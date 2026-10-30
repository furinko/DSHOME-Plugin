// Search never normalizes document bytes or interprets a query as a pattern.
export function documentMatches(text, query, caseSensitive = false) {
  if (!query) return [];
  const escaped = [...query].map(ch => '^$.*+?()[]{}|'.includes(ch) || ch.charCodeAt(0) === 92 ? String.fromCharCode(92) + ch : ch).join('');
  const pattern = new RegExp(escaped, caseSensitive ? 'gu' : 'giu');
  const matches = [];
  for (const match of text.matchAll(pattern)) {
    matches.push({ start: match.index, end: match.index + match[0].length });
    if (matches.length >= 10000) break;
  }
  return matches;
}
export function documentPosition(text, offset) {
  const prefix = text.slice(0, Math.max(0, offset)).replace(/^\uFEFF/, '');
  const lines = prefix.split(/\r\n|\r|\n/);
  return { line: lines.length, column: Array.from(lines.at(-1)).length + 1 };
}
