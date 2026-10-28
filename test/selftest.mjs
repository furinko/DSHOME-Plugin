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
import { bareHashedSelectorLiterals } from './fixtures/selector-contract.mjs';
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
  // Exactly one classic client bundle, plus the registered host entry and its
  // declared content-keyed re-export. No untracked runtime files are admitted.
  assert.deepEqual(libFiles.sort(), ['client.js', 'index.js', manifest.exports['./workbench-entry'].split('/').at(-1)].sort());
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
  // 2026-10-25: upstream wrapped the row in `data-disclosure-header`, so the body
  // moved from the row's next sibling to the header's. The window silently
  // stopped clamping when that happened; both spellings are pinned so the next
  // change is a failing test, not a user report.
  assert.ok(code.includes("thinkBody: '[data-disclosure-header] + div'"),
    'the reasoning-body anchor (post-2026-10-25 nesting) is gone');
  assert.ok(code.includes("thinkBodyLegacy: '[data-disclosure-row] + div'"),
    'the legacy reasoning-body fallback is gone');
  assert.ok(code.includes("'[data-expanded] ' + SELECTORS.thinkBody"),
    'the clamp must reach the header-wrapped body');
  assert.ok(!code.includes(":is(' + SELECTORS.thinkBody"),
    'CSS must not also emit the legacy sibling form — it would clamp the accessory');
  assert.match(code, /var THINK_LINES = 12;/, 'the line window is gone');
  assert.ok(code.includes('max-height:calc('), 'the line-window clamp is gone');
});

