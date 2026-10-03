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

The strip is not fixed-width: it narrows with the gutter between the text column's measured right edge and the conversation column's right edge (58px down to 24px) rather than disappearing, and it stands down only when a sidebar surface actually reaches it.

Zoom is fixed at 1 by design. Above 1, the thumb (moving on the document ratio) and the content (drawn in its own coordinates) only agree near the middle, so clicks land in the wrong place and every measurement error is magnified. At zoom 1 the two relations are identical, which is what makes "click here, land here" exact.

### Slot registration

`slots.inject(name, fn)` is a **dependency declaration**: it runs `fn` once that slot exists and keeps whatever `fn` returns. Nesting the calls is how a group of slots is registered together, and each callback must return a value — typically the registration handle. A callback that returns nothing registers nothing, so a `function*` generator cannot be used here: `inject` does not iterate the result.

## Failure model

Every feature is a progressive enhancement, invoked inside an error boundary. A failure in one leaves the others working, and the worst outcome is a missing feature — never a broken UI.

## Test

```bash
npm test
```

- `test/selftest.mjs` — 44 checks: the classic-script contract, selector stability, minimap geometry (including the conversation-area anchoring), theme token completeness, the slot-registration return contract, and the packaging contract (the `dsh.client` bundle shape, every `exports` target exists, every cordis row resolves).
- `test/domtest.mjs` — 59 checks: evaluates the bundle with `new Function` (the closest local equivalent of a classic script, which rejects `import` the same way), then exercises style injection idempotency, the attach paths, slot registration, and the minimap's real geometry — where it sits, how wide it is, and how it follows a sidebar whose slide is transform-driven — against a DOM double.

Both run without a browser. The two suites overlap deliberately on the module-format check: either one alone would have caught the boot failure.

## License

MIT
