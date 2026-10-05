// Executes DSHOME-Plugin's client bundle against a minimal DOM double.
//
// The selftest checks packaging and source invariants; this file actually *runs*
// the bundle. That matters because the host loads it as a **classic script**, so
// the closest local equivalent is `new Function(source)` — which, unlike
// `import()`, rejects `import`/`export` exactly as a browser would. Running the
// bundle this way therefore exercises both the attach paths (style injection,
// selector queries, canvas painting, pointer handling) and the module-format
// constraint at the same time.
//
// Run with `node test/domtest.mjs`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${label}\n      ${error.message}`);
  }
}

// ── a DOM just large enough for this plugin ─────────────────────────────────
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.parent = null;
    this.style = {};
    this.textContent = '';
    this.listeners = {};
    this.clientWidth = 900;
    this._clientHeight = 700;
    this.scrollTop = 0;
    this.scrollHeight = 4000;
    this.className = '';
  }
  /**
   * Layout-faithful height: a real browser resolves `clientHeight` from the CSS
   * box, so an element whose `style.height` was just set reports that height.
   * Without this the double keeps the constructor default and any code that
   * sizes itself from its own clientHeight computes something a browser never
   * would.
   */
  get clientHeight() {
    const fromStyle = parseFloat(this.style.height);
    return Number.isFinite(fromStyle) ? fromStyle : this._clientHeight;
  }
  set clientHeight(value) { this._clientHeight = value; }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; }
  hasAttribute(n) { return n in this.attributes; }
  removeAttribute(n) { delete this.attributes[n]; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener() {}
  dispatchEvent(e) {
    (this.listeners[e.type] || []).forEach((fn) => fn(e));
    return true;
  }
  getBoundingClientRect() {
    return { top: 100, bottom: 800, left: 0, right: 900, width: 900, height: 700 };
  }
  setPointerCapture() {}
  closest(sel) {
    let node = this;
    while (node) {
      if (node.matches?.(sel)) return node;
      node = node.parent;
    }
    return null;
  }
  querySelector(sel) { return walk(this).find((n) => matches(n, sel)) ?? null; }
  querySelectorAll(sel) { return walk(this).filter((n) => matches(n, sel)); }
  matches() { return false; }
  /**
   * A recording 2d context. The plugin's paint path returns early when the
   * context is missing, so a null-returning stub made every canvas assertion
   * vacuous — "is anything actually drawn?" was never asked.
   */
  getContext(kind) {
    if (kind !== '2d') return null;
    if (!this._ctx) {
      const calls = [];
      this._ctx = {
        calls,
        globalAlpha: 1,
        fillStyle: '',
        setTransform() {},
        clearRect() { calls.push({ op: 'clear' }); },
        fillRect(x, y, w, h) {
          calls.push({ op: 'rect', x, y, w, h, alpha: this.globalAlpha, fill: this.fillStyle });
        },
      };
    }
    return this._ctx;
  }
}

/** Walk the tree and return every element. */
function walk(node, out = []) {
  for (const child of node.children) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

/**
 * Match the selector forms this plugin emits, so idempotency is genuinely
 * exercised rather than trivially satisfied by a stub returning null.
 * Supported: `tag[attr='value']`, `tag[attr]` and `[class*="value"]` (the
 * scroll-container selector is a class substring match).
 */
function matches(node, selector) {
  // A comma list is any-of, exactly as the DOM treats it. The sidebar surface
  // selector is such a list, and without this it would match nothing at all —
  // which would make every sidebar check vacuously pass as "no sidebar".
  if (selector.includes(',')) return selector.split(',').some((part) => matches(node, part.trim()));
  // A descendant combinator: the official rail is found as `body nav[class*=…]`.
  // Without this the rail is invisible to the double, and every rail-anchored
  // assertion would silently test the fallback instead.
  const parts = selector.trim().split(/\s+/);
  if (parts.length > 1) {
    if (!matches(node, parts[parts.length - 1])) return false;
    let up = node.parent;
    for (let i = parts.length - 2; i >= 0; i -= 1) {
      let found = false;
      while (up) {
        if (matches(up, parts[i])) { found = true; break; }
        up = up.parent;
      }
      if (!found) return false;
    }
    return true;
  }
  // A class-substring test with or without a tag: `[class*="x"]` and
  // `nav[class*="x"]` both reach here (the rail is looked up as the latter).
  const classMatch = /^([a-z]*)\[class\*=["']([^"']+)["']\]$/.exec(selector);
  if (classMatch) {
    const [, tag, sub] = classMatch;
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    return node.className.includes(sub);
  }
  const star = /^\[class\*=["']([^"']+)["']\]$/.exec(selector);
  if (star) return node.className.includes(star[1]);
  const m = /^([a-z]+)?(?:\[([^=\]]+)(?:=['"]([^'"]*)['"])?\])?$/.exec(selector);
  if (!m) return false;
  const [, tag, attr, value] = m;
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  if (attr) {
    if (!node.hasAttribute(attr)) return false;
    if (value !== undefined && node.getAttribute(attr) !== value) return false;
  }
  return true;
}

function makeDocument() {
  const head = new El('head');
  const body = new El('body');
  const listeners = {};
  const doc = {
    head,
    body,
    documentElement: new El('html'),
    createElement: (t) => new El(t),
    querySelector: (sel) => walk(doc.documentElement).find((n) => matches(n, sel)) ?? null,
    querySelectorAll: (sel) => walk(doc.documentElement).filter((n) => matches(n, sel)),
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => {
      listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
    },
    dispatch(type, event = {}) {
      (listeners[type] || []).forEach((fn) => fn({ type, ...event }));
      return true;
    },
  };
  doc.documentElement.appendChild(head);
  doc.documentElement.appendChild(body);
  return doc;
}

/** Fresh globals + a fresh DOM. Returns the new document. */
function installGlobals() {
  const doc = makeDocument();
  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1400,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn) => { void fn; return 0; },   // timers never fire: no async
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    // The frame-by-frame follow goes through `window`, exactly as it does in the
    // browser. It never runs by itself here (instrument() records it instead), so
    // a check can decide which frame to deliver and when.
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.MouseEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
  globalThis.localStorage = {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); },
  };
  return doc;
}

/**
 * Several checks deliberately drive failure paths, and the plugin logs a warning
 * for each. Those warnings are the desired behaviour, so they are captured
 * rather than printed.
 */
let expectedWarnings = 0;
const capturedWarnings = [];
const realWarn = console.warn;
const record = (...args) => {
  capturedWarnings.push(args.map((a) => (a && a.stack ? a.stack : String(a))).join(' '));
};
console.warn = (...args) => { expectedWarnings += 1; record(...args); };
// `safe()` may report through error, not warn; missing that made the swallow invisible.
console.error = (...args) => { expectedWarnings += 1; record(...args); };
process.on('exit', () => {
  realWarn(`  (captured ${expectedWarnings} expected degradation warning(s))`);
});

// ── load the bundle the way a classic script would ──────────────────────────
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib', 'client.js'), 'utf8');

let loaded = null;
let loadError = null;

function loadBundle() {
  installGlobals();
  loaded = null;
  loadError = null;
  globalThis.window.__ModuleLoader__ = {
    load(spec) { loaded = spec; },
  };
  globalThis.window.__dshomePlugin = undefined;
  try {
    // Same evaluation model as a classic script: no module scope.
    // eslint-disable-next-line no-new-func
    new Function(source)();
  } catch (error) {
    loadError = error;
  }
}

console.log('\n== classic-script load ==');

loadBundle();

check('evaluates without throwing (no ESM syntax)', () => {
  // `new Function` rejects `import`/`export` exactly as a browser classic script
  // does. This is the assertion that would have caught the boot failure.
  assert.equal(loadError, null, loadError ? String(loadError) : '');
});

