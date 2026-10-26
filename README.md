# DSHOME-Plugin

## Modular workbench foundation: 0.2.0-workbench.3 (candidate)

This is a **module-launcher and native-panel composition foundation**, not a finished arbitrary docking editor. In Workbench, **自定义** selects visible module entries and moves them up/down; **恢复默认模块** resets that session. Hiding an entry never closes its open tabs, terminates a process, or discards a draft. Configuration is session-local memory only, lost on reload; no user/profile settings are written. The toolbar order does not reorder existing native tabs.

The built-in file, browser and terminal modules are registered through the same API as extensions. An extension first registers its actual panel kind with the host, then registers a launcher (and releases it on unload):

```js
const unregister = window.__dshomePluginWorkbench.registerModule({
  id: 'metrics', kind: 'metrics', label: '指标',
  description: '打开已注册的原生指标面板', defaultEnabled: false,
});
// unregister(); // removes only this launcher, not native tab content
```

Unknown host kinds stay visibly unavailable; registration never creates a fake panel. Definitions are copied, duplicate IDs rejected, and stale session callbacks cannot reconfigure or collapse the arriving session. Extensions must re-register after the Workbench instance reloads. Only native panel kinds are supported here, not arbitrary render callbacks, commands or write endpoints.

The layout fix removes the proportional CSS grid override. DSH 0.2.1-rc.2 and rc.3 use a separately sized, absolutely positioned right panel, so changing only outer tracks produces a blank gutter. The host now owns tracks, panel width, resize handles, split-room budgets and narrow fullscreen together. The **分栏** action and native tab dragging compose actual panels within the host's limits; custom arbitrary docking, saved layout presets and a writable editor are **not implemented**.

`npm run test:workbench` tests module behavior with explicit service/React doubles. `npm run test:workbench-browser -- --browser /path/to/chrome --output /path/to/report.json` runs an isolated headless Chromium regression using the frozen packaged rc.3 CSS and column solver. It checks adjacent panel geometry, native handle alignment, multiple widths/resizes and customization controls. This is not an authenticated production GUI, real React integration, file editor, terminal or IME test. Initial fixture assertion/scheduling failures remain in the audit logs; do not count them as product passes. Loading this candidate into a running profile still requires separate explicit approval.

## Packaging fix: 0.2.0-workbench.2 (historical)

The package uses a declared, package-relative, content-keyed empty host re-export. This avoids retaining an older client path when a host caches metadata by Loader name and resolution base. No private cache clearing, DSH core patch, or extra host behavior is introduced. Actual `dsh-app-boot` normalization and `ClientModuleRegistry` methods are regression-tested with isolated Loader inputs. A deployment also verified HTTP 200 containing the complete new client script; that is not an authenticated GUI/DOM or interaction test.

A consolidated web client kit for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): brand theme, conversation card layout, a VSCode-style turn minimap, and reminder notifications, in one plugin.

Pure client plugin — no host behaviour, no build step, no runtime dependencies.

## Workbench preview (0.2.0-workbench.1)

The default remains Original. This repository contains the preview implementation; committing or pushing it does not install or reload it in a running DSH profile. The additive session-header **原版 / 工作台** switch and a small overlay launcher use the resident conversation and composer; no chat/view component is replaced or moved.

- Entering Workbench opens the official `files` tab once per session only if its launcher is enabled and the host provides it; later toggles reuse native tabs. Missing or hidden files never blocks another module or automatically opens a terminal.
- Geometry remains entirely native at all sizes. No proportional override or resize-handle hiding remains; use the native outer handle to resize and native tab/split controls to compose panels.
- The workbench toolbar opens **文件 / 网页 / 终端** only through the host's registered types, and **分栏** uses the host's room/budget checks. No terminal starts automatically.
- **返回原版** removes the Workbench presentation and restores the panel's prior collapsed state when appropriate; it never closes tabs or changes message/draft data. Preferences are session-local and in memory; a reload starts in Original.
- `workbench: false` disables and removes this feature. `__dshomePluginWorkbench.status()` reports support/failure; absent APIs or missing semantic anchors leave Original intact with a visible explanation.

