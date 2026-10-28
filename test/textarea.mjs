import test from 'node:test';
import assert from 'node:assert/strict';
import { textareaProjection, applyTextareaEdit } from '../src/workbench/textarea.mjs';
for (const raw of ['', '\ufeff甲\r\n😀乙\r\n', '甲\r乙\n丙\r\n丁', '\r\n\r\n\r\n', 'LF\nonly\n']) {
  test('textarea projection round-trips every DOM boundary: ' + JSON.stringify(raw), () => {
    const p = textareaProjection(raw); assert.equal(p.text, raw.replace(/\r\n?/g, '\n'));
    for (let i = 0; i <= p.text.length; i++) { assert.equal(p.toDisplay(p.toRaw(i)), i); assert.equal(raw.slice(0, p.toRaw(i)).replace(/\r\n?/g, '\n'), p.text.slice(0, i)); }
    assert.equal(p.toRaw(p.text.length), raw.length); assert.equal(applyTextareaEdit(raw, p.text), raw);
  });
}
test('typing preserves BOM, every original CRLF, and trailing newline', () => {
  const raw = '\ufeff甲\r\n乙\r\n'; assert.equal(applyTextareaEdit(raw, '\ufeff甲\n乙X\n'), '\ufeff甲\r\n乙X\r\n');
});
test('new line breaks follow original predominant convention', () => {
  assert.equal(applyTextareaEdit('a\r\nb\r\n', 'a\nb\nNEW\n'), 'a\r\nb\r\nNEW\r\n');
  assert.equal(applyTextareaEdit('a\rb\r', 'a\nb\nNEW\n'), 'a\rb\rNEW\r');
});
test('mixed EOLs outside the replaced region remain exact', () => {
  assert.equal(applyTextareaEdit('a\r\nb\nc\rD', 'a\nbX\nc\nD'), 'a\r\nbX\nc\rD');
  assert.equal(applyTextareaEdit('a\r\nb\nc\rD', 'a\nNEW\nc\nD'), 'a\r\nNEW\nc\rD');
});
test('deleting, replacing and inserting across CRLF boundaries has no phantom CR', () => {
  assert.equal(applyTextareaEdit('a\r\nb\r\nc', 'ac'), 'ac');
  assert.equal(applyTextareaEdit('a\r\nb', 'a\n\nb'), 'a\r\n\r\nb');
  assert.equal(applyTextareaEdit('a\r\nb', 'aXb'), 'aXb');
});
test('source selection is exact after earlier CRLFs and astral text', () => {
  const raw = '\ufefffirst\r\n鲸😀\r\nlast', p = textareaProjection(raw), start = p.text.indexOf('鲸'), end = start + '鲸😀'.length;
  assert.equal(raw.slice(p.toRaw(start), p.toRaw(end)), '鲸😀');
  assert.equal(p.toRaw(start), raw.indexOf('鲸')); assert.equal(p.toDisplay(raw.indexOf('last')), p.text.indexOf('last'));
});
test('invalid offsets are rejected and finite boundaries clamp', () => {
  const p = textareaProjection('a\r\nb'); assert.throws(() => p.toRaw(NaN)); assert.throws(() => p.toDisplay(Infinity));
  assert.equal(p.toRaw(-1), 0); assert.equal(p.toDisplay(100), p.text.length);
});