check('registers with the module loader', () => {
  assert.ok(loaded, 'load() was never called');
  assert.equal(loaded.id, 'dshome-plugin');
  assert.equal(typeof loaded.factory, 'function');
});

const provide = (id) => {
  if (id === 'react/jsx-runtime') return { jsx: () => null };
  return { FishLogo: () => null };
};

const makePlugin = () => loaded.factory(provide);

console.log('\n== plugin shape ==');

check('factory returns a plugin with name, inject and apply', () => {
  const plugin = makePlugin();
  assert.equal(plugin.name, 'dshome-plugin');
  assert.deepEqual(plugin.inject, ['slots']);
  assert.equal(typeof plugin.apply, 'function');
});

// ── style / conversation / minimap attach paths ─────────────────────────────
console.log('\n== attach ==');

check('apply() installs conversation, sidebar and minimap stylesheets', () => {
  const doc = installGlobals();
  const plugin = loaded.factory(provide);
  // ctx.get('theme') returns undefined and ctx.slots is absent: the theme
  // feature must degrade instead of throwing, and the others must still run.
  plugin.apply({ get: () => undefined });
  const markers = doc.head.children.map((c) => c.getAttribute('data-plugin'));
  assert.ok(markers.includes('dshome-plugin-conversation'), 'conversation stylesheet missing');
  assert.ok(markers.includes('dshome-plugin-sidebar'), 'sidebar stylesheet missing');
  assert.ok(markers.includes('dshome-plugin-minimap'), 'minimap stylesheet missing');
});

check('sidebar stylesheet stacks the foot rows and keeps the collapsed rail', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-sidebar').textContent;
  // The container is named through the slot's own anchor — `renderSlot()` wraps
  // every outlet in `<div data-slot="<key>" style="display:contents">` — and
  // never through a hashed CSS-Module class, which changes on upstream rebuilds.
  assert.match(css, /div:has\(>\[data-slot="sidebar\.footer\.action"\]\)/);
  assert.match(css, /flex-direction:column;align-items:stretch/);
  // Collapsed mode must outrank upstream's `._collapsed ._footerActions` (0,2,0).
  assert.match(css, /\[data-sidebar-collapsed="true"\][^{]*\{flex-direction:row/);
});

check('apply() attaches the minimap strip to the body', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.ok(shell, 'strip not attached');
  // The canvas must sit inside the clipping window, not directly in the shell:
  // the shell is the fixed window and the canvas is the long scroll behind it.
  // Every part is looked up by name rather than by index, because the canvas
  // moved into the window once and positional lookups silently compared the
  // wrong element from then on.
  assert.equal(shell.children.length, 3, 'shell holds window + thumb + tip');
  const view = shell.children.find((c) => c.className === 'dshome-plugin-minimap-view');
  assert.ok(view, 'clipping window missing');
  assert.ok(shell.children.find((c) => c.className === 'dshome-plugin-minimap-thumb'), 'thumb missing');
  assert.ok(shell.children.find((c) => c.className === 'dshome-plugin-minimap-tip'), 'hover tip missing');
  assert.deepEqual(view.children.map((c) => c.tagName), ['CANVAS']);
});

check('strip starts hidden when there is no conversation', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.equal(shell.style.display, 'none');
});

// The "think window" assertions live here again. They were deleted on
// 2026-10-04 together with the feature itself, on the theory that they only ever
// proved our own stylesheet was spelled the way we spelled it. That theory came
// from a failed probe: `data-variant="think"` DOES exist upstream (ui-chat's
// ReasoningRow, app.asar offset 19312977) — the bundle merely writes it as
// `"data-variant": "think"`, which the literal search missed. Deleting a feature
// and the locks that guarded it in the same commit is exactly how a removal goes
// green: there is nothing left to turn red. These stay until the feature does.

check('conversation stylesheet clamps the think body to 12 lines', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  assert.match(css, /max-height:calc\(12 \*/);
  assert.match(css, /data-variant="think"/);
  assert.match(css, /data-expanded/);
});

check('conversation stylesheet raises specificity for the collapsed state', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  // Upstream's chat CSS is lazily injected after ours; without the extra
  // attribute the same-specificity rule would lose.
  assert.match(css, /data-state\]:not\(\[data-expanded\]\)/);
});

check('conversation stylesheet keeps the sticky header masking its body', () => {
  // Upstream fills the header with bg-base and pins it (sticky;top:0;z-index:1).
  // Dropping that fill lets the reasoning text scroll through the header; using
  // upstream's colour instead of the surrounding plate's shows a stray band.
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  const rule = /\[data-disclosure-row\]\{background:([^}]+)\}/.exec(css);
  assert.ok(rule, 'the sticky-header rule is gone');
  assert.ok(!/transparent/.test(rule[1]), 'a transparent header lets the body scroll through');
  assert.match(rule[1], /--dshome-plate/);
  assert.match(css, /--dshome-plate:var\(--dsw-alias-bg-layer-1/);
});

check('a collapsed reasoning block is force-expanded on the next frame', () => {
  // The behaviour, not the text. Upstream renders the reasoning body only once
  // the row is expanded, so this synthetic click *is* the feature. The plugin
  // schedules its sweep with a bare `requestAnimationFrame`, i.e. globalThis's
  // (installGlobals stubs it out) — instrument() only covers `window`, so the
  // recorder has to be installed on globalThis to see the frame at all.
  const doc = installGlobals();
  const flow = new El('div');
  flow.setAttribute('data-chat-flow-key', 'turn-1');
  const root = new El('div');
  root.setAttribute('data-variant', 'think');
  root.setAttribute('data-state', 'ok');
  const row = new El('div');
  row.setAttribute('data-disclosure-row', 'true');
  root.appendChild(row);
  flow.appendChild(root);
  doc.body.appendChild(flow);

  instrument();
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  loaded.factory(provide).apply({ get: () => undefined });

  assert.ok(frames.length > 0, 'no sweep was scheduled');
  const clicks = [];
  row.addEventListener('click', (e) => clicks.push(e));
  frames.splice(0).forEach((fn) => fn());

  assert.equal(clicks.length, 1, 'the reasoning block was never expanded');
  assert.equal(clicks[0].bubbles, true, 'the synthetic click would not reach React');
});

check('conversation stylesheet styles the card kinds', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  assert.match(css, /data-chat-flow-kind="tool-call"/);
  assert.match(css, /:not\(\[hidden\]\)/);
});

check('minimap hides the official rail by default', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const rail = doc.head.children.find(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap-rail',
  );
  assert.ok(rail, 'rail rule missing');
  assert.match(rail.textContent, /pointer-events:none/);
});

check('applying twice does not duplicate stylesheets', () => {
  const doc = installGlobals();
  const plugin = loaded.factory(provide);
  plugin.apply({ get: () => undefined });
  plugin.apply({ get: () => undefined });
  const n = doc.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation',
  ).length;
  assert.equal(n, 1, 'style injection must be idempotent');
});

// ── theme + slot registration ───────────────────────────────────────────────
console.log('\n== theme ==');

check('registers all three brand slots', () => {
  const calls = [];
  const ctx = {
    get: () => ({ overrideTokens(id, tokens) { calls.push(['tokens', id, tokens]); } }),
    slots: {
      inject(name, fn) { calls.push(['inject', name]); return fn(); },
      register(spec) {
        calls.push(['register', spec.name]);
        return () => calls.push(['dispose', spec.name]);
      },
    },
  };
  installGlobals();
  loaded.factory(provide).apply(ctx);
  const registered = calls.filter(([op]) => op === 'register').map(([, n]) => n);
  assert.deepEqual(registered, [
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark',
  ]);
  const tokens = calls.find(([op]) => op === 'tokens');
  assert.equal(tokens[1], 'dshome-plugin', 'token namespace');
  assert.ok(tokens[2]['--dsw-alias-brand-primary'].light, 'brand token passed');
});

