# DSHOME-Plugin

A consolidated web client kit for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): brand theme, conversation card layout, and a VSCode-style turn minimap, in one plugin.

Pure client plugin — no host behaviour, no build step, no runtime dependencies.

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
A canvas strip on the right edge showing a squashed picture of the whole session, with a translucent viewport box. Click to jump, hold and drag to scrub.

- Your messages render in brand blue, assistant replies mid grey, reasoning and tool blocks light grey, matching the real message alignment.
- The strip is drawn once as a full-length canvas and moved by a transform, so scrolling never repaints it.

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
  hideOfficialRail: true,   // hide upstream's own evenly-spaced turn rail
};
```

`hideOfficialRail` only hides upstream's rail visually and pointer-wise. Nothing in the React tree is touched, so setting it to `false` brings the rail straight back.

## Design notes

Written against official **semantic attributes** — `data-variant`, `data-chat-flow-kind`, `data-chat-turn`, `data-disclosure-row`, `data-state`, `data-expanded`, `data-chat-flow-key`. CSS-Module hash class names are never used, so an upstream rebuild does not break the plugin.

Three invariants keep the minimap accurate, each fixing a bug reproduced on a real session:

1. **Two heights, never mixed.** Strip scale and thumb size come from a standard band height derived from the viewport. The viewport's own height and the thumb's travel come from live measurements. Mixing them makes short sessions drift after everything is already visible.
2. **Positions come only from the browser.** `fromEnd = scrollHeight − rect.top − rect.height`. Estimating height from character counts uses a different ruler than real layout, so "what I clicked" and "what is on screen" disagree.
3. **Dirty values are never cached.** A block measuring 0px has not laid out yet; it gets a temporary height and no cache entry.

Zoom is fixed at 1 by design. Above 1, the thumb (moving on the document ratio) and the content (drawn in its own coordinates) only agree near the middle, so clicks land in the wrong place and every measurement error is magnified. At zoom 1 the two relations are identical, which is what makes "click here, land here" exact.

### Slot registration

`slots.inject(name, fn)` is a **dependency declaration**: it runs `fn` once that slot exists and keeps whatever `fn` returns. Nesting the calls is how a group of slots is registered together, and each callback must return a value — typically the registration handle. A callback that returns nothing registers nothing, so a `function*` generator cannot be used here: `inject` does not iterate the result.

## Failure model

Every feature is a progressive enhancement, invoked inside an error boundary. A failure in one leaves the others working, and the worst outcome is a missing feature — never a broken UI.

## Test

```bash
npm test
```

- `test/selftest.mjs` — 23 checks: selector stability, minimap geometry, theme token completeness, and the packaging contract (the `dsh.client` bundle shape, every `exports` target exists, every cordis row resolves).
- `test/domtest.mjs` — 27 checks: style injection idempotency, module attach and teardown, the loader factory protocol, and slot registration.

Both run without a browser.

## License

MIT
