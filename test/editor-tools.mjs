import test from 'node:test';
import assert from 'node:assert/strict';
import { documentMatches, documentPosition } from '../src/workbench/editor-tools.mjs';
test('document find treats pattern characters literally and returns source positions', () => {
  assert.deepEqual(documentMatches('a.b a[b] a*b a\\b', 'a.b'), [{ start: 0, end: 3 }]);
  for (const term of ['a[b]', 'a*b', 'a\\b', '$', '(']) assert.doesNotThrow(() => documentMatches('sample', term));
  assert.deepEqual(documentMatches('鲸鱼 Whale whale', 'WHALE'), [{ start: 3, end: 8 }, { start: 9, end: 14 }]);
  assert.deepEqual(documentMatches('Whale whale', 'Whale', true), [{ start: 0, end: 5 }]);
  assert.deepEqual(documentMatches('any', ''), []);
});
test('editor position accounts for BOM, CRLF and surrogate pairs without altering text', () => {
  const text = '\ufefffirst\r\n鲸😀';
  assert.deepEqual(documentPosition(text, 1), { line: 1, column: 1 });
  assert.deepEqual(documentPosition(text, text.length), { line: 2, column: 3 });
});
