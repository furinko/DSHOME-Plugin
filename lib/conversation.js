// dshome-plugin — conversation module.
//
// Two behaviours, both pure DOM/CSS over official semantic attributes:
//
//   1. Card isolation — tool calls, commands, and system injections get their
//      own card so they stop blending into prose.
//
//   2. Think window — reasoning blocks are capped at N visible lines. Upstream
//      renders the body only when expanded (`open && children` in the
//      primitives DisclosureRow), so CSS alone can never reach the process text.
//      We therefore synthesise a click on the official row to let React expand
//      it for real, then clamp the body with CSS.
//
// While a block is running the window sticks to the end; the moment the user
// scrolls up to read history it lets go, and blocks the user collapsed by hand
// are remembered in localStorage and never force-expanded again.

import { CARD_SELECTOR, SELECTORS, installStyle, safe } from './shared.js';

const PLUGIN = 'dshome-plugin-conversation';
const THINK_LINES = 12;
const CARD_RADIUS = 16;
const COLLAPSED_KEY = 'dshome-plugin.thinkCollapsed.v1';
const MAX_COLLAPSED = 400;
/** Distance from our last scroll position that counts as "the user took over". */
const FOLLOW_SLACK = 24;

/** Border uses border-l2 (one step deeper than l1) so cards stay visible on the
 *  near-white light background; the soft elevation lifts them off the page. */
const CARD = [
  'background:var(--dsw-alias-bg-layer-1,#131a29)',
  'border:1px solid var(--dsw-alias-border-l2,#2a3a5c)',
  `border-radius:${CARD_RADIUS}px`,
  'box-sizing:border-box',
  'box-shadow:var(--dsw-elevation-soft,none)',
].join(';');

/** The think body's line height tracks the user's font-size setting. */
const LINE = 'calc(20px + var(--dsh-content-font-delta-secondary,0px))';

const CSS = [
  // Think card. The card wraps the official root, not the body, so the expanded
  // state stays inside the same card.
  `${SELECTORS.think}{${CARD};padding:8px 14px}`,

  // Collapsed state: upstream pins height to 24px with `contain:size layout`,
  // which overflows once we add padding. The [data-state] attribute raises
  // specificity to (0,3,0) so this wins even though upstream's chat CSS is
  // injected lazily *after* ours.
  `${SELECTORS.think}[data-state]:not([data-expanded]){height:auto;contain:layout}`,

  // The line window applies only when expanded; a hand-collapsed block falls
  // back to upstream's single-line summary and the card covers it naturally.
  `${SELECTORS.think}[data-expanded] ${SELECTORS.thinkBody}{` +
    `max-height:calc(${THINK_LINES} * (${LINE}));` +
    'overflow-y:auto;overscroll-behavior:contain;padding-right:6px;' +
    'scrollbar-width:thin;' +
    'scrollbar-color:var(--dsw-alias-border-l2,#2a3a5c) transparent}',

  // Tool / command / system-injection cards
  `${CARD_SELECTOR}{${CARD};padding:10px 14px}`,
].join('');

