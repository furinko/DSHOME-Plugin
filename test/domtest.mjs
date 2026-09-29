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
 * Match the selector forms this plugin emits, so idempotency is genuinely
 * exercised rather than trivially satisfied by a stub returning null.
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

/** Fresh globals + a fresh DOM. Returns the new document. */
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
  assert.deepEqual(shell.children.map((c) => c.tagName), ['CANVAS', 'DIV']);
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

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
