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
  getContext() { return null; }
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
const realWarn = console.warn;
console.warn = () => { expectedWarnings += 1; };
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
  assert.deepEqual(shell.children.map((c) => c.tagName), ['DIV', 'DIV']);
  const view = shell.children[0];
  assert.equal(view.className, 'dshome-plugin-minimap-view');
  assert.deepEqual(view.children.map((c) => c.tagName), ['CANVAS']);
  assert.equal(shell.children[1].className, 'dshome-plugin-minimap-thumb');
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

/** The canvas offset the bundle wrote, read back out of the transform. */
function offsetOf(shell) {
  const canvas = shell.children[0].children[0];
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
  const thumb = shell.children[1];
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

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
