/* HTML textarea exposes LF-only UTF-16 coordinates. Keep that projection
 * separate from the exact original text; never normalize a file on typing. */
const before = (values, offset) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid] < offset) lo = mid + 1; else hi = mid; }
  return lo;
};
const bounded = (offset, length) => { if (!Number.isFinite(offset)) throw TypeError('Invalid textarea offset'); return Math.max(0, Math.min(length, Math.trunc(offset))); };
export function textareaProjection(raw) {
  if (typeof raw !== 'string') throw TypeError('Document text must be a string');
  const rawCRLF = [], displayCRLF = [], endings = new Map(); let removed = 0;
  for (const match of raw.matchAll(/\r\n|\r|\n/g)) {
    endings.set(match[0], (endings.get(match[0]) ?? 0) + 1);
    if (match[0] === '\r\n') { rawCRLF.push(match.index); displayCRLF.push(match.index - removed++); }
  }
  let preferredEOL = '\n', most = 0;
  for (const [ending, count] of endings) if (count > most) { preferredEOL = ending; most = count; }
  const text = raw.replace(/\r\n?/g, '\n');
  return Object.freeze({ text, preferredEOL,
    toRaw(offset) { const at = bounded(offset, text.length); return at + before(displayCRLF, at); },
    toDisplay(offset) { const at = bounded(offset, raw.length); return at - before(rawCRLF, at); },
  });
}
export function applyTextareaEdit(raw, nextValue) {
  if (typeof nextValue !== 'string') throw TypeError('Textarea value must be a string');
  const projection = textareaProjection(raw), old = projection.text, next = nextValue.replace(/\r\n?/g, '\n');
  if (old === next) return raw;
  let start = 0, oldEnd = old.length, newEnd = next.length;
  while (start < oldEnd && start < newEnd && old[start] === next[start]) start++;
  while (oldEnd > start && newEnd > start && old[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  // Preserve bytes represented by unchanged prefix/suffix, including mixed
  // CRLF/CR/LF, BOM and trailing newline. Only newly inserted breaks use the
  // original document's predominant EOL (ties: first encountered).
  return raw.slice(0, projection.toRaw(start)) + next.slice(start, newEnd).replace(/\n/g, projection.preferredEOL) + raw.slice(projection.toRaw(oldEnd));
}