export function applyConversation() {
  installStyle(PLUGIN, CSS);

  // ── remembered manual collapses ────────────────────────────────────────────
  const loadCollapsed = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const saveCollapsed = (list) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(list.slice(-MAX_COLLAPSED)));
    } catch {
      // No localStorage: keep the bookkeeping in memory only.
    }
  };

  const collapsed = loadCollapsed();
  const isCollapsed = (key) => key !== '' && collapsed.indexOf(key) >= 0;

  /** Stable identity: outer flow key + index of this think block within it. */
  const keyOf = (root) => safe(() => {
    const flow = root.closest(SELECTORS.flow);
    if (!flow) return '';
    const flowKey = flow.getAttribute('data-chat-flow-key') || '';
    if (!flowKey) return '';
    const all = flow.querySelectorAll(SELECTORS.think);
    return `${flowKey}#${Array.prototype.indexOf.call(all, root)}`;
  }) ?? '';

  // ── expansion ─────────────────────────────────────────────────────────────
  let autoClicking = false;

  const bodyOf = (root) => safe(() => root.querySelector(SELECTORS.thinkBody));

  /**
   * Drive a think block into upstream's expanded state.
   *
   * A synthetic click on the official row is used rather than touching React
   * state: the event bubbles to React's delegated root and runs the component's
   * real onClick, so the renderer stays upstream's business.
   */
  const expand = (root) => {
    if (root.hasAttribute('data-expanded')) return;
    if (isCollapsed(keyOf(root))) return; // the user collapsed this one
    const row = root.querySelector(SELECTORS.thinkRow);
    if (!row) return;
    autoClicking = true;
    try {
      row.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
      }));
    } catch {
      // Synthetic click unavailable: degrade to card styling only.
    } finally {
      autoClicking = false;
    }
  };

  // ── follow the live tail, but yield to the reader ─────────────────────────
  //
  // Detecting "the user scrolled" via scroll events does not work: they are
  // dispatched asynchronously while streaming content keeps growing, so our own
  // pinning gets misread as user input. Instead we remember where we last put
  // the scroll position and compare.
  const lastSet = new WeakMap();

  const setScrollTop = (body, top) => {
    body.scrollTop = top;
    lastSet.set(body, body.scrollTop); // browser clamps; store the real value
  };

  const humanTookOver = (body) => {
    const mine = lastSet.get(body);
    if (mine === undefined) return false;
    if (Math.abs(body.scrollTop - mine) <= 4) return false;
    return body.scrollHeight - body.scrollTop - body.clientHeight > FOLLOW_SLACK;
  };

  const followEnd = (root) => {
    const body = bodyOf(root);
    if (!body || body.scrollHeight <= body.clientHeight) return;
    if (humanTookOver(body)) return;
    setScrollTop(body, body.scrollHeight);
  };

  /** Once a turn finishes, rewind to the start of the reasoning. */
  const rewind = (root) => {
    const body = bodyOf(root);
    if (!body || body.scrollTop === 0) return;
    if (humanTookOver(body)) return;
    setScrollTop(body, 0);
  };

  // ── sweep (rAF-throttled) ─────────────────────────────────────────────────
  const lastState = new WeakMap();

  const sweep = () => {
    const roots = document.querySelectorAll(SELECTORS.think);
    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      const state = root.getAttribute('data-state');
      if (!root.hasAttribute('data-expanded')) {
        expand(root);
      } else if (state === 'running') {
        followEnd(root);
      }
      if (lastState.get(root) === 'running' && state !== 'running') rewind(root);
      lastState.set(root, state);
    }
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    try {
      requestAnimationFrame(() => {
        scheduled = false;
        safe(sweep);
      });
    } catch {
      scheduled = false;
    }
  };

  // ── distinguish our expansion from the user's ─────────────────────────────
  const onClick = (event) => {
    if (autoClicking) return;
    safe(() => {
      const row = event.target?.closest?.(SELECTORS.thinkRow);
      if (!row) return;
      const root = row.closest(SELECTORS.think);
      if (!root) return;
      const key = keyOf(root);
      if (key === '') return;
      if (root.hasAttribute('data-expanded')) {
        if (!isCollapsed(key)) {
          collapsed.push(key);
          saveCollapsed(collapsed);
        }
      } else {
        const at = collapsed.indexOf(key);
        if (at >= 0) {
          collapsed.splice(at, 1);
          saveCollapsed(collapsed);
        }
      }
    });
  };

  const start = () => {
    safe(() => document.addEventListener('click', onClick, true));
    schedule();
    safe(() => {
      new MutationObserver(schedule).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true, // streaming reasoning grows character by character
        attributes: true,
        attributeFilter: ['data-state', 'data-expanded'],
      });
    }, 'dshome-plugin: conversation observer failed');
  };

  safe(start, 'dshome-plugin: conversation init failed');
}
