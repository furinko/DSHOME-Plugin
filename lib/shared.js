// dshome-plugin — shared client helpers.
//
// Three concerns live here so the feature modules stay readable:
//   1. selectors   — official semantic attributes only (never CSS-Module hashes)
//   2. styling     — idempotent <style> injection with a self-healing guard
//   3. utilities   — colour reads and error containment

/** Official semantic attributes. Hash class names (lcKema_*) change on every
 *  upstream rebuild, so they are never used anywhere in this package. */
export const SELECTORS = {
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
 * `:not([hidden])` is required: upstream marks an empty per-turn process block
 * with `hidden` while leaving it `display:block`, so without the guard it grows
 * padding and border into a ~22px blank card.
 */
const CARD_KINDS = [
  'tool-call',
  'context',
  'system-prompt',
  'command',
  'manual-compaction',
  'compaction',
  'turn-process',
];

export const CARD_SELECTOR = CARD_KINDS
  .map((kind) => `[data-chat-flow-kind="${kind}"]:not([hidden])`)
  .join(',');

/**
 * Inject one <style> element per plugin id, idempotently.
 *
 * The DOM is the source of truth, not an in-memory flag: after a client hot
 * reload the module state resets while any surviving <style> node is still
 * there, and a stale flag would leave elements unstyled.
 *
 * `guard` additionally repairs the tag if something else removes or replaces
 * it later (upstream remount, safe mode, another plugin clearing <head>).
 * Without that repair elements silently fall back to bare styles until reload.
 */
export function installStyle(id, css, { guard = true } = {}) {
  const selector = `style[data-plugin='${id}']`;

  const ensure = () => {
    if (document.querySelector(selector)) return;
    try {
      const tag = document.createElement('style');
      tag.setAttribute('data-plugin', id);
      tag.textContent = css;
      document.head.appendChild(tag);
    } catch (error) {
      console.warn(`${id}: style injection failed`, error);
    }
  };

  ensure();
  if (!guard) return;

  try {
    if (typeof MutationObserver !== 'function' || !document.head) return;
    const registry = (window.__dshomePluginStyleGuard ||= {});
    if (registry[id]) return;
    registry[id] = true;
    new MutationObserver(ensure).observe(document.head, { childList: true });
    window.addEventListener('focus', ensure);
    document.addEventListener('visibilitychange', ensure);
  } catch {
    // A failed guard must not take the plugin down.
  }
}

/** Read a CSS custom property, falling back when it is unset or unparsable. */
export function readColor(variable, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(variable);
    return raw && raw.trim() ? raw.trim() : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Run `fn` and swallow failures.
 *
 * Every module here is a progressive enhancement: the worst outcome of any
 * single failure is that its feature is missing, never that the UI breaks.
 * That contract only holds if failures are contained here.
 */
export function safe(fn, label) {
  try {
    return fn();
  } catch (error) {
    if (label) console.warn(label, error);
    return undefined;
  }
}
