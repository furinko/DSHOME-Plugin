// dshome-plugin — turn minimap (VSCode-style thumbnail navigation).
//
// A canvas strip pinned to the right edge of the conversation shows a squashed
// picture of the whole session; a translucent box marks the visible viewport.
// Click anywhere to jump, hold and drag to scrub.
//
// Four invariants this implementation is built around. They are not stylistic
// preferences — each fixes a bug reproduced on a real session, and breaking any
// of them reintroduces it.
//
//   ① Two heights, never mixed.
//     Scale, thumb height, and canvas length come from a *standard* strip height
//     computed from the viewport. The viewport's own height and the thumb's
//     travel come from live measurements. Mixing them makes short sessions keep
//     moving after everything is already visible.
//     Consequence: the thumb always occupies 8% of the standard height, and
//     travel is forced to zero whenever the content fits the viewport.
//
//   ② Positions come only from the browser. `fromEnd = scrollHeight − rect.top −
//     rect.height`. Estimating height from character counts uses a different
//     ruler than real layout, which makes "what I clicked" and "what is on
//     screen" disagree.
//
//   ③ Never cache a dirty value. A block measuring 0px has not laid out yet, so
//     it gets a temporary height for this frame and no cache entry.
//
//   ④ Growing content emits no DOM event. Markdown, highlighting, images, and
//     font loading all change height without mutating the DOM, so there is no
//     mutation to listen for. A re-check follows content changes and stops once
//     several consecutive passes agree.
//
// Zoom is deliberately fixed at 1. Above 1 the thumb (which moves on the
// *document* ratio) and the content (drawn in its own coordinates) only agree
// near the middle, so clicking jumps to the wrong place and every measurement
// error is magnified. At zoom 1 the two relations are identical, which is what
// makes "click here, land here" exact.

import { SELECTORS, installStyle, readColor, safe } from './shared.js';

const PLUGIN = 'dshome-plugin-minimap';
/** Strip width. Narrow enough not to crowd the conversation column. */
const WIDTH_PX = 58;
/** Strip height cap. Long sessions keep ~1px per block instead of collapsing. */
const MAX_HEIGHT_PX = 760;
/** Room reserved for the composer at the bottom. */
const COMPOSER_RESERVE_PX = 152;
/** Thumb height as a fraction of the standard strip height. */
const THUMB_RATIO = 0.08;
/** Absolute floor for the thumb, so it stays grabbable. */
const MIN_THUMB_PX = 8;
/** Blocks reread near the tail on an incremental pass (streaming grows there). */
const TAIL_REREAD = 8;
/** Forced full re-measure interval; higher blocks can change too. */
const FULL_PASS_MS = 2000;
/** Coalescing window for redraws. */
const REDRAW_MS = 120;
/** Fallback sync interval, for movement ResizeObserver does not cover. */
const SYNC_MS = 250;
/** Follow-up window used while content settles. */
const RECHECK_MS = 500;
/** Consecutive stable passes before the re-check loop stops. */
const STABLE_PASSES = 3;
/** Drag-state lifetime, in case pointerup is never delivered. */
const DRAG_TIMEOUT_MS = 30000;

