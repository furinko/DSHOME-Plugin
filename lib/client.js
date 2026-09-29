// DSHOME-Plugin �?browser client module.
//
// ── Why this is one file with no import/export ───────────────────────────────
// The host loads this bundle as a **classic script**
// (`document.createElement("script")` + `el.src = url`; see
// `@deepseek-ai/dsh-client-modules/lib/client.js`: "Default bundle-load hook:
// same-origin external classic script"). A classic script is not a module, so
// any top-level `import` throws `SyntaxError: Cannot use import statement
// outside a module` and the entry never activates �?which fails the whole web
// boot, not just this plugin.
//
// The source is therefore deliberately authored as one self-contained file.
// Modules the host exposes (react, the UI primitives) are pulled through the
// `require` argument of the loader factory instead.
//
// Three features share one plugin id:
//   · theme        �?brand accent tokens + brand slots
//   · conversation �?card isolation + think line window
//   · minimap      �?VSCode-style turn thumbnail navigation
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

    // ══════════════════════════════════════════════════════════════════════�?    // shared �?selectors, style injection, small utilities
    // ══════════════════════════════════════════════════════════════════════�?    //
    // Selector discipline: official **semantic attributes** only
    // (data-variant / data-chat-flow-kind / data-chat-turn / data-disclosure-row
    // / data-state / data-expanded / data-chat-flow-key). CSS-Module hash class
    // names such as `lcKema_frame` change on every upstream rebuild and are
    // never used anywhere in this file.

    /** Official semantic attributes. */
    var SELECTORS = {
      /** A reasoning ("think") block. */
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

    // ══════════════════════════════════════════════════════════════════════�?    // theme �?brand accent tokens + brand slots
    // ══════════════════════════════════════════════════════════════════════�?    //
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
      '--dsw-alias-bg-base': { light: '#f7f9fc', dark: '#0f1420' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#131a29' },
      '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#172032' },
      '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#1a2338' },
      '--dsw-alias-bg-module-platform': { light: '#ffffff', dark: '#131a29' },

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
      // therefore return something �?typically the registration handle.
      //
      // Nesting is how a group of slots is registered together: the outer inject
      // waits for the first slot, and only inside that callback do we ask for
      // the next. A generator function cannot be used here, because inject does
      // not iterate its callback's result �?yielding registrations would
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

    // ══════════════════════════════════════════════════════════════════════�?    // conversation �?card isolation + think line window
    // ══════════════════════════════════════════════════════════════════════�?    //
    // 1. Card isolation: tool calls, commands, and system injections get their
    //    own card so they stop blending into prose.
    //
    // 2. Think window: reasoning blocks are capped at 12 visible lines.
    //    Upstream renders the body only when expanded (`open && children` in the
    //    primitives DisclosureRow), so CSS alone can never reach the process
    //    text. We therefore synthesise a click on the official row to let React
    //    expand it for real, then clamp the body with CSS.
    //
    // While a block is running the window sticks to the end; the moment the user
    // scrolls up to read history it lets go, and blocks the user collapsed by
    // hand are remembered in localStorage and never force-expanded again.

    var CONV_PLUGIN = 'dshome-plugin-conversation';
    var THINK_LINES = 12;
    var CARD_RADIUS = 16;
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

    var CONV_CSS = [
      // Think card. The card wraps the official root, not the body, so the
      // expanded state stays inside the same card.
      SELECTORS.think + '{' + CARD + ';padding:8px 14px}',

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

      // Tool / command / system-injection cards
      CARD_SELECTOR + '{' + CARD + ';padding:10px 14px}',
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

    // ══════════════════════════════════════════════════════════════════════�?    // minimap �?VSCode-style turn thumbnail navigation
    // ══════════════════════════════════════════════════════════════════════�?    //
    // A canvas strip pinned to the right edge of the conversation shows a
    // squashed picture of the whole session; a translucent box marks the visible
    // viewport. Click anywhere to jump, hold and drag to scrub.
    //
    // Four invariants this implementation is built around. They are not
    // stylistic preferences �?each fixes a bug reproduced on a real session, and
    // breaking any of them reintroduces it.
    //
    //   �?Two heights, never mixed.
    //     Scale, thumb height, and canvas length come from a *standard* strip
    //     height computed from the viewport. The viewport's own height and the
    //     thumb's travel come from live measurements. Mixing them makes short
    //     sessions keep moving after everything is already visible.
    //     Consequence: the thumb always occupies 8% of the standard height, and
    //     travel is forced to zero whenever the content fits the viewport.
    //
    //   �?Positions come only from the browser. `fromEnd = scrollHeight �?    //     rect.top �?rect.height`. Estimating height from character counts uses
    //     a different ruler than real layout, which makes "what I clicked" and
    //     "what is on screen" disagree.
    //
    //   �?Never cache a dirty value. A block measuring 0px has not laid out yet,
    //     so it gets a temporary height for this frame and no cache entry.
    //
    //   �?Growing content emits no DOM event. Markdown, highlighting, images,
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
    /** Strip width. Narrow enough not to crowd the conversation column. */
    var WIDTH_PX = 58;
    /** Strip height cap. Long sessions keep ~1px per block instead of collapsing. */
    var MAX_HEIGHT_PX = 760;
    /** Room reserved for the composer at the bottom. */
    var COMPOSER_RESERVE_PX = 152;
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

    var MAP_CSS = [
      '.dshome-plugin-minimap{position:fixed;z-index:6;cursor:pointer;border-radius:4px;' +
        'opacity:.92;transition:opacity .15s ease}',
      '.dshome-plugin-minimap:hover,.dshome-plugin-minimap[data-active]{opacity:1}',
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
    ].join('');

    /**
     * @param {object} [options]
     * @param {boolean} [options.hideOfficialRail=true] hide upstream's own rail
     * @returns {Function} teardown
     */
    function applyMinimap(options) {
      var hideOfficialRail = !options || options.hideOfficialRail !== false;
      installStyle(MAP_PLUGIN, MAP_CSS);

      // Upstream's rail spaces turns evenly (a fixed distance per turn), so it
      // cannot express "this passage is longer". Rather than draw beside it, we
      // hide it visually and pointer-wise �?no React tree is touched, so
      // removing this one rule brings it straight back.
      if (hideOfficialRail) {
        installStyle(MAP_PLUGIN + '-rail',
          SELECTORS.officialRail + '{opacity:0;pointer-events:none}');
      }

      var shell = document.createElement('div');
      shell.className = 'dshome-plugin-minimap';
      shell.style.width = WIDTH_PX + 'px';
      shell.style.display = 'none';

      var canvas = document.createElement('canvas');
      var thumb = document.createElement('div');
      thumb.className = 'dshome-plugin-minimap-thumb';
      shell.appendChild(canvas);
      shell.appendChild(thumb);
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
      var bandPx = 0;          // standard strip height (invariant �?
      var drawnTotal = 0;      // scrollHeight at the last successful measure
      var lastFullPassAt = 0;
      var lastSignature = '';
      var measureCache = [];
      var blocks = [];

      function totalOf() { return scroller ? scroller.scrollHeight : 0; }
      function viewH() { return Math.max(1, scroller ? scroller.clientHeight : 0); }

      /**
       * Standard strip height �?derived from the viewport, *not* from content,
       * so it is identical for a two-message session and a two-thousand-message
       * one.
       */
      function computeBand() {
        var available = window.innerHeight - COMPOSER_RESERVE_PX;
        return Math.max(120, Math.min(MAX_HEIGHT_PX, available));
      }

      /** Thumb height in strip space: a constant fraction of the standard height. */
      function thumbHeight() { return Math.max(MIN_THUMB_PX, bandPx * THUMB_RATIO); }

      /** Document �?canvas scale. */
      function recomputeScale() {
        var total = totalOf();
        if (total <= 0 || bandPx <= 0) return false;
        stripScale = bandPx / total;
        canvasH = Math.round(total * stripScale);
        return true;
      }

      /** Where the strip should sit: right-aligned to upstream's rail when present. */
      function placeShell() {
        var right = 8;
        safe(function () {
          var rail = document.querySelector(SELECTORS.officialRail);
          if (!rail) return;
          var rect = rail.getBoundingClientRect();
          // A rail that is missing or degenerate must not hide the strip; fall
          // back to the right edge instead.
          if (rect.width < 4 || rect.height < 40) return;
          right = Math.max(8, window.innerWidth - rect.right + (rect.width - WIDTH_PX) / 2);
        });
        var top = Math.max(8, (window.innerHeight - COMPOSER_RESERVE_PX - bandPx) / 2 + 8);
        shell.style.top = Math.round(top) + 'px';
        shell.style.right = Math.round(right) + 'px';
        shell.style.height = bandPx + 'px';
      }

      // ── painting ─────────────────────────────────────────────────────────
      //
      // Colour hierarchy: the user's own messages get brand blue, assistant
      // replies mid grey, reasoning and tool blocks light grey.
      function paint(total) {
        if (!ctx2d || canvasH <= 0) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = WIDTH_PX;
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
          if (!b || b.height <= 0) continue;
          var y = h - (b.fromEnd + b.height) * stripScale;
          var bh = Math.max(1, b.height * stripScale);
          ctx2d.globalAlpha = b.mine ? 0.85 : 0.55;
          ctx2d.fillStyle = b.fill;
          var bw = Math.min(w - 4, Math.max(6, b.width));
          var x = b.mine ? w - 2 - bw : 2;
          ctx2d.fillRect(Math.max(0, x), Math.max(0, y), bw, bh);
        }
        ctx2d.globalAlpha = 1;
      }

      /**
       * Canvas translation, the single source of coordinates shared by painting,
       * hover, and click. Keeping exactly one of these is what keeps the three
       * in agreement.
       */
      function shiftFor() {
        var total = totalOf();
        var view = viewH();
        if (total <= view || total <= 0) return 0;
        var thumbH = thumbHeight();
        var stripThumb = Math.max(thumbH, canvasH * (view / total));
        return (scroller.scrollTop / (total - view)) * Math.max(0, canvasH - stripThumb);
      }

      function paintShift() {
        canvas.style.transform = 'translateY(' + (-Math.round(shiftFor())) + 'px)';
      }

      /** Position and size the viewport box. */
      function paintThumb() {
        var total = totalOf();
        var view = viewH();
        var h = thumbHeight();
        var travel = bandPx - h;
        // Content shorter than the viewport: everything is visible, so the box
        // stays at the top and does not move (invariant �?.
        var ratio = total > view ? scroller.scrollTop / (total - view) : 0;
        thumb.style.height = Math.round(h) + 'px';
        thumb.style.top = Math.round(Math.max(0, Math.min(travel, ratio * travel))) + 'px';
      }

      // ── measuring ────────────────────────────────────────────────────────
      function draw(forceFull) {
        if (!scroller || bandPx <= 0) return;
        if (!recomputeScale()) return;

        var scrollTop = scroller.scrollTop;
        var scrollHeight = scroller.scrollHeight;
        var boxTop = scroller.getBoundingClientRect().top - scrollTop; // content origin
        var now = Date.now();

        var all = scroller.querySelectorAll(SELECTORS.turn);
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
              // frame only and never cached (invariant �?.
              height = 40;
              measureCache[i] = undefined;
            }
          }

          signature += Math.round(height) * (i + 1) + Math.round(top);
          var kind = block.getAttribute('data-chat-flow-kind') || '';
          var mine = kind === 'user' || kind === 'steering';
          var span = mine ? WIDTH_PX * 0.62 : WIDTH_PX * 0.9;
          next[i] = {
            // Same ruler as the scrollbar.
            fromEnd: Math.max(0, scrollHeight - top - height),
            height: height,
            mine: mine,
            fill: mine ? colorMine : (kind === 'assistant' ? colorReply : colorOther),
            // Bar length proxies content volume using real block height,
            // avoiding a text serialisation per block.
            width: Math.max(6, Math.min(WIDTH_PX - 4, span * Math.min(1, 0.35 + height / 1200))),
          };
        }

        measureCache.length = count;
        blocks = next;
        drawnTotal = scrollHeight;
        lastSignature = count + '|' + Math.round(scrollHeight) + '|' + signature;

        paint(scrollHeight);
        paintShift();
        paintThumb();
      }

      // ── re-check while content settles (invariant �? ─────────────────────
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
      // intersects the viewport.
      function findScroller() {
        var candidates = document.querySelectorAll(SELECTORS.scrollBody);
        for (var i = 0; i < candidates.length; i += 1) {
          var el = candidates[i];
          if (el.clientHeight <= 0) continue;
          if (!el.querySelector(SELECTORS.turn)) continue;
          var rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
          return el;
        }
        return null;
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
          lastFullPassAt = 0;
          if (observer) {
            try { observer.disconnect(); } catch (error) { /* already gone */ }
            observer = null;
          }
          if (!scroller) {
            shell.style.display = 'none';
            return;
          }
          safe(function () {
            observer = new ResizeObserver(function () { scheduleRedraw(); });
            observer.observe(scroller);
          });
          startRecheck();
        }
        if (!scroller) return;
        bandPx = computeBand();
        placeShell();
        shell.style.display = 'block';
        safe(function () { draw(); });
        // Nothing to follow when the content fits: fade the box rather than show
        // one that cannot move.
        thumb.style.opacity = scroller.scrollHeight <= scroller.clientHeight ? '0' : '';
      }

      // ── pointer interaction ──────────────────────────────────────────────
      function scrollToFraction(fraction) {
        if (!scroller) return;
        var total = totalOf();
        var max = Math.max(0, total - viewH());
        scroller.scrollTop = Math.max(0, Math.min(max, fraction * max));
        paintShift();
        paintThumb();
      }

      /** Fraction along the strip, inverted through the current canvas shift. */
      function fractionAt(clientY) {
        var rect = shell.getBoundingClientRect();
        var local = clientY - rect.top;
        var shifted = local + shiftFor();
        var total = totalOf();
        var view = viewH();
        if (total <= view || canvasH <= 0) return 0;
        var thumbH = thumbHeight();
        var travel = Math.max(0, canvasH - thumbH);
        if (travel <= 0) return 0;
        // Map the click onto the thumb's travel so the clicked content lands
        // under the pointer (invariant �?.
        var thumbTop = shifted - thumbH / 2;
        return Math.max(0, Math.min(1, thumbTop / travel));
      }

      var dragging = false;
      var dragUntil = 0;

      shell.addEventListener('pointerdown', function (event) {
        dragging = true;
        dragUntil = Date.now() + DRAG_TIMEOUT_MS;
        shell.setAttribute('data-active', '1');
        safe(function () { shell.setPointerCapture(event.pointerId); });
        scrollToFraction(fractionAt(event.clientY));
      });

      shell.addEventListener('pointermove', function (event) {
        if (!dragging) return;
        if (Date.now() > dragUntil) { dragging = false; return; }
        scrollToFraction(fractionAt(event.clientY));
      });

      function endDrag() {
        if (!dragging) return;
        dragging = false;
        shell.removeAttribute('data-active');
      }
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', endDrag, true);

      // Keep the picture current when the scroll position moves by any means.
      document.addEventListener('scroll', function () {
        if (!scroller) return;
        paintShift();
        paintThumb();
      }, true);

      // Observers alone do not catch every way the conversation can move; this
      // is the fallback, not the primary path.
      try {
        syncTimer = window.setInterval(function () { safe(sync); }, SYNC_MS);
      } catch (error) {
        syncTimer = 0;
      }

      window.addEventListener('resize', function () { safe(sync); });
      safe(sync);

      return function () {
        try { window.clearInterval(syncTimer); } catch (error) { /* not started */ }
        stopRecheck();
        if (observer) safe(function () { observer.disconnect(); });
        safe(function () { shell.remove(); });
      };
    }

    // ══════════════════════════════════════════════════════════════════════�?    // plugin
    // ══════════════════════════════════════════════════════════════════════�?
    /** `slots` is required for brand registration; the other two do not need it. */
    var inject = ['slots'];

    /**
     * Options are read off a single global so behaviour can be adjusted at
     * runtime without a rebuild.
     */
    function options() {
      var o = { theme: true, conversation: true, minimap: true, hideOfficialRail: true };
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
      if (o.minimap) {
        safe(function () {
          applyMinimap({ hideOfficialRail: o.hideOfficialRail });
        }, 'dshome-plugin: minimap failed');
      }
    }

    module.exports = { name: 'dshome-plugin', inject: inject, apply: apply };
    // The loader materialises the factory's *return value* as the plugin body,
    // so it must be returned explicitly.
    return module.exports;
  },
});