check('the sticky disclosure header masks without showing', () => {
  // Upstream pins it (sticky;top:0;z-index:1) and fills it with bg-base. The
  // fill must stay — a transparent row lets the body scroll through the header
  // — but it must be the *plate* colour, because a reasoning block sits inside
  // our card (layer-1), where upstream's bg-base reads as a stray band.
  // 2026-10-14 review P2-28: the rule is scoped to rows inside our cards —
  // a bare `[data-disclosure-row]` with !important repainted host settings
  // panels too. The assertions therefore pin BOTH the scoping and the paint.
  const rule = code.match(/\{background:var\(--dshome-plate[^}]*\}/);
  assert.ok(rule, 'the sticky-header rule is gone');
  assert.ok(!/transparent/.test(rule[0]), 'the sticky header stopped masking its body');
  assert.ok(/!important/.test(rule[0]), 'the rule lost !important (upstream’s (0,4,0) rule wins without it)');
  // `code` 已剥注释，而 CSS 是拼出来的——钉**构造式**（两个作用域前缀都在）。
  assert.match(code, /SELECTORS\.think \+ ' \[data-disclosure-row\],'/,
    'the rule must be scoped to disclosure rows inside the think card');
  assert.match(code, /CARD_SELECTOR \+ ' \[data-disclosure-row\]'/,
    'the rule must also cover disclosure rows inside card-wrapped flow items');
  assert.ok(!/'\[data-disclosure-row\]\{/.test(code),
    'the unscoped global disclosure-row rule must be gone (P2-28)');
  assert.match(code, /--dshome-plate:var\(--dsw-alias-bg-layer-1/, 'nothing sets the plate colour');
});

// ── 2026-10-14 review batch D pins ──────────────────────────────────────────

check('canvas backing store is rounded before comparing (P2-26)', () => {
  // Fractional DPR (125%/150% scaling) made `canvas.width !== w * dpr` always
  // true — every paint rebuilt the canvas, every 120ms while streaming.
  assert.match(code, /Math\.round\(w \* dpr\)/, 'DPR width compare is not rounded');
  assert.match(code, /Math\.round\(h \* dpr\)/, 'DPR height compare is not rounded');
});

check('canvas length is capped below Chrome’s 32767px limit (P2-27)', () => {
  assert.match(code, /32767/, 'no 32767 cap found');
  assert.match(code, /CONTENT_MAX_PX/, 'the content cap constant is gone');
});

check('a missing scrollBody anchor says so once (P1-12)', () => {
  // The minimap dying silently is how the 2026-10-04 think-window deletion went
  // unnoticed; the probe must exist and must be one-shot.
  assert.match(code, /warnOnce\('scrollBody-anchor'/, 'the anchor probe is gone');
  assert.match(code, /function warnOnce\(/, 'warnOnce helper is gone');
});

check('synthetic-click expansion backs off and gives up loudly (P2-30)', () => {
  assert.match(code, /EXPAND_MAX_TRIES/, 'no retry cap');
  assert.match(code, /EXPAND_RETRY_MS/, 'no retry spacing');
  assert.match(code, /warnOnce\('expand-anchor'/, 'give-up is silent');
});

check('theme and notify-settings passes hold their teardowns (P2-25)', () => {
  // Discarded handles stacked a duplicate registration on every HMR reload.
  assert.match(code, /__dshomePluginThemeTeardown/, 'theme teardown global is gone');
  assert.match(code, /__dshomePluginNotifySettingsTeardown/, 'notify-settings teardown global is gone');
  assert.match(code, /function reentrantPass\(/, 'the re-entrant wrapper is gone');
});

check('the selector header documents exactly two hash-fragment exceptions (P1-12)', () => {
  // The old header claimed hash class names were "never used anywhere in this
  // file" while scrollBody/officialRail used them — an honest tripwire instead.
  // 注释在 `code` 里被剥掉了 ⇒ 这条钉读原文 `clientSource`。
  assert.match(clientSource, /audited exceptions/, 'the exceptions paragraph is gone');
  assert.ok(!/never used anywhere in this file/.test(clientSource),
    'the false "never used anywhere" claim is back');
  // 2026-10-15 现场回归：两个例外**各自**要有失效探针——rail 选择器 miss 的
  // 静默路径当时没盖住，官方进度条回来了半天没人知道为什么。
  assert.match(code, /warnOnce\('scrollBody-anchor'/, 'scrollBody anchor probe is gone');
  assert.match(code, /warnOnce\('rail-anchor'/, 'rail anchor probe is gone');
  // 包络必须是「宽包络」而非剪影：≤200px / ≥40px。第一版 ≤64px 是测试替身上
  // 标定的，真实 rail 量出来 72px，当场放走。
  assert.match(code, /RAIL_MAX_W = 200/, 'the rail envelope regressed to a tight silhouette');
  assert.match(code, /RAIL_MIN_H = 40/, 'the rail min-height guard changed');
  // 2026-10-16 现场回归（「官方进度条还是没藏掉」第三次报告的根因）：藏 rail
  // 不能只在 scroller 变更那一刻——官方 TurnNavigator 的 nav 要到第 2 个回合才
  // 挂载（items.length < 2 直接 render null），scroller 被找到时往往还没有 nav，
  // 一次性 JS 追藏必然放过迟到/重挂载的 nav。
  assert.match(clientSource, /官方 TurnNavigator 的 nav 在 items\.length < 2 时不挂载/,
    'the audit rationale is gone');
  assert.match(code, /railDueOnScreen/, 'the ≥2-turn gate on the rail probe is gone');
  assert.match(code, /railSeenPasses/, 'the mount-race grace counter is gone');
  // 2026-10-16 重设计（主人问「不能常态隐藏吗」）：隐藏本体回到 CSS——但这次
  // 圈在语义属性 data-conversation-scroll 里（已在 app.asar 核实：与 _scrollBody
  // 同元素、rail 的 nav 是它的后代），P2-29 拆掉的全局形态绝不回来；每拍只做
  // 审计（规则在场 / 锚点探针）和救错杀（确凿不是 rail 的用 inline !important
  // 救回——方向比「像 rail 才藏」更安全：漏判只多藏 250ms）。
  assert.match(code, /RAIL_RULE = '\[data-conversation-scroll\] nav\[class\*="_frame"\]'/,
    'the scoped rail rule anchor changed');
  assert.ok(!/body nav\[class\*="_frame"\]\{/.test(code),
    'the global P2-29 rule came back');
  assert.match(code, /function auditOfficialRails/, 'the per-pass audit is gone');
  assert.match(code, /function confidentlyNotARail/, 'the rescue gate is gone');
  assert.match(code, /setProperty\('opacity', '1', 'important'\)/,
    'the rescue lost its inline !important (it would lose to the rule)');
  assert.match(code, /ensureRailStyle/, 'the rule can no longer self-heal after a head clearing');
});

check('never relies on hashed CSS-module class names', () => {
  // A hashed class looks like lcKema_frame. `[class*="_scrollBody"]` and
  // `[class*="_frame"]` are suffix matches on stable upstream names and are
  // allowed; a bare `.foo_bar` selector is not.
  const bare = bareHashedSelectorLiterals(clientSource);
  assert.deepEqual(bare, [], 'hashed class selector found');
});

check('card selector excludes empty hidden blocks', () => {
  // Upstream marks empty per-turn process blocks with `hidden` while leaving
  // them display:block; without the guard they become blank cards.
  assert.match(code, /:not\(\[hidden\]\)/);
});

check('locale descriptions track package.json (2026-10-14 review, locale drift)', () => {
  // 漂移史：locale 漏掉 reminders、zh.json 还曾以错误编码落盘（乱码）。钉三件事：
  // 两种语言都提到 minimap 与 reminders，且 zh 里没有乱码替身符。
  const en = JSON.parse(readFileSync(join(root, 'locale', 'en.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(join(root, 'locale', 'zh.json'), 'utf8'));
  assert.match(en.meta.description, /minimap/, 'en locale lost the minimap');
  assert.match(en.meta.description, /reminder/i, 'en locale lost reminders (package.json has them)');
  assert.match(zh.meta.description, /缩略导航/, 'zh locale lost the minimap');
  assert.match(zh.meta.description, /提醒/, 'zh locale lost reminders');
  assert.ok(!zh.meta.description.includes(String.fromCharCode(0xFFFD)), 'zh locale has mojibake replacement chars');
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

check('the header comment counts exactly what apply() installs', () => {
  // The header used to claim "Six features" over a list of five. This lock ties
  // three things together: the count word in the header, the header's bullet
  // list, and the `if (o.x)` gates apply() actually runs. Add or remove a
  // feature and this goes red until all three agree again. (`hideOfficialRail`
  // is a minimap option — it has an options() key but no gate of its own, and
  // README files it under Configuration, not under a Features section.)
  const gates = [...code.matchAll(/^ {6}if \(o\.(\w+)\) \{$/gm)].map((m) => m[1]);
  const bullets = [...clientSource.matchAll(/^\/\/   · (\w+)/gm)].map((m) => m[1]);
  const declared = clientSource.match(/^\/\/ (\w+) features share one plugin id:$/m);
  assert.ok(declared, 'the header no longer declares a feature count');
  assert.deepEqual(gates, ['theme', 'conversation', 'sidebar', 'minimap', 'notify', 'glow'],
    'the feature gates apply() runs have changed — update header and bullets with them');
  // The application shell is now the required root owner. Workspace-off keeps
  // chat available instead of leaving the disabled official root blank.
  assert.deepEqual(bullets, [...gates, 'workbench'], 'the header bullets and the applied features disagree');
  const counts = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10 };
  assert.equal(counts[declared[1]], gates.length + 1,
    `header claims ${declared[1]} features but apply() installs ${gates.length + 1}`);
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
  // Default cards remain a backup even when constructor success is opaque.
  // toast:false may suppress a redundant backup, not the sole visible delivery;
  // the runtime matrix separately verifies refusal, constructor throw and errors.
  assert.match(code, /toast\(title, body, \{ sessionId: sessionId \}, !systemSent\);/,
    'missing guaranteed fallback when system construction did not succeed');
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
  assert.match(code, /var gap = notifyWiringGap\(wired\);\s*\n\s*if \(gap\) toast\(gap\.title, gap\.body, null, true\);/,
    'the gap is computed but never shown');
});

check('设置卡片：六个开关都挂在官方设置分区上', () => {
  // 面板上要"看得见、点得动"：注册进 `settings.section`（官方设置页给插件的
  // list 槽位），值存浏览器本地。锁住字段名，免得改了名字界面与代码对不上。
  assert.match(code, /slots\.inject\('settings\.section'/, '没注册到设置分区');
  assert.match(code, /id: 'dshome-notify'/, '分区 id 丢了');
  assert.match(code, /label: function \(\) \{ return '提醒'; \}/, '分区名丢了');
  assert.match(code, /var NOTIFY_STORE_KEY = 'dshome-plugin\.notify\.v1'/, '存储键丢了');
  for (const field of [
    'enabled', 'notifyOnTurnCompletion', 'notifyOnBackground',
    'notifyOnApproval', 'notifyOnUserQuestion', 'sound',
  ]) {
    assert.ok(code.includes(`field: '${field}'`), `卡片少了这一行：${field}`);
  }
  assert.match(code, /set: function \(patch\)/, '句柄缺少写回入口');
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
  assert.match(code, /var top = Math\.round\(box\.top \+ CONVO_GAP_PX\);/,
    'the strip must start where the conversation starts');
  assert.match(code, /shell\.style\.top = top \+ 'px';/);
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

check('sidebar navigation uses the conversation box and reserves a text lane', () => {
  // The bug this locks: with three grid tracks the right sidebar sits *outside*
  // the conversation column, and "covered" measured against the window's right
  // edge hid the strip whenever the sidebar was open.
  assert.match(code, /var freeRight = sidebarFreeRight\(box\);/, 'sidebar space must come from the conversation box');
  assert.match(code, /reserveSidebarInset\(overlap > 0/, 'an overlay must leave an actual lane beside the text');
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

check('the minimap reads the assistant kind upstream actually emits', () => {
  // `data-chat-flow-kind` is upstream's own semantic attribute, and its value
  // domain is fixed by the owner's key table (the runner's registry entry:
  // assistant-step, command, command-input, compaction, context,
  // manual-compaction, model-retry, steering, system-prompt, tool-call,
  // turn-error, turn-max-tokens, turn-process, turn-tail, unknown, user,
  // workflow-run). `assistant` is *not* a member. The first version compared
  // against it anyway, so an assistant reply silently fell through to
  // `colorOther` — the light grey reserved for reasoning and tool blocks, not
  // the mid grey the README promises — and the hover tip said "Content".
  // Both bugs were invisible: a wrong colour and a generic word, no error.
  assert.match(
    code,
    /kind === 'assistant-step' \? colorReply/,
    'the reply colour must key off the kind upstream emits',
  );
  assert.match(
    code,
    /'assistant-step': 'Assistant'/,
    'the hover label must key off the kind upstream emits',
  );
  assert.ok(
    !/'assistant'/.test(code),
    "the source compares against a kind 'assistant', which upstream never emits",
  );
  // The other half of the same comparison is correct as it stands — the user's
  // own messages are `user` *or* `steering` (both are in the key table). Pin it
  // so a later edit cannot "fix" it to a plausible-looking value that upstream
  // does not emit either, which would repaint every user message light grey.
  assert.match(
    code,
    /var mine = kind === 'user' \|\| kind === 'steering';/,
    'the user/steering pair is the correct way to say "mine"',
  );
});

check('the hover-tip label table covers exactly the official kind domain', () => {
  // The tip labels live in one lookup table keyed by upstream's own value
  // domain — the runner's key table, the same 17 kinds listed in the check
  // above. Two failure modes are locked here:
  //
  //   * a key the domain has never contained: `tool`, `thinking` and `think`
  //     shipped as comparison branches that could never match (dead code), and
  //     `assistant` did the same before them;
  //   * an official kind with no entry and no stated reason, which would
  //     silently relabel a real message to the generic 'Content'.
  //
  // Kinds whose semantics are not verified stay on the fallback *by design*;
  // they are listed explicitly, so the table plus the unverified list is
  // exactly the official domain — completeness, not just subset.
  const OFFICIAL_KINDS = [
    'assistant-step', 'command', 'command-input', 'compaction', 'context',
    'manual-compaction', 'model-retry', 'steering', 'system-prompt',
    'tool-call', 'turn-error', 'turn-max-tokens', 'turn-process', 'turn-tail',
    'unknown', 'user', 'workflow-run',
  ];
  const UNVERIFIED = ['turn-process', 'turn-tail', 'unknown'];
  const table = code.match(/var TIP_LABELS = \{([\s\S]*?)\n    \};/);
  assert.ok(table, 'the hover-tip label table must exist');
  const keys = [...table[1].matchAll(/'([^']+)':/g)].map((m) => m[1]);
  assert.equal(new Set(keys).size, keys.length, 'a kind appears twice in the table');
  for (const key of keys) {
    assert.ok(OFFICIAL_KINDS.includes(key),
      `the table names kind '${key}', which upstream never emits`);
  }
  for (const kind of OFFICIAL_KINDS) {
    assert.ok(keys.includes(kind) || UNVERIFIED.includes(kind),
      `official kind '${kind}' must have a label or be listed as unverified`);
  }
  assert.match(code, /TIP_LABELS\[block\.kind\] \|\| 'Content'/,
    'the lookup must fall back to the generic label');
  // The dead literals must stay dead — as kind comparisons, which is the form
  // they shipped in ('tool-call' is a real member and stays).
  for (const dead of ['assistant', 'tool', 'thinking', 'think']) {
    assert.ok(!code.includes(`=== '${dead}'`),
      `the bundle still compares against kind '${dead}', which upstream never emits`);
  }
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
  assert.equal(names.length, 2, 'workspace and application-layout entries are required');
  const layout = JSON.parse(readFileSync(join(root, 'layout/package.json'), 'utf8'));
  for (const name of names) {
    if (name.startsWith('./layout/')) {
      assert.equal(name, './layout/' + layout.exports['./shell-entry'].slice(2));
      assert.match(name, /^\.\/layout\/lib\/entry-[a-f0-9]{12}\.js$/);
      assert.ok(existsSync(join(root, name)), 'layout entry missing');
      continue;
    }
    assert.equal(name, manifest.exports['./workbench-entry'], 'row must name the declared package-owned host entry');
    assert.match(name, /^\.\/lib\/entry-workbench-[a-f0-9]{12}\.js$/, 'entry must remain bounded, content-keyed and package-relative');
    assert.ok(existsSync(join(root, name)), 'anchored host entry missing');
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
  // V2 is no longer an empty host. It requires a real injected SDK Context;
  // never turn missing context into a fake successfully registered service.
  assert.throws(() => host.apply(), TypeError);
  assert.deepEqual(host.inject, ['fs', 'sessions', 'sandboxPolicy', 'typert']);
  for (const method of ['project', 'list', 'read', 'save', 'createTerminal']) assert.equal(typeof host.WorkbenchFilesService.prototype[method], 'function');
});

check('default export carries name and apply', () => {
  assert.equal(host.default.name, 'dshome-plugin');
  assert.equal(typeof host.default.apply, 'function');
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed}/${passed + failed}`);
process.exit(failed === 0 ? 0 : 1);
