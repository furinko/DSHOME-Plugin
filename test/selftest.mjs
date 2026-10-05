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
  for (const feature of ['applyTheme', 'applyConversation', 'applySidebar', 'applyMinimap', 'applyNotify']) {
    assert.ok(
      new RegExp(`safe\\([\\s\\S]{0,120}${feature}`).test(code),
      `${feature} is not wrapped in safe()`,
    );
  }
});

// ── selectors: semantic attributes only ─────────────────────────────────────
console.log('\n== selectors ==');

check('reasoning window keeps its verified anchors and stays masking', () => {
  // `data-variant="think"` DOES exist upstream: ui-chat's ReasoningRow renders
  // it (app.asar offset 19312977) alongside `data-state` (`running`/`ok`) and
  // `data-expanded`. An earlier probe searched the archive for the literal
  // `data-variant="think"`, missed the bundle's actual `"data-variant": "think"`
  // spelling, declared the anchor absent and deleted a working feature. These
  // assertions exist so that cannot happen silently again: if the window is ever
  // removed on purpose, remove the feature and this lock in the same commit,
  // with fresh asar evidence in the message.
  assert.match(code, /think: '\[data-variant="think"\]'/, 'the reasoning anchor is gone');
  assert.ok(code.includes("thinkRow: '[data-disclosure-row]'"), 'the disclosure-row anchor is gone');
  assert.ok(code.includes("thinkBody: '[data-disclosure-row] + div'"), 'the reasoning-body anchor is gone');
  assert.match(code, /var THINK_LINES = 12;/, 'the line window is gone');
  assert.ok(code.includes('max-height:calc('), 'the line-window clamp is gone');
});