const CSS = [
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
 * @param {object} options
 * @param {boolean} [options.hideOfficialRail=true] hide upstream's own turn rail
 * @returns {() => void} teardown
 */
export function applyMinimap({ hideOfficialRail = true } = {}) {
  installStyle(PLUGIN, CSS);

  // Upstream's rail spaces turns evenly (a fixed distance per turn), so it
  // cannot express "this passage is longer". Rather than draw beside it, we hide
  // it visually and pointer-wise — no React tree is touched, so removing this
  // one rule brings it straight back.
  if (hideOfficialRail) {
    installStyle(`${PLUGIN}-rail`, `${SELECTORS.officialRail}{opacity:0;pointer-events:none}`);
  }

  const shell = document.createElement('div');
  shell.className = 'dshome-plugin-minimap';
  shell.style.width = `${WIDTH_PX}px`;
  shell.style.display = 'none';

  const canvas = document.createElement('canvas');
  const thumb = document.createElement('div');
  thumb.className = 'dshome-plugin-minimap-thumb';
  shell.append(canvas, thumb);
  document.body.appendChild(shell);

  const ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

  // ── geometry ──────────────────────────────────────────────────────────────
  //
  // The strip is a fixed window. The canvas is exactly as long as the scaled
  // document and is translated behind that window, which is what lets scrolling
  // touch only a transform (no layout, no repaint of the picture itself).
  let scroller = null;
  let stripScale = 1;      // canvas px per document px
  let canvasH = 0;         // total canvas length
  let bandPx = 0;          // standard strip height (invariant ①)
  let drawnTotal = 0;      // scrollHeight at the last successful measure
  let lastFullPassAt = 0;
  let lastSignature = '';
  let measureCache = [];
  let blocks = [];

  const totalOf = () => (scroller ? scroller.scrollHeight : 0);
  const viewH = () => Math.max(1, (scroller ? scroller.clientHeight : 0));

  /**
   * Standard strip height — derived from the viewport, *not* from content, so
   * it is identical for a two-message session and a two-thousand-message one.
   */
  const computeBand = () => {
    const available = window.innerHeight - COMPOSER_RESERVE_PX;
    return Math.max(120, Math.min(MAX_HEIGHT_PX, available));
  };

  /** Thumb height in strip space: a constant fraction of the standard height. */
  const thumbHeight = () => Math.max(MIN_THUMB_PX, bandPx * THUMB_RATIO);

  /** Document → canvas scale. */
  const recomputeScale = () => {
    const total = totalOf();
    if (total <= 0 || bandPx <= 0) return false;
    stripScale = bandPx / total;
    canvasH = Math.round(total * stripScale);
    return true;
  };

  /** Where the strip should sit: right-aligned to upstream's rail when present. */
  const placeShell = () => {
    let right = 8;
    safe(() => {
      const rail = document.querySelector(SELECTORS.officialRail);
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      // A rail that is missing or degenerate must not hide the strip; fall back
      // to the right edge instead.
      if (rect.width < 4 || rect.height < 40) return;
      right = Math.max(8, window.innerWidth - rect.right + (rect.width - WIDTH_PX) / 2);
    });
    const top = Math.max(8, (window.innerHeight - COMPOSER_RESERVE_PX - bandPx) / 2 + 8);
    shell.style.top = `${Math.round(top)}px`;
    shell.style.right = `${Math.round(right)}px`;
    shell.style.height = `${bandPx}px`;
  };

  // ── painting ──────────────────────────────────────────────────────────────
  //
  // Colour hierarchy: the user's own messages get brand blue, assistant replies
  // mid grey, reasoning and tool blocks light grey.
  const paint = (total) => {
    if (!ctx2d || canvasH <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = WIDTH_PX;
    const h = canvasH;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.height = `${h}px`;
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    if (!stripScale || !total) return;

    for (let i = 0; i < blocks.length; i += 1) {
      const b = blocks[i];
      if (!b || b.height <= 0) continue;
      const y = h - (b.fromEnd + b.height) * stripScale;
      const bh = Math.max(1, b.height * stripScale);
      ctx2d.globalAlpha = b.mine ? 0.85 : 0.55;
      ctx2d.fillStyle = b.fill;
      const bw = Math.min(w - 4, Math.max(6, b.width));
      const x = b.mine ? w - 2 - bw : 2;
      ctx2d.fillRect(Math.max(0, x), Math.max(0, y), bw, bh);
    }
    ctx2d.globalAlpha = 1;
  };

  /**
   * Canvas translation, the single source of coordinates shared by painting,
   * hover, and click. Keeping exactly one of these is what keeps the three in
   * agreement.
   */
  const shiftFor = () => {
    const total = totalOf();
    const view = viewH();
    if (total <= view || total <= 0) return 0;
    const thumbH = thumbHeight();
    const stripThumb = Math.max(thumbH, canvasH * (view / total));
    return (scroller.scrollTop / (total - view)) * Math.max(0, canvasH - stripThumb);
  };

  const paintShift = () => {
    canvas.style.transform = `translateY(${-Math.round(shiftFor())}px)`;
  };

  /** Position and size the viewport box. */
  const paintThumb = () => {
    const total = totalOf();
    const view = viewH();
    const h = thumbHeight();
    const travel = bandPx - h;
    // Content shorter than the viewport: everything is visible, so the box stays
    // at the top and does not move (invariant ①).
    const ratio = total > view ? scroller.scrollTop / (total - view) : 0;
    thumb.style.height = `${Math.round(h)}px`;
    thumb.style.top = `${Math.round(Math.max(0, Math.min(travel, ratio * travel)))}px`;
  };

  // ── measuring ─────────────────────────────────────────────────────────────
  const draw = (forceFull = false) => {
    if (!scroller || bandPx <= 0) return;
    if (!recomputeScale()) return;

    const scrollTop = scroller.scrollTop;
    const scrollHeight = scroller.scrollHeight;
    const boxTop = scroller.getBoundingClientRect().top - scrollTop; // content origin
    const now = Date.now();

    const all = scroller.querySelectorAll(SELECTORS.turn);
    const count = all.length;
    const sameSet = measureCache.length === count
      && measureCache.every((c, i) => c !== undefined && c.el === all[i]);
    const totalChanged = scrollHeight !== drawnTotal;
    const needFull = !sameSet || now - lastFullPassAt > FULL_PASS_MS || forceFull;

    // Incremental passes reread only the tail and the blocks near the viewport;
    // those are the only ones that can have changed. A stable total means a
    // block's height cannot have changed, so nothing is reread at all.
    let reread = null;
    if (!needFull && totalChanged) {
      reread = new Set();
      for (let i = Math.max(0, count - TAIL_REREAD); i < count; i += 1) reread.add(i);
      const lo = scrollHeight - scrollTop - viewH() * 1.5;
      const hi = scrollHeight - scrollTop + viewH() * 0.5;
      for (let i = 0; i < count; i += 1) {
        const c = measureCache[i];
        if (c === undefined) { reread.add(i); continue; }
        const near = scrollHeight - c.top - c.height;
        if (near >= lo && near <= hi) reread.add(i);
      }
    }
    if (needFull) lastFullPassAt = now;

    const colorMine = readColor('--dsw-alias-brand-primary', '#4D6BFE');
    const colorReply = readColor('--dsw-alias-label-tertiary', '#6b7a99');
    const colorOther = readColor('--dsw-alias-border-l4', '#c9d2e3');

    const next = new Array(count);
    let valid = 0;
    let signature = 0;

    for (let i = 0; i < count; i += 1) {
      const block = all[i];
      const cached = measureCache[i];
      const fresh = cached !== undefined && cached.el === block;
      const mustRead = !fresh || needFull || (reread !== null && reread.has(i));

      let top;
      let height;
      if (!mustRead) {
        top = cached.top;
        height = cached.height;
        if (height > 1) valid += 1; // a cached real value still counts as laid out
      } else {
        const rect = block.getBoundingClientRect();
        top = rect.top - boxTop;
        if (rect.height > 0) {
          height = rect.height;
          valid += 1;
          measureCache[i] = { el: block, top, height };
        } else {
          // Not laid out yet: this is a dirty value, so it is used for this
          // frame only and never cached (invariant ③).
          height = 40;
          measureCache[i] = undefined;
        }
      }

      signature += Math.round(height) * (i + 1) + Math.round(top);
      const kind = block.getAttribute('data-chat-flow-kind') ?? '';
      const mine = kind === 'user' || kind === 'steering';
      next[i] = {
        fromEnd: Math.max(0, scrollHeight - top - height), // same ruler as the scrollbar
        height,
        mine,
        fill: mine ? colorMine : kind === 'assistant' ? colorReply : colorOther,
        // Bar length proxies content volume using real block height, avoiding a
        // text serialisation per block.
        width: Math.max(6, Math.min(WIDTH_PX - 4, (mine ? WIDTH_PX * 0.62 : WIDTH_PX * 0.9)
          * Math.min(1, 0.35 + height / 1200))),
      };
    }

    measureCache.length = count;
    blocks = next;
    drawnTotal = scrollHeight;
    lastSignature = `${count}|${Math.round(scrollHeight)}|${signature}`;

    paint(scrollHeight);
    paintShift();
    paintThumb();
  };

  // ── re-check while content settles (invariant ④) ──────────────────────────
  let recheckTimer = 0;
  let stablePasses = 0;
  let lastSeenSignature = '';

  const stopRecheck = () => {
    if (recheckTimer !== 0) {
      try { window.clearTimeout(recheckTimer); } catch { /* removed */ }
      recheckTimer = 0;
    }
  };

  const recheck = () => {
    recheckTimer = 0;
    safe(() => draw());
    if (lastSignature === lastSeenSignature) {
      stablePasses += 1;
      if (stablePasses >= STABLE_PASSES) return; // settled: stop reading entirely
    } else {
      stablePasses = 0;
      lastSeenSignature = lastSignature;
    }
    try { recheckTimer = window.setTimeout(recheck, RECHECK_MS); } catch { /* unavailable */ }
  };

  const startRecheck = () => {
    stablePasses = 0;
    lastSeenSignature = '';
    if (recheckTimer === 0) {
      try { recheckTimer = window.setTimeout(recheck, RECHECK_MS); } catch { /* unavailable */ }
    }
  };

  // ── coalesced redraw ──────────────────────────────────────────────────────
  let redrawTimer = 0;
  const scheduleRedraw = () => {
    if (redrawTimer !== 0) return;
    try {
      redrawTimer = window.setTimeout(() => {
        redrawTimer = 0;
        safe(draw);
      }, REDRAW_MS);
    } catch {
      redrawTimer = 0;
    }
  };

  // ── attaching to a conversation ───────────────────────────────────────────
  //
  // When panels switch, a previous conversation's scroller can still be in the
  // DOM with a non-zero height, so pick the candidate that actually intersects
  // the viewport.
  const findScroller = () => {
    const candidates = document.querySelectorAll(SELECTORS.scrollBody);
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el.clientHeight <= 0) continue;
      if (!el.querySelector(SELECTORS.turn)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      return el;
    }
    return null;
  };

  let observer = null;
  let syncTimer = 0;

  const sync = () => {
    const found = findScroller();
    if (found !== scroller) {
      scroller = found;
      measureCache = [];
      blocks = [];
      drawnTotal = 0;
      lastFullPassAt = 0;
      if (observer) {
        try { observer.disconnect(); } catch { /* already gone */ }
        observer = null;
      }
      if (!scroller) {
        shell.style.display = 'none';
        return;
      }
      safe(() => {
        observer = new ResizeObserver(() => scheduleRedraw());
        observer.observe(scroller);
      });
      startRecheck();
    }
    if (!scroller) return;
    bandPx = computeBand();
    placeShell();
    shell.style.display = 'block';
    safe(() => draw());
    // Nothing to follow when the content fits: fade the box rather than show one
    // that cannot move.
    thumb.style.opacity = scroller.scrollHeight <= scroller.clientHeight ? '0' : '';
  };

  // ── pointer interaction ───────────────────────────────────────────────────
  const scrollToFraction = (fraction) => {
    if (!scroller) return;
    const total = totalOf();
    const max = Math.max(0, total - viewH());
    scroller.scrollTop = Math.max(0, Math.min(max, fraction * max));
    paintShift();
    paintThumb();
  };

  /** Fraction along the strip, inverted through the current canvas shift. */
  const fractionAt = (clientY) => {
    const rect = shell.getBoundingClientRect();
    const local = clientY - rect.top;
    const shifted = local + shiftFor();
    const total = totalOf();
    const view = viewH();
    if (total <= view || canvasH <= 0) return 0;
    const thumbH = thumbHeight();
    const travel = Math.max(0, canvasH - thumbH);
    if (travel <= 0) return 0;
    // Map the click onto the thumb's travel so the clicked content lands under
    // the pointer (invariant ②).
    const thumbTop = shifted - thumbH / 2;
    return Math.max(0, Math.min(1, thumbTop / travel));
  };

  let dragging = false;
  let dragUntil = 0;

  shell.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragUntil = Date.now() + DRAG_TIMEOUT_MS;
    shell.setAttribute('data-active', '1');
    safe(() => shell.setPointerCapture(event.pointerId));
    scrollToFraction(fractionAt(event.clientY));
  });

  shell.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    if (Date.now() > dragUntil) { dragging = false; return; }
    scrollToFraction(fractionAt(event.clientY));
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    shell.removeAttribute('data-active');
  };
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);

  // Keep the picture current when the scroll position moves by any means.
  document.addEventListener('scroll', () => {
    if (!scroller) return;
    paintShift();
    paintThumb();
  }, true);

  // Observers alone do not catch every way the conversation can move; this is
  // the fallback, not the primary path.
  try {
    syncTimer = window.setInterval(() => safe(sync), SYNC_MS);
  } catch {
    syncTimer = 0;
  }

  window.addEventListener('resize', () => safe(sync));
  safe(sync);

  return () => {
    try { window.clearInterval(syncTimer); } catch { /* not started */ }
    stopRecheck();
    if (observer) safe(() => observer.disconnect());
    safe(() => shell.remove());
  };
}