check('slot inject callbacks return a value (inject keeps it)', () => {
  // inject() is a dependency declaration: it runs the callback once the slot
  // exists and keeps what the callback returns. A callback that returns nothing
  // registers nothing, which is how the earlier generator form failed silently.
  //
  // The stub must return the callback's result, exactly as the real service
  // does; swallowing it would make this assertion unable to see the nesting.
  const returns = [];
  const ctx = {
    get: () => undefined,
    slots: {
      inject(name, fn) { const value = fn(); returns.push([name, value]); return value; },
      register() { return 'REGISTRATION-TOKEN'; },
    },
  };
  installGlobals();
  loaded.factory(provide).apply(ctx);
  assert.equal(returns.length, 3, 'three slots declared');
  for (const [name, value] of returns) {
    assert.ok(value, `inject callback for ${name} returned nothing`);
  }
});

check('apply() tolerates a theme service that throws', () => {
  installGlobals();
  const ctx = {
    get: () => ({ overrideTokens() { throw new Error('upstream changed'); } }),
    slots: { inject() {}, register() {} },
  };
  loaded.factory(provide).apply(ctx); // must not propagate
});

check('apply() tolerates a missing slots service', () => {
  installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
});

// ── minimap geometry, executed ──────────────────────────────────────────────
//
// The selftest locks the formulas by reading the source; these checks run the
// real bundle against a fake session and read the resulting numbers off the DOM.
// That is the only way to catch "the formulas are right but they are wired to
// the wrong element", which is exactly what the clipping-window and zoom bugs
// were.
console.log('\n== minimap geometry (runtime) ==');

const THUMB_RATIO = 0.08;
const TURN_STEP = 600;
const TURN_COUNT = 40;
const VIEW_H = 800;
const TOTAL_H = TURN_COUNT * TURN_STEP + VIEW_H;

/** The bundle's own zoom rule, restated so the test can predict the numbers. */
const zoomFor = (total, view) => (THUMB_RATIO * total) / view;

/**
 * Mount the real bundle against a fake session: one scroll container holding
 * TURN_COUNT turn blocks. Heights are supplied by hand because the DOM double
 * has no layout engine.
 */
function mountSession({ total = TOTAL_H, view = VIEW_H, turns = TURN_COUNT, step = TURN_STEP, applies = 1 } = {}) {
  const doc = installGlobals();
  const scroller = doc.createElement('div');
  scroller.className = 'session_scrollBody';
  scroller.clientHeight = view;
  scroller.scrollHeight = total;
  scroller.scrollTop = 0;
  scroller.getBoundingClientRect = () => ({
    top: 0, bottom: view, left: 0, right: 900, width: 900, height: view,
  });
  for (let i = 0; i < turns; i += 1) {
    const block = doc.createElement('div');
    block.setAttribute('data-chat-turn', '');
    block.textContent = `turn ${i} `.repeat(8);
    block.getBoundingClientRect = () => ({
      top: i * step, bottom: (i + 1) * step, height: step, left: 0, right: 800, width: 800,
    });
    scroller.appendChild(block);
  }
  doc.body.appendChild(scroller);
  const plugin = makePlugin();
  for (let pass = 0; pass < applies; pass += 1) plugin.apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  return { doc, scroller, shell };
}

/**
 * The strip's canvas, found by walking rather than by a fixed child index: the
 * canvas moved inside the clipping window, and a positional lookup would silently
 * compare the wrong element across revisions.
 */
function canvasOf(shell) {
  return shell ? (walk(shell).find((n) => n.tagName === 'CANVAS') ?? null) : null;
}

/** The viewport box, by name: the shell's third child is now the hover tip. */
function thumbOf(shell) {
  return shell ? (shell.children.find((c) => c.className === 'dshome-plugin-minimap-thumb') ?? null) : null;
}

/** The hover tip, by name. */
function tipOf(shell) {
  return shell ? (shell.children.find((c) => c.className === 'dshome-plugin-minimap-tip') ?? null) : null;
}

/** The canvas offset the bundle wrote, read back out of the transform. */
function offsetOf(shell) {
  const canvas = canvasOf(shell);
  const m = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(canvas.style.transform || '');
  return m ? -Number(m[1]) : null;
}

check('the strip mounts and shows for a session taller than the viewport', () => {
  const { shell } = mountSession();
  assert.ok(shell, 'strip not attached');
  assert.notEqual(shell.style.display, 'none', 'a scrollable session must show the strip');
  assert.ok(parseFloat(shell.style.height) > 0, 'the strip must have a height');
});

check('re-applying tears the previous pass down instead of stacking shells', () => {
  // This bundle hot-reloads, so apply() runs again while the previous shell is
  // still in the DOM. Without the teardown each pass stacked another shell and
  // another set of listeners — and the older shells kept drawing with the older
  // geometry, which is exactly what made a previous fix look broken.
  const { doc } = mountSession({ applies: 3 });
  const shells = doc.body.children.filter((c) => c.className === 'dshome-plugin-minimap');
  assert.equal(shells.length, 1, `expected one shell after three applies, found ${shells.length}`);
});

// The two painting checks below are the regression lock for "draw() calls a
// paint routine that no longer exists": that threw inside safe(), which
// swallowed it, so the strip still mounted while the canvas stayed blank.
check('the canvas is actually painted', () => {
  const { shell } = mountSession();
  const canvas = canvasOf(shell);
  const ctx = canvas.getContext('2d');
  const rects = ctx.calls.filter((c) => c.op === 'rect');
  assert.ok(rects.length > 0,
    `calls=${ctx.calls.length} canvas.width=${canvas.width} shellH=${shell.style.height} `
    + `probe=${JSON.stringify(globalThis.window.__probe || [])}`);
  for (const r of rects) {
    assert.ok([r.x, r.y, r.w, r.h].every(Number.isFinite), 'rect coordinates must be finite');
    assert.ok(r.w > 0 && r.h > 0, 'rect must have a positive size');
  }
});

check('painted rects land inside the visible window at the top of the document', () => {
  const { scroller, shell } = mountSession();
  const canvas = canvasOf(shell);
  const rects = canvas.getContext('2d').calls.filter((c) => c.op === 'rect');
  const H = shell.clientHeight;
  const offset = offsetOf(shell);              // 0 at the top of the document
  assert.equal(scroller.scrollTop, 0, 'the mount must start at the top');
  const visible = rects.filter((r) => r.y + r.h >= offset && r.y <= offset + H);
  assert.ok(visible.length > 0,
    `no rect intersects the window [${offset}, ${offset + H}] out of ${rects.length} drawn`);
});

check('a session that fits on one screen hides the whole strip', () => {
  const { shell } = mountSession({ total: 400, turns: 1, step: 100 });
  assert.equal(shell.style.display, 'none');
});

check('a long session zooms the canvas past the window', () => {
  const { shell } = mountSession();
  const zoom = zoomFor(TOTAL_H, VIEW_H);
  assert.ok(zoom > 1, `zoom must exceed 1 for a long session, got ${zoom}`);
  assert.ok(parseFloat(shell.style.height) > 0, 'the window keeps the standard band');
});