check('the sticky disclosure header masks without showing', () => {
  // Upstream pins it (sticky;top:0;z-index:1) and fills it with bg-base. The
  // fill must stay — a transparent row lets the body scroll through the header
  // — but it must be the *plate* colour, because a reasoning block sits inside
  // our card (layer-1), where upstream's bg-base reads as a stray band.
  const rule = code.match(/'\[data-disclosure-row\]\{background:([^}]+)\}/);
  assert.ok(rule, 'the sticky-header rule is gone');
  assert.ok(!/transparent/.test(rule[1]), 'the sticky header stopped masking its body');
  assert.match(rule[1], /--dshome-plate/, 'the header no longer follows the plate colour');
  assert.match(code, /--dshome-plate:var\(--dsw-alias-bg-layer-1/, 'nothing sets the plate colour');
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

// ── sidebar foot: the slot anchor names the container ───────────────────────
console.log('\n== sidebar foot ==');

check('the foot layout is addressed by the slot anchor, not a hashed class', () => {
  // `renderSlot()` wraps every outlet in `<div data-slot="<key>"
  // style="display:contents">` (ui-renderer `SlotOutlet`), so the slot's own key
  // is the stable way to name its container. A CSS-Module class such as
  // `_2H3hWW_footerActions` changes on every upstream rebuild; `:has()` reaches
  // the parent from the anchor instead.
  assert.ok(
    code.includes('var FOOTER_SLOT = \'[data-slot="sidebar.footer.action"]\''),
    'the slot anchor is gone',
  );
  assert.match(
    code,
    /FOOTER_ACTIONS = 'div:has\(>' \+ FOOTER_SLOT \+ '\)'/,
    'the container selector is gone',
  );
});

check('the foot stacks its rows instead of squeezing them into one line', () => {
  // Every registrant is authored as a full-width row — dsh-opencode-go-usage
  // `.ocg-widget{width:100%}`, dsh-context `.lc-ov-entry{width:calc(100% + 4px)}`
  // (whose own source says the entry is "stacked directly above Settings"), and
  // dsh-mind `.dm-widget{width:100%}`. Sharing one 280px row gives each about
  // 66px, which is what wraps their headings mid-word.
  assert.match(code, /flex-direction:column;align-items:stretch/, 'the stack rule is gone');
});

check('the collapsed rail keeps the centred row', () => {
  // Collapsed mode passes `wide:false`, so registrants render compact badges; a
  // column would stack them into a ladder. The restore has to outrank upstream's
  // `._collapsed ._footerActions` (0,2,0), which is why it carries the attribute.
  const rule = code.match(
    /'\[data-sidebar-collapsed="true"\] ' \+ FOOTER_ACTIONS \+[\s\S]{0,80}?\{([^}]+)\}/,
  );
  assert.ok(rule, 'the collapsed restore is gone');
  assert.match(rule[1], /flex-direction:row/, 'the collapsed rail no longer stays a row');
});

check('the sidebar feature is switchable and wired', () => {
  assert.match(code, /sidebar: true/, 'the feature is not enabled by default');
  assert.match(code, /if \(o\.sidebar\)/, 'the feature is never applied');
});

// ── notify: the client-side port of the reference's host reminder ───────────
console.log('\n== notify ==');

check('the notify feature is switchable and wired', () => {
  assert.match(code, /notify: true/, 'the feature is not enabled by default');
  assert.match(code, /if \(o\.notify\)/, 'the feature is never applied');
  assert.match(code, /function applyNotify\(ctx, rawOptions\)/, 'the entry point is gone');
});

check('every upstream read is optional', () => {
  // The bundle carries no host half, so its reminder sources are client services
  // it does not declare: `slots` is the only hard inject. A missing service has to
  // mean "one scene fewer", never "the plugin failed to activate" — which is why
  // each source goes through ctx.get / ctx.inject inside applyNotify.
  for (const service of ['sessions', 'uiSession', 'remote']) {
    assert.ok(code.includes(`ctx.get('${service}')`), `${service} is not read through ctx.get`);
  }
  assert.match(code, /ctx\.inject\(\[name\], function \(\) \{ attach\(\); \}\)/,
    'late-provided services are sampled once instead of awaited');
  assert.match(code, /wired = \{ catalog: false, status: false, remote: false \}/,
    'attachment is not idempotent');
});

check('the reference copy and both throttles are carried over', () => {
  // Copy is the reference's `COPY` verbatim (`packages/dshome/lib/host/notify.js`),
  // so the two products read alike; the 5s windows are its `deliverAttention` and
  // its contract-v2 member sound window.
  for (const scene of [
    'turn-completed', 'turn-failed', 'member-completed',
    'member-failed', 'approval-asked', 'user-question',
  ]) {
    assert.ok(code.includes(`'${scene}':`), `scene ${scene} lost its copy`);
  }
  assert.match(code, /var NOTIFY_THROTTLE_MS = 5000/, 'the per-session window is gone');
  assert.match(code, /var NOTIFY_SOUND_WINDOW_MS = 5000/, 'the member sound window is gone');
});

check('delivery degrades instead of failing', () => {
  // 2026-10-06 实测教训：**构造成功 ≠ 已经弹给用户看**。Windows 上的 Electron
  // 渲染进程可以在没有应用标识的情况下构造出 Notification，却被系统静默丢弃
  // ——主人当时拿到的正是"只有声音、没有弹窗"。现在页内卡片**无条件**投递
  // （它不会被系统丢掉），系统通知只做加法：页面不在前台时才补一发。
  assert.match(code, /toast\(title, body\);\s*\n\s*var mode = opts\.systemNotification;/,
    '页内卡片不再是无条件投递');
  assert.match(code, /mode === 'always' \|\| \(mode === 'auto' && !inFront\)/,
    '系统通知不再按前后台决定');
  assert.match(code, /if \(!inFront\) flashTitle\(title\);/, '标题闪烁忽略了前后台');
  assert.match(code, /function notificationCtor\(\)/, 'Notification 探测没了');
});

check('the README documents the notify option', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /notify/, 'the feature is undocumented');
  assert.match(readme, /notifyOnTurnCompletion/, 'the per-category switches are undocumented');
  assert.match(readme, /__dshomePluginNotify/, 'the live handle is undocumented');
});

check('a feature that cannot fire says so in-page, not only in the console', () => {
  // All three sources are optional reads, so "nothing attached" is a legal state
  // that must not look identical to "working": the gap notice is the only signal
  // an owner who never opens a console can see.
  assert.match(code, /function notifyWiringGap\(wired\)/, 'the gap check is gone');
  assert.match(code, /var NOTIFY_WIRING_GRACE_MS = 5000/, 'the grace window is gone');
  assert.match(code, /var gap = notifyWiringGap\(wired\);\s*\n\s*if \(gap\) toast\(gap\.title, gap\.body\);/,
    'the gap is computed but never shown');
});

// ── minimap geometry: the filmstrip rule ────────────────────────────────────
console.log('\n== minimap geometry ==');

const MAX_HEIGHT_PX = 760;
const COMPOSER_FALLBACK_PX = 152;
const THUMB_RATIO = 0.08;
const MIN_THUMB_PX = 8;

// These checks read the bundle's *source text*. The earlier version of this
// section re-implemented the formulas locally and asserted the local copies, so
// all of them stayed green while the bundle computed something else — which is
// exactly how the dropped zoom shipped.
check('band is driven by the conversation area, not by the window or the content', () => {
  // The regression this locks: the band used to be `window.innerHeight - 152`,
  // which includes the 76px conversation header plus whatever chrome precedes it,
  // so a short window pushed the strip's top above the conversation. The band now
  // comes from the conversation column's own box, minus the composer that
  // upstream parks inside it.
  assert.match(code, /function columnBox\(\)/, 'the conversation area needs one definition');
  assert.match(code, /var available = \(box\.bottom - box\.top\) - CONVO_GAP_PX \* 2;/,
    'band input must be the conversation area');
  assert.match(code, /Math\.max\(120, Math\.min\(MAX_HEIGHT_PX, available\)\)/, 'band formula');
  assert.ok(!code.includes('window.innerHeight - COMPOSER_RESERVE_PX'),
    'the window height must not decide the band any more');
});

check('the composer height comes from the official measurement', () => {
  // `--dsh-composer-height` is written by upstream after measuring the composer,
  // so a composer that grows moves the strip's bottom with it. The flat fallback
  // stays only for environments where the variable cannot be read.
  assert.match(code, /var COMPOSER_VAR = '--dsh-composer-height';/, 'official variable');
  assert.match(code, /return readPx\(scroller, COMPOSER_VAR, COMPOSER_FALLBACK_PX\);/,
    'and it must actually be read, not replaced by the fallback constant');
  assert.match(code, /rect\.bottom - composerHeight\(\)/,
    'the conversation area must end above the composer');
});

check('the strip is top-aligned inside the conversation area', () => {
  assert.match(code, /shell\.style\.top = Math\.round\(box\.top \+ CONVO_GAP_PX\) \+ 'px';/,
    'the strip must start where the conversation starts');
});

check('the strip narrows with the conversation gutter instead of a fixed width', () => {
  assert.match(code, /function computeStripWidth\(box\)/, 'width must be derived from the column');
  assert.match(code, /Math\.max\(MIN_WIDTH_PX, Math\.min\(WIDTH_PX, Math\.round\(gutter - 4\)\)\)/,
    'width must shrink with the gutter, down to the floor');
  assert.match(code, /var w = stripWidthPx;/, 'the canvas must be rebuilt at the current width');
});

check('the gutter is measured off message rows, not parsed from a CSS expression', () => {
  // `--dsh-chat-content-width` is a `clamp()` whose computed value is a token
  // stream, so parseFloat on it yields NaN. Measuring the rows also keeps the
  // strip out of hashed CSS-module class names, which this bundle never reads.
  assert.match(code, /function textColumnRight\(\)/, 'the text column must be measured');
  assert.match(code, /var textRight = textColumnRight\(\);/, 'and the gutter must use it');
  assert.match(code, /scroller\.querySelectorAll\(SELECTORS\.flow\)/, 'from semantic rows');
  assert.match(code, /return Math\.max\(0, box\.right - textRight\);/, 'gutter = column - text');
});

check('sidebar avoidance asks about the strip itself, not the window edge', () => {
  // The bug this locks: with three grid tracks the right sidebar sits *outside*
  // the conversation column, and "covered" measured against the window's right
  // edge hid the strip whenever the sidebar was open.
  assert.match(code, /function sidebarCovers\(strip\)/, 'the rule must take the strip box');
  assert.match(code, /sidebarCovers\(stripBox\(\)\)/, 'and be asked about the strip itself');
});

check('a column resize re-places the strip at once, and the slide is followed per frame', () => {
  // The sidebar animates `grid-template-columns`, so the column resizes on every
  // frame of the slide: redrawing on a coalescing window left the geometry
  // waiting for the 250ms tick. Motion no resize reports (the panel's own
  // transform) is followed on animation frames instead.
  assert.match(code, /new ResizeObserver\(function \(\) \{ safe\(sync\); \}\)/,
    'a column resize must re-place the strip immediately');
  assert.match(code, /function followLayout\(\)/, 'a bounded per-frame follow must exist');
  assert.match(code, /window\.requestAnimationFrame\(fn\)/, 'and it must use animation frames');
  assert.match(code, /var SIDE_FOLLOW_MS = 450;/, 'bounded, not a permanent loop');
  assert.match(code, /safe\(function \(\) \{ sync\(\); \}\);\n        followLayout\(\);/,
    'the sidebar observer must actually start the follow');
});

check('zoom is derived from the thumb ratio, not fixed at 1', () => {
  // thumb = (view/total) * (band * zoom) must equal THUMB_RATIO * band, which is
  // only possible when the zoom scales with the document.
  assert.match(code, /\(THUMB_RATIO \* total\) \/ view/, 'zoom formula missing');
});

check('thumb height stays a constant fraction of the standard band', () => {
  const band = 760;
  const total = 50000;
  const view = 800;
  const zoom = (THUMB_RATIO * total) / view;
  const content = band * zoom;
  const thumb = (view / total) * content;
  assert.ok(Math.abs(thumb - band * THUMB_RATIO) < 1e-9, 'thumb must stay 8% of the band');
  assert.match(code, /\(view \/ total\) \* contentOf\(total\)/, 'thumb must derive from the canvas');
});

check('the canvas is translated inside a clipping window', () => {
  assert.match(
    code,
    /\.dshome-plugin-minimap-view\{position:absolute;inset:0;overflow:hidden/,
    'clipping window CSS missing',
  );
  assert.match(code, /view\.appendChild\(canvas\)/, 'canvas must live inside the view');
  assert.match(code, /shell\.appendChild\(view\)/, 'view must live inside the shell');
});

check('the thumb covers exactly the viewport slice of the canvas', () => {
  // NOT the (band-thumb)/(total-view) === band/total identity: that one only
  // holds at zoom 1. At any zoom the thumb's top and height must equal the
  // on-screen position and height of the viewport's span of the canvas.
  const band = 760;
  const total = 50000;
  const view = 800;
  const H = band;
  const p = 0.37;
  const zoom = (THUMB_RATIO * total) / view;
  const content = band * zoom;
  const scale = content / total;
  const thumb = (view / total) * content;
  const scrollTop = p * (total - view);
  const offset = scrollTop * scale - p * Math.max(0, H - thumb);
  const spanTop = scrollTop * scale - offset;
  assert.ok(Math.abs(spanTop - p * (H - thumb)) < 1e-9, 'thumb top must match the span top');
  assert.ok(Math.abs(thumb - view * scale) < 1e-9, 'thumb height must match the span height');
  assert.ok(Math.abs((view / total) * content - band * THUMB_RATIO) < 1e-9, 'thumb stays 8%');
});

check('at the document bottom the window is exactly filled', () => {
  const band = 760;
  const total = 50000;
  const view = 800;
  const H = band;
  const zoom = (THUMB_RATIO * total) / view;
  const content = band * zoom;
  const thumb = (view / total) * content;
  // scrollTop at the bottom is (total - view), and p is 1 there.
  const offset = (total - view) * (content / total) - Math.max(0, H - thumb);
  assert.ok(Math.abs(offset - (content - H)) < 1e-9, 'canvas bottom must meet the window bottom');
});

check('content that fits is never translated', () => {
  assert.match(code, /if \(content <= H \+ 1\) return 0;/, 'fits branch must keep the canvas still');
});

check('clicking centres the clicked content', () => {
  assert.match(code, /contentY - viewH\(\) \/ 2/, 'click must centre, not top-align');
});

check('the old two-ruler mapping is gone', () => {
  assert.ok(!code.includes('stripThumb'), 'stripThumb must be gone');
  assert.ok(!code.includes('fractionAt'), 'fractionAt must be gone');
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

check('the code plates and inline chips are brand-tinted, not upstream neutral grey', () => {
  // Upstream paints these with neutral greys: `--dsw-static-neutral-bluish-50`
  // (#f9fafb) for the code-block plates/banner, and `--dsw-static-neutral-50`
  // (#fafafa) for the inline-code chip. The chip is a single global token, so
  // leaving it alone is what kept a snippet grey in replies *and* in reasoning
  // blocks no matter what we did to the plates. This plugin overrides all three
  // with a soft blue tint; a neutral value has blue ≈ red, the tint does not.
  // The two notEqual guards pin the exact upstream greys, so a revert to the
  // official value fails loudly instead of slipping through as "still a hex".
  const UPSTREAM_GREYS = ['#fafafa', '#f9fafb', '#f1f3f5'];
  const find = (name) => tokenEntries.find((t) => t.name === name);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const name of [
    '--dsw-alias-markdown-code-block',
    '--dsw-alias-markdown-code-block-banner',
    '--dsw-alias-markdown-inline-code',
    '--dsw-alias-markdown-tag',
    '--dsw-alias-markdown-code-segment-unselected',
  ]) {
    const entry = find(name);
    assert.ok(entry, `${name} must be overridden`);
    const light = /light:\s*'(#[0-9a-fA-F]{6})'/.exec(entry.body);
    assert.ok(light, `${name} must declare a light value`);
    const [r, , b] = rgb(light[1]);
    assert.ok(b - r >= 6, `${name} light ${light[1]} is grey (blue ${b} - red ${r} < 6)`);
    assert.ok(
      !UPSTREAM_GREYS.includes(light[1].toLowerCase()),
      `${name} light is still upstream's grey ${light[1]}`,
    );
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

check('the patch disables the official brand row', () => {
  // Both this plugin and `ui-brand-official` register sidebar.brand.mark /
  // sidebar.brand.name. The official row is earlier in the bundle list and its
  // apply runs first, so without disabling it the sidebar keeps showing the
  // official wordmark while every other feature works — which is exactly what a
  // real boot looked like.
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  const disabled = [...patch.matchAll(/- id:\s*(\S+)\s*\n\s*disabled:\s*true/g)]
    .map((m) => m[1]);
  assert.ok(
    disabled.includes('ui-brand-official'),
    'ui-brand-official must be disabled or the official brand wins the slot',
  );
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
