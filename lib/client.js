// DSHOME-Plugin —browser client module.
//
// ── Why this is one file with no import/export ───────────────────────────────
// The host loads this bundle as a **classic script**
// (`document.createElement("script")` + `el.src = url`; see
// `@deepseek-ai/dsh-client-modules/lib/client.js`: "Default bundle-load hook:
// same-origin external classic script"). A classic script is not a module, so
// any top-level `import` throws `SyntaxError: Cannot use import statement
// outside a module` and the entry never activates —which fails the whole web
// boot, not just this plugin.
//
// The source is therefore deliberately authored as one self-contained file.
// Modules the host exposes (react, the UI primitives) are pulled through the
// `require` argument of the loader factory instead.
//
// Six features share one plugin id:
//   · theme        —brand accent tokens + brand slots
//   · conversation —card isolation + think line window
//   · sidebar      —stack the left sidebar's foot actions into full-width rows
//   · minimap      —VSCode-style turn thumbnail navigation
//   · notify       —turn / member / attention reminders (software port of the
//                    DSHOME reference's host-side `dshome/notify`, rebuilt on
//                    the official client state this bundle can actually see)
//
// Every feature is optional and isolated: a failure in one leaves the others
// running, and the worst possible outcome is a missing feature, never a broken
// UI or a failed boot.