check('the thumb covers exactly the viewport slice of the canvas', () => {
  // The invariant that makes the picture trustworthy, at every scroll position:
  // the thumb's top and height must equal the on-screen position and height of
  // the viewport's span of the canvas.
  const { doc, scroller, shell } = mountSession();
  const thumb = thumbOf(shell);
  const band = parseFloat(shell.style.height);
  const canvasLen = band * zoomFor(TOTAL_H, VIEW_H);
  const scale = canvasLen / TOTAL_H;

  for (const fraction of [0, 0.25, 0.5, 1]) {
    scroller.scrollTop = fraction * (TOTAL_H - VIEW_H);
    doc.dispatch('scroll');
    const offset = offsetOf(shell);
    const sliceTop = scroller.scrollTop * scale - offset;
    const sliceHeight = VIEW_H * scale;
    assert.ok(
      Math.abs(parseFloat(thumb.style.top) - sliceTop) <= 1.5,
      `at ${fraction}: thumb top ${thumb.style.top} must equal slice top ${sliceTop}`,
    );
    assert.ok(
      Math.abs(parseFloat(thumb.style.height) - sliceHeight) <= 1.5,
      `at ${fraction}: thumb height ${thumb.style.height} must equal slice height ${sliceHeight}`,
    );
  }
});

check('at the document bottom the canvas bottom meets the window bottom', () => {
  const { doc, scroller, shell } = mountSession();
  const band = parseFloat(shell.style.height);
  const canvasLen = band * zoomFor(TOTAL_H, VIEW_H);
  scroller.scrollTop = TOTAL_H - VIEW_H;
  doc.dispatch('scroll');
  assert.ok(
    Math.abs(offsetOf(shell) - (canvasLen - band)) <= 1.5,
    `offset ${offsetOf(shell)} must be canvasLen - window = ${canvasLen - band}`,
  );
});

check('clicking centres the clicked content instead of top-aligning it', () => {
  const { scroller, shell } = mountSession();
  const band = parseFloat(shell.style.height);
  const canvasLen = band * zoomFor(TOTAL_H, VIEW_H);
  const scale = canvasLen / TOTAL_H;
  scroller.scrollTop = 0;
  const rect = shell.getBoundingClientRect();
  const local = band / 2;
  const expected = local / scale - VIEW_H / 2;   // offset is 0 at the top of the document
  (shell.listeners.pointerdown || []).forEach((fn) => fn({
    type: 'pointerdown', button: 0, clientY: rect.top + local, pointerId: 1, preventDefault() {},
  }));
  assert.ok(
    Math.abs(scroller.scrollTop - expected) <= 2,
    `click must centre: scrollTop ${scroller.scrollTop}, expected ${expected}`,
  );
});

// ── hover tip · right sidebar · layout gate · change-driven redraw ──────────
//
// All four are timer- or observer-driven, and the double's timers never fire. So
// the instruments below record what the bundle *scheduled* and pin the clock,
// and each check drives the recorded callback by hand where it needs to. Every
// claim about the picture is still read off the DOM afterwards — "the callback
// was invoked" is never the assertion.
console.log('\n== minimap behaviour (runtime) ==');

/**
 * Add one conversation column. `left`/`top` place it in the viewport, which is
 * what findScroller has to judge. `laidOut` decides which blocks report a real
 * height: the double has no layout engine, so heights are supplied by hand.
 */
function addColumn(doc, { turns, step, total, view = VIEW_H, left = 0, top = 0, laidOut = null, kinds = null, width = 900, textRight = 800 }) {
  const scroller = doc.createElement('div');
  scroller.className = 'session_scrollBody';
  scroller.clientHeight = view;
  scroller.scrollHeight = total;
  scroller.scrollTop = 0;
  scroller.getBoundingClientRect = () => ({
    top, bottom: top + view, left, right: left + width, width, height: view,
  });
  for (let i = 0; i < turns; i += 1) {
    const block = doc.createElement('div');
    block.setAttribute('data-chat-turn', String(i + 1));
    // Real rows carry both: `data-chat-turn` for turn boundaries and
    // `data-chat-flow-key` for the row's identity. The strip measures the text
    // column's right edge off the latter.
    if (textRight > 0) block.setAttribute('data-chat-flow-key', `k${i + 1}`);
    if (kinds) block.setAttribute('data-chat-flow-kind', kinds[i % kinds.length]);
    block.textContent = `hello from turn ${i}`;
    const ready = laidOut === null || laidOut(i);
    block.getBoundingClientRect = () => ({
      top: i * step,
      bottom: (i + 1) * step,
      height: ready ? step : 0,
      left: 0,
      right: textRight,
      width: textRight,
    });
    scroller.appendChild(block);
  }
  doc.body.appendChild(scroller);
  return scroller;
}

/**
 * Make a mount observable.
 *
 * Records every timer the bundle schedules — the double's timers never fire, so
 * the request itself is the only evidence — captures MutationObservers so their
 * callback can be invoked by hand, and pins `Date.now` to a clock the check can
 * advance: the hover tip is deliberately throttled, so a real clock would make
 * that assertion flaky.
 */
function instrument() {
  const log = { timeouts: [], intervals: [], observers: [], raf: [], resizers: [], now: 1000000 };
  const win = globalThis.window;
  win.setTimeout = (fn, delay) => { log.timeouts.push({ fn, delay }); return log.timeouts.length; };
  win.clearTimeout = () => {};
  win.setInterval = (fn, delay) => { log.intervals.push({ fn, delay }); return log.intervals.length; };
  win.clearInterval = () => {};
  // Animation frames are recorded, never delivered: the follow loop is a loop,
  // and a real rAF would recurse out of the check's control.
  win.requestAnimationFrame = (fn) => { log.raf.push(fn); return log.raf.length; };
  win.cancelAnimationFrame = () => {};
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb; log.observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; log.resizers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  Date.now = () => log.now;
  return log;
}

/** Build a session, instrument the scheduling, then apply the real bundle. */
function mountWith({
  turns = TURN_COUNT, step = TURN_STEP, total = TOTAL_H, view = VIEW_H,
  laidOut = null, kinds = null, left = 0, top = 0, width = 900, textRight = 800,
  setup = null,
} = {}) {
  const doc = installGlobals();
  const scroller = addColumn(doc, {
    turns, step, total, view, left, top, laidOut, kinds, width, textRight,
  });
  const log = instrument();
  if (setup) setup(doc, log);
  makePlugin().apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  const ctx = canvasOf(shell).getContext('2d');
  // The recording context accumulates across paints, and every paint begins
  // with a clear(). So "how many passes ran" is the number of clears, and "what
  // the picture is now" is the rects after the last clear — counting all
  // recorded rects would treat a redraw as extra blocks.
  const passes = () => ctx.calls.filter((c) => c.op === 'clear').length;
  const rects = () => {
    let start = 0;
    for (let i = ctx.calls.length - 1; i >= 0; i -= 1) {
      if (ctx.calls[i].op === 'clear') { start = i; break; }
    }
    return ctx.calls.slice(start).filter((c) => c.op === 'rect');
  };
  /** The observer watching the conversation column, not the style guard. */
  const contentWatcher = () => log.observers.find((o) => o.target === scroller && o.options.childList);
  return { doc, scroller, shell, log, ctx, passes, rects, contentWatcher };
}

/** Drive the strip's own hover path with a client Y that lands on `canvasY`. */
function hover(shell, canvasY) {
  const rect = shell.getBoundingClientRect();
  const clientY = rect.top + (canvasY - offsetOf(shell));
  (shell.listeners.pointermove || []).forEach((fn) => fn({ type: 'pointermove', clientY, buttons: 0 }));
}

/** A right-sidebar panel, visible at `left`, with the expand attribute set. */
function sidebarPanel(doc, left) {
  const panel = doc.createElement('div');
  panel.className = 'sidebar_panel';
  panel.setAttribute('data-sidebar-right-open', '');
  panel.getBoundingClientRect = () => ({
    top: 0, bottom: 1080, left, right: left + 400, width: 400, height: 1080,
  });
  doc.body.appendChild(panel);
  return panel;
}