**Not implemented:** the current public `workspaceFiles` API only reads/lists/stats/watches. This candidate does not claim a writable file editor, save-to-disk, selection-to-composer or diff-apply implementation, and never adds a private file-write endpoint. Native file previews and the existing conversation/tools are real; the earlier standalone HTML's simulated save/diff actions are not shipped here.

Run `npm run test:workbench` for the new feature. The captured baseline already has two failing notification source-pattern assertions; this version preserves those same two failures rather than masking them. DOM and Workbench tests use explicit service/React doubles, not the authenticated production GUI. The optional browser fixture exercises DOM/CSS with doubles, not real files, terminals, IME, or production activation. Loading or updating a running profile requires separate explicit approval.

### Host SDK regression

`npm run test:client-registry` resolves the real Host SDK from local dependencies, or from a checkout/install root supplied as `DSH_SDK_ROOT`:

```sh
DSH_SDK_ROOT=/path/to/deepseek-harness npm run test:client-registry
```

Verified with isolated SDK captures from DSH 0.2.1-rc.2 and rc.3. Missing SDK modules fail explicitly rather than silently skipping. The test creates and removes its own temporary old-package fixture, checks the same-name stale-path behavior, and simulates a remove/add batch using the real registry methods. It does not alter a live registry or restart DSH.

## Features

### 1. Theme
Registers the brand accent through the official `theme` service and replaces the stock brand slots.

- Brand blue `#4D6BFE` in light mode, lifted to `#6B84FF` in dark so it keeps contrast against the navy background.
- Deep-navy dark palette.
- Replaces `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark`.

### 2. Conversation layout
- **Card isolation** — tool calls, commands, and system injections get their own card instead of blending into prose.
- **Think window** — reasoning blocks show 12 lines instead of collapsing entirely.

Upstream renders reasoning text only when expanded, so CSS alone cannot reach it. The plugin synthesises a click on the official disclosure row, letting React expand for real, then clamps the body with CSS. While a block is streaming the window follows the tail; the moment you scroll up to read back it lets go, and blocks you collapsed by hand are remembered and never force-expanded again.

### 3. Turn minimap
A canvas strip on the right edge showing a squashed picture of the conversation, with a translucent viewport box. Click to jump, hold and drag to scrub.

- Your messages render in brand blue, assistant replies mid grey, reasoning and tool blocks light grey, matching the real message alignment.
- The strip is drawn once as a full-length canvas and moved by a transform, so scrolling never repaints it.
- **Short sessions show the whole picture; long ones show the stretch around you.** The strip is at most a standard band tall (capped at 760px), while the canvas grows with zoom so blocks stay readable. Once the picture outgrows the band, the strip becomes a window onto it: it shows the neighbourhood of the current viewport and slides as you scroll. There a click jumps *within that window* (on a 600-turn session the window covers roughly 16% of the document, so clicking the bottom of the strip does not reach the end); travelling the whole conversation is the thumb's job — hold it and drag, which maps its travel linearly onto the document.

### 4. Reminders
Tells you when something is worth looking up from what you are doing — the client-side port of DSHOME's `dshome/notify` host plugin, rebuilt on state the official client already computes because this bundle has no host half.

- **A finished turn** — the session you are looking at stops running.
- **A finished member/background session** — any other session the catalog reports as running and then stopped, named by its own label ("成员「复核员」…").
- **Something is waiting on you** — a pending approval (`kind: 'approval'`) or a model question (`'question'` / `'plan-review'`), with the tool name and reason, or the first question's header.

Sources, all optional and read through `ctx.get` / `ctx.inject`:

| Source | What it supplies |
|---|---|
| `sessions.list` | `running`, `origin`, `retainedBy.mainView` (the official "session in view" tag), `displayTitle` |
| `uiSession.sessionStatus` | `pendingInteraction` per session — the official approval/question projection |
| `remote` | `api-session/error`, the client's view of a failed turn |

Delivery degrades rather than failing: a system notification when the browser grants it, an in-page toast otherwise, always with a synthesised two-tone chime (WebAudio, no assets) and a tab-title flash while the window is hidden. Waiting reminders are throttled per session (5s), and all member/background reminders share one 5s sound window — the same two rules as the reference, so several members finishing at once do not fire a burst of sound.

Two honest divergences from the reference, both forced by the platform:

- Sounds are synthesised instead of picked from `%WINDIR%\Media` — a web page cannot read those files.
- There is no client-side `turn/end{reason}` and no client-side background-*job* feed, so failures come from `api-session/error`, and the reference's `job-completed` branch is covered by the member branch.

Notifications need permission: with `permission === 'default'` the plugin asks once on your first click or keypress; if you refuse, every reminder still arrives as a toast, so nothing is silently lost. In the desktop client the renderer already holds the permission, so no prompt appears.

### Using it — nothing to operate

The reminders are automatic; there is no console step and no button to press.

1. Reload the page once after installing or updating this plugin. The client half is hot-replaced, but a page that is already open keeps the copy it booted with until it is reloaded.
2. Use the client normally. Send a message and let the reply finish: that is a turn completion, and it announces itself — a system notification, or an in-page card in the bottom-right corner when the browser has not granted notifications (with a tab-title flash while the window is in the background). A finished member session, a pending approval and a waiting question announce themselves the same way.

If a reminder never appears, the feature reports its own gap instead of failing quietly: when none of the three sources attach within five seconds, one in-page card reads「提醒功能未接入」with the missing services named.

### 5. Glow
A light layer in two places, both of which the plugin owns outright.

- **Cards** — a thin edge light on hover. Nothing glows at rest.
- **Minimap thumb** — an inner light on hover. It has to be inner: the thumb sits in a view clipped to the strip's rounded box, so an outward halo paints nothing (the first version did exactly that, and read as "小方块没生效"). Dragging adds nothing further — the pointer is still over the strip, so the hover light already applies, and a second, brighter state was reported as 扎眼 mid-drag.

There is no light on the brand mark. Four rounds of tuning (9px → 15px → 26px → silhouette-hugged drop-shadow) never made a permanently-lit logo look right beside its label, so it was removed; `registerBrand` renders the plain mark again. Do not reintroduce it without a reference the owner picked.

Nothing animates on a loop: a breathing `box-shadow` or `filter` repaints every frame — the reported cause of scroll jank in neon-heavy dark UIs — so there is no pulse left to switch off for `prefers-reduced-motion`. Light stays inside the element it belongs to, and the colour is a low-alpha brand blue that also reads as a soft tint on a light page. `glow: false` injects no stylesheet at all.

`__dshomePluginGlow.status()` reports whether the sheet went in and the thumb's live computed style.

### The switches live in Settings

Open the client's settings page: the plugin registers a **提醒** section (the official `settings.section` slot) with six switches — master, turn completion, member sessions, approvals, questions, and the chime. Clicking one takes effect immediately and is remembered in this browser (`localStorage`, key `dshome-plugin.notify.v1`), so no code editing and no console are involved. The master switch only silences delivery; the section itself stays, so it can always be turned back on.

For troubleshooting only, a handle is published on the page:

```js
__dshomePluginNotify.status()                     // options, permission, scenes, baselines
__dshomePluginNotify.emit('turn-completed')       // fire one scene by hand
```

## Install

```bash
dsh plugin --profile <name> add /path/to/dshome-plugin
```

Or add it to a profile's `package.json` by hand:

```json
{
  "dependencies": { "dshome-plugin": "link:/path/to/dshome-plugin" },
  "dsh": { "profile": { "bundles": ["...", "dshome-plugin"] } }
}
```

Then `pnpm install` in the profile directory and restart the harness.

## Configuration

Each feature can be toggled at runtime by setting a global before the client loads:

```js
window.__dshomePlugin = {
  theme: true,
  conversation: true,
  minimap: true,
  sidebar: true,
  hideOfficialRail: true,   // hide upstream's own evenly-spaced turn rail
  notify: true,             // or an object — see below
  glow: true,               // false injects no glow stylesheet at all
};
```

`hideOfficialRail` (default `true`) is a **constant** hide: one stylesheet rule scoped to
the conversation scroller (`[data-conversation-scroll] nav[class*="_frame"]`), so it applies
to the rail the moment upstream mounts or remounts it — no polling, no visible gap. The
per-tick audit only re-ensures the rule survived, warns once if either anchor name changes
(so a broken hide is never silent), and **rescues** a nav the rule provably mis-caught
(wider than 200px, or laid out shorter than 40px) with an inline `!important` override.
Setting it to `false` removes the rule on the next apply; nothing in the React tree is
touched either way.