window.__ModuleLoader__.load({
  id: 'dshome-plugin',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var react_jsx_runtime = require('react/jsx-runtime');
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    // ═══════════════════════════════════════════════════════════════════════    // shared —selectors, style injection, small utilities
    // ═══════════════════════════════════════════════════════════════════════    //
    // Selector discipline: official **semantic attributes** only
    // (data-chat-flow-kind / data-chat-group-part / data-chat-turn /
    // data-disclosure-row / data-chat-flow-key). CSS-Module hash class names
    // such as `lcKema_frame` change on every upstream rebuild and are never
    // used anywhere in this file.
    //
    // Every attribute named here has been verified to exist in the shipped
    // app.asar bundle — and in the spelling that bundle actually uses. That
    // second half is not decorative. An earlier revision searched the archive
    // for the literal `data-variant="think"`, found nothing, and deleted a
    // working feature (a 12-line reasoning window that WAS running). The bundle
    // writes it as `"data-variant": "think"` (`ui-chat` ReasoningRow, offset
    // 19312977) while the DOM attribute is exactly `data-variant="think"`, so
    // `[data-variant="think"]` had matched all along. A no-match is evidence
    // only once the probe's own spelling has been proven against a known hit.

    /** Official semantic attributes. */
    var SELECTORS = {
      /** A reasoning ("think") block — verified on the official ReasoningRow. */
      think: '[data-variant="think"]',
      /** The clickable header row inside a reasoning block. */
      thinkRow: '[data-disclosure-row]',
      /** Content wrapper that only exists once the block is expanded. */
      thinkBody: '[data-disclosure-row] + div',
      /** The per-turn wrapper that carries a stable flow key. */
      flow: '[data-chat-flow-key]',
      /** Every message block; `data-chat-turn` also marks turn boundaries. */
      turn: '[data-chat-turn]',
      /** The scrolling column that hosts the conversation. */
      scrollBody: '[class*="_scrollBody"]',
      /** Official turn-navigation rail (hidden in favour of our minimap). */
      officialRail: 'body nav[class*="_frame"]',
    };

    /**
     * Message-block kinds that get card treatment.
     *
     * `:not([hidden])` is required: upstream marks an empty per-turn process
     * block with `hidden` while leaving it `display:block`, so without the guard
     * it grows padding and border into a ~22px blank card.
     */
    var CARD_SELECTOR = [
      'tool-call',
      'context',
      'system-prompt',
      'command',
      'manual-compaction',
      'compaction',
      'turn-process',
    ].map(function (kind) {
      return '[data-chat-flow-kind="' + kind + '"]:not([hidden])';
    }).join(',');

    /**
     * Inject one <style> element per plugin id, idempotently.
     *
     * The DOM is the source of truth, not an in-memory flag: after a client hot
     * reload the module state resets while any surviving <style> node is still
     * there, and a stale flag would leave elements unstyled.
     *
     * The guard repairs the tag if something else removes or replaces it later
     * (upstream remount, safe mode, another plugin clearing <head>). Without
     * that repair elements silently fall back to bare styles until reload.
     */
    function installStyle(id, css, options) {
      var useGuard = !options || options.guard !== false;
      var selector = "style[data-plugin='" + id + "']";

      function ensure() {
        if (document.querySelector(selector)) return;
        try {
          var tag = document.createElement('style');
          tag.setAttribute('data-plugin', id);
          tag.textContent = css;
          document.head.appendChild(tag);
        } catch (error) {
          console.warn(id + ': style injection failed', error);
        }
      }

      ensure();
      if (!useGuard) return;

      try {
        if (typeof MutationObserver !== 'function' || !document.head) return;
        var registry = window.__dshomePluginStyleGuard || (window.__dshomePluginStyleGuard = {});
        if (registry[id]) return;
        registry[id] = true;
        new MutationObserver(ensure).observe(document.head, { childList: true });
        window.addEventListener('focus', ensure);
        document.addEventListener('visibilitychange', ensure);
      } catch (error) {
        // A failed guard must not take the plugin down.
      }
    }

    /** Read a CSS custom property, falling back when it is unset or unparsable. */
    function readColor(variable, fallback) {
      try {
        var raw = getComputedStyle(document.documentElement).getPropertyValue(variable);
        return raw && raw.trim() ? raw.trim() : fallback;
      } catch (error) {
        return fallback;
      }
    }

    /**
     * Run `fn` and swallow failures.
     *
     * Every feature here is a progressive enhancement: the worst outcome of any
     * single failure is that its feature is missing, never that the UI breaks or
     * the boot fails. That contract only holds if failures are contained here.
     */
    function safe(fn, label) {
      try {
        return fn();
      } catch (error) {
        if (label) console.warn(label, error);
        return undefined;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════    // theme —brand accent tokens + brand slots
    // ═══════════════════════════════════════════════════════════════════════    //
    // Brand blue #4D6BFE in light mode, lifted to #6B84FF in dark so it keeps
    // contrast against the deep navy background.

    var BRAND_LIGHT = '#4D6BFE';
    var BRAND_DARK = '#6B84FF';
    /** Label shown in the sidebar and conversation hero. */
    var BRAND_NAME = 'DSHOME';
    /** Shown as a badge next to the brand name. */
    var VERSION = 'v0.1.0';

    /** Token overrides handed to `theme.overrideTokens`. */
    var TOKENS = {
      // Accent
      '--dsw-alias-brand-primary': { light: BRAND_LIGHT, dark: BRAND_DARK },
      '--dsw-alias-state-business-primary': { light: BRAND_LIGHT, dark: BRAND_DARK },
      '--dsw-alias-button-primary-fill': { light: BRAND_LIGHT, dark: BRAND_LIGHT },
      '--dsw-alias-button-primary-hover': { light: '#3E5BF0', dark: '#5B7BFF' },

      // Background layers (deep navy in dark mode)
      '--dsw-alias-bg-base': { light: '#fbfcff', dark: '#0f1420' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#131a29' },
      '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#172032' },
      '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#1a2338' },
      '--dsw-alias-bg-module-platform': { light: '#ffffff', dark: '#131a29' },

      // Code blocks and the plates reasoning/process blocks are drawn on.
      //
      // Upstream paints both with `--dsw-static-neutral-bluish-50` (a neutral
      // #f9fafb light / #14161a-ish dark) — which is what reads as "a grey slab"
      // on an otherwise near-white page. A soft brand tint says "this is code"
      // instead, and the banner token sits one step deeper so a block's title
      // row reads as that block's header rather than as a second grey box.
      // `--shiki-background` (the `<pre class="shiki">` background, set inline by
      // upstream) resolves to `--dsw-alias-markdown-code-block`, so overriding
      // this one token repaints every code block in the client.
      '--dsw-alias-markdown-code-block': { light: '#f5f8ff', dark: '#101827' },
      '--dsw-alias-markdown-code-block-banner': { light: '#edf2fe', dark: '#162034' },

      // Inline snippets (`allow pasting`) are a *separate* upstream alias:
      // `--dsw-alias-markdown-inline-code`, which resolves to
      // `--dsw-static-neutral-50` (#fafafa — a neutral grey; #292929 in dark).
      // Because it is one global token, the same chip reads grey in a reply and
      // in a reasoning block alike; that is what the owner kept pointing at.
      // Overriding this alias repaints every inline snippet in the client, with
      // no selector and no specificity fight. Tinted one step past the
      // code-block plate so a short chip is still visible.
      '--dsw-alias-markdown-inline-code': { light: '#eef3ff', dark: '#1c2740' },

      // The last two plates upstream still paints grey (`--dsw-static-neutral-
      // bluish-75`, #f1f3f5): the markdown `#tag` chip and the unselected tab of
      // a code-segment switcher. Same tint, same reason — they read as grey bits
      // floating in otherwise white prose.
      '--dsw-alias-markdown-tag': { light: '#eef3ff', dark: '#1c2740' },
      '--dsw-alias-markdown-code-segment-unselected': { light: '#eef3ff', dark: '#1c2740' },

      // Sidebar sits one step deeper than the base
      '--dsw-specific-sidebar-fill': { light: '#eef2f9', dark: '#0c111c' },

      // Borders
      '--dsw-alias-border-l1': { light: '#e3e9f3', dark: '#1e2a44' },
      '--dsw-alias-border-l2': { light: '#d3dcea', dark: '#2a3a5c' },

      // Text
      '--dsw-alias-label-primary': { light: '#1a2233', dark: '#dbe4f0' },
      '--dsw-alias-label-secondary': { light: '#4a5a78', dark: '#c3d0e4' },
      '--dsw-alias-label-tertiary': { light: '#6b7a99', dark: '#8fa3c0' },

      // Interactive
      '--dsw-alias-interactive-bg-hover': {
        light: 'rgba(77,107,254,0.08)',
        dark: 'rgba(107,132,255,0.10)',
      },
    };

    function applyTheme(ctx) {
      var jsx = react_jsx_runtime.jsx;

      // Fall back to a simple inline mark when the primitives package does not
      // export the logo, so the slot never renders an empty hole.
      var Logo = primitives && primitives.FishLogo;
      function Mark(props) {
        props = props || {};
        var size = props.size || 24;
        if (Logo) return jsx(Logo, { size: size, className: props.className });
        return jsx('span', {
          className: props.className,
          style: { fontSize: size * 0.8, lineHeight: 1, color: BRAND_LIGHT },
          children: '\u25C8',
        });
      }

      function Name() {
        var kids = [
          jsx('span', {
            key: 'n',
            style: {
              color: 'var(--dsw-alias-brand-primary, ' + BRAND_LIGHT + ')',
              fontWeight: 600,
            },
            children: BRAND_NAME,
          }),
        ];
        if (VERSION) {
          kids.push(jsx('span', {
            key: 'v',
            style: {
              height: 16,
              lineHeight: '16px',
              fontSize: 9,
              fontWeight: 500,
              fontFamily: "Consolas, 'Cascadia Mono', monospace",
              letterSpacing: 0,
              color: 'var(--dsw-alias-label-primary-inverted, #0f1115)',
              background: 'var(--dsw-alias-label-primary, #f4f6fb)',
              borderRadius: 3,
              padding: '0 4px',
              whiteSpace: 'nowrap',
              alignSelf: 'center',
            },
            children: VERSION,
          }));
        }
        return jsx('span', {
          style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 24 },
          children: kids,
        });
      }

      // 1) Token overrides.
      //    `theme` is an optional service read through ctx.get, and it may be
      //    provided after `slots` (our only declared inject). Sampling once would
      //    silently drop every token override, so wait for the service instead.
      function pushTokens(themeService) {
        if (!themeService || typeof themeService.overrideTokens !== 'function') return false;
        themeService.overrideTokens('dshome-plugin', TOKENS);
        return true;
      }
      try {
        if (!pushTokens(ctx.get('theme')) && typeof ctx.inject === 'function') {
          ctx.inject(['theme'], function (scoped) {
            var late = scoped && typeof scoped.get === 'function' ? scoped.get('theme') : null;
            if (!pushTokens(late)) {
              console.warn('dshome-plugin: theme service appeared but exposes no overrideTokens');
            }
          });
        }
      } catch (error) {
        console.warn('dshome-plugin: token override failed', error);
      }

      // 2) Brand slots.
      //
      // `slots.inject(name, fn)` is a **dependency declaration**: `fn` runs once
      // that slot exists, and its return value is what inject keeps. It must
      // therefore return something —typically the registration handle.
      //
      // Nesting is how a group of slots is registered together: the outer inject
      // waits for the first slot, and only inside that callback do we ask for
      // the next. A generator function cannot be used here, because inject does
      // not iterate its callback's result —yielding registrations would
      // silently register nothing.
      try {
        var slots = ctx.slots;
        if (!slots) throw new Error('slots service unavailable');

        function registerBrand() {
          var offs = [
            slots.register({ name: 'sidebar.brand.mark' }, function (props) {
              return jsx(Mark, { size: props && props.size, className: props && props.className });
            }),
            slots.register({ name: 'sidebar.brand.name' }, function () { return jsx(Name, {}); }),
            slots.register({ name: 'conversation.hero.brand.mark' }, function (props) {
              return jsx(Mark, { size: props && props.size, className: props && props.className });
            }),
          ];
          return function () {
            for (var i = 0; i < offs.length; i += 1) {
              var off = offs[i];
              if (typeof off === 'function') off();
              else if (off && typeof off.dispose === 'function') off.dispose();
            }
          };
        }

        return slots.inject('sidebar.brand.mark', function () {
          return slots.inject('sidebar.brand.name', function () {
            return slots.inject('conversation.hero.brand.mark', registerBrand);
          });
        });
      } catch (error) {
        console.warn('dshome-plugin: brand slot registration failed', error);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════    // conversation —card isolation
    // ═══════════════════════════════════════════════════════════════════════    //
    // Tool calls, commands, and system injections get their own card so they
    // stop blending into prose.
    //
    // A "think window" lives here too: reasoning clamped to 12 visible lines,
    // force-expanded by a synthetic click on the official disclosure row, the
    // reader's own collapses remembered in localStorage. It was deleted by
    // mistake on 2026-10-04 — the probe that declared its anchor absent had
    // searched the wrong spelling (see the SELECTORS note above) — and is
    // restored here verbatim from `7400168^`.
    //
    // Its anchors are the official ones: the root is `[data-variant="think"]` on
    // ui-chat's ReasoningRow, which also carries `data-state` (`running`/`ok`)
    // and `data-expanded`; the body is the row's next sibling and only renders
    // once expanded, which is exactly why CSS alone cannot reach it and a real
    // (synthetic) click is required. `data-expanded` / `data-state` live on the
    // DisclosureRow, *not* on the flow item, so swapping the selector alone
    // would loop forever trying to expand.

    var CONV_PLUGIN = 'dshome-plugin-conversation';
    var CARD_RADIUS = 16;
    var THINK_LINES = 12;
    var COLLAPSED_KEY = 'dshome-plugin.thinkCollapsed.v1';
    var MAX_COLLAPSED = 400;
    /** Distance from our last scroll position that counts as "the user took over". */
    var FOLLOW_SLACK = 24;

    /** Border uses border-l2 (one step deeper than l1) so cards stay visible on
     *  the near-white light background; the soft elevation lifts them off. */
    var CARD = [
      'background:var(--dsw-alias-bg-layer-1,#131a29)',
      'border:1px solid var(--dsw-alias-border-l2,#2a3a5c)',
      'border-radius:' + CARD_RADIUS + 'px',
      'box-sizing:border-box',
      'box-shadow:var(--dsw-elevation-soft,none)',
    ].join(';');

    /** The think body's line height tracks the user's font-size setting. */
    var LINE = 'calc(20px + var(--dsh-content-font-delta-secondary,0px))';

    /** Colour of the plate a sticky disclosure header is drawn on. Every rule
     *  that paints a card also sets this to that card's own background, so the
     *  header can disappear into it while still masking the body scrolling
     *  underneath; a stray block falls back to the conversation background. */
    var PLATE_VAR = '--dshome-plate:var(--dsw-alias-bg-layer-1,#131a29)';

    var CONV_CSS = [
      // Think card. The card wraps the official root, not the body, so the
      // expanded state stays inside the same card.
      SELECTORS.think + '{' + CARD + ';' + PLATE_VAR + ';padding:8px 14px}',

      // Collapsed state: upstream pins height to 24px with `contain:size
      // layout`, which overflows once we add padding. The [data-state] attribute
      // raises specificity to (0,3,0) so this wins even though upstream's chat
      // CSS is injected lazily *after* ours.
      SELECTORS.think + '[data-state]:not([data-expanded]){height:auto;contain:layout}',

      // The line window applies only when expanded; a hand-collapsed block falls
      // back to upstream's single-line summary and the card covers it naturally.
      SELECTORS.think + '[data-expanded] ' + SELECTORS.thinkBody + '{' +
        'max-height:calc(' + THINK_LINES + ' * (' + LINE + '));' +
        'overflow-y:auto;overscroll-behavior:contain;padding-right:6px;' +
        'scrollbar-width:thin;' +
        'scrollbar-color:var(--dsw-alias-border-l2,#2a3a5c) transparent}',

      // Tool / command / system-injection cards. The card wraps the official
      // flow item, so a block's own states stay inside the same card.
      CARD_SELECTOR + '{' + CARD + ';' + PLATE_VAR + ';padding:10px 14px}',

      // Reasoning-block header.
      //
      // Upstream fills that sticky row (`position:sticky;top:0;z-index:1`) with
      // `var(--dsw-alias-bg-base)` while the block is expanded —
      // `.root[data-expanded] [data-open] [data-disclosure-row]`, specificity
      // (0,4,0), injected *after* this sheet — so `!important` is the only thing
      // that reliably wins here. The fill itself must stay: a transparent row
      // no longer masks the body, so long reasoning text scrolls straight under
      // the header and the two collide.
      //
      // It must not *show*, though, and upstream's colour is the wrong one: a
      // reasoning block sits inside our card, whose plate is layer-1, not
      // bg-base, so the upstream paint reads as a stray band across it. The
      // variable carries the colour of the plate the header is actually drawn
      // on (set by every card rule above), which makes the row invisible *and*
      // keeps it masking.
      '[data-disclosure-row]{background:var(--dshome-plate,var(--dsw-alias-bg-base)) !important}',
    ].join('');

    function applyConversation() {
      installStyle(CONV_PLUGIN, CONV_CSS);

      // ── remembered manual collapses ──────────────────────────────────────
      function loadCollapsed() {
        try {
          var parsed = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
          return Object.prototype.toString.call(parsed) === '[object Array]' ? parsed : [];
        } catch (error) {
          return [];
        }
      }
      function saveCollapsed(list) {
        try {
          localStorage.setItem(COLLAPSED_KEY, JSON.stringify(list.slice(-MAX_COLLAPSED)));
        } catch (error) {
          // No localStorage: keep the bookkeeping in memory only.
        }
      }

      var collapsed = loadCollapsed();
      function isCollapsed(key) { return key !== '' && collapsed.indexOf(key) >= 0; }

      /** Stable identity: outer flow key + index of this think block within it. */
      function keyOf(root) {
        var key = safe(function () {
          var flow = root.closest(SELECTORS.flow);
          if (!flow) return '';
          var flowKey = flow.getAttribute('data-chat-flow-key') || '';
          if (!flowKey) return '';
          var all = flow.querySelectorAll(SELECTORS.think);
          return flowKey + '#' + Array.prototype.indexOf.call(all, root);
        });
        return key === undefined ? '' : key;
      }

      // ── expansion ────────────────────────────────────────────────────────
      var autoClicking = false;

      function bodyOf(root) {
        return safe(function () { return root.querySelector(SELECTORS.thinkBody); });
      }

      /**
       * Drive a think block into upstream's expanded state.
       *
       * A synthetic click on the official row is used rather than touching React
       * state: the event bubbles to React's delegated root and runs the
       * component's real onClick, so the renderer stays upstream's business.
       */
      function expand(root) {
        if (root.hasAttribute('data-expanded')) return;
        if (isCollapsed(keyOf(root))) return; // the user collapsed this one
        var row = root.querySelector(SELECTORS.thinkRow);
        if (!row) return;
        autoClicking = true;
        try {
          row.dispatchEvent(new MouseEvent('click', {
            bubbles: true, cancelable: true, view: window,
          }));
        } catch (error) {
          // Synthetic click unavailable: degrade to card styling only.
        } finally {
          autoClicking = false;
        }
      }

      // ── follow the live tail, but yield to the reader ────────────────────
      //
      // Detecting "the user scrolled" via scroll events does not work: they are
      // dispatched asynchronously while streaming content keeps growing, so our
      // own pinning gets misread as user input. Instead we remember where we
      // last put the scroll position and compare.
      var lastSet = new WeakMap();

      function setScrollTop(body, top) {
        body.scrollTop = top;
        lastSet.set(body, body.scrollTop); // browser clamps; store the real value
      }

      function humanTookOver(body) {
        var mine = lastSet.get(body);
        if (mine === undefined) return false;
        if (Math.abs(body.scrollTop - mine) <= 4) return false;
        return body.scrollHeight - body.scrollTop - body.clientHeight > FOLLOW_SLACK;
      }

      function followEnd(root) {
        var body = bodyOf(root);
        if (!body || body.scrollHeight <= body.clientHeight) return;
        if (humanTookOver(body)) return;
        setScrollTop(body, body.scrollHeight);
      }

      /** Once a turn finishes, rewind to the start of the reasoning. */
      function rewind(root) {
        var body = bodyOf(root);
        if (!body || body.scrollTop === 0) return;
        if (humanTookOver(body)) return;
        setScrollTop(body, 0);
      }

      // ── sweep (rAF-throttled) ────────────────────────────────────────────
      var lastState = new WeakMap();

      function sweep() {
        var roots = document.querySelectorAll(SELECTORS.think);
        for (var i = 0; i < roots.length; i += 1) {
          var root = roots[i];
          var state = root.getAttribute('data-state');
          if (!root.hasAttribute('data-expanded')) {
            expand(root);
          } else if (state === 'running') {
            followEnd(root);
          }
          if (lastState.get(root) === 'running' && state !== 'running') rewind(root);
          lastState.set(root, state);
        }
      }

      var scheduled = false;
      function schedule() {
        if (scheduled) return;
        scheduled = true;
        try {
          requestAnimationFrame(function () {
            scheduled = false;
            safe(sweep);
          });
        } catch (error) {
          scheduled = false;
        }
      }

      // ── distinguish our expansion from the user's ────────────────────────
      function onClick(event) {
        if (autoClicking) return;
        safe(function () {
          var target = event.target;
          var row = target && target.closest ? target.closest(SELECTORS.thinkRow) : null;
          if (!row) return;
          var root = row.closest(SELECTORS.think);
          if (!root) return;
          var key = keyOf(root);
          if (key === '') return;
          if (root.hasAttribute('data-expanded')) {
            if (!isCollapsed(key)) {
              collapsed.push(key);
              saveCollapsed(collapsed);
            }
          } else {
            var at = collapsed.indexOf(key);
            if (at >= 0) {
              collapsed.splice(at, 1);
              saveCollapsed(collapsed);
            }
          }
        });
      }

      function start() {
        safe(function () { document.addEventListener('click', onClick, true); });
        schedule();
        safe(function () {
          new MutationObserver(schedule).observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true, // streaming reasoning grows character by character
            attributes: true,
            attributeFilter: ['data-state', 'data-expanded'],
          });
        }, 'dshome-plugin: conversation observer failed');
      }

      safe(start, 'dshome-plugin: conversation init failed');
    }

    // ═══════════════════════════════════════════════════════════════════════    // sidebar —stack the foot actions instead of squeezing them into one row
    // ═══════════════════════════════════════════════════════════════════════    //
    // The left sidebar's foot renders `sidebar.footer.action` as a **list** slot
    // inside a flex row (upstream's footer-actions wrapper is `display:flex`), but
    // every registrant is authored as a full-width row:
    //
    //   · dsh-opencode-go-usage  `.ocg-widget{width:100%}`   (heading + usage rows)
    //   · dsh-context            `.lc-ov-entry{width:calc(100% + 4px)}` — its own
    //     source calls the entry "stacked directly above Settings"
    //   · dsh-mind               `.dm-widget{width:100%}`    (dot + label + badge)
    //   · upstream ui-cordis     the dynamic-plugin entry
    //
    // Four full-width rows sharing one 280px row get ~66px each, so the headings
    // wrap mid-word ("OpenCode" / "GO", "刷" / "新") and the context entry
    // ellipsises to "上下…". Stacking them is the layout those registrants were
    // written for, and it is pure CSS — no upstream file, no third-party plugin,
    // no React tree is touched.
    //
    // The selector is the official semantic hook: `renderSlot()` wraps every
    // outlet in `<div data-slot="<key>" style="display:contents">`, so the slot's
    // own anchor names the container without ever naming a hashed class (which
    // changes on every upstream rebuild). `:has()` reaches the parent from it.
    //
    // Collapsed mode keeps upstream's centred row: there the registrants receive
    // `wide:false` and render compact rail badges, which a row suits.

    var SIDEBAR_PLUGIN = 'dshome-plugin-sidebar';
    /** The footer-action outlet anchor — the slot's own semantic attribute. */
    var FOOTER_SLOT = '[data-slot="sidebar.footer.action"]';
    /** Its container: the element the list's registered rows are laid out in. */
    var FOOTER_ACTIONS = 'div:has(>' + FOOTER_SLOT + ')';

    var SIDEBAR_CSS = [
      // Specificity (0,1,1) beats upstream's `._hash_footerActions{display:flex}`
      // (0,1,0) even though upstream's sidebar sheet is injected lazily.
      FOOTER_ACTIONS + '{flex-direction:column;align-items:stretch;gap:2px}',

      // Collapsed: restore upstream's own centred row, again at a higher
      // specificity (0,2,1) than upstream's `._collapsed ._footerActions` (0,2,0).
      '[data-sidebar-collapsed="true"] ' + FOOTER_ACTIONS +
        '{flex-direction:row;align-items:center;justify-content:center}',
    ].join('');

    function applySidebar() {
      installStyle(SIDEBAR_PLUGIN, SIDEBAR_CSS);
    }

    // ═══════════════════════════════════════════════════════════════════════    // minimap —VSCode-style turn thumbnail navigation
    // ═══════════════════════════════════════════════════════════════════════    //
    // A canvas strip pinned to the right edge of the conversation shows a
    // squashed picture of the whole session; a translucent box marks the visible
    // viewport. Click anywhere to jump, hold and drag to scrub.
    //
    // Four invariants this implementation is built around. They are not
    // stylistic preferences —each fixes a bug reproduced on a real session, and
    // breaking any of them reintroduces it.
    //
    //   ⓪It belongs to the conversation, not to the window.
    //     Every position is measured against the conversation area: the scroll
    //     container's box, minus the composer upstream parks at its bottom
    //     (`--dsh-composer-height`), top-aligned inside it, and as wide as the
    //     gutter left of the text column allows. Measuring against the window is
    //     what put the strip's top above the conversation whenever the window was
    //     short (the window also holds the 76px conversation header), and what
    //     made it hide as "covered" while the right sidebar was merely owning its
    //     own grid track beside the conversation column.
    //
    //   ①Two heights, never mixed.
    //     Scale, thumb height, and canvas length come from a *standard* strip
    //     height computed from the viewport. The viewport's own height and the
    //     thumb's travel come from live measurements. Mixing them makes short
    //     sessions keep moving after everything is already visible.
    //     Consequence: the thumb always occupies 8% of the standard height, and
    //     travel is forced to zero whenever the content fits the viewport.
    //
    //   ②Positions come only from the browser. `fromEnd = scrollHeight −    //     rect.top −rect.height`. Estimating height from character counts uses
    //     a different ruler than real layout, which makes "what I clicked" and
    //     "what is on screen" disagree.
    //
    //   ③Never cache a dirty value. A block measuring 0px has not laid out yet,
    //     so it gets a temporary height for this frame and no cache entry.
    //
    //   ④Growing content emits no DOM event. Markdown, highlighting, images,
    //     and font loading all change height without mutating the DOM, so there
    //     is no mutation to listen for. A re-check follows content changes and
    //     stops once several consecutive passes agree.
    //
    // Zoom is deliberately fixed at 1. Above 1 the thumb (which moves on the
    // *document* ratio) and the content (drawn in its own coordinates) only
    // agree near the middle, so clicking jumps to the wrong place and every
    // measurement error is magnified. At zoom 1 the two relations are identical,
    // which is what makes "click here, land here" exact.

    var MAP_PLUGIN = 'dshome-plugin-minimap';
    /**
     * Strip width — a *maximum*, not a fixed size.
     *
     * The strip lives inside the conversation column, in the gutter the official
     * layout leaves between the end of the text column and the column's right
     * edge. That gutter narrows when the column does (the right sidebar owns a
     * real grid track on a wide viewport, so opening it squeezes the column), and
     * a strip that kept 58px there is what "it just disappears when the
     * conversation gets narrow" looked like. It now narrows with the gutter.
     */
    var WIDTH_PX = 58;
    /** Narrowest the strip may shrink to. Below this it is not worth reading. */
    var MIN_WIDTH_PX = 24;
    /** Breathing room between the strip and the conversation area's own edges. */
    var CONVO_GAP_PX = 8;
    /** Strip height cap. Long sessions keep ~1px per block instead of collapsing. */
    var MAX_HEIGHT_PX = 760;
    /**
     * Composer height, used **only** when the official measurement cannot be
     * read.
     *
     * Upstream measures the composer and writes the result onto the scroll
     * container (`--dsh-composer-height`, falling back to the same 152px), and
     * the composer is a child of that container sitting sticky over the messages
     * — so the conversation area is not the scroll container's box, it is that
     * box minus this. Reading the variable means a composer that grows (a
     * multi-line draft, an attachment row) moves the strip's bottom with it.
     */
    var COMPOSER_FALLBACK_PX = 152;
    /** The official variables that describe the conversation column. */
    var COMPOSER_VAR = '--dsh-composer-height';
    var CONTENT_WIDTH_VAR = '--dsh-chat-content-width';
    var SIDE_CLEARANCE_VAR = '--dsh-composer-side-clearance';
    /** Horizontal padding the official scroll body keeps: clearance + 16px. */
    var CONTENT_PAD_FALLBACK_PX = 32;
    /**
     * How long to keep reading the layout frame by frame after something that
     * moves it without resizing anything — the sidebar's transform slide, whose
     * 0.3s is upstream's own slow duration.
     */
    var SIDE_FOLLOW_MS = 450;
    /** Message rows sampled (at most) to measure the text column's right edge. */
    var TEXT_SAMPLE_ROWS = 12;
    /** Thumb height as a fraction of the standard strip height. */
    var THUMB_RATIO = 0.08;
    /** Absolute floor for the thumb, so it stays grabbable. */
    var MIN_THUMB_PX = 8;
    /** Blocks reread near the tail on an incremental pass (streaming grows there). */
    var TAIL_REREAD = 8;
    /** Forced full re-measure interval; higher blocks can change too. */
    var FULL_PASS_MS = 2000;
    /** Coalescing window for redraws. */
    var REDRAW_MS = 120;
    /** Fallback sync interval, for movement ResizeObserver does not cover. */
    var SYNC_MS = 250;
    /** Follow-up window used while content settles. */
    var RECHECK_MS = 500;
    /** Consecutive stable passes before the re-check loop stops. */
    var STABLE_PASSES = 3;
    /** Drag-state lifetime, in case pointerup is never delivered. */
    var DRAG_TIMEOUT_MS = 30000;
    /** Hover-tip throttle: pointer moves fire far faster than a redraw. */
    var TIP_MS = 60;
    /**
     * Coefficients for the placeholder height of a block the browser has not laid
     * out yet. Taken from the reference implementation, and the reason they exist:
     * a block that measures 0 still has to be drawn *somewhere*, and a flat guess
     * is wrong in both directions — too small collapses a long message into a few
     * pixels (which reads as "that message is missing"), too large stretches a
     * short one over its neighbour. Estimating from the block's own text keeps the
     * placeholder in the same league as the real height.
     */
    var EST_CHARS_PER_LINE = 45;
    var EST_LINE_PX = 21;
    var EST_PAD_PX = 36;
    /**
     * A pass in which fewer than this fraction of blocks report a real height is
     * treated as "layout is not ready yet" and paints nothing at all: an absent
     * picture beats a wrong one. The pass is retried instead.
     */
    var READY_RATIO = 0.6;
    /** Retry interval and cap (~2s) used while layout is still settling. */
    var RETRY_MS = 60;
    var RETRY_MAX = 34;
    /**
     * How long to wait, after the right sidebar opens or closes, before reading
     * its final position.
     *
     * The panel slides in with a transform, so its rect is still off-window at
     * the instant the attribute flips; measuring then would give way by too
     * little. Deliberately a timer rather than `transitionend`: upstream drops
     * the transition under `prefers-reduced-motion`, in which case that event
     * never arrives, and any transition inside the panel would bubble one event
     * per animated descendant. 320ms = upstream's slow duration plus margin.
     */
    var SIDEBAR_SETTLE_MS = 320;
    /**
     * Official right sidebar. Both are **semantic attributes**, never hashed
     * class names (those are build output and change on the next upstream
     * bundle): one panel element is permanently marked, and carries `-open` only
     * while expanded.
     */
    var SIDEBAR_OPEN_SELECTOR = '[data-sidebar-right-open]';
    var SIDEBAR_FULLSCREEN_SELECTOR = '[data-sidebar-right-panel="fullscreen"]';
    /**
     * The three shapes the official sidebar can take on screen: the docked panel
     * while it is open, the dock host inside it, and a floating pane.
     *
     * The host is included because it is what actually carries the visual box:
     * upstream hides it while closed by translating it out with
     * `translateX(var(--dsh-sidebar-width))`, so the viewport test below drops it
     * on its own. A floating pane is on screen whether or not its owner is open,
     * which is the case `[data-sidebar-right-open]` alone misses.
     */
    var SIDEBAR_SURFACE_SELECTOR =
      '[data-sidebar-right-open], [data-dockkit-host=dock], [data-dockkit-float]';
    /**
     * Stamp for the strip's behaviour, so the build actually running in the
     * client can be named from the console without a rebuild.
     */
    var MINIMAP_VERSION = 'v12-conversation-anchored';

    var MAP_CSS = [
      '.dshome-plugin-minimap{position:fixed;z-index:6;cursor:pointer;border-radius:4px;' +
        'opacity:.92;transition:opacity .15s ease}',
      '.dshome-plugin-minimap:hover,.dshome-plugin-minimap[data-active]{opacity:1}',
      // The canvas is longer than the strip whenever zoom > 1, so the strip has to
      // be a real clipping window. Without it the picture is painted over the
      // conversation above the strip while the strip itself shows almost nothing.
      '.dshome-plugin-minimap-view{position:absolute;inset:0;overflow:hidden;' +
        'border-radius:4px;contain:paint}',
      '.dshome-plugin-minimap canvas{position:absolute;left:0;top:0;width:100%;will-change:transform}',
      '.dshome-plugin-minimap-thumb{position:absolute;left:0;right:0;border-radius:3px;' +
        'background:var(--dsw-alias-label-tertiary);opacity:.22;pointer-events:none;' +
        'transition:opacity .15s ease}',
      // Hover ring is purely cosmetic: the thumb's geometry (the part that is
      // clicked and dragged) does not move by a single pixel.
      ".dshome-plugin-minimap-thumb::after{content:'';position:absolute;left:-1px;right:-1px;top:50%;" +
        'height:18px;transform:translateY(-50%);border-radius:5px;' +
        'background:var(--dsw-alias-label-tertiary);opacity:.10;' +
        'border:1px solid var(--dsw-alias-label-tertiary)}',
      '.dshome-plugin-minimap:hover .dshome-plugin-minimap-thumb::after,' +
        '.dshome-plugin-minimap[data-active] .dshome-plugin-minimap-thumb::after{opacity:.22}',
      '.dshome-plugin-minimap:hover .dshome-plugin-minimap-thumb,' +
        '.dshome-plugin-minimap[data-active] .dshome-plugin-minimap-thumb{opacity:.38}',
      // Hover tip. Sits to the *left* of the strip, over the conversation, and
      // takes no pointer events, so it can never steal the hover it describes.
      '.dshome-plugin-minimap-tip{position:absolute;right:calc(100% + 10px);' +
        'transform:translateY(-50%);width:max-content;max-width:360px;min-width:96px;' +
        'padding:6px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);' +
        'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);' +
        'font-size:12px;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.18);' +
        'pointer-events:none;opacity:0;transition:opacity .12s ease;' +
        'white-space:pre-line;overflow-wrap:break-word;overflow:hidden}',
      '.dshome-plugin-minimap-tip[data-show]{opacity:1}',
    ].join('');

    /**
     * Whether an element sits inside a subtree the official code treats as
     * hidden. Upstream's own test is
     * `pane.closest('[hidden], [aria-hidden="true"]') === null`, and it matters
     * here: every mounted session renders its own sidebar owner, marked `hidden`
     * while that session is not the active one, so a stale owner can still carry
     * `data-sidebar-right-panel="fullscreen"` with nothing on screen at all.
     *
     * Walks parents rather than calling `closest`, so the rule is built from the
     * same primitives the DOM double can reproduce.
     */
    /** Parent element, across the browser (`parentElement`) and the DOM double. */
    function parentOf(el) {
      return el ? (el.parentElement || el.parentNode || el.parent || null) : null;
    }

    /** Laid-out height, or 0 when the element is not laid out (or unreadable). */
    function laidOutHeight(el) {
      try {
        return typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect().height : 0;
      } catch (error) {
        return 0;
      }
    }

    function insideHiddenSubtree(el) {
      var node = el;
      while (node) {
        if (typeof node.hasAttribute === 'function') {
          if (node.hasAttribute('hidden')) return true;
          if (typeof node.getAttribute === 'function'
            && node.getAttribute('aria-hidden') === 'true') return true;
        }
        node = parentOf(node);
      }
      return false;
    }

    /**
     * Every official sidebar surface that is actually on screen, as rects.
     *
     * A zero-width or off-window match is not on screen; anything unreadable
     * yields none — i.e. no avoidance, which is exactly the behaviour before any
     * of this existed, so an upstream change degrades instead of breaking the
     * strip.
     */
    function visibleSidebarRects() {
      var out = [];
      try {
        if (typeof document.querySelectorAll !== 'function') return out;
        var list = document.querySelectorAll(SIDEBAR_SURFACE_SELECTOR);
        var width = Number(window.innerWidth) || 0;
        for (var i = 0; i < list.length; i += 1) {
          var el = list[i];
          if (!el || typeof el.getBoundingClientRect !== 'function') continue;
          if (insideHiddenSubtree(el)) continue;
          var rect = el.getBoundingClientRect();
          if (!rect || !(rect.width > 0)) continue;
          if (!(rect.right > 0) || !(rect.left < width)) continue;   // off to the side
          out.push(rect);
        }
      } catch (error) {
        return out;
      }
      return out;
    }

    /**
     * Whether an on-screen sidebar surface overlaps the strip **itself**.
     *
     * The test is the strip's own box, not the window's right edge. That
     * distinction is the whole bug: on a wide viewport the right sidebar owns a
     * real grid track, so it sits *outside* the conversation column and the strip
     * never touches it — measuring against the window edge hid the strip every
     * time the sidebar was open, for no reason at all. When the viewport is too
     * narrow for a track the panel floats over the centre column and does reach
     * the strip; there it still stands down, because sliding left to the panel's
     * edge would park it on top of the text being read.
     *
     * Called after placeShell, because it asks where the strip *is*.
     */
    function sidebarCovers(strip) {
      var rects = visibleSidebarRects();
      if (rects.length === 0) return false;
      if (!strip || !(strip.width > 0) || !(strip.height > 0)) return false;
      for (var i = 0; i < rects.length; i += 1) {
        if (rects[i].left < strip.right && rects[i].right > strip.left) return true;
      }
      return false;
    }

    /**
     * Whether the right sidebar is on screen in its fullscreen state.
     *
     * `data-sidebar-right-panel` is not a switch, it is a permanent attribute
     * (`fullscreen ? "fullscreen" : "push"`), and every mounted session renders
     * its own owner. Reading the attribute alone therefore matched a *stale*
     * owner from an inactive session and hid the strip in every session for good.
     */
    function sidebarFullscreen() {
      try {
        if (typeof document.querySelector !== 'function') return false;
        var el = document.querySelector(SIDEBAR_FULLSCREEN_SELECTOR);
        if (el === null || el === undefined) return false;
        if (insideHiddenSubtree(el)) return false;
        if (typeof el.getBoundingClientRect !== 'function') return false;
        var rect = el.getBoundingClientRect();
        return rect !== null && rect !== undefined && rect.width > 0;
      } catch (error) {
        return false;
      }
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.hideOfficialRail=true] hide upstream's own rail
     * @returns {Function} teardown
     */
    function applyMinimap(options) {
      // Re-entrant: this bundle hot-reloads, so apply() runs again while the
      // previous shell is still in the DOM. Without this each pass stacks another
      // shell plus another set of window/document listeners.
      if (typeof window.__dshomePluginTeardown === 'function') {
        try { window.__dshomePluginTeardown(); } catch (error) { /* already gone */ }
      }
      window.__dshomePluginTeardown = null;
      window.__dshomePluginMinimapVersion = MINIMAP_VERSION;
      var hideOfficialRail = !options || options.hideOfficialRail !== false;
      /** Current strip width: WIDTH_PX unless the conversation gutter is narrower. */
      var stripWidthPx = WIDTH_PX;
      installStyle(MAP_PLUGIN, MAP_CSS);

      // Upstream's rail spaces turns evenly (a fixed distance per turn), so it
      // cannot express "this passage is longer". Rather than draw beside it, we
      // hide it visually and pointer-wise —no React tree is touched, so
      // removing this one rule brings it straight back.
      if (hideOfficialRail) {
        installStyle(MAP_PLUGIN + '-rail',
          SELECTORS.officialRail + '{opacity:0;pointer-events:none}');
      }

      var shell = document.createElement('div');
      shell.className = 'dshome-plugin-minimap';
      shell.style.width = stripWidthPx + 'px';
      shell.style.display = 'none';

      // The canvas lives inside a clipping window, never directly in the shell:
      // the shell is the fixed window, the canvas is the long scroll behind it.
      var view = document.createElement('div');
      view.className = 'dshome-plugin-minimap-view';
      var canvas = document.createElement('canvas');
      var thumb = document.createElement('div');
      thumb.className = 'dshome-plugin-minimap-thumb';
      // The hover tip lives in the shell too, so it moves and dies with it, and
      // never enters the React tree (same reason as the shell itself).
      var tip = document.createElement('div');
      tip.className = 'dshome-plugin-minimap-tip';
      view.appendChild(canvas);
      shell.appendChild(view);
      shell.appendChild(thumb);
      shell.appendChild(tip);
      document.body.appendChild(shell);

      var ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

      // ── geometry ─────────────────────────────────────────────────────────
      //
      // The strip is a fixed window. The canvas is exactly as long as the scaled
      // document and is translated behind that window, which is what lets
      // scrolling touch only a transform (no layout, no repaint of the picture).
      var scroller = null;
      var stripScale = 1;      // canvas px per document px
      var canvasH = 0;         // total canvas length
      var bandPx = 0;          // standard strip height (invariant ①
      var drawnTotal = 0;      // scrollHeight at the last successful measure
      /**
       * The standard band the current picture was scaled with. A window resize
       * changes the band, which changes the canvas length — and the scroll
       * container's own height may not change at all, so its ResizeObserver
       * stays silent and the picture would keep the old scale. Comparing this
       * is what re-scales it.
       */
      var drawnBand = -1;
      var lastFullPassAt = 0;
      var lastSignature = '';
      var measureCache = [];
      var blocks = [];
      /** Hover-tip throttle stamp. */
      var lastTipAt = 0;
      /** Pending "layout was not ready" retry, and how many have been spent. */
      var retryTimer = 0;
      var retryCount = 0;
      /**
       * Content changed since the last successful measure. This — plus a
       * changed scrollHeight — is what decides whether a sync has to redraw;
       * without it the 250ms tick redraws unconditionally.
       */
      var totalDirty = true;
      /** Watches the scroll container's content (new turns, streaming text). */
      var mutationObserver = null;
      /** Watches the official right sidebar's open/fullscreen attributes. */
      var sidebarObserver = null;
      var sidebarSettleTimer = 0;

      function totalOf() { return scroller ? scroller.scrollHeight : 0; }
      function viewH() { return Math.max(1, scroller ? scroller.clientHeight : 0); }

      /**
       * Height to draw a block at while the browser has not laid it out yet.
       *
       * Used for one frame only and **never cached**: the real value replaces it as
       * soon as it is readable. See EST_* for why this is estimated from the text
       * instead of being a flat number.
       */
      function tempHeightOf(el) {
        var len = el && el.textContent ? String(el.textContent).trim().length : 0;
        return EST_PAD_PX + Math.max(1, Math.ceil(len / EST_CHARS_PER_LINE)) * EST_LINE_PX;
      }

      /** Upper bound on the zoom, so a runaway ratio cannot allocate a huge canvas. */
      var ZOOM_MAX = 32;

      /**
       * Numeric value of a CSS custom property, in px.
       *
       * The official layout publishes its own measurements as variables on the
       * elements that own them — the composer's height is written by JS after
       * measuring it — so this reads the running layout instead of trusting a
       * constant that merely matches today's defaults. An unreadable value is
       * never an error: every caller supplies its own fallback.
       */
      function readPx(el, name, fallback) {
        if (!el || typeof getComputedStyle !== 'function') return fallback;
        try {
          var raw = getComputedStyle(el).getPropertyValue(name);
          var value = parseFloat(raw);
          return isFinite(value) && value >= 0 ? value : fallback;
        } catch (error) {
          return fallback;
        }
      }

      /** How tall the official composer currently is, in px. */
      function composerHeight() {
        return readPx(scroller, COMPOSER_VAR, COMPOSER_FALLBACK_PX);
      }

      /** Horizontal padding the official text column keeps on each side. */
      function contentPad() {
        return readPx(scroller, SIDE_CLEARANCE_VAR, CONTENT_PAD_FALLBACK_PX - 16) + 16;
      }

      /**
       * The conversation area: the scroll container's box, minus the composer
       * that upstream parks at its bottom.
       *
       * Everything the strip does is measured against this box, never against the
       * window. The window also contains the conversation header — 76px tall
       * while the tab strip is shown — and whatever chrome sits above it, so a
       * window-anchored strip starts *above* the conversation as soon as the
       * window is short: reported as "the top is too high, and worse in a
       * non-maximised window".
       *
       * `known: false` is a window-based approximation, used while the column is
       * not measurable (still laying out, or parked off screen).
       */
      function columnBox() {
        var windowHeight = Number(window.innerHeight) || 0;
        var windowWidth = Number(window.innerWidth) || 0;
        var fallback = {
          top: 0,
          bottom: Math.max(0, windowHeight - composerHeight()),
          left: 0,
          right: windowWidth,
          width: windowWidth,
          known: false,
        };
        if (!scroller || typeof scroller.getBoundingClientRect !== 'function') return fallback;
        var rect = null;
        try { rect = scroller.getBoundingClientRect(); } catch (error) { rect = null; }
        if (!rect || !(rect.height > 0) || !(rect.width > 0)) return fallback;
        // A column parked outside the viewport is not a place to put a strip —
        // findScroller deliberately returns one so the strip attaches rather than
        // staying hidden. Approximate until it is on screen.
        if (rect.top > windowHeight - 40 || rect.bottom < 40) return fallback;
        return {
          top: rect.top,
          bottom: rect.bottom - composerHeight(),
          left: rect.left,
          right: rect.right,
          width: rect.width,
          known: true,
        };
      }

      /**
       * Standard strip height: the conversation area, *not* the viewport and not
       * the content — so it is identical for a two-message session and a
       * two-thousand-message one, and it never leaves the conversation.
       */
      function computeBand() {
        var box = columnBox();
        var available = (box.bottom - box.top) - CONVO_GAP_PX * 2;
        return Math.max(120, Math.min(MAX_HEIGHT_PX, available));
      }

      /**
       * The text column's own right edge, measured from message rows.
       *
       * Measured rather than derived, for two reasons found in the official
       * bundle: the column element itself is a hashed CSS-module class name (this
       * bundle never depends on those), and the width it is limited by,
       * `--dsh-chat-content-width`, is published as
       * `clamp(680px, calc(var(--dsh-conversation-column-width) * .64), 920px)` —
       * a custom property keeps its token stream, so reading it back yields that
       * expression, not a number. Rows are semantic
       * (`[data-chat-flow-key]`), every one of them is laid out inside the
       * column, and the widest of a small sample ends at the column's right edge.
       *
       * `null` = nothing to measure yet (the strip attached before the first row
       * painted).
       */
      function textColumnRight() {
        if (!scroller || typeof scroller.querySelectorAll !== 'function') return null;
        var rows = null;
        try { rows = scroller.querySelectorAll(SELECTORS.flow); } catch (error) { return null; }
        if (!rows || rows.length === 0) return null;
        var limit = Math.min(rows.length, TEXT_SAMPLE_ROWS);
        var right = null;
        for (var i = 0; i < limit; i += 1) {
          var rect = null;
          try { rect = rows[i].getBoundingClientRect(); } catch (error) { continue; }
          if (!rect || !(rect.width > 0)) continue;
          if (right === null || rect.right > right) right = rect.right;
        }
        return right;
      }

      /**
       * Free room to the right of the text column, inside the conversation
       * column.
       *
       * The space between the text's right edge and the column's right edge is
       * the only place a strip can sit without covering a line of text — and it
       * is what shrinks when the column shrinks (the sidebar's track takes width
       * from the column, the text column stays 680-920px, so the gutter absorbs
       * the difference). `null` = not knowable, and the caller then keeps the
       * full width rather than guessing.
       */
      function gutterRight(box) {
        var textRight = textColumnRight();
        if (textRight !== null && textRight <= box.right) {
          return Math.max(0, box.right - textRight);
        }
        // Fallback: the width the user prefers, when upstream writes it as a px
        // value (`--dsh-chat-user-width` is set only while a preference exists).
        var content = readPx(scroller, CONTENT_WIDTH_VAR, -1);
        if (!(content > 0) || !(box.width > 0)) return null;
        var pad = contentPad();
        var inner = Math.max(0, box.width - pad * 2);
        return pad + Math.max(0, (inner - Math.min(inner, content)) / 2);
      }

      /** Strip width for the conversation column as it is now. */
      function computeStripWidth(box) {
        var gutter = gutterRight(box);
        if (gutter === null) return WIDTH_PX;
        return Math.max(MIN_WIDTH_PX, Math.min(WIDTH_PX, Math.round(gutter - 4)));
      }

      /**
       * Zoom = how much longer the canvas is than the strip.
       *
       * Derived from the thumb, because the thumb has to satisfy two things at
       * once: stay a constant THUMB_RATIO of the *standard* band, and cover
       * exactly one viewport of content.
       *   thumb = (view / total) * (band * zoom)   and   thumb = THUMB_RATIO * band
       *   =>  zoom = THUMB_RATIO * total / view
       *
       * Deliberately NOT clamped to a minimum of 1: a short session keeps the same
       * thumb size and simply uses less of the strip. A minimum of 1 would send
       * short sessions back to "squeeze the whole document into the strip", which
       * makes their thumb *bigger* than a long session's.
       */
      function zoomOf(total) {
        var forced = window.__dshomePluginMinimapZoom;
        if (typeof forced === 'number' && forced >= 1) return Math.min(ZOOM_MAX, forced);
        var view = viewH();
        if (view <= 0 || bandPx <= 0 || !(total > 0)) return 1;
        return Math.max(0.01, Math.min(ZOOM_MAX, (THUMB_RATIO * total) / view));
      }

      /** Canvas length: the whole document at this zoom. */
      function contentOf(total) {
        return bandPx > 0 ? bandPx * zoomOf(total) : 0;
      }

      /** Document -> canvas scale. */
      function recomputeScale() {
        var total = totalOf();
        if (total <= 0 || bandPx <= 0) return false;
        var content = contentOf(total);
        stripScale = content / total;
        canvasH = Math.max(1, Math.round(content));
        return true;
      }

      /**
       * Distance from the window's right edge to the strip's right edge.
       *
       * The preferred anchor is upstream's own rail, which already sits in the
       * gutter (28px wide, 12px inside the scroll body's padding, i.e. clear of
       * the scrollbar) — aligning to it is what keeps the strip beside the text
       * instead of over it. That rail hides itself when the conversation
       * container is narrow, and a missing or degenerate one must not hide the
       * strip: the fallback is then the *conversation column's* right edge, never
       * the window's. While the right sidebar owns a grid track, the window's
       * right edge belongs to the sidebar, which is not where the conversation
       * is.
       */
      function freeRightOffset(box) {
        var windowWidth = Number(window.innerWidth) || 0;
        var right = Math.max(CONVO_GAP_PX, windowWidth - box.right + CONVO_GAP_PX);
        safe(function () {
          var rail = document.querySelector(SELECTORS.officialRail);
          if (!rail) return;
          var rect = rail.getBoundingClientRect();
          if (rect.width >= 4 && rect.height >= 40) {
            right = Math.max(CONVO_GAP_PX,
              windowWidth - rect.right + (rect.width - stripWidthPx) / 2);
          }
        });
        return right;
      }

      /**
       * The strip's own box on screen — what the sidebar-avoidance rule asks
       * about. Read where the shell is in scope, and handed to the rule.
       */
      function stripBox() {
        try {
          return typeof shell.getBoundingClientRect === 'function'
            ? shell.getBoundingClientRect()
            : null;
        } catch (error) {
          return null;
        }
      }

      /**
       * Where the strip sits: inside the conversation area, top-aligned.
       *
       * Top-aligned rather than centred in the window, because the strip is a
       * column *of the conversation*: it starts where the conversation starts,
       * and it is only as tall as the conversation is — capped by MAX_HEIGHT_PX,
       * and shorter still when the session is short (a tall strip that is mostly
       * blank is worse than a short one).
       */
      function placeShell() {
        var box = columnBox();
        stripWidthPx = computeStripWidth(box);
        shell.style.width = stripWidthPx + 'px';
        var content = contentOf(totalOf());
        var boxH = Math.max(24, Math.min(bandPx, content > 0 ? content : bandPx));
        shell.style.top = Math.round(box.top + CONVO_GAP_PX) + 'px';
        shell.style.right = Math.round(freeRightOffset(box)) + 'px';
        shell.style.height = Math.round(boxH) + 'px';
      }

      /** 0..1 scroll progress through the document. */
      function progress() {
        if (!scroller) return 0;
        var range = totalOf() - viewH();
        if (range <= 0) return 0;
        return Math.min(1, Math.max(0, scroller.scrollTop / range));
      }

      /**
       * Thumb height = one viewport of content, in canvas pixels.
       *
       * No rounding and no generous floor: the thumb height is exactly what makes
       * (window - thumb) / (total - view) equal window / total, so rounding it
       * becomes hundreds of content pixels of error once divided by the scale.
       */
      function thumbHeight() {
        var total = totalOf();
        var view = viewH();
        if (total <= 0 || view <= 0) return MIN_THUMB_PX;
        return Math.max(2, (view / total) * contentOf(total));
      }

      /**
       * Canvas translation - the single source of coordinates shared by painting,
       * hover and click. Keeping exactly one of these is what keeps the three in
       * agreement: top of document => 0, bottom of document => the canvas bottom
       * aligned with the window bottom, so the window is always exactly filled.
       */
      function canvasOffsetOf() {
        var total = totalOf();
        var H = shell.clientHeight;
        var content = contentOf(total);
        if (total <= 0 || content <= 0) return 0;
        // Everything fits: do not move at all.
        if (content <= H + 1) return 0;
        return (scroller ? scroller.scrollTop : 0) * stripScale - progress() * Math.max(0, H - thumbHeight());
      }

      function shiftFor() { return canvasOffsetOf(); }

      function paintShift() {
        canvas.style.transform = 'translateY(' + (-Math.round(canvasOffsetOf())) + 'px)';
      }

      /** Position and size the viewport box. */
      function paintThumb() {
        var h = thumbHeight();
        var railH = shell.clientHeight > 0 ? shell.clientHeight : bandPx;
        var travel = Math.max(0, railH - h);
        thumb.style.height = h + 'px';
        thumb.style.top = Math.round(Math.max(0, Math.min(travel, progress() * travel))) + 'px';
      }

      // ── measuring ────────────────────────────────────────────────────────
      // ── painting ─────────────────────────────────────────────────────────
      //
      // Colour hierarchy: the user's own messages get brand blue, assistant
      // replies mid grey, reasoning and tool blocks light grey.
      function paint(total) {
        if (!ctx2d || canvasH <= 0) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        // The strip's current width, not the nominal one: the canvas has to be
        // rebuilt whenever the gutter narrows it, or the picture keeps drawing at
        // the old width and gets clipped by the shell.
        var w = stripWidthPx;
        var h = canvasH;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.height = h + 'px';
        }
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx2d.clearRect(0, 0, w, h);
        if (!stripScale || !total) return;

        for (var i = 0; i < blocks.length; i += 1) {
          var b = blocks[i];
          if (!b) continue;
          var y = h - (b.fromEnd + b.height) * stripScale;
          var bh = Math.max(1, b.height * stripScale);
          // Remember where the block was actually drawn. Hover hit-testing reads
          // this rectangle rather than recomputing a position from content
          // coordinates: painting applies its own scale and a 1px floor, so a
          // recomputation would name the neighbouring message. Written for every
          // block, before the height guard, so the table stays sorted by drawY.
          b.drawY = y;
          b.drawH = bh;
          if (b.height <= 0) continue;
          ctx2d.globalAlpha = b.mine ? 0.85 : 0.55;
          ctx2d.fillStyle = b.fill;
          var bw = Math.min(w - 4, Math.max(6, b.width));
          var x = b.mine ? w - 2 - bw : 2;
          ctx2d.fillRect(Math.max(0, x), Math.max(0, y), bw, bh);
        }
        ctx2d.globalAlpha = 1;
      }
      /**
       * The rows to draw — one per visible message.
       *
       * Upstream marks **two** kinds of element with `data-chat-turn`: every message
       * row (`div.flowItem`) and the group seat that wraps a run of them
       * (`ChatGroupSeat`, carrying `data-chat-group-key`). Taking every match counts
       * a wrapper *and* its own children as separate messages, and their rectangles
       * overlap by construction — which is what made grey bars overlap on the strip.
       *
       * Upstream's own row queries drop the seat by attribute, plus empty rows and
       * anything under `[hidden]`. Dropping the seat by attribute would also drop a
       * *collapsed* group, whose rows are not laid out while the seat is the only
       * thing representing that run. So this is structural instead:
       *   - anything inside a hidden subtree is off screen: gone;
       *   - a candidate with a *laid-out* candidate inside it is a wrapper: gone,
       *     its rows are the messages;
       *   - a candidate that is not laid out and sits inside another candidate is
       *     one of those collapsed rows: gone, the wrapper stands for it.
       * Both halves matter: dropping wrappers unconditionally would replace a
       * collapsed group with a column of estimated bars, and keeping them would
       * draw one bar across their own contents.
       */
      function turnRows() {
        var candidates = scroller.querySelectorAll(SELECTORS.turn);
        var visible = [];
        var i;
        for (i = 0; i < candidates.length; i += 1) {
          if (!insideHiddenSubtree(candidates[i])) visible.push(candidates[i]);
        }
        var n = visible.length;
        var index = new Map();
        var laidOut = new Array(n);
        var wrappers = new Array(n);        // how many candidates sit inside this one
        var wrapperHasRow = new Array(n);   // ... and whether any of them is laid out
        var nested = new Array(n);          // whether this one sits inside a candidate
        for (i = 0; i < n; i += 1) {
          index.set(visible[i], i);
          laidOut[i] = laidOutHeight(visible[i]) > 0;
          wrappers[i] = 0;
          wrapperHasRow[i] = false;
          nested[i] = false;
        }
        // One ancestor walk per row marks every candidate ancestor, so this stays
        // linear in rows x nesting depth instead of comparing every pair.
        for (i = 0; i < n; i += 1) {
          var up = parentOf(visible[i]);
          while (up) {
            var at = index.has(up) ? index.get(up) : -1;
            if (at >= 0) {
              wrappers[at] += 1;
              if (laidOut[i]) wrapperHasRow[at] = true;
              nested[i] = true;
            }
            up = parentOf(up);
          }
        }
        var rows = [];
        for (i = 0; i < n; i += 1) {
          if (wrappers[i] > 0) {
            if (wrapperHasRow[i]) continue;   // a wrapper over rows that are on screen
            rows.push(visible[i]);            // collapsed: it stands for the whole run
            continue;
          }
          if (nested[i] && !laidOut[i]) continue;   // a collapsed row under a wrapper
          rows.push(visible[i]);
        }
        return rows;
      }

      function draw(forceFull) {
        if (!scroller || bandPx <= 0) return;
        if (!recomputeScale()) return;

        var scrollTop = scroller.scrollTop;
        var scrollHeight = scroller.scrollHeight;
        var boxTop = scroller.getBoundingClientRect().top - scrollTop; // content origin
        var now = Date.now();

        var all = turnRows();
        var count = all.length;
        var sameSet = measureCache.length === count && (function () {
          for (var k = 0; k < count; k += 1) {
            var c = measureCache[k];
            if (c === undefined || c.el !== all[k]) return false;
          }
          return true;
        })();
        var totalChanged = scrollHeight !== drawnTotal;
        var needFull = !sameSet || now - lastFullPassAt > FULL_PASS_MS || forceFull === true;

        // Incremental passes reread only the tail and the blocks near the
        // viewport; those are the only ones that can have changed. A stable
        // total means a block's height cannot have changed, so nothing is
        // reread at all.
        var reread = null;
        if (!needFull && totalChanged) {
          reread = {};
          var t;
          for (t = Math.max(0, count - TAIL_REREAD); t < count; t += 1) reread[t] = true;
          var lo = scrollHeight - scrollTop - viewH() * 1.5;
          var hi = scrollHeight - scrollTop + viewH() * 0.5;
          for (t = 0; t < count; t += 1) {
            var cc = measureCache[t];
            if (cc === undefined) { reread[t] = true; continue; }
            var near = scrollHeight - cc.top - cc.height;
            if (near >= lo && near <= hi) reread[t] = true;
          }
        }
        if (needFull) lastFullPassAt = now;

        var colorMine = readColor('--dsw-alias-brand-primary', '#4D6BFE');
        var colorReply = readColor('--dsw-alias-label-tertiary', '#6b7a99');
        var colorOther = readColor('--dsw-alias-border-l4', '#c9d2e3');

        var next = new Array(count);
        var valid = 0;
        var signature = 0;

        for (var i = 0; i < count; i += 1) {
          var block = all[i];
          var cached = measureCache[i];
          var fresh = cached !== undefined && cached.el === block;
          var mustRead = !fresh || needFull || (reread !== null && reread[i] === true);

          var top;
          var height;
          if (!mustRead) {
            top = cached.top;
            height = cached.height;
            if (height > 1) valid += 1; // a cached real value still counts as laid out
          } else {
            var rect = block.getBoundingClientRect();
            top = rect.top - boxTop;
            if (rect.height > 0) {
              height = rect.height;
              valid += 1;
              measureCache[i] = { el: block, top: top, height: height };
            } else {
              // Not laid out yet: this is a dirty value, so it is used for this
              // frame only and never cached (invariant ③). Estimated from the
              // block's own text rather than guessed flat — see EST_* above.
              height = tempHeightOf(block);
              measureCache[i] = undefined;
            }
          }

          signature += Math.round(height) * (i + 1) + Math.round(top);
          var kind = block.getAttribute('data-chat-flow-kind') || '';
          var mine = kind === 'user' || kind === 'steering';
          var span = mine ? stripWidthPx * 0.62 : stripWidthPx * 0.9;
          next[i] = {
            // Same ruler as the scrollbar.
            fromEnd: Math.max(0, scrollHeight - top - height),
            height: height,
            turn: block.getAttribute('data-chat-turn') || '',
            kind: kind,
            mine: mine,
            fill: mine ? colorMine : (kind === 'assistant' ? colorReply : colorOther),
            // Bar length proxies content volume using real block height,
            // avoiding a text serialisation per block.
            width: Math.max(6, Math.min(stripWidthPx - 4,
              span * Math.min(1, 0.35 + height / 1200))),
            // Where paint() actually drew it. Kept on the block so the hover hit
            // test and the picture can never disagree.
            drawY: 0,
            drawH: 0,
            // Only the hover tip reads a block's text, and only for the one under
            // the pointer; serialising hundreds of blocks during a redraw is what
            // made an earlier version slow.
            el: block,
          };
        }

        measureCache.length = count;
        blocks = next;
        drawnTotal = scrollHeight;
        // Layout was not ready: most blocks measured 0. That makes this pass
        // void — it paints nothing, because a picture built from placeholder
        // heights is worse than no picture. Drop the cache, queue a retry, and
        // stay dirty so the 250ms tick retries too (a slow layout must not be
        // able to leave the strip blank for good).
        if (count > 0 && valid < count * READY_RATIO) {
          measureCache.length = 0;
          totalDirty = true;
          if (retryTimer === 0 && retryCount < RETRY_MAX) {
            retryCount += 1;
            retryTimer = window.setTimeout(function () {
              retryTimer = 0;
              safe(function () { draw(); }, 'dshome-plugin: minimap retry failed');
            }, RETRY_MS);
          }
          return;
        }
        retryCount = 0;
        drawnBand = bandPx;

        lastSignature = count + '|' + Math.round(scrollHeight) + '|' + signature;

        paint(scrollHeight);
        paintShift();
        paintThumb();
      }

      // ── re-check while content settles (invariant ④ ─────────────────────
      var recheckTimer = 0;
      var stablePasses = 0;
      var lastSeenSignature = '';

      function stopRecheck() {
        if (recheckTimer !== 0) {
          try { window.clearTimeout(recheckTimer); } catch (error) { /* removed */ }
          recheckTimer = 0;
        }
      }

      function recheck() {
        recheckTimer = 0;
        safe(function () { draw(); });
        if (lastSignature === lastSeenSignature) {
          stablePasses += 1;
          if (stablePasses >= STABLE_PASSES) return; // settled: stop reading entirely
        } else {
          stablePasses = 0;
          lastSeenSignature = lastSignature;
        }
        try {
          recheckTimer = window.setTimeout(recheck, RECHECK_MS);
        } catch (error) {
          // unavailable
        }
      }

      function startRecheck() {
        stablePasses = 0;
        lastSeenSignature = '';
        if (recheckTimer === 0) {
          try {
            recheckTimer = window.setTimeout(recheck, RECHECK_MS);
          } catch (error) {
            // unavailable
          }
        }
      }

      // ── coalesced redraw ─────────────────────────────────────────────────
      var redrawTimer = 0;
      function scheduleRedraw() {
        if (redrawTimer !== 0) return;
        try {
          redrawTimer = window.setTimeout(function () {
            redrawTimer = 0;
            safe(function () { draw(); });
          }, REDRAW_MS);
        } catch (error) {
          redrawTimer = 0;
        }
      }

      // ── attaching to a conversation ──────────────────────────────────────
      //
      // When panels switch, a previous conversation's scroller can still be in
      // the DOM with a non-zero height, so pick the candidate that actually
      // intersects the viewport. "Intersects" is four-way on purpose: a column
      // parked outside the window still reports a positive height and a vertical
      // overlap, and a vertical-only test would hand us that stale session.
      function findScroller() {
        var candidates = document.querySelectorAll(SELECTORS.scrollBody);
        var firstOk = null;
        for (var i = 0; i < candidates.length; i += 1) {
          var el = candidates[i];
          if (el.clientHeight <= 0) continue;
          if (!el.querySelector(SELECTORS.turn)) continue;
          var rect = el.getBoundingClientRect();
          var onScreen = rect.bottom > 0 && rect.top < (window.innerHeight || 0) &&
            rect.right > 0 && rect.left < (window.innerWidth || 0);
          if (onScreen) return el;
          // Nothing intersects yet (the column is still being laid out at its
          // final position): return the first usable candidate rather than
          // nothing, so the strip attaches instead of staying hidden.
          if (firstOk === null) firstOk = el;
        }
        return firstOk;
      }

      var observer = null;
      var syncTimer = 0;

      function sync() {
        var found = findScroller();
        if (found !== scroller) {
          scroller = found;
          measureCache = [];
          blocks = [];
          drawnTotal = 0;
          drawnBand = -1;
          lastFullPassAt = 0;
          totalDirty = true;
          if (observer) {
            try { observer.disconnect(); } catch (error) { /* already gone */ }
            observer = null;
          }
          if (mutationObserver) {
            try { mutationObserver.disconnect(); } catch (error) { /* already gone */ }
            mutationObserver = null;
          }
          if (!scroller) {
            shell.style.display = 'none';
            return;
          }
          safe(function () {
            // A resize of the conversation column *is* the thing the strip has
            // to keep up with: the layout animates `grid-template-columns` when
            // the right sidebar opens or closes, and the column's width changes
            // on every frame of that 0.3s. Redrawing on the coalescing window
            // (what this did) left the geometry waiting for the 250ms tick, i.e.
            // the strip slid in visible steps and jumped at the end. sync() is
            // cheap when nothing about the picture changed: it re-places, and
            // only draws when the band or the total moved.
            observer = new ResizeObserver(function () { safe(sync); });
            observer.observe(scroller);
          });
          // Content changes — a new turn, streaming text, markup settling —
          // arrive as mutations. They are what should drive a redraw; the 250ms
          // tick remains the fallback for movement no observer reports, such as
          // a block that grew without touching the DOM.
          if (typeof MutationObserver === 'function') {
            safe(function () {
              mutationObserver = new MutationObserver(function () {
                totalDirty = true;
                // Redraw on the coalescing window (120ms) rather than waiting
                // for the next tick, so a message paints as it arrives.
                scheduleRedraw();
                // Re-arm the settle re-check: heights here keep growing after
                // the DOM has stopped changing, so one pass is never enough.
                startRecheck();
              });
              mutationObserver.observe(scroller, {
                childList: true, subtree: true, characterData: true,
              });
            });
          }
          startRecheck();
        }
        if (!scroller) return;
        bandPx = computeBand();
        // Geometry first: the occlusion test below asks where the strip *is*, so
        // the strip has to be where it belongs before anything is asked.
        placeShell();
        // Anything official that actually reaches the strip — the right sidebar's
        // floating pane, or its fullscreen state — leaves it nowhere to be, so it
        // stands down. On a wide viewport the sidebar has its own grid track and
        // sits beside the conversation instead of over it, so this no longer
        // fires merely because the sidebar is open.
        if (sidebarFullscreen() || sidebarCovers(stripBox())) {
          shell.style.display = 'none';
          return;
        }
        // A session that fits on one screen has nothing to navigate: hide the whole
        // strip rather than showing a box that cannot move.
        var fits = scroller.scrollHeight <= scroller.clientHeight * 1.05;
        shell.style.display = fits ? 'none' : 'block';
        if (fits) return;
        // Only redraw when the picture can actually be stale. This is the
        // difference between "the tick is a fallback" and "the tick is a redraw
        // loop that re-measures every block five times a second". The band is
        // part of the test because it is the picture's scale, not its contents.
        if (totalDirty || scroller.scrollHeight !== drawnTotal || bandPx !== drawnBand) {
          totalDirty = false;
          safe(function () { draw(); });
          return;
        }
        paintThumb();
        paintShift();
      }

      // ── frame-by-frame follow ────────────────────────────────────────────
      //
      // Read the layout on animation frames for a bounded window, so motion that
      // no observer reports — a transform slide — is followed as it happens
      // instead of sampled on a timer.
      var followUntil = 0;
      var followHandle = 0;
      var followScheduled = false;

      /** requestAnimationFrame, or 0 when the environment has none. */
      function requestFrame(fn) {
        try {
          if (typeof window.requestAnimationFrame === 'function') {
            return window.requestAnimationFrame(fn);
          }
        } catch (error) { /* unavailable */ }
        return 0;
      }

      function cancelFrame(handle) {
        try {
          if (handle && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(handle);
          }
        } catch (error) { /* already gone */ }
      }

      function followFrame() {
        followHandle = 0;
        followScheduled = false;
        safe(function () { sync(); });
        if (Date.now() < followUntil) {
          followScheduled = true;
          followHandle = requestFrame(followFrame);
        }
      }

      /** Start (or extend) a bounded run of per-frame reads. */
      function followLayout() {
        followUntil = Date.now() + SIDE_FOLLOW_MS;
        if (followScheduled) return;
        followScheduled = true;
        followHandle = requestFrame(followFrame);
      }

      /**
       * The sidebar opens and closes by attribute, but it *moves* by transform
       * and by an animated grid track — so the instant its rect is readable it is
       * still off-window, and reading once on the attribute flip plus once after
       * a fixed settle (what this used to do) left the strip motionless through
       * the whole slide and then jumping into place. Instead: read at once, then
       * keep reading frame by frame for as long as the slide can last. That costs
       * nothing once the follow window closes.
       *
       * `attributeFilter` is what stops this feeding itself: the strip is itself
       * a child of body, so an unfiltered observer would wake on every style
       * write the strip makes.
       */
      function resyncForSidebar() {
        safe(function () { sync(); });
        followLayout();
        if (sidebarSettleTimer !== 0) {
          try { window.clearTimeout(sidebarSettleTimer); } catch (error) { /* gone */ }
        }
        // Kept as the fallback for environments without animation frames: it is
        // the last read either way.
        sidebarSettleTimer = window.setTimeout(function () {
          sidebarSettleTimer = 0;
          safe(function () { sync(); });
        }, SIDEBAR_SETTLE_MS);
      }

      if (typeof MutationObserver === 'function') {
        try {
          sidebarObserver = new MutationObserver(resyncForSidebar);
          sidebarObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-sidebar-right-open', 'data-sidebar-right-panel'],
            subtree: true,
          });
        } catch (error) {
          sidebarObserver = null;   // degrade to the 250ms tick
        }
      }

      // ── pointer interaction ──────────────────────────────────────────────
      /** Scroll so the content at `contentY` lands in the middle of the viewport. */
      function scrollToContent(contentY) {
        if (!scroller) return;
        var max = Math.max(0, totalOf() - viewH());
        scroller.scrollTop = Math.max(0, Math.min(max, contentY - viewH() / 2));
        paintShift();
        paintThumb();
      }

      /** Document position under a client Y, inverted through the canvas offset. */
      function contentAtPointer(clientY) {
        if (!(stripScale > 0)) return 0;
        var rect = shell.getBoundingClientRect();
        return (canvasOffsetOf() + (clientY - rect.top)) / stripScale;
      }

      /** Thumb top for a 0..1 progress, in the current window. */
      function thumbTopFor(p) {
        var h = thumbHeight();
        var railH = shell.clientHeight > 0 ? shell.clientHeight : bandPx;
        return Math.max(0, Math.min(Math.max(0, railH - h), p * Math.max(0, railH - h)));
      }

      /**
       * The block whose painted rectangle contains `canvasY`.
       *
       * Binary search over `drawY`, which paint() keeps ascending (blocks are in
       * document order, and a later block is drawn lower). Deliberately the
       * *painted* rectangle: the drawn height has a 1px floor, so a lookup that
       * recomputed the position from content coordinates would land on the
       * neighbouring message.
       */
      function blockAt(canvasY) {
        var low = 0;
        var high = blocks.length - 1;
        var found = null;
        while (low <= high) {
          var mid = (low + high) >> 1;
          var y = blocks[mid] && typeof blocks[mid].drawY === 'number' ? blocks[mid].drawY : 0;
          if (y <= canvasY) {
            found = blocks[mid];
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        return found;
      }

      /**
       * Name the block under the pointer, with the opening words of the message
       * as a second line: a turn number alone does not say what the message is.
       *
       * Throttled — pointermove fires far faster than a redraw, and reading a
       * block's textContent forces layout.
       */
      function showTip(clientY) {
        if (!scroller || blocks.length === 0) return;
        var now = Date.now();
        if (now - lastTipAt < TIP_MS) return;
        lastTipAt = now;
        var rect = shell.getBoundingClientRect();
        if (!(rect.height > 0)) return;
        var local = clientY - rect.top;
        var block = blockAt(canvasOffsetOf() + local);
        // Only a block that was actually drawn can be named: while layout is
        // still settling the block table exists but nothing is on the canvas,
        // and naming an invisible block would be a confident lie.
        if (!block || !(block.drawH > 0)) {
          tip.removeAttribute('data-show');
          return;
        }
        var label = block.kind === 'user' || block.kind === 'steering' ? 'You'
          : block.kind === 'assistant' ? 'Assistant'
            : block.kind === 'tool-call' || block.kind === 'tool' ? 'Tool call'
              : block.kind === 'thinking' || block.kind === 'think' ? 'Thinking'
                : 'Content';
        var raw = block.el && block.el.textContent ? String(block.el.textContent) : '';
        var text = raw.replace(/\s+/g, ' ').trim();
        var preview = text.length > 90 ? text.slice(0, 90) + '…' : text;
        var head = (block.turn ? 'Turn ' + block.turn + ' · ' : '') + label;
        tip.textContent = preview === '' ? head : head + '\n' + preview;
        tip.style.top = Math.round(local) + 'px';
        tip.setAttribute('data-show', '1');
      }

      var dragging = false;
      var dragUntil = 0;
      var dragGrab = null;   // clientY minus the thumb top, when the grab started on the thumb

      shell.addEventListener('pointerdown', function (event) {
        if (typeof event.button === 'number' && event.button !== 0) return;
        dragging = true;
        dragUntil = Date.now() + DRAG_TIMEOUT_MS;
        shell.setAttribute('data-active', '1');
        // A drag is not a hover: drop the tip rather than leave it frozen.
        tip.removeAttribute('data-show');
        safe(function () { shell.setPointerCapture(event.pointerId); });
        var rect = shell.getBoundingClientRect();
        var h = thumbHeight();
        var local = event.clientY - rect.top;
        var thumbTop = thumbTopFor(progress());
        // Planting the pointer on the thumb keeps the grab point under it (no
        // jump); planting it anywhere else centres the clicked content.
        dragGrab = local >= thumbTop - 8 && local <= thumbTop + h + 8 ? local - thumbTop : null;
        if (dragGrab === null) scrollToContent(contentAtPointer(event.clientY));
        safe(function () { event.preventDefault(); });
      });

      shell.addEventListener('pointermove', function (event) {
        if (!dragging) {
          // Not dragging, so this is a hover: name the block under the pointer.
          showTip(event.clientY);
          return;
        }
        if (Date.now() > dragUntil) { endDrag(); return; }
        // Self-heal: a pointerup delivered elsewhere must not leave us dragging.
        if (event.buttons === 0) { endDrag(); return; }
        if (dragGrab !== null) {
          var rect = shell.getBoundingClientRect();
          var h = thumbHeight();
          var railH = shell.clientHeight > 0 ? shell.clientHeight : bandPx;
          var travel = Math.max(0, railH - h);
          if (travel <= 0 || !scroller) return;
          var p = Math.max(0, Math.min(1, (event.clientY - rect.top - dragGrab) / travel));
          scroller.scrollTop = p * Math.max(0, totalOf() - viewH());
          paintShift();
          paintThumb();
          return;
        }
        scrollToContent(contentAtPointer(event.clientY));
      });

      // The wheel belongs to the conversation: swallowing it here is what makes the
      // strip feel like it has taken the mouse away.
      shell.addEventListener('wheel', function (event) {
        if (!scroller) return;
        scroller.scrollTop += event.deltaY;
        safe(function () { event.preventDefault(); });
      }, { passive: false });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        dragGrab = null;
        shell.removeAttribute('data-active');
      }
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', endDrag, true);
      window.addEventListener('blur', endDrag, true);
      shell.addEventListener('pointerleave', function () {
        tip.removeAttribute('data-show');
        if (dragging) endDrag();
      });

      // Keep the picture current when the scroll position moves by any means.
      function onScrollCapture() {
        if (!scroller) return;
        paintShift();
        paintThumb();
      }
      document.addEventListener('scroll', onScrollCapture, true);

      // Observers alone do not catch every way the conversation can move; this
      // is the fallback, not the primary path.
      try {
        syncTimer = window.setInterval(function () { safe(sync); }, SYNC_MS);
      } catch (error) {
        syncTimer = 0;
      }

      function onResize() {
        safe(sync);
        // A window resize can be followed by a layout that keeps settling (the
        // sidebar's auto-collapse below 1024px), so follow it for a moment.
        followLayout();
      }
      window.addEventListener('resize', onResize);
      safe(sync);

      // Everything this pass attached, so a hot reload can undo it before the next
      // pass installs its own. The shell's own listeners go away with the shell.
      return function () {
        try { window.clearInterval(syncTimer); } catch (error) { /* not started */ }
        followScheduled = false;
        cancelFrame(followHandle);
        followHandle = 0;
        stopRecheck();
        if (retryTimer !== 0) {
          try { window.clearTimeout(retryTimer); } catch (error) { /* already fired */ }
          retryTimer = 0;
        }
        if (sidebarSettleTimer !== 0) {
          try { window.clearTimeout(sidebarSettleTimer); } catch (error) { /* already fired */ }
          sidebarSettleTimer = 0;
        }
        if (observer) safe(function () { observer.disconnect(); });
        if (mutationObserver) safe(function () { mutationObserver.disconnect(); });
        if (sidebarObserver) safe(function () { sidebarObserver.disconnect(); });
        if (document.removeEventListener) document.removeEventListener('scroll', onScrollCapture, true);
        if (window.removeEventListener) {
          window.removeEventListener('resize', onResize);
          window.removeEventListener('pointerup', endDrag, true);
          window.removeEventListener('pointercancel', endDrag, true);
          window.removeEventListener('blur', endDrag, true);
        }
        safe(function () { shell.remove(); });
      };
    }

    // ═══════════════════════════════════════════════════════════════════════    // notify —turn / member / attention reminders
    // ═══════════════════════════════════════════════════════════════════════    //
    // The DSHOME reference implements this as a *host* plugin
    // (`packages/dshome/lib/host/notify.js`): it subscribes to `session/event`
    // and POSTs `{title, body, sound}` to the Electron shell's local notify
    // listener. This bundle is a client plugin whose node half carries no host
    // behaviour, so the same moments are derived from client state the official
    // UI already computes, and delivered with browser APIs instead:
    //
    //   · `sessions`  —the session catalog. `list` is a snapshot store; every row
    //                  carries `running`, `origin` and the `retainedBy.mainView`
    //                  tag, which is the official rule for "the session the user
    //                  is looking at" (`dsh-client-ui-session` uses the same one).
    //   · `uiSession` —the official status projection
    //                  `{running, pendingInteraction, completionUnread}` per
    //                  session. `pendingInteraction.kind` is `approval`,
    //                  `question` or `plan-review`.
    //   · `remote`    —`api-session/error` for the failure branches.
    //
    // Categories, copy and the two throttles mirror the reference one for one;
    // delivery degrades rather than failing: a system notification when the
    // browser grants it, an in-page toast otherwise, plus a title flash while the
    // tab is hidden. Without those services the feature is simply absent.
    //
    // Two divergences from the reference, both forced by the platform:
    //   · Sounds are synthesised with WebAudio instead of naming a file under
    //     `%WINDIR%\Media` —a web page cannot read those.
    //   · There is no client-side `turn/end{reason}` to read, so failures come
    //     from `api-session/error`, and there is no client-side background *job*
    //     feed, so the reference's `job-*` scenes are covered by the member
    //     branch (a finished session that is not the one in view).

    var NOTIFY_PLUGIN = 'dshome-plugin-notify';
    /** Per-(scene, session) gap, the same value and intent as `deliverAttention`. */
    var NOTIFY_THROTTLE_MS = 5000;
    /** Every member/background reminder shares one sound window (reference contract v2). */
    var NOTIFY_SOUND_WINDOW_MS = 5000;
    /** How long one in-page toast stays: a reminder, not a dialog. */
    var NOTIFY_TOAST_MS = 9000;
    /** How long the tab title carries the flash while the page is hidden. */
    var NOTIFY_TITLE_MS = 8000;
    /** Above this many stacked toasts the oldest is dropped, never a wall of them. */
    var NOTIFY_TOAST_MAX = 3;

    /** The reference's `COPY`, kept verbatim so both products read alike. */
    var NOTIFY_COPY = {
      'turn-completed': { title: 'DSHOME 回合完成', body: '一个由你发起的回合已处理完毕，可查看结果。' },
      'turn-failed': { title: 'DSHOME 回合失败', body: '一个由你发起的回合未能完成，请查看详情。' },
      'member-completed': { title: 'DSHOME 成员任务完成', body: '一个成员任务已完成。' },
      'member-failed': { title: 'DSHOME 成员任务失败', body: '一个成员任务未能完成，请查看详情。' },
      'approval-asked': { title: 'DSHOME 需要你确认', body: '有一个操作在等你确认后才会继续。' },
      'user-question': { title: 'DSHOME 有个问题等你回答', body: '模型在等你选择或补充信息。' },
    };

    /** Scene → tone pair. Three distinguishable shapes, not six near-identical beeps. */
    var NOTIFY_TONES = {
      turn: [660, 990],
      background: [520, 660],
      attention: [784, 1046],
    };
    /** Gap between the two tones of one chime, in seconds. */
    var NOTIFY_TONE_MS = 0.16;

    /**
     * Normalise `window.__dshomePlugin.notify`, which may be `true`, `false`, or an
     * object. Field names follow the reference's settings schema so the two
     * products stay readable side by side.
     */
    function notifyOptions(raw) {
      var out = {
        enabled: true,
        notifyOnTurnCompletion: true,
        notifyOnBackground: true,
        notifyOnApproval: true,
        notifyOnUserQuestion: true,
        sound: true,
        toast: true,
        titleFlash: true,
      };
      if (raw === false) {
        out.enabled = false;
        return out;
      }
      if (raw && typeof raw === 'object') {
        for (var key in out) {
          if (Object.prototype.hasOwnProperty.call(out, key) &&
              Object.prototype.hasOwnProperty.call(raw, key)) {
            out[key] = raw[key] !== false;
          }
        }
      }
      return out;
    }

    var NOTIFY_CSS = [
      '.dshome-plugin-notify-stack{position:fixed;right:16px;bottom:16px;z-index:2147483000;',
      'display:flex;flex-direction:column;gap:8px;max-width:360px;pointer-events:none}',
      '.dshome-plugin-notify-toast{pointer-events:auto;cursor:pointer;display:flex;',
      'flex-direction:column;gap:4px;padding:12px 14px;border-radius:10px;',
      'border:1px solid var(--dsw-alias-border-l2,#d3dcea);',
      'border-left:3px solid var(--dsw-alias-brand-primary,#4D6BFE);',
      'background:var(--dsw-alias-bg-overlay,#fff);',
      'box-shadow:var(--dsw-shadow-lv2,0 6px 20px rgba(15,20,32,.18));',
      'font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary,#1a2233)}',
      '.dshome-plugin-notify-toast-title{font-weight:600}',
      '.dshome-plugin-notify-toast-body{color:var(--dsw-alias-label-secondary,#4a5a78)}',
    ].join('');

    /**
     * Install the reminder feature.
     *
     * Every upstream read is optional: a missing service means a missing reminder
     * scene, never a failed activation. The returned function is the teardown,
     * because this bundle hot-reloads and a second pass must not stack
     * subscriptions (the same reason the minimap owns one).
     *
     * @param {object} ctx client context
     * @param {boolean|object} rawOptions `window.__dshomePlugin.notify`
     * @returns {Function|null} teardown, or null when the feature is switched off
     */
    function applyNotify(ctx, rawOptions) {
      var opts = notifyOptions(rawOptions);
      if (!opts.enabled) return null;

      // Re-entrant: a hot reload runs apply() again while the previous pass still
      // holds store subscriptions, listeners and DOM.
      if (typeof window.__dshomePluginNotifyTeardown === 'function') {
        try { window.__dshomePluginNotifyTeardown(); } catch (error) { /* already gone */ }
      }
      window.__dshomePluginNotifyTeardown = null;

      installStyle(NOTIFY_PLUGIN, NOTIFY_CSS);

      var stops = [];
      var disposed = false;
      /** sessionId → {running, main, title} as last seen (the diff's left side). */
      var sessions = new Map();
      /** sessionId → pending interaction kind as last seen. */
      var pending = new Map();
      /** The first ready catalog is a baseline: loading the page must not fire a burst. */
      var catalogBaseline = false;
      var statusBaseline = false;
      var lastAttentionAt = new Map();
      var lastSoundAt = 0;
      var audio = null;
      var titleBase = null;
      var titleTimer = 0;
      var titleWatching = false;
      var stack = null;
      var stackAttached = false;
      var wired = { catalog: false, status: false, remote: false };

      /** Register one disposer. */
      function stop(fn) {
        if (typeof fn === 'function') stops.push(fn);
      }

      /** One-line, truncated text: a notification is no place for a whole command. */
      function oneLine(text, max) {
        var flat = String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ');
        flat = flat.replace(/^\s+|\s+$/g, '');
        if (flat === '') return '';
        return flat.length > max ? flat.slice(0, max - 1) + '\u2026' : flat;
      }

      function focusWindow() {
        try { window.focus(); } catch (error) { /* nothing to do */ }
      }

      /**
       * The platform's Notification constructor, read defensively: the browser
       * may not have one at all and a probe must not throw.
       */
      function notificationCtor() {
        try {
          if (typeof window !== 'undefined' && typeof window.Notification === 'function') {
            return window.Notification;
          }
        } catch (error) { /* fall through */ }
        try {
          if (typeof Notification === 'function') return Notification;
        } catch (error) { /* fall through */ }
        return null;
      }

      function permissionState() {
        var ctor = notificationCtor();
        if (!ctor) return 'unavailable';
        return typeof ctor.permission === 'string' ? ctor.permission : 'default';
      }

      /** @returns {boolean} whether a real system notification was raised. */
      function systemNotify(title, body, tag) {
        var ctor = notificationCtor();
        if (!ctor || permissionState() !== 'granted') return false;
        try {
          var note = new ctor(title, { body: body, tag: tag, silent: true });
          if (note && typeof note.addEventListener === 'function') {
            note.addEventListener('click', focusWindow);
          } else if (note) {
            note.onclick = focusWindow;
          }
          if (typeof window.setTimeout === 'function') {
            window.setTimeout(function () {
              try { if (note && typeof note.close === 'function') note.close(); } catch (error) { /* gone */ }
            }, 12000);
          }
          return true;
        } catch (error) {
          // A refused Notification must not swallow the reminder: the toast below
          // still runs, so a reminder is never silently lost.
          return false;
        }
      }

      function ensureStack() {
        // `stackAttached` rather than `stack.parent`/`parentNode`: a real
        // Element has no `parent` at all, and a double may only carry one of the
        // two, either of which would silently re-create the container per toast.
        if (stack && stackAttached) return stack;
        if (!document || !document.body) return null;
        var box = document.createElement('div');
        box.className = 'dshome-plugin-notify-stack';
        box.setAttribute('aria-live', 'polite');
        document.body.appendChild(box);
        stack = box;
        stackAttached = true;
        return box;
      }

      /** The in-page fallback: what a reminder looks like without notification rights. */
      function toast(title, body) {
        if (!opts.toast) return;
        var box = ensureStack();
        if (!box) return;
        var card = document.createElement('div');
        card.className = 'dshome-plugin-notify-toast';
        card.setAttribute('role', 'status');
        var head = document.createElement('div');
        head.className = 'dshome-plugin-notify-toast-title';
        head.textContent = title;
        var text = document.createElement('div');
        text.className = 'dshome-plugin-notify-toast-body';
        text.textContent = body;
        card.appendChild(head);
        card.appendChild(text);
        card.addEventListener('click', function () {
          try { card.remove(); } catch (error) { /* gone */ }
          stopTitleFlash();
          focusWindow();
        });
        box.appendChild(card);
        while (box.children.length > NOTIFY_TOAST_MAX) {
          try { box.children[0].remove(); } catch (error) { break; }
        }
        if (typeof window.setTimeout === 'function') {
          window.setTimeout(function () {
            try { card.remove(); } catch (error) { /* gone */ }
          }, NOTIFY_TOAST_MS);
        }
      }

      function stopTitleFlash() {
        if (titleTimer) {
          try { window.clearTimeout(titleTimer); } catch (error) { /* gone */ }
          titleTimer = 0;
        }
        if (titleBase !== null) {
          try { document.title = titleBase; } catch (error) { /* gone */ }
          titleBase = null;
        }
        if (titleWatching) {
          titleWatching = false;
          try { window.removeEventListener('focus', stopTitleFlash); } catch (error) { /* gone */ }
          try { document.removeEventListener('visibilitychange', stopTitleFlash); } catch (error) { /* gone */ }
        }
      }

      /**
       * Flash the tab title, but only while the page is hidden: a visible client
       * already shows the turn, and rewriting its title there would be noise.
       */
      function flashTitle(text) {
        if (!opts.titleFlash) return;
        try {
          if (document.visibilityState === 'visible') return;
          if (titleBase === null) titleBase = document.title;
          document.title = '\uD83D\uDD14 ' + text;
          if (!titleWatching) {
            titleWatching = true;
            window.addEventListener('focus', stopTitleFlash);
            document.addEventListener('visibilitychange', stopTitleFlash);
          }
          if (titleTimer) window.clearTimeout(titleTimer);
          titleTimer = window.setTimeout(stopTitleFlash, NOTIFY_TITLE_MS);
        } catch (error) { /* a title flash is never worth an exception */ }
      }

      /** A two-tone chime; silence is the right failure mode for a sound. */
      function playTones(scene) {
        if (!opts.sound) return;
        try {
          var ctor = window.AudioContext || window.webkitAudioContext;
          if (typeof ctor !== 'function') return;
          if (!audio) audio = new ctor();
          if (audio.state === 'suspended' && typeof audio.resume === 'function') {
            var resumed = audio.resume();
            // Autoplay policy rejects this promise before the first gesture; an
            // unconsumed rejection would surface as a page error for a mute tap.
            if (resumed && typeof resumed.catch === 'function') {
              resumed.catch(function () { /* sound is optional */ });
            }
          }
          var tones = NOTIFY_TONES[scene] || NOTIFY_TONES.background;
          var at = audio.currentTime;
          for (var i = 0; i < tones.length; i += 1) {
            var start = at + i * NOTIFY_TONE_MS;
            var osc = audio.createOscillator();
            var gain = audio.createGain();
            osc.type = 'sine';
            osc.frequency.value = tones[i];
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
            osc.connect(gain);
            gain.connect(audio.destination);
            osc.start(start);
            osc.stop(start + 0.26);
          }
        } catch (error) { /* a reminder must survive a mute device */ }
      }

      function sceneOf(key) {
        if (key === 'turn-completed' || key === 'turn-failed') return 'turn';
        if (key === 'approval-asked' || key === 'user-question') return 'attention';
        return 'background';
      }

      /** `turn` and `attention` always sound; `background` shares the 5s window. */
      function soundAllowed(scene, now) {
        if (scene !== 'background') return true;
        if (now - lastSoundAt < NOTIFY_SOUND_WINDOW_MS) return false;
        lastSoundAt = now;
        return true;
      }

      /** One reminder, end to end: sound, then system notification or toast. */
      function deliver(key, detail) {
        var copy = NOTIFY_COPY[key];
        if (!copy) return;
        var title = detail && detail.title ? detail.title : copy.title;
        var body = detail && detail.body ? detail.body : copy.body;
        var sessionId = detail && detail.sessionId ? detail.sessionId : '';
        var scene = sceneOf(key);
        var now = Date.now();
        try {
          if (soundAllowed(scene, now)) playTones(scene);
          var shown = systemNotify(title, body,
            'dshome-plugin:' + key + (sessionId ? ':' + sessionId : ''));
          if (!shown) toast(title, body);
          flashTitle(title);
        } catch (error) {
          console.warn('dshome-plugin: notify delivery failed', error);
        }
      }

      /** Waiting scenes are throttled per session, exactly like `deliverAttention`. */
      function deliverAttention(key, sessionId, detail) {
        var throttleKey = key + ':' + sessionId;
        var now = Date.now();
        if (now - (lastAttentionAt.get(throttleKey) || 0) < NOTIFY_THROTTLE_MS) return;
        lastAttentionAt.set(throttleKey, now);
        var outgoing = { sessionId: sessionId };
        if (detail && detail.title) outgoing.title = detail.title;
        if (detail && detail.body) outgoing.body = detail.body;
        deliver(key, outgoing);
      }

      function pendingKindOf(interaction) {
        if (!interaction) return '';
        if (interaction.kind === 'approval') return 'approval';
        if (interaction.kind === 'question' || interaction.kind === 'plan-review') return 'question';
        return '';
      }

      /** First question of a batch, the same summary the reference sends. */
      function questionSummary(questions) {
        var first = Array.isArray(questions) ? questions[0] : null;
        if (!first || typeof first !== 'object') return '';
        return oneLine(first.header || first.question, 80);
      }

      /** The catalog is the completion source: a running flag that flips to false. */
      function onCatalog() {
        if (disposed) return;
        var service = ctx.get('sessions');
        if (!service || !service.list || typeof service.list.getSnapshot !== 'function') return;
        var snapshot = service.list.getSnapshot();
        if (!snapshot || !snapshot.byId) return;
        var ids = snapshot.ids || Object.keys(snapshot.byId);
        var next = new Map();
        for (var i = 0; i < ids.length; i += 1) {
          var id = String(ids[i]);
          var row = snapshot.byId[ids[i]];
          if (!row) continue;
          next.set(id, {
            running: row.running === true,
            main: !!(row.retainedBy && row.retainedBy.mainView > 0),
            title: oneLine(row.displayTitle || row.title, 40),
          });
        }
        // The baseline snapshot records state without announcing history; only a
        // live transition after the catalog is ready is a reminder.
        if (!catalogBaseline) {
          catalogBaseline = snapshot.phase === 'ready';
          sessions = next;
          return;
        }
        next.forEach(function (current, id) {
          var before = sessions.get(id);
          if (!before || before.running !== true || current.running !== false) return;
          var detail = { sessionId: id };
          if (current.main) {
            if (!opts.notifyOnTurnCompletion) return;
            if (current.title) detail.body = '「' + current.title + '」已处理完毕，可查看结果。';
            deliver('turn-completed', detail);
            return;
          }
          if (!opts.notifyOnBackground) return;
          detail.body = current.title
            ? '成员「' + current.title + '」的回合已完成，可查看结果。'
            : NOTIFY_COPY['member-completed'].body;
          deliver('member-completed', detail);
        });
        sessions = next;
      }

      /** Approvals and questions come from the official pending-interaction projection. */
      function onStatus() {
        if (disposed) return;
        var service = ctx.get('uiSession');
        if (!service || !service.sessionStatus ||
            typeof service.sessionStatus.getSnapshot !== 'function') return;
        var snapshot = service.sessionStatus.getSnapshot();
        if (!snapshot || typeof snapshot.forEach !== 'function') return;
        var next = new Map();
        snapshot.forEach(function (entry, id) {
          if (!entry || !entry.pendingInteraction) return;
          var kind = pendingKindOf(entry.pendingInteraction);
          if (kind === '') return;
          next.set(String(id), { kind: kind, interaction: entry.pendingInteraction });
        });
        if (!statusBaseline) {
          statusBaseline = true;
          pending = next;
          return;
        }
        next.forEach(function (current, id) {
          var before = pending.get(id);
          if (before && before.kind === current.kind) return;
          var interaction = current.interaction;
          if (current.kind === 'approval') {
            if (!opts.notifyOnApproval) return;
            var tool = oneLine(interaction.toolName, 40) || '未知工具';
            // `reason` is the raw string; `displayReason` is a *localized* token
            // that may be an object, so it is only used when it is already text
            // (otherwise a notification would read "[object Object]").
            var reason = oneLine(interaction.reason, 120);
            if (reason === '' && typeof interaction.displayReason === 'string') {
              reason = oneLine(interaction.displayReason, 120);
            }
            deliverAttention('approval-asked', id, {
              body: reason
                ? '工具「' + tool + '」请求确认：' + reason
                : '工具「' + tool + '」在等你确认后才会继续。',
            });
            return;
          }
          if (!opts.notifyOnUserQuestion) return;
          var summary = questionSummary(interaction.questions);
          deliverAttention('user-question', id, summary ? { body: summary } : undefined);
        });
        pending = next;
      }

      /**
       * Failures: the client receives the host's `api-session/error` forwarding.
       * A session the catalog does not know yet is treated as main, because the
       * reference only reports failures for user-initiated turns.
       */
      function wireRemote(service) {
        if (!service || typeof service.$on !== 'function') return false;
        var off = null;
        try {
          off = service.$on('api-session/error', function (sessionId, message) {
            if (disposed) return;
            var id = String(sessionId === null || sessionId === undefined ? '' : sessionId);
            var row = sessions.get(id);
            var isMain = !row || row.main;
            if (isMain && !opts.notifyOnTurnCompletion) return;
            if (!isMain && !opts.notifyOnBackground) return;
            var detail = { sessionId: id };
            var text = oneLine(message, 120);
            if (row && row.title) {
              detail.body = isMain
                ? '「' + row.title + '」未能完成，请查看详情。'
                : '成员「' + row.title + '」的回合未能完成，请查看详情。';
            } else if (text) {
              detail.body = text;
            }
            deliver(isMain ? 'turn-failed' : 'member-failed', detail);
          });
        } catch (error) {
          console.warn('dshome-plugin: notify remote subscription failed', error);
          return false;
        }
        if (typeof off === 'function') stop(off);
        return true;
      }

      function wireStore(store, handler, label) {
        if (!store || typeof store.subscribe !== 'function') return false;
        try {
          var off = store.subscribe(handler);
          if (typeof off === 'function') stop(off);
          return true;
        } catch (error) {
          console.warn('dshome-plugin: notify ' + label + ' subscription failed', error);
          return false;
        }
      }

      /** Attach whatever the client currently offers; idempotent per source. */
      function attach() {
        if (disposed) return;
        if (!wired.catalog) {
          var sessionsService = ctx.get('sessions');
          if (sessionsService && sessionsService.list) {
            wired.catalog = wireStore(sessionsService.list, onCatalog, 'sessions');
            if (wired.catalog) onCatalog();
          }
        }
        if (!wired.status) {
          var uiService = ctx.get('uiSession');
          if (uiService && uiService.sessionStatus) {
            wired.status = wireStore(uiService.sessionStatus, onStatus, 'uiSession');
            if (wired.status) onStatus();
          }
        }
        if (!wired.remote) {
          var remoteService = ctx.get('remote');
          if (remoteService) wired.remote = wireRemote(remoteService);
        }
      }

      attach();

      // `sessions` / `uiSession` / `remote` may be provided after this plugin
      // activates (`slots` is our only declared inject), so wait for each instead
      // of sampling once — the same reason the theme feature waits for `theme`.
      if (typeof ctx.inject === 'function') {
        ['sessions', 'uiSession', 'remote'].forEach(function (name) {
          if (ctx.get(name)) return;
          try {
            ctx.inject([name], function () { attach(); });
          } catch (error) { /* an absent service is a missing scene, not a failure */ }
        });
      }

      /**
       * Ask for notification rights on the first user gesture: browsers only grant
       * them from a gesture, and until then every reminder takes the toast path.
       */
      function primePermission() {
        var ctor = notificationCtor();
        if (!ctor || permissionState() !== 'default' ||
            typeof ctor.requestPermission !== 'function') return;
        var ask = function () {
          try {
            window.removeEventListener('pointerdown', ask, true);
            document.removeEventListener('keydown', ask, true);
          } catch (error) { /* gone */ }
          try {
            var pendingAsk = ctor.requestPermission();
            if (pendingAsk && typeof pendingAsk.catch === 'function') {
              pendingAsk.catch(function () { /* a refusal is a normal answer */ });
            }
          } catch (error) { /* ignore */ }
        };
        try {
          window.addEventListener('pointerdown', ask, true);
          document.addEventListener('keydown', ask, true);
          stop(function () {
            window.removeEventListener('pointerdown', ask, true);
            document.removeEventListener('keydown', ask, true);
          });
        } catch (error) { /* the toast path still works */ }
      }
      primePermission();

      function teardown() {
        if (disposed) return;
        disposed = true;
        while (stops.length > 0) {
          var off = stops.pop();
          try { off(); } catch (error) { /* already gone */ }
        }
        stopTitleFlash();
        if (stack) {
          try { stack.remove(); } catch (error) { /* gone */ }
          stack = null;
        }
        stackAttached = false;
        try { if (audio && typeof audio.close === 'function') audio.close(); } catch (error) { /* gone */ }
        audio = null;
        if (window.__dshomePluginNotify === api) window.__dshomePluginNotify = null;
        if (window.__dshomePluginNotifyTeardown === teardown) window.__dshomePluginNotifyTeardown = null;
      }

      /**
       * Live handle, so the feature can be inspected and verified from the console
       * without waiting for a real turn (`__dshomePluginNotify.emit('turn-completed')`).
       */
      var api = {
        version: 'v1',
        status: function () {
          return {
            options: notifyOptions(rawOptions),
            permission: permissionState(),
            scenes: Object.keys(NOTIFY_COPY),
            sessions: sessions.size,
            pending: pending.size,
            catalogBaseline: catalogBaseline,
          };
        },
        emit: function (key, detail) {
          return safe(function () { deliver(key, detail || {}); }, 'dshome-plugin: notify emit failed');
        },
        teardown: teardown,
      };
      window.__dshomePluginNotify = api;

      return teardown;
    }

    // ═══════════════════════════════════════════════════════════════════════    // plugin
    // ═══════════════════════════════════════════════════════════════════════
    /** `slots` is required for brand registration; the other two do not need it. */
    var inject = ['slots'];

    /**
     * Options are read off a single global so behaviour can be adjusted at
     * runtime without a rebuild. `notify` accepts `true`/`false` as well as an
     * object (`{notifyOnApproval:false, …}`); see `notifyOptions`.
     */
    function options() {
      var o = {
        theme: true, conversation: true, minimap: true, sidebar: true,
        hideOfficialRail: true, notify: true,
      };
      var override = window.__dshomePlugin;
      if (override && typeof override === 'object') {
        for (var k in override) {
          if (Object.prototype.hasOwnProperty.call(override, k)) o[k] = override[k];
        }
      }
      return o;
    }

    function apply(ctx) {
      var o = options();
      if (o.theme) {
        safe(function () { applyTheme(ctx); }, 'dshome-plugin: theme failed');
      }
      if (o.conversation) {
        safe(applyConversation, 'dshome-plugin: conversation failed');
      }
      if (o.sidebar) {
        safe(applySidebar, 'dshome-plugin: sidebar failed');
      }
      if (o.minimap) {
        safe(function () {
          // Held on the global so a re-entrant apply() can tear the previous pass
          // down first; the loader hands us no other lifecycle handle.
          window.__dshomePluginTeardown =
            applyMinimap({ hideOfficialRail: o.hideOfficialRail }) || null;
        }, 'dshome-plugin: minimap failed');
      }
      if (o.notify) {
        safe(function () {
          // Same re-entrancy contract as the minimap, on its own global so the
          // two features cannot tear each other down.
          window.__dshomePluginNotifyTeardown = applyNotify(ctx, o.notify) || null;
        }, 'dshome-plugin: notify failed');
      }
    }

    module.exports = { name: 'dshome-plugin', inject: inject, apply: apply };
    // The loader materialises the factory's *return value* as the plugin body,
    // so it must be returned explicitly.
    return module.exports;
  },
});
