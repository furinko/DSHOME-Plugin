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

check('apply() installs conversation and minimap stylesheets', () => {
  const doc = installGlobals();
  const plugin = loaded.factory(provide);
  // ctx.get('theme') returns undefined and ctx.slots is absent: the theme
  // feature must degrade instead of throwing, and the other two must still run.
  plugin.apply({ get: () => undefined });
  const markers = doc.head.children.map((c) => c.getAttribute('data-plugin'));
  assert.ok(markers.includes('dshome-plugin-conversation'), 'conversation stylesheet missing');
  assert.ok(markers.includes('dshome-plugin-minimap'), 'minimap stylesheet missing');
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

check('conversation stylesheet clamps the think body to 12 lines', () => {
  const doc = installGlobals();
  loaded.factory(provide).apply({ get: () => undefined });
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  assert.match(css, /max-height:calc\(12 \*/);
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
function addColumn(doc, { turns, step, total, view = VIEW_H, left = 0, top = 0, laidOut = null, kinds = null }) {
  const scroller = doc.createElement('div');
  scroller.className = 'session_scrollBody';
  scroller.clientHeight = view;
  scroller.scrollHeight = total;
  scroller.scrollTop = 0;
  scroller.getBoundingClientRect = () => ({
    top, bottom: top + view, left, right: left + 900, width: 900, height: view,
  });
  for (let i = 0; i < turns; i += 1) {
    const block = doc.createElement('div');
    block.setAttribute('data-chat-turn', String(i + 1));
    if (kinds) block.setAttribute('data-chat-flow-kind', kinds[i % kinds.length]);
    block.textContent = `hello from turn ${i}`;
    const ready = laidOut === null || laidOut(i);
    block.getBoundingClientRect = () => ({
      top: i * step,
      bottom: (i + 1) * step,
      height: ready ? step : 0,
      left: 0,
      right: 800,
      width: 800,
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
  const log = { timeouts: [], intervals: [], observers: [], now: 1000000 };
  const win = globalThis.window;
  win.setTimeout = (fn, delay) => { log.timeouts.push({ fn, delay }); return log.timeouts.length; };
  win.clearTimeout = () => {};
  win.setInterval = (fn, delay) => { log.intervals.push({ fn, delay }); return log.intervals.length; };
  win.clearInterval = () => {};
  globalThis.MutationObserver = class {
    constructor(cb) { this.cb = cb; log.observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  Date.now = () => log.now;
  return log;
}

/** Build a session, instrument the scheduling, then apply the real bundle. */
function mountWith({
  turns = TURN_COUNT, step = TURN_STEP, total = TOTAL_H, view = VIEW_H,
  laidOut = null, kinds = null, left = 0, top = 0, setup = null,
} = {}) {
  const doc = installGlobals();
  const scroller = addColumn(doc, { turns, step, total, view, left, top, laidOut, kinds });
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

check('the strip stands down while the right sidebar covers its column', () => {
  const { shell } = mountWith({ setup: (doc) => { sidebarPanel(doc, 1000); } });
  // The sidebar is an overlay — it reserves no layout space — so while it is
  // open the column the strip lives in *is* the sidebar. Sliding the strip to
  // the panel's edge would park it on top of the conversation being read; the
  // honest answer is to stand down and come back when the space is free.
  assert.equal(shell.style.display, 'none', 'the strip must stand down while covered');
});

check('a sidebar surface away from the strip column does not hide it', () => {
  // A floating pane can sit anywhere. One that never reaches the right margin
  // must not take the strip down with it — the rule is the rect, not the name.
  const { shell } = mountWith({ setup: (doc) => { sidebarPanel(doc, 100); } });
  assert.notEqual(shell.style.display, 'none', 'a sidebar nowhere near the strip must not hide it');
  assert.ok(Math.abs(parseFloat(shell.style.right) - 8) <= 1,
    `with nothing covering it the strip sits at the window edge, right=${shell.style.right}`);
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
      float.getBoundingClientRect = () => ({
        top: 0, bottom: 1080, left: 1000, right: 1400, width: 400, height: 1080,
      });
      doc.body.appendChild(float);
    },
  });
  assert.equal(shell.style.display, 'none', 'a floating pane over the column must hide the strip');
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
  const { doc, shell, log } = mountWith({ setup: (d) => { sidebarPanel(d, 1000); } });
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
  watcher.cb();
  assert.notEqual(shell.style.display, 'none', 'closing must bring the strip back immediately');
  assert.ok(Math.abs(parseFloat(shell.style.right) - 8) <= 1,
    `and back to the window edge, right=${shell.style.right}`);
  // Opening reads the rect mid-slide, so a settle re-read is scheduled.
  assert.deepEqual(log.timeouts.map((t) => t.delay), [320],
    'the settle re-read must be scheduled after the slide');
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

check('a window resize re-scales the picture even when the column does not change', () => {
  const { shell, passes, rects, log } = mountWith();
  const painted = passes();
  const before = canvasOf(shell).style.height;
  // A shorter window lowers the standard band, so the canvas has to be rebuilt
  // at the new scale. The scroll container's own height is untouched here, which
  // is exactly the case its ResizeObserver cannot see.
  globalThis.window.innerHeight = 700;
  log.intervals.find((t) => t.delay === 250).fn();
  assert.ok(passes() > painted, 'the band change must drive a redraw');
  const after = canvasOf(shell).style.height;
  assert.notEqual(after, before, `the canvas must follow the new band (still ${after})`);
  assert.ok(rects().length > 0, 'and the picture must still be drawn');
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
