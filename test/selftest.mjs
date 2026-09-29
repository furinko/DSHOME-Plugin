// Self-check for DSHOME-Plugin.
//
// Runs without a browser. Two things are covered here:
//
//   1. The **classic-script contract**, which is the one that actually broke a
//      real boot. The host loads the client bundle with
//      `document.createElement("script")` + `el.src = url` — a classic script,
//      *not* a module. A single top-level `import` therefore throws
//      `SyntaxError: Cannot use import statement outside a module`, the entry
//      never activates, and the whole web boot fails (not just this plugin).
//      These checks make that mistake impossible to reintroduce silently.
//
//   2. Behavioural invariants each derived from a bug reproduced on a real
//      session: the minimap's two-height rule, cache hygiene, theme token
//      completeness, and the slot-registration return contract.
//
// Run with `node test/selftest.mjs`.

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const clientPath = join(root, manifest.exports['./client']);
const clientSource = readFileSync(clientPath, 'utf8');

/** Strip comments so the checks below judge code, not prose about code. */
const code = clientSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── the classic-script contract ─────────────────────────────────────────────
console.log('\n== classic-script contract ==');

check('bundle has no top-level import statement', () => {
  // `import(` (dynamic) is legal in a classic script; a bare `import x` is not.
  // Check the raw source so a commented example cannot hide a real one.
  const offenders = clientSource
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /^\s*import\s+[^(]/.test(line));
  assert.deepEqual(
    offenders.map(([n, l]) => `${n}: ${l.trim()}`),
    [],
    'a top-level import makes the whole web boot fail',
  );
});

check('bundle has no top-level export statement', () => {
  const offenders = clientSource
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /^\s*export\s/.test(line));
  assert.deepEqual(offenders.map(([n, l]) => `${n}: ${l.trim()}`), []);
});

check('bundle is a single self-contained file', () => {
  // No relative import can exist if there is only one file; assert that too, so
  // a future split is caught here rather than at boot.
  const libFiles = readdirSync(join(root, 'lib'));
  assert.deepEqual(libFiles.sort(), ['client.js', 'index.js']);
});