check('the tip is invisible until it has something to say', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap').textContent;
  // Without opacity:0 the tip is a label permanently visible over the
  // conversation — that is the failure mode worth locking out.
  assert.match(css, /\.dshome-plugin-minimap-tip\{[^}]*opacity:0/);
  assert.match(css, /\.dshome-plugin-minimap-tip\[data-show\]\{opacity:1\}/);
  // Avoidance is done by position, never by raising the strip above the panel.
  assert.match(css, /\.dshome-plugin-minimap\{[^}]*z-index:6/);
});

check('findScroller skips a column parked outside the window', () => {
  const doc = installGlobals();
  // Parked to the right of the window: positive height and vertical overlap, so
  // only a horizontal test can tell it apart from the live column. Its content
  // fits one screen, so picking it would also hide the strip outright.
  addColumn(doc, { turns: 1, step: 100, total: 400, left: 1500 });
  addColumn(doc, { turns: TURN_COUNT, step: TURN_STEP, total: TOTAL_H });
  instrument();
  makePlugin().apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.notEqual(shell.style.display, 'none', 'the on-screen column must be the one picked');
  const rects = canvasOf(shell).getContext('2d').calls.filter((c) => c.op === 'rect');
  assert.equal(rects.length, TURN_COUNT, `drew ${rects.length} blocks; the parked column has 1`);
});

check('findScroller still returns a column when nothing intersects the viewport yet', () => {
  // Below the fold: laid out, but with no overlap at all. Without the fallback
  // the strip stayed hidden until the layout happened to finish.
  const doc = installGlobals();
  addColumn(doc, { turns: TURN_COUNT, step: TURN_STEP, total: TOTAL_H, top: 5000 });
  instrument();
  makePlugin().apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.notEqual(shell.style.display, 'none', 'the only candidate must still be used');
  assert.ok(parseFloat(shell.style.height) > 0, 'and it must be sized');
});

check('the hover tip names the block whose painted rectangle is under the pointer', () => {
  const { shell, rects } = mountWith();
  const tip = tipOf(shell);
  const drawn = rects();
  const offset = offsetOf(shell);
  // Strictly inside the 13th painted rectangle, and inside the visible window.
  const target = 12;
  const canvasY = drawn[target].y + drawn[target].h / 2;
  assert.ok(canvasY >= offset && canvasY <= offset + shell.clientHeight,
    'the target rect must be visible for this check to mean anything');
  hover(shell, canvasY);
  assert.ok(tip.hasAttribute('data-show'), 'the tip must show');
  // The block is identified by its own text, so this locks "the tip names the
  // message the pointer is over" and not merely "the tip has some text".
  assert.match(tip.textContent, /hello from turn 12/,
    `tip named the wrong block: ${JSON.stringify(tip.textContent)}`);
  assert.ok(Math.abs(parseFloat(tip.style.top) - (canvasY - offset)) <= 1,
    `tip top ${tip.style.top} must follow the pointer, not the block's edge`);
});

check('the tip labels the block kind read off the block', () => {
  for (const [kind, label] of [['user', 'You'], ['assistant', 'Assistant'], ['tool-call', 'Tool call'], ['', 'Content']]) {
    const { shell, rects } = mountWith({
      turns: 3, total: 3 * TURN_STEP + VIEW_H, kinds: [kind, kind, kind],
    });
    const drawn = rects();
    hover(shell, drawn[0].y + drawn[0].h / 2);
    // `.` is a wildcard for the separator, so this stays exact without betting
    // the assertion on how a middle dot survives an editor round-trip.
    assert.match(tipOf(shell).textContent.split('\n')[0], new RegExp(`^Turn 1 . ${label}$`),
      `kind ${JSON.stringify(kind)} should be labelled ${label}`);
  }
});

check('the tip hides when the pointer leaves the strip', () => {
  const { shell, rects } = mountWith();
  const drawn = rects();
  const tip = tipOf(shell);
  hover(shell, drawn[5].y + drawn[5].h / 2);
  assert.ok(tip.hasAttribute('data-show'), 'the tip must show first');
  (shell.listeners.pointerleave || []).forEach((fn) => fn({ type: 'pointerleave', buttons: 0 }));
  assert.ok(!tip.hasAttribute('data-show'), 'the tip must hide on pointerleave');
});

check('the tip is throttled, so a fast sweep does not re-read the DOM per pixel', () => {
  const { shell, rects, log } = mountWith();
  const tip = tipOf(shell);
  const drawn = rects();
  hover(shell, drawn[5].y + drawn[5].h / 2);
  assert.match(tip.textContent, /hello from turn 5/);
  hover(shell, drawn[20].y + drawn[20].h / 2);
  assert.match(tip.textContent, /hello from turn 5/, 'a move inside the throttle window must be dropped');
  log.now += 1000;
  hover(shell, drawn[20].y + drawn[20].h / 2);
  assert.match(tip.textContent, /hello from turn 20/, 'past the window the tip must follow the pointer');
});

check('a sidebar that owns a track beside the column never hides the strip', () => {
  // The wide-viewport case, and the whole reason the strip used to vanish for no
  // reason: upstream lays out three grid tracks, so an open right sidebar sits
  // *outside* the conversation column — it does not overlap the strip, and the
  // only thing that ever hid the strip here was measuring "covered" against the
  // window's right edge instead of against the strip itself.
  const { shell } = mountWith({ setup: (doc) => { sidebarPanel(doc, 1000); } });
  assert.notEqual(shell.style.display, 'none',
    'a sidebar beside the conversation column must not stand the strip down');
});

check('a sidebar that reaches the strip itself stands it down', () => {
  // The narrow-viewport case: there is no room for a track, so the panel floats
  // over the centre column and does overlap the strip. Sliding the strip to the
  // panel's edge — what the reference implementation does — parks it on top of
  // the conversation being read, so standing down is still right here.
  const { shell } = mountWith({ setup: (doc) => { sidebarPanel(doc, 700); } });
  assert.equal(shell.style.display, 'none', 'the strip must stand down while it is covered');
});

check('the strip anchors inside the conversation column, not the window edge', () => {
  // The double's column is 900px wide inside a 1400px window. Anchoring to the
  // window's right edge would put the strip at x≈1334 — outside the conversation
  // entirely, which is exactly what made it depend on the sidebar for its life.
  const { shell, log } = mountWith({ setup: (doc) => { sidebarPanel(doc, 100); } });
  // The double has no layout engine: model the strip where the bundle placed it
  // (just inside the column's right edge) and ask again.
  shell.getBoundingClientRect = () => ({
    top: 116, bottom: 700, left: 838, right: 892, width: 54, height: 584,
  });
  log.intervals.find((t) => t.delay === 250).fn();
  assert.notEqual(shell.style.display, 'none', 'a sidebar nowhere near the strip must not hide it');
  const expected = 1400 - 900 + 8;                  // window - column.right + gap
  assert.ok(Math.abs(parseFloat(shell.style.right) - expected) <= 1,
    `the strip must sit inside the column: right=${shell.style.right}, expected ${expected}`);
});

check('the strip aligns to the official rail when the rail is there', () => {
  // Upstream's rail already sits in the gutter, clear of the scrollbar, so it is
  // the better anchor whenever it is laid out.
  const { shell } = mountWith({
    setup: (doc) => {
      const nav = doc.createElement('nav');
      nav.className = 'chat_frame';
      nav.getBoundingClientRect = () => ({
        top: 100, bottom: 520, left: 1000, right: 1028, width: 28, height: 420,
      });
      doc.body.appendChild(nav);
    },
  });
  const expected = 1400 - 1028 + (28 - 58) / 2;      // rail-aligned, centred on it
  assert.ok(Math.abs(parseFloat(shell.style.right) - expected) <= 1,
    `the rail must win as the anchor: right=${shell.style.right}, expected ${expected}`);
});

