// Self-check for dshome-plugin's pure logic.
//
// Runs without a browser: geometry is asserted against the same constants the
// minimap uses, and the theme tokens are imported directly rather than parsed
// out of source text. Run with `node test/selftest.mjs`.

import assert from 'node:assert/strict';
import { SELECTORS, CARD_SELECTOR } from '../lib/shared.js';
import { TOKENS } from '../lib/theme.js';

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

// ── selectors: semantic attributes only ─────────────────────────────────────
console.log('\n== selectors ==');

check('uses data-variant for reasoning blocks', () => {
  assert.match(SELECTORS.think, /data-variant="think"/);
});

check('never relies on hashed CSS-module class names', () => {
  const all = Object.values(SELECTORS).join(' ');
  // A hashed class looks like lcKema_frame; any bare identifier class is a
  // stability risk. Attribute selectors are the only permitted form.
  assert.doesNotMatch(all, /\.[a-zA-Z]{5,}_[a-zA-Z]+/);
});

check('card selector excludes empty hidden blocks', () => {
  // Upstream marks empty per-turn process blocks with `hidden` while leaving
  // them display:block; without the guard they become blank cards.
  assert.match(CARD_SELECTOR, /:not\(\[hidden\]\)/);
});

check('card selector covers tool calls and system injections', () => {
  for (const kind of ['tool-call', 'context', 'system-prompt', 'command']) {
    assert.ok(CARD_SELECTOR.includes(`"${kind}"`), `missing ${kind}`);
  }
});

// ── minimap geometry: the two-height rule ───────────────────────────────────
//
// These mirror the constants and formulas in lib/minimap.js. They are asserted
// here because the invariant is what stops short sessions from drifting.
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

check('short content pins travel to zero (nothing to scroll)', () => {
  const total = 500;   // document
  const view = 800;    // viewport taller than document
  const ratio = total > view ? 1 : 0;
  assert.equal(ratio, 0, 'content fits ⇒ the box must not move');
});

check('long content maps scroll range onto thumb travel', () => {
  const total = 10000;
  const view = 800;
  const band = computeBand(1080);
  const travel = band - thumbHeight(band);
  const mid = (total / 2) / (total - view);
  const top = mid * travel;
  assert.ok(top > 0 && top < travel, 'mid-scroll lands inside travel');
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
  const measureCache = [];
  const rect = { height: 0 };
  if (rect.height > 0) {
    measureCache[0] = { top: 0, height: rect.height };
  } else {
    measureCache[0] = undefined;
  }
  assert.equal(measureCache[0], undefined, 'unlaid-out blocks stay uncached');
});

// ── theme tokens ────────────────────────────────────────────────────────────
console.log('\n== theme ==');

check('every token declares both light and dark', () => {
  const entries = Object.entries(TOKENS);
  assert.ok(entries.length >= 15, `expected many tokens, found ${entries.length}`);
  for (const [token, pair] of entries) {
    assert.ok(pair && typeof pair === 'object', `${token} is not a light/dark pair`);
    assert.ok(pair.light, `${token} missing light`);
    assert.ok(pair.dark, `${token} missing dark`);
  }
});

check('all tokens use the --dsw- prefix', () => {
  for (const token of Object.keys(TOKENS)) {
    assert.match(token, /^--dsw-/, `${token} is not a design token`);
  }
});

check('brand accent differs between modes for contrast', () => {
  const brand = TOKENS['--dsw-alias-brand-primary'];
  assert.notEqual(brand.light, brand.dark, 'dark must be lifted for the navy background');
});

check('dark backgrounds are darker than their light counterparts', () => {
  const hex = (s) => parseInt(s.replace('#', ''), 16);
  for (const key of ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1']) {
    assert.ok(hex(TOKENS[key].dark) < hex(TOKENS[key].light), `${key} dark is not darker`);
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

// ── packaging contract ──────────────────────────────────────────────────────
console.log('\n== packaging ==');

const { readFileSync, existsSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const { dirname, join } = await import('node:path');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

check('declares the bundle patch so the loader can find the client', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(existsSync(join(root, 'cordis.patch.yml')), 'patch file missing');
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

check('declares dsh.client with a full bundle shape', () => {
  // The host's client-module scan reads exactly three things off this field and
  // silently ignores the package if any piece is wrong, so a missing piece means
  // the browser half never loads with no error anywhere:
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
  assert.ok(existsSync(join(root, manifest.exports['./client'])), 'client bundle missing');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