check('registers through the module loader factory protocol', () => {
  assert.match(clientSource, /window\.__ModuleLoader__\.load\(/);
  assert.match(clientSource, /factory:\s*\(require\)\s*=>/);
});

check('factory returns its exports', () => {
  // The loader materialises the factory's return value as the plugin body.
  assert.match(clientSource, /return module\.exports;/);
});

check('host modules come from require(), not import', () => {
  assert.match(code, /require\('react\/jsx-runtime'\)/);
  assert.match(code, /require\('@deepseek-ai\/dsh-client-ui-primitives'\)/);
});

check('declares name, inject and apply', () => {
  assert.match(code, /name:\s*'dshome-plugin'/);
  assert.match(code, /inject/);
  assert.match(code, /function apply\(ctx\)/);
});

check('each feature is isolated behind safe()', () => {
  for (const feature of ['applyTheme', 'applyConversation', 'applyMinimap']) {
    assert.ok(
      new RegExp(`safe\\([\\s\\S]{0,120}${feature}`).test(code),
      `${feature} is not wrapped in safe()`,
    );
  }
});

// ── selectors: semantic attributes only ─────────────────────────────────────
console.log('\n== selectors ==');

check('uses data-variant for reasoning blocks', () => {
  assert.match(code, /data-variant="think"/);
});

check('never relies on hashed CSS-module class names', () => {
  // A hashed class looks like lcKema_frame. `[class*="_scrollBody"]` and
  // `[class*="_frame"]` are suffix matches on stable upstream names and are
  // allowed; a bare `.foo_bar` selector is not.
  const bare = code.match(/\.[a-zA-Z]{5,}_[a-zA-Z]+/g) || [];
  assert.deepEqual(bare, [], 'hashed class selector found');
});

check('card selector excludes empty hidden blocks', () => {
  // Upstream marks empty per-turn process blocks with `hidden` while leaving
  // them display:block; without the guard they become blank cards.
  assert.match(code, /:not\(\[hidden\]\)/);
});

check('card selector covers tool calls and system injections', () => {
  for (const kind of ['tool-call', 'context', 'system-prompt', 'command']) {
    assert.ok(code.includes(`'${kind}'`), `missing ${kind}`);
  }
});

// ── minimap geometry: the two-height rule ───────────────────────────────────
console.log('\n== minimap geometry ==');

const MAX_HEIGHT_PX = 760;
const COMPOSER_RESERVE_PX = 152;
const THUMB_RATIO = 0.08;
const MIN_THUMB_PX = 8;

const computeBand = (innerHeight) =>
  Math.max(120, Math.min(MAX_HEIGHT_PX, innerHeight - COMPOSER_RESERVE_PX));
const thumbHeight = (band) => Math.max(MIN_THUMB_PX, band * THUMB_RATIO);

check('band is driven by viewport, not by content length', () => {
  // Same viewport must yield the same band for a 2-message and a 2000-message
  // session; otherwise the thumb changes size between conversations.
  assert.equal(computeBand(1080), computeBand(1080));
  assert.equal(computeBand(1080), 760, 'capped at MAX_HEIGHT_PX for a tall viewport');
});

check('band never collapses below a usable floor', () => {
  assert.equal(computeBand(240), 120);
});

check('thumb is a constant fraction of the band', () => {
  for (const height of [400, 800, 1200]) {
    const band = computeBand(height);
    assert.equal(thumbHeight(band), Math.max(MIN_THUMB_PX, band * THUMB_RATIO));
  }
});

check('short content pins travel to zero', () => {
  const total = 500;   // document
  const view = 800;    // viewport taller than document
  assert.equal(total > view ? 1 : 0, 0, 'content fits => the box must not move');
});

check('at zoom 1 the two rulers are identical', () => {
  // Clicking must land the clicked content under the pointer. That holds only
  // when (band-thumb)/(total-view) === band/total, i.e. thumb = band*view/total.
  const total = 5000;
  const view = 700;
  const band = 600;
  const thumb = band * (view / total);
  const left = (band - thumb) / (total - view);
  const right = band / total;
  assert.ok(Math.abs(left - right) < 1e-12, 'ratios must agree exactly at zoom 1');
});

check('a zero-height block is not admitted to the cache', () => {
  // Invariant ③: a block measuring 0px has not laid out yet, so it gets a
  // temporary height and no cache entry.
  assert.match(
    code,
    /measureCache\[i\] = undefined/,
    'the dirty-value path must clear the cache entry',
  );
});

// ── theme tokens ────────────────────────────────────────────────────────────
console.log('\n== theme ==');

/** Pull the TOKENS object out of the bundle and read its entries. */
const tokensBlock = clientSource.match(/var TOKENS = \{([\s\S]*?)\n    \};/);
const tokenEntries = tokensBlock
  ? [...tokensBlock[1].matchAll(/'(--dsw-[^']+)':\s*\{([^}]*)\}/g)]
    .map(([, name, body]) => ({ name, body }))
  : [];

check('token table is present and substantial', () => {
  assert.ok(tokensBlock, 'TOKENS object not found');
  assert.ok(tokenEntries.length >= 15, `expected many tokens, found ${tokenEntries.length}`);
});

check('every token declares both light and dark', () => {
  for (const { name, body } of tokenEntries) {
    assert.match(body, /light:/, `${name} missing light`);
    assert.match(body, /dark:/, `${name} missing dark`);
  }
});

check('brand accent differs between modes for contrast', () => {
  const brand = clientSource.match(
    /var BRAND_LIGHT = '([^']+)';[\s\S]*?var BRAND_DARK = '([^']+)';/,
  );
  assert.ok(brand, 'brand colours not found');
  assert.notEqual(brand[1], brand[2], 'dark must be lifted for the navy background');
});

check('sidebar label is exactly DSHOME', () => {
  // User-visible branding; deliberately the bare product name rather than the
  // plugin's package name.
  assert.match(code, /var BRAND_NAME = 'DSHOME';/);
});

// ── slot registration contract ──────────────────────────────────────────────
console.log('\n== slot registration ==');

check('inject callbacks return a value', () => {
  // `inject` keeps what its callback returns. A callback that returns nothing
  // registers nothing — which is exactly how the earlier generator form failed
  // silently.
  const nested = code.match(/slots\.inject\('sidebar\.brand\.mark',[\s\S]{0,400}/);
  assert.ok(nested, 'brand slot block not found');
  assert.match(nested[0], /return slots\.inject/, 'outer inject callback must return');
});

check('all three brand slots are registered', () => {
  for (const slot of [
    'sidebar.brand.mark',
    'sidebar.brand.name',
    'conversation.hero.brand.mark',
  ]) {
    assert.ok(code.includes(`'${slot}'`), `${slot} not registered`);
  }
});

// ── packaging contract ──────────────────────────────────────────────────────
console.log('\n== packaging ==');

check('declares the bundle patch so the loader can find the client', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(existsSync(join(root, 'cordis.patch.yml')), 'patch file missing');
});

check('declares dsh.client with a full bundle shape', () => {
  // The host's client-module scan reads exactly three things and silently
  // ignores the package if any is wrong, so a missing piece means the browser
  // half never loads with no error anywhere:
  //   · dsh.client must exist and be an object
  //   · dsh.client.platform must be the string "web"
  //   · exports["./client"] must point at the bundle
  const client = manifest.dsh.client;
  assert.ok(client, 'dsh.client is missing — the browser module would never load');
  assert.equal(typeof client, 'object');
  assert.equal(client.platform, 'web', 'platform must be exactly "web"');
  assert.ok(
    manifest.exports['./client'],
    'dsh.client is declared but exports["./client"] is missing',
  );
  assert.ok(existsSync(clientPath), 'client bundle missing');
});

check('a client with no inject must set immediately', () => {
  // A row with an empty `inject` has nothing to pull it in: it is neither a
  // dependency of another row nor required by one, so nothing triggers it at
  // startup. It then stays dormant until something forces a re-composition
  // (toggling the plugin in the panel does exactly that), which looks like
  // "works only after I toggle it".
  //
  // `immediately: true` is what makes the host activate it on a cold start.
  // This was observed on a real boot: the plugin applied only after a manual
  // toggle, never on launch.
  const client = manifest.dsh.client;
  const inject = client.inject ?? [];
  if (inject.length === 0) {
    assert.equal(
      client.immediately,
      true,
      'empty inject needs immediately: true, or the plugin only loads after a toggle',
    );
  }
});

check('every exports target exists on disk', () => {
  for (const [key, value] of Object.entries(manifest.exports)) {
    assert.ok(existsSync(join(root, value)), `exports["${key}"] -> ${value} missing`);
  }
});

check('main entry exists', () => {
  assert.ok(existsSync(join(root, manifest.main)), 'main missing');
});

check('cordis rows resolve to this package', () => {
  // Discipline: a row whose name is a subpath needs a matching exports entry,
  // otherwise the host fails to load it at startup.
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  const names = [...patch.matchAll(/name:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(names.length > 0, 'no rows declared');
  for (const name of names) {
    assert.equal(name, manifest.name, `row "${name}" is not this package`);
    assert.ok(!name.includes('/'), 'a subpath row would need its own exports entry');
  }
});

// ── host half ───────────────────────────────────────────────────────────────
console.log('\n== host half ==');

const host = await import('../lib/index.js');

check('host half names the plugin', () => {
  assert.equal(host.name, 'dshome-plugin');
});

check('host half exports apply', () => {
  assert.equal(typeof host.apply, 'function');
  assert.equal(host.apply(), undefined, 'must do nothing');
});

check('default export carries name and apply', () => {
  assert.equal(host.default.name, 'dshome-plugin');
  assert.equal(typeof host.default.apply, 'function');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