check('a floating sidebar pane hides the strip even with no open attribute', () => {
  // Upstream's own rule is "a pane is visible when it is floating OR its owner is
  // open". A float is on screen with no `data-sidebar-right-open` anywhere, so
  // watching that attribute alone would leave the strip underneath it.
  const { shell } = mountWith({
    setup: (doc) => {
      const float = doc.createElement('div');
      float.className = 'sidebar_float';
      float.setAttribute('data-dockkit-float', 'pane-1');
      // Floating over the centre column, as it does when there is no track.
      float.getBoundingClientRect = () => ({
        top: 0, bottom: 1080, left: 700, right: 1400, width: 700, height: 1080,
      });
      doc.body.appendChild(float);
    },
  });
  assert.equal(shell.style.display, 'none', 'a floating pane over the strip must hide it');
});

check('a stale fullscreen owner in an inactive session does not hide the strip', () => {
  // `data-sidebar-right-panel` is a permanent attribute, not a switch, and every
  // mounted session renders its own owner. Reading it without upstream's own
  // visibility test (`[hidden]` / `aria-hidden`) hid the strip in every session,
  // permanently, as soon as any session had ever gone fullscreen.
  const { shell } = mountWith({
    setup: (doc) => {
      const wrapper = doc.createElement('div');
      wrapper.setAttribute('hidden', '');
      const stale = doc.createElement('div');
      stale.setAttribute('data-sidebar-right-panel', 'fullscreen');
      // The double hands every element a real box, so the hidden-subtree test is
      // the only thing that can reject this owner — which is the point.
      wrapper.appendChild(stale);
      doc.body.appendChild(wrapper);
    },
  });
  assert.notEqual(shell.style.display, 'none', 'a hidden owner is not a fullscreen sidebar');
});

check('a fullscreen right sidebar hides the strip entirely', () => {
  const { shell } = mountWith({
    setup: (doc) => {
      const full = doc.createElement('div');
      full.className = 'sidebar_full';
      full.setAttribute('data-sidebar-right-panel', 'fullscreen');
      doc.body.appendChild(full);
    },
  });
  assert.equal(shell.style.display, 'none');
});

check('the sidebar is watched by attribute, and closing brings the strip back', () => {
  const { doc, shell, log } = mountWith({ setup: (d) => { sidebarPanel(d, 700); } });
  // The conversation feature installs an attribute observer of its own, so name
  // the attribute the sidebar watcher has to carry.
  const watcher = log.observers.find((o) => o.options && Array.isArray(o.options.attributeFilter)
    && o.options.attributeFilter.includes('data-sidebar-right-open'));
  assert.ok(watcher, 'no attribute observer installed for the sidebar');
  assert.deepEqual(watcher.options.attributeFilter,
    ['data-sidebar-right-open', 'data-sidebar-right-panel']);
  assert.equal(watcher.target, doc.body, 'the panel can appear anywhere, so body is the right root');
  assert.equal(shell.style.display, 'none', 'an open sidebar must stand the strip down at mount');
  // Closing: the attribute is gone, so the first read already has the final
  // position and the strip must come back without waiting for the animation.
  doc.body.children.find((c) => c.className === 'sidebar_panel').removeAttribute('data-sidebar-right-open');
  log.timeouts.length = 0;
  log.raf.length = 0;
  watcher.cb();
  assert.notEqual(shell.style.display, 'none', 'closing must bring the strip back immediately');
  const expected = 1400 - 900 + 8;
  assert.ok(Math.abs(parseFloat(shell.style.right) - expected) <= 1,
    `and back inside the conversation column, right=${shell.style.right}, expected ${expected}`);
  // The slide itself is transform-driven: the strip follows it frame by frame
  // rather than waiting for a timer, so the flip must open a follow run.
  assert.ok(log.raf.length > 0, 'the attribute flip must start a per-frame follow');
  // The settle re-read is kept as the fallback for environments with no frames.
  assert.deepEqual(log.timeouts.map((t) => t.delay), [320],
    'the settle re-read must be scheduled after the slide');
});

check('the strip follows the sidebar slide frame by frame', () => {
  // The slide is a transform plus an animated grid track: its rect moves every
  // frame while nothing in the DOM says "still moving". Sampling it once on the
  // attribute flip and again after a fixed settle left the strip motionless
  // through the whole slide, then jumping — reported as "it does not keep up".
  const { doc, shell, log } = mountWith({ setup: (d) => { sidebarPanel(d, 1200); } });
  const panel = doc.body.children.find((c) => c.className === 'sidebar_panel');
  const watcher = log.observers.find((o) => o.options && Array.isArray(o.options.attributeFilter)
    && o.options.attributeFilter.includes('data-sidebar-right-open'));
  assert.notEqual(shell.style.display, 'none', 'a panel to the right of the strip must not hide it');
  log.raf.length = 0;
  // Opening: the attribute flips and the slide begins.
  panel.setAttribute('data-sidebar-right-open', '');
  watcher.cb();
  assert.equal(log.raf.length, 1, 'the slide must open exactly one follow run');
  // Mid-slide the panel has reached the strip: the very next frame must know,
  // with no timer involved.
  panel.getBoundingClientRect = () => ({
    top: 0, bottom: 1080, left: 700, right: 1400, width: 700, height: 1080,
  });
  log.raf[0]();
  assert.equal(shell.style.display, 'none',
    'the frame that sees the overlap must stand the strip down');
  // Sliding back out: the next frame brings it back straight away.
  panel.getBoundingClientRect = () => ({
    top: 0, bottom: 1080, left: 1200, right: 1400, width: 200, height: 1080,
  });
  assert.ok(log.raf.length >= 2, 'the follow run must keep scheduling frames');
  log.raf[1]();
  assert.notEqual(shell.style.display, 'none',
    'the frame that sees the space free must bring the strip back');
});

check('the layout gate is a ratio: 23/40 paints nothing, 24/40 paints', () => {
  const below = mountWith({ laidOut: (i) => i < 23 });
  assert.equal(below.rects().length, 0, 'a not-ready pass must paint nothing at all');
  assert.ok(below.log.timeouts.some((t) => t.delay === 60), 'and it must queue a retry');
  const above = mountWith({ laidOut: (i) => i < 24 });
  assert.ok(above.rects().length > 0, 'a pass that clears the ratio must paint');
});

check('the queued retry paints once layout has finished', () => {
  const { scroller, rects, log } = mountWith({ laidOut: (i) => i < 1 });
  assert.equal(rects().length, 0, 'nothing is painted while layout is unready');
  // Layout finishes: every block now reports its real height.
  scroller.children.forEach((block, i) => {
    block.getBoundingClientRect = () => ({
      top: i * TURN_STEP, bottom: (i + 1) * TURN_STEP, height: TURN_STEP, left: 0, right: 800, width: 800,
    });
  });
  const retry = log.timeouts.find((t) => t.delay === 60);
  assert.ok(retry, 'a retry must have been queued');
  retry.fn();
  assert.ok(rects().length > 0, `the retry must paint, got ${rects().length} rects`);
});

check('painted bars are as long as the message really is', () => {
  // Every block here is laid out and all of them are TURN_STEP tall, so every bar
  // must be about TURN_STEP of canvas. Without this, a pass that ignored the
  // measured height — or used a placeholder for everything — would collapse the
  // whole picture to slivers and nothing else in this file would notice: the
  // thumb and offset checks read the strip's geometry, never the bar lengths.
  const { shell, rects } = mountWith();
  const scale = canvasOf(shell).height / TOTAL_H;
  const expected = TURN_STEP * scale;
  const drawn = rects();
  assert.equal(drawn.length, TURN_COUNT, 'every block must be drawn');
  const wrong = drawn.findIndex((bar) => Math.abs(bar.h - expected) > 1.5);
  assert.equal(wrong, -1,
    `block ${wrong} drawn ${drawn[wrong] && drawn[wrong].h}px; its real height implies ${expected}px`);
});