`notify` accepts `true`, `false`, or an object. Field names follow DSHOME's own settings schema:

```js
window.__dshomePlugin = {
  notify: {
    enabled: true,               // master switch
    notifyOnTurnCompletion: true, // the session you are looking at finished
    notifyOnBackground: true,     // a member/other session finished
    notifyOnApproval: true,       // an approval is waiting
    notifyOnUserQuestion: true,   // a model question is waiting
    sound: true,                  // synthesised chime
    toast: true,                  // in-page fallback when notifications are unavailable
    titleFlash: true,             // flash the tab title while the window is hidden
  },
};
```

`notify: false` installs nothing at all — no subscriptions, no listeners, no handle.

## Design notes

### The client bundle is a classic script, not an ES module

This is the single most important constraint, and getting it wrong is not a small mistake — it **fails the entire web boot**, not just this plugin:

```
Error: web boot: 1 entry did not activate
dshome-plugin: import failed
  Uncaught SyntaxError: Cannot use import statement outside a module
```

The host loads the client bundle with `document.createElement("script")` plus `el.src = url` (see `@deepseek-ai/dsh-client-modules/lib/client.js`: *"Default bundle-load hook: same-origin external classic script"*). A classic script has no module scope, so a single top-level `import` throws, the entry never activates, and the boot fails.

Consequences for anyone editing this plugin:

- **No top-level `import` or `export`.** Author everything as one self-contained file.
- **Host modules come from `require`**, the argument the loader hands to the factory: `require('react/jsx-runtime')`, `require('@deepseek-ai/dsh-client-ui-primitives')`.
- `npm test` enforces this, including a check that `lib/` contains exactly the two expected files.

Note the asymmetry with the host half: `lib/index.js` **is** a normal ES module (it is imported by the loader, not injected as a script), so `export` is correct there. Only the `./client` bundle is a classic script.

### Selectors

Written against official **semantic attributes** — `data-variant`, `data-chat-flow-kind`, `data-chat-turn`, `data-disclosure-row`, `data-state`, `data-expanded`, `data-chat-flow-key`. CSS-Module hash class names are never used, so an upstream rebuild does not break the plugin.

### Minimap invariants

Four invariants keep the minimap accurate, each fixing a bug reproduced on a real session:

1. **It belongs to the conversation, not the window.** Position and size come from the conversation area — the scroll container's box minus the composer upstream parks inside it (`--dsh-composer-height`), top-aligned, and no wider than the gutter left of the text column. The window also holds the conversation header, so a window-anchored strip starts *above* the conversation as soon as the window is short; and while the right sidebar owns a grid track, the window's right edge is the sidebar, not the conversation — measuring against it hid the strip every time the sidebar was open.
2. **Two heights, never mixed.** Strip scale and thumb size come from a standard band height derived from the conversation area. The viewport's own height and the thumb's travel come from live measurements. Mixing them makes short sessions drift after everything is already visible.
3. **Positions come only from the browser.** `fromEnd = scrollHeight − rect.top − rect.height`. Estimating height from character counts uses a different ruler than real layout, so "what I clicked" and "what is on screen" disagree.
4. **Dirty values are never cached.** A block measuring 0px has not laid out yet; it gets a temporary height and no cache entry.

The strip narrows with the conversation gutter (58px down to 24px). When a sidebar floats over the conversation, the strip moves to its left edge and the text and composer reflow to leave a navigation lane. Closing the sidebar restores the original layout. A fullscreen sidebar replaces the conversation view, so its conversation minimap stays hidden.

Zoom is computed, not fixed: it is chosen so the viewport occupies `THUMB_RATIO` (8%) of the standard band — which keeps blocks legible however long the session grows — capped at 32 and additionally clamped by `CONTENT_MAX_PX` so the backing store stays inside the browser's canvas limit. When the picture fits the band (zoom 1) the thumb's document ratio and the canvas's own coordinates coincide, which is what makes "click here, land here" exact. Above 1 the canvas is taller than the strip, so the two relations only agree inside the visible window; the click/window note under *Turn minimap* is the practical consequence.

### Slot registration

