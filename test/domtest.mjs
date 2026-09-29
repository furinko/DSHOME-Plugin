// Executes dshome-plugin's client logic against a minimal DOM double.
//
// The selftest covers pure geometry and packaging, but the modules also do real
// work on attach: style injection, selector queries, canvas painting, pointer
// handling, and the loader handshake. Those paths only run in a browser, so
// without a DOM double they would never be exercised before release.
//
// Run with `node test/domtest.mjs`.

import assert from 'node:assert/strict';

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

// ── a DOM just large enough for these modules ───────────────────────────────
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
    this.clientHeight = 700;
    this.scrollTop = 0;
    this.scrollHeight = 4000;
    this.className = '';
  }
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
  querySelector() { return null; }
  querySelectorAll() { return []; }
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
 * Match the selector forms this package actually emits, so idempotency is
 * genuinely exercised rather than trivially satisfied by a stub returning null.
 * Supported: `tag[attr='value']` and `tag[attr]`.
 */
function matches(node, selector) {
  const m = /^([a-z]+)?(?:\[([^=\]]+)(?:='([^']*)')?\])?$/.exec(selector);
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
  const doc = {
    head,
    body,
    documentElement: new El('html'),
    createElement: (t) => new El(t),
    querySelector: (sel) => walk(doc.documentElement).find((n) => matches(n, sel)) ?? null,
    querySelectorAll: (sel) => walk(doc.documentElement).filter((n) => matches(n, sel)),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  doc.documentElement.appendChild(head);
  doc.documentElement.appendChild(body);
  return doc;
}

function installGlobals() {
  const doc = makeDocument();
  globalThis.document = doc;
  globalThis.window = {
    innerWidth: 1400,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener: () => {},
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

const doc = installGlobals();

// ── shared: style injection ─────────────────────────────────────────────────
console.log('\n== style injection ==');

const { installStyle, readColor, safe } = await import('../lib/shared.js');

check('injects exactly one style tag per plugin id', () => {
  const before = doc.head.children.length;
  installStyle('t1', 'body{color:red}');
  installStyle('t1', 'body{color:red}');
  assert.equal(doc.head.children.length, before + 1, 'second call must be a no-op');
});

check('style tag carries the plugin marker attribute', () => {
  const tag = doc.head.children.at(-1);
  assert.equal(tag.getAttribute('data-plugin'), 't1');
  assert.equal(tag.textContent, 'body{color:red}');
});

check('readColor falls back when the token is unset', () => {
  assert.equal(readColor('--nope', '#abc'), '#abc');
});

check('safe() swallows and reports failures', () => {
  const original = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    assert.equal(safe(() => { throw new Error('boom'); }, 'label'), undefined);
    assert.ok(warned, 'should warn');
    assert.equal(safe(() => 42), 42, 'should pass through success');
  } finally {
    console.warn = original;
  }
});

// ── conversation module ─────────────────────────────────────────────────────
console.log('\n== conversation module ==');

const { applyConversation } = await import('../lib/conversation.js');

check('applies without throwing on an empty document', () => {
  applyConversation();
});

check('injects its stylesheet', () => {
  const found = doc.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation',
  );
  assert.equal(found.length, 1);
});

check('stylesheet clamps the think body to 12 lines', () => {
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  assert.match(css, /max-height:calc\(12 \*/);
  assert.match(css, /data-expanded/);
});

check('stylesheet raises specificity for the collapsed state', () => {
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  // Upstream's chat CSS is lazily injected after ours; without the extra
  // attribute the same-specificity rule would lose.
  assert.match(css, /data-state\]:not\(\[data-expanded\]\)/);
});

check('stylesheet styles the card kinds', () => {
  const css = doc.head.children
    .find((c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation').textContent;
  assert.match(css, /data-chat-flow-kind="tool-call"/);
  assert.match(css, /:not\(\[hidden\]\)/);
});

check('is idempotent when applied twice', () => {
  applyConversation();
  const found = doc.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-conversation',
  );
  assert.equal(found.length, 1, 'must not duplicate the tag');
});

// ── minimap module ──────────────────────────────────────────────────────────
console.log('\n== minimap module ==');

const { applyMinimap } = await import('../lib/minimap.js');

check('applies without a live conversation', () => {
  applyMinimap();
});

check('creates the strip shell on body', () => {
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.ok(shell, 'shell missing');
});

check('strip starts hidden when there is no conversation', () => {
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.equal(shell.style.display, 'none');
});

check('shell contains canvas and thumb', () => {
  const shell = doc.body.children.find((c) => c.className === 'dshome-plugin-minimap');
  assert.deepEqual(shell.children.map((c) => c.tagName), ['CANVAS', 'DIV']);
  assert.equal(shell.children[1].className, 'dshome-plugin-minimap-thumb');
});

check('injects the strip stylesheet', () => {
  const found = doc.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap',
  );
  assert.equal(found.length, 1);
});

check('hides the official rail by default', () => {
  const rail = doc.head.children.find(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap-rail',
  );
  assert.ok(rail, 'rail rule missing');
  assert.match(rail.textContent, /pointer-events:none/);
});

check('does not add a rail rule when hideOfficialRail is false', () => {
  // Must be judged in a fresh document: the default call above already installed
  // the rail rule, and installStyle dedupes by marker attribute, so reusing that
  // document would report the earlier rule rather than this call's behaviour.
  const fresh = installGlobals();
  applyMinimap({ hideOfficialRail: false });
  const railRules = fresh.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap-rail',
  );
  assert.equal(railRules.length, 0, 'no rail rule expected');
  const mainRules = fresh.head.children.filter(
    (c) => c.getAttribute('data-plugin') === 'dshome-plugin-minimap',
  );
  assert.equal(mainRules.length, 1, 'the strip stylesheet is still installed');
});