check('a block whose layout has not settled is estimated from its text, not drawn as a sliver', () => {
  // A block that measures 0 still has to be drawn somewhere, and a flat guess is
  // wrong in both directions. The visible failure of guessing low is this one: a
  // long message collapses to a few pixels and reads as "that message is not
  // shown at all".
  const LINES = 30;
  const text = 'x'.repeat(45 * LINES);
  const { shell, rects } = mountWith({
    laidOut: (i) => i !== 20,
    setup: (doc) => {
      const scroller = doc.body.children.find((c) => c.className === 'session_scrollBody');
      scroller.children[20].textContent = text;
    },
  });
  const canvas = canvasOf(shell);
  const scale = canvas.height / TOTAL_H;         // canvas px per document px
  const implied = (36 + LINES * 21) * scale;     // the estimator's own arithmetic
  const bar = rects()[20];
  assert.ok(Math.abs(bar.h - implied) <= 1.5,
    `unmeasured block drawn ${bar.h}px tall; its text implies ${implied}px`);
  // And stated as the thing that is actually visible: not a sliver.
  assert.ok(bar.h >= 20, `a long unmeasured block must not collapse to ${bar.h}px`);
});

// ── which elements count as message rows ────────────────────────────────────
//
// Upstream marks two kinds of element with `data-chat-turn`: every message row and
// the group seat that wraps a run of them. Counting both draws one bar across a
// group and another for each of its rows — overlapping grey blocks, reported from
// the running client.
console.log('\n== message rows ==');

/** One message row, at `top`, `height` tall, as the strip should see it. */
function rowEl(doc, { top, height, turn = '', kind = '' }) {
  const el = doc.createElement('div');
  el.setAttribute('data-chat-turn', turn);
  if (kind) el.setAttribute('data-chat-flow-kind', kind);
  el.textContent = `row at ${top}`;
  el.getBoundingClientRect = () => ({
    top, bottom: top + height, height, left: 0, right: 800, width: 800,
  });
  return el;
}

/** A scroll container that is genuinely scrollable, so the strip stays shown. */
function columnEl(doc, { scrollHeight = 1000, view = 200 } = {}) {
  const scroller = doc.createElement('div');
  scroller.className = 'session_scrollBody';
  scroller.clientHeight = view;
  scroller.scrollHeight = scrollHeight;
  scroller.getBoundingClientRect = () => ({
    top: 0, bottom: view, left: 0, right: 900, width: 900, height: view,
  });
  doc.body.appendChild(scroller);
  return scroller;
}

/** Mount a hand-built column and return what was painted. */
function mountColumn(build) {
  const doc = installGlobals();
  const scroller = columnEl(doc);
  build(doc, scroller);
  instrument();
  makePlugin().apply({ get: () => undefined });
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  const drawn = canvasOf(shell).getContext('2d').calls.filter((c) => c.op === 'rect');
  return { shell, drawn };
}

/** Assert that no painted bar covers another. */
function assertNoOverlap(drawn) {
  const sorted = drawn.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    assert.ok(sorted[i].y >= prev.y + prev.h - 0.5,
      `bar ${i} starts at ${sorted[i].y}, inside the previous bar (${prev.y}..${prev.y + prev.h})`);
  }
}

check('a group wrapper is not drawn as a message on top of its own rows', () => {
  const { drawn } = mountColumn((doc, scroller) => {
    // Exactly what upstream renders: the seat carries data-chat-turn, and so does
    // each row inside it.
    const seat = doc.createElement('div');
    seat.setAttribute('data-chat-turn', '1');
    seat.setAttribute('data-chat-group-key', 'g1');
    seat.getBoundingClientRect = () => ({ top: 0, bottom: 300, height: 300, left: 0, right: 800, width: 800 });
    for (let i = 0; i < 3; i += 1) seat.appendChild(rowEl(doc, { top: i * 100, height: 100, turn: '1' }));
    scroller.appendChild(seat);
    scroller.appendChild(rowEl(doc, { top: 300, height: 700, turn: '2' }));
  });
  assert.equal(drawn.length, 4, `one bar per row: expected 3 in the group + 1 after, got ${drawn.length}`);
  assertNoOverlap(drawn);
});

check('rows inside a hidden subtree never reach the canvas', () => {
  const { drawn } = mountColumn((doc, scroller) => {
    // The rows report real heights, so only the hidden-subtree rule can reject
    // them — which is the point: upstream hides a collapsed group's rows.
    const hiddenBox = doc.createElement('div');
    hiddenBox.setAttribute('hidden', '');
    for (let i = 0; i < 3; i += 1) hiddenBox.appendChild(rowEl(doc, { top: i * 100, height: 100, turn: '1' }));
    scroller.appendChild(hiddenBox);
    scroller.appendChild(rowEl(doc, { top: 300, height: 700, turn: '2' }));
  });
  assert.equal(drawn.length, 1, `only the visible row may be drawn, got ${drawn.length}`);
});

check('a collapsed group is represented by its wrapper alone', () => {
  const { drawn } = mountColumn((doc, scroller) => {
    // Grouped and closed: the rows are not laid out, so the seat is the only thing
    // that stands for that stretch of the conversation. Counting the rows as well
    // used to fill the table with estimated bars piled on the same spot.
    // The seat itself IS laid out — a closed group still shows its one-line header.
    const seat = doc.createElement('div');
    seat.setAttribute('data-chat-turn', '1');
    seat.setAttribute('data-chat-group-key', 'g1');
    seat.getBoundingClientRect = () => ({ top: 0, bottom: 40, height: 40, left: 0, right: 800, width: 800 });
    for (let i = 0; i < 3; i += 1) seat.appendChild(rowEl(doc, { top: 0, height: 0, turn: '1' }));
    scroller.appendChild(seat);
    scroller.appendChild(rowEl(doc, { top: 300, height: 700, turn: '2' }));
  });
  assert.equal(drawn.length, 2, `expected the wrapper + the next row, got ${drawn.length}`);
  assertNoOverlap(drawn);
});

check('an idle sync tick does not repaint', () => {
  const { rects, passes, log } = mountWith();
  const drawn = rects().length;
  const painted = passes();
  assert.equal(drawn, TURN_COUNT, 'the mount must paint every block');
  const tick = log.intervals.find((t) => t.delay === 250);
  assert.ok(tick, 'the fallback tick must still be installed');
  for (let i = 0; i < 5; i += 1) tick.fn();
  assert.equal(passes(), painted, 'five idle ticks must not repaint at all');
  assert.equal(rects().length, drawn, 'and the picture must be untouched');
});

check('a content mutation drives a redraw', () => {
  const { rects, passes, log, contentWatcher } = mountWith();
  const drawn = rects().length;
  const painted = passes();
  const watcher = contentWatcher();
  // The style-guard observer also watches for childList, so this has to be the
  // one attached to the conversation column.
  assert.ok(watcher, 'the scroll container must be watched for content changes');
  log.timeouts.length = 0;
  watcher.cb();
  // The mutation must schedule its own coalesced redraw (120ms) rather than
  // waiting for the 250ms tick: that wait is what "it still feels slow" was.
  assert.ok(log.timeouts.some((t) => t.delay === 120),
    'a mutation must schedule a coalesced redraw, not wait for the tick');
  // The mutation only marks the picture stale; a sync is what draws it.
  // (Nothing here waits on a real timer: the recorded callback is invoked.)
  log.intervals.find((t) => t.delay === 250).fn();
  assert.ok(passes() > painted, 'a mutation must drive a redraw');
  assert.equal(rects().length, drawn, 'the same content still paints the same number of blocks');
});