`slots.inject(name, fn)` is a **dependency declaration**: it runs `fn` once that slot exists and keeps whatever `fn` returns. Nesting the calls is how a group of slots is registered together, and each callback must return a value — typically the registration handle. A callback that returns nothing registers nothing, so a `function*` generator cannot be used here: `inject` does not iterate the result.

## Failure model

Every feature is a progressive enhancement, invoked inside an error boundary. A failure in one leaves the others working, and the worst outcome is a missing feature — never a broken UI.

## Test

```bash
npm test
```

- `test/selftest.mjs` — 67 checks: the classic-script contract, selector stability, minimap geometry (including the conversation-area anchoring), theme token completeness, the slot-registration return contract, the header's feature census, and the packaging contract (the `dsh.client` bundle shape, every `exports` target exists, every cordis row resolves).
- `test/domtest.mjs` — 106 checks: evaluates the bundle with `new Function` (the closest local equivalent of a classic script, which rejects `import` the same way), then exercises style injection idempotency, the attach paths, slot registration, the minimap's real geometry — where it sits, how wide it is, how it follows a sidebar whose slide is transform-driven, and how its wheel handler converts deltaMode (including the NaN no-op, a zero-height PAGE target, and a throwing style engine) — every reminder scene against fake official stores, including the 5s throttles, the toast fallback, teardown, and re-apply after a hot reload, and the glow layer's rules: the wordmark sweep (target class, transparent fill, glyph clip, seam arithmetic), reduced motion, hover-only card light, the thumb's inset light, no brand-mark glow, and no sheet under `glow:false`.

Both run without a browser. The two suites overlap deliberately on the module-format check: either one alone would have caught the boot failure.

### Manual: Firefox flash check

A `display:none` element reports a zero rect, so the mock DOM cannot reproduce a show/hide feedback loop — the failure mode where the strip hides itself, loses the geometry that justified hiding, and comes back. `test/manual/firefox-flash.mjs` covers it in a real browser: a full-width conversation plus a floating sidebar that slides in, sampled every 16ms across open, settled, close and reopen.

```bash
node test/manual/firefox-flash.mjs          # open http://127.0.0.1:3099/
DSHOME_V15=/path/to/old-client.js \
  node test/manual/firefox-flash.mjs        # then open http://127.0.0.1:3099/?impl=v15
```

It prints `FAIL`/`PASS` per property (display flips, direction reversals, lane inset, return-to-baseline, stable-window drift) and writes the raw report to the OS temp directory. Deliberately not part of `npm test`: it needs a browser window in the foreground. The 2026-10-25 run is recorded in `test/manual/firefox-flash-20261025.json`.

### Manual: long-session minimap check

The canvas is capped at `CONTENT_MAX_PX` (16383 CSS px) so the backing store stays under the browser's 32767px limit at DPR 2 — but a cap that only exists in arithmetic is not a cap that was seen working. `test/manual/long-session-minimap.mjs` builds a 600-turn conversation and checks two paths: the natural zoom, and a forced `zoom=32` that must hit the cap exactly.

```bash
node test/manual/long-session-minimap.mjs   # open http://127.0.0.1:3097/?turns=600
                                            # or  ?turns=600&zoom=32
```

It reports canvas device size against 32767, a sampled paint ratio (an all-transparent canvas is the P2-27 failure), per-block height, and where a click on 5% / 50% / 95% of the strip actually lands. Both runs are recorded in `test/manual/long-session-20261025.json`.

### Manual: think-window clamp check

The 12-line reasoning window is a stylesheet rule keyed to upstream's nesting, so a structural change upstream deletes the feature without failing anything here — which is exactly what happened on 2026-10-25, when the row gained a `data-disclosure-header` wrapper and the body stopped being its sibling. `test/manual/think-window.mjs` reproduces the current nesting in a real browser and measures the computed result:

```bash
node test/manual/think-window.mjs           # open http://127.0.0.1:3096/
OLD_CLIENT=/path/to/old-client.js \
  node test/manual/think-window.mjs         # then open http://127.0.0.1:3096/?old=1
```

It checks that the body clamps to `THINK_LINES × line-height`, scrolls internally, and that the accessory sibling next to the row is *not* clamped. The control run with the pre-fix bundle shows the opposite on both counts: no clamp on the body, and the accessory squeezed to 240px. Both runs are recorded in `test/manual/think-window-20261025.json`.

## License

MIT