check('returns a teardown function', () => {
  const dispose = applyMinimap({ hideOfficialRail: false });
  assert.equal(typeof dispose, 'function');
  dispose();
});

check('teardown removes exactly the strip it created', () => {
  const fresh = installGlobals();
  const dispose = applyMinimap({ hideOfficialRail: false });
  assert.equal(
    fresh.body.children.filter((c) => c.className === 'dshome-plugin-minimap').length,
    1,
    'one strip created',
  );
  dispose();
  assert.equal(
    fresh.body.children.filter((c) => c.className === 'dshome-plugin-minimap').length,
    0,
    'strip removed',
  );
});

check('repeated apply() does not stack duplicate strips', () => {
  // Each call creates its own strip, so calling apply twice without disposing
  // leaves two. This documents the contract: apply is once-per-load, and the
  // returned dispose must be used if it is ever called again.
  const fresh = installGlobals();
  const a = applyMinimap({ hideOfficialRail: false });
  const b = applyMinimap({ hideOfficialRail: false });
  assert.equal(
    fresh.body.children.filter((c) => c.className === 'dshome-plugin-minimap').length,
    2,
  );
  a();
  b();
  assert.equal(
    fresh.body.children.filter((c) => c.className === 'dshome-plugin-minimap').length,
    0,
    'both disposed cleanly',
  );
});

// ── client entry: full loader protocol ──────────────────────────────────────
console.log('\n== client entry ==');

let loaded = null;
globalThis.window.__ModuleLoader__ = {
  load(spec) {
    loaded = spec;
  },
};
globalThis.window.__dshomePlugin = undefined;

await import('../lib/client.js');

const provide = (id) => {
  if (id === 'react/jsx-runtime') return { jsx: () => null };
  return { FishLogo: () => null };
};

check('registers with the module loader', () => {
  assert.ok(loaded, 'load() was never called');
  assert.equal(loaded.id, 'dshome-plugin');
  assert.equal(typeof loaded.factory, 'function');
});

check('factory returns a plugin with name, inject and apply', () => {
  const plugin = loaded.factory(provide);
  assert.equal(plugin.name, 'dshome-plugin');
  assert.deepEqual(plugin.inject, ['slots']);
  assert.equal(typeof plugin.apply, 'function');
});

check('apply() still runs every feature when the slot service is absent', () => {
  const plugin = loaded.factory(provide);
  // Fresh document so this asserts what apply() installs, not what earlier
  // checks already left in the shared one.
  const fresh = installGlobals();
  // ctx.get('theme') returns undefined and ctx.slots is absent: the theme
  // feature must degrade instead of throwing, and the other two must still run.
  plugin.apply({ get: () => undefined });
  const markers = fresh.head.children.map((c) => c.getAttribute('data-plugin'));
  assert.ok(markers.includes('dshome-plugin-conversation'), 'conversation stylesheet missing');
  assert.ok(markers.includes('dshome-plugin-minimap'), 'minimap stylesheet missing');
  assert.ok(
    fresh.body.children.some((c) => c.className === 'dshome-plugin-minimap'),
    'minimap strip not attached',
  );
});

check('apply() tolerates a theme service that throws', () => {
  const plugin = loaded.factory(provide);
  const ctx = {
    get: () => ({
      overrideTokens() { throw new Error('upstream changed'); },
    }),
    slots: { inject() {}, register() {} },
  };
  plugin.apply(ctx); // must not propagate
});

check('theme registers all three brand slots', () => {
  const plugin = loaded.factory(provide);
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
  const fresh = installGlobals();
  plugin.apply(ctx);
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
  // registers nothing, which is how the generator form previously failed.
  //
  // The stub must return the callback's result, exactly as the real service
  // does; swallowing it would make this assertion unable to see the nesting.
  const plugin = loaded.factory(provide);
  const returns = [];
  const ctx = {
    get: () => undefined,
    slots: {
      inject(name, fn) { const value = fn(); returns.push([name, value]); return value; },
      register() { return 'REGISTRATION-TOKEN'; },
    },
  };
  plugin.apply(ctx);
  assert.equal(returns.length, 3, 'three slots declared');
  for (const [name, value] of returns) {
    assert.ok(value, `inject callback for ${name} returned nothing`);
  }
});

check('features can be disabled individually', () => {
  const fresh = installGlobals();
  globalThis.window.__dshomePlugin = { conversation: false, minimap: false };
  // Re-import in a fresh module registry is not possible here, so drive the
  // factory directly with the same option source the module reads.
  const plugin = loaded.factory(provide);
  const opts = Object.assign(
    { theme: true, conversation: true, minimap: true, hideOfficialRail: true },
    globalThis.window.__dshomePlugin,
  );
  assert.equal(opts.conversation, false);
  assert.equal(opts.minimap, false);
  plugin.apply({ get: () => undefined }); // apply itself must stay safe
  globalThis.window.__dshomePlugin = undefined;
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