check('a scrollHeight change alone still triggers a redraw (the fallback path)', () => {
  const { scroller, rects, passes, log } = mountWith();
  const drawn = rects().length;
  const painted = passes();
  // No DOM mutation at all: a block that grew in place. Only the total reveals
  // it, which is why the cheap total comparison has to stay.
  scroller.scrollHeight = TOTAL_H + TURN_STEP;
  log.intervals.find((t) => t.delay === 250).fn();
  assert.ok(passes() > painted, 'a redraw must happen when the total moves');
  assert.equal(rects().length, drawn, 'and it must measure the same blocks');
});

// ── the strip belongs to the conversation, not to the window ────────────────
//
// The conversation area is the scroll container's box minus the composer, which
// upstream parks sticky inside that same container. On a real session the window
// also holds a 76px conversation header, which is why a window-anchored strip
// starts above the conversation — the reported "the top is too high, and worse
// in a non-maximised window".
console.log('\n== conversation anchoring ==');

/** Point getComputedStyle at a fixed set of official variables. */
function withVars(vars) {
  globalThis.getComputedStyle = () => ({
    getPropertyValue: (name) => (name in vars ? vars[name] : ''),
  });
}

check('the strip starts inside the conversation area, not above it', () => {
  // Column at y=120..720: on a real session that 120px is the header plus
  // whatever chrome precedes it. The old formula centred the strip in
  // `innerHeight - composer`, which lands near y=8 — above all of it.
  const { shell } = mountWith({ top: 120, view: 600 });
  const top = parseFloat(shell.style.top);
  const height = parseFloat(shell.style.height);
  assert.ok(top >= 120, `the strip must not start above the conversation: top=${top}`);
  assert.equal(top, 120 + 8, "and it starts at the conversation's top edge + the gap");
  assert.ok(top + height <= 720 - 152,
    `and it must end above the composer: ${top} + ${height} vs 720 - 152`);
});

check('the composer height is read from the official measurement', () => {
  // Upstream measures the composer and writes `--dsh-composer-height` onto the
  // scroll container. A hard-coded 152px is right only until the composer grows
  // (a multi-line draft, an attachment row) — then the strip's bottom would end
  // up underneath it.
  const { shell } = mountWith({
    top: 120,
    view: 600,
    setup: () => withVars({ '--dsh-composer-height': '200px' }),
  });
  const top = parseFloat(shell.style.top);
  const height = parseFloat(shell.style.height);
  assert.ok(top + height <= 720 - 200,
    `the strip must respect the measured composer: ${top} + ${height} vs 720 - 200`);
});

check('the strip narrows with the conversation gutter instead of vanishing', () => {
  // Official layout: the scroll body pads itself by 32px and the text column
  // inside it stays 680-920px, so when the sidebar's track takes width from the
  // conversation column the *gutter* absorbs it. A 460px column leaves 32px for
  // the strip; a 900px column leaves 110px. The strip must track that, not sit at
  // a fixed 58px and get covered.
  const narrow = mountWith({ width: 460, textRight: 428 });
  assert.equal(parseFloat(narrow.shell.style.width), 28,
    `a 32px gutter leaves room for a 28px strip, got ${narrow.shell.style.width}`);
  assert.equal(canvasOf(narrow.shell).width, 28,
    'and the canvas must be rebuilt at that width, not clipped by the shell');

  const wide = mountWith({ width: 900, textRight: 790 });
  assert.equal(parseFloat(wide.shell.style.width), 58,
    `a 110px gutter keeps the full width, got ${wide.shell.style.width}`);
});

check('the text column is measured, not parsed out of a CSS expression', () => {
  // Upstream publishes the text column's limit as
  // `clamp(680px, calc(var(--dsh-conversation-column-width) * .64), 920px)`, and
  // a custom property keeps its token stream — reading it back gives that
  // expression, not a number. So the gutter comes from the rows themselves; if it
  // were parsed instead, this column would silently keep the full strip width.
  const { shell } = mountWith({
    width: 700,
    textRight: 660,                                  // a 40px gutter -> a 36px strip
    setup: () => withVars({
      '--dsh-chat-content-width': 'clamp(680px, calc(700px * .64), 920px)',
    }),
  });
  assert.equal(parseFloat(shell.style.width), 36,
    `the measured gutter must decide, got ${shell.style.width}`);
});

check('a px width preference is honoured when there are no rows to measure', () => {
  // Before the first row paints there is nothing to measure, so the published
  // width is used instead. In the browser `--dsh-chat-content-width` is
  // `var(--dsh-chat-user-width, clamp(…))` and the custom-property chain resolves
  // to the px number the preference sets — the double hands over the resolved
  // value, which is what a computed style returns.
  const { shell } = mountWith({
    width: 700,
    textRight: 0,                                    // nothing measurable
    setup: () => withVars({ '--dsh-chat-content-width': '600px' }),
  });
  assert.equal(parseFloat(shell.style.width), 46,
    `pad 32 + (636 - 600) / 2 = 50 gutter -> 46px strip, got ${shell.style.width}`);
});

check('a conversation-column resize moves the strip in the same callback', () => {
  // The sidebar opening animates `grid-template-columns`, so the column resizes
  // on every frame. Redrawing on the coalescing window and re-measuring the
  // geometry only on the 250ms tick is what "it does not keep up" looked like.
  const { scroller, shell, log, passes } = mountWith();
  const resizer = log.resizers.find((r) => r.target === scroller);
  assert.ok(resizer, 'the conversation column must be watched for resizes');
  const painted = passes();
  // The sidebar takes a 200px track on the right.
  scroller.getBoundingClientRect = () => ({
    top: 0, bottom: VIEW_H, left: 0, right: 700, width: 700, height: VIEW_H,
  });
  resizer.cb();
  assert.equal(parseFloat(shell.style.right), 1400 - 700 + 8,
    `the strip must follow the column immediately, right=${shell.style.right}`);
  assert.equal(passes(), painted,
    'and a width-only change must not repaint the picture');
});

check('a taller conversation re-scales the picture', () => {
  const { scroller, shell, log, passes } = mountWith();
  const painted = passes();
  const before = canvasOf(shell).height;
  scroller.clientHeight = 600;
  scroller.getBoundingClientRect = () => ({
    top: 0, bottom: 600, left: 0, right: 900, width: 900, height: 600,
  });
  log.resizers.find((r) => r.target === scroller).cb();
  assert.ok(passes() > painted, 'the band change must drive a redraw');
  assert.notEqual(canvasOf(shell).height, before,
    'the canvas must follow the conversation area, not the window');
});

check('the window height alone no longer decides the strip', () => {
  // Locking the invariant in the direction the bug went: with the column
  // unchanged, a window resize must not move or rescale the strip — the window
  // includes chrome that is none of the strip's business.
  const { shell, log } = mountWith();
  const top = shell.style.top;
  const canvasHeight = canvasOf(shell).height;
  globalThis.window.innerHeight = 700;
  log.intervals.find((t) => t.delay === 250).fn();
  assert.equal(shell.style.top, top, 'the strip must stay where the conversation is');
  assert.equal(canvasOf(shell).height, canvasHeight,
    'and its scale must not follow the window');
});

check('the tip stays quiet while the layout gate is withholding the picture', () => {
  const { shell, rects } = mountWith({ laidOut: (i) => i < 1 });
  assert.equal(rects().length, 0, 'nothing is painted in this state');
  hover(shell, shell.clientHeight / 2);
  assert.ok(!tipOf(shell).hasAttribute('data-show'),
    'the tip must not name a block that is not on the canvas');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
