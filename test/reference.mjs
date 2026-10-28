import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/workbench/document.mjs';
import { REFERENCE_PREFIX, encodeReference, decodeReference, referenceHash, quoteDocumentSelection, revealDocumentReference, referenceTextRule } from '../src/workbench/reference.mjs';
const text = '\ufefffirst\r\nsecond 😀\r\nthird\n';
const projectId = 'file:///work', sessionId = 'A';
async function setup() {
  let writes = 0, opens = 0; const doc = createDocument({ path: '/work/中文 [a].md', transport: { read: async () => ({ text, version: 'v1' }), save: async () => { writes++; return { version: 'v2' }; } } }); await doc.load();
  doc.view({ selectionStart: text.indexOf('second'), selectionEnd: text.indexOf('third') - 2 });
  const controller = { projectId, sessionId, openDocument: async path => { assert.equal(path, doc.getSnapshot().path); opens++; return doc; } };
  let draft = 'existing draft', revision = 1, insertions = 0;
  const inputActions = { captureInsertion: () => ({ start: draft.length, end: draft.length, draftRev: revision }), insertText(value, span) { insertions++; if (span.draftRev !== revision) return false; draft += value; revision++; return true; }, setDraft() { throw Error('must not replace chat draft'); }, submit() { throw Error('must not auto-send'); } };
  return { doc, controller, inputActions, get draft() { return draft; }, changeDraft(value) { draft = value; revision++; }, counts: () => ({ writes, opens, insertions }) };
}
const quote = f => quoteDocumentSelection({ doc: f.doc, controller: f.controller, inputActions: f.inputActions });
const reveal = (f, uri, extra = {}) => revealDocumentReference({ uri, controller: f.controller, ...extra });
test('real WebCrypto digest matches SHA-256 vector and rejects ill-formed source', async () => {
  assert.equal(await referenceHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); await assert.rejects(referenceHash(String.fromCharCode(0xd800)));
});
test('reference round-trips exact Unicode path and raw UTF-16 offsets without carrying source bodies', async () => {
  const f = await setup(), selected = await quote(f), value = decodeReference(selected.uri); assert.equal(value.path, '/work/中文 [a].md'); assert.equal(value.start, 8); assert.equal(value.end, 17); assert.equal(value.hash, await referenceHash(text)); assert.equal(value.dirty, false); assert.equal('text' in value, false);
  assert.throws(() => { value.start = 0; }, TypeError); assert.equal(f.counts().writes, 0);
});
test('quote preserves existing input, labels unsaved source, inserts only selected lines, and does not send', async () => {
  const f = await setup(); f.doc.edit(text + 'unsaved'); const selected = await quote(f); assert.equal(selected.text, 'second 😀'); assert.ok(f.draft.startsWith('existing draft\n引用：')); assert.ok(f.draft.includes('（未保存草稿）\n> second 😀\n↩ ')); assert.equal(f.draft.includes('> first'), false); assert.deepEqual(f.counts(), { writes: 0, opens: 0, insertions: 1 });
});
test('asynchronous digest cannot replace later native input edits: captured revision is passed intact', async () => {
  const f = await setup(), gate = Promise.withResolvers(), digest = await referenceHash(text);
  const pending = quoteDocumentSelection({ doc: f.doc, controller: f.controller, inputActions: f.inputActions, hash: () => gate.promise }); f.changeDraft('newer native draft'); gate.resolve(digest);
  await assert.rejects(pending, /草稿已变化/); assert.equal(f.draft, 'newer native draft');
});
test('session or provider replacement during hashing rejects before insert', async () => {
  const f = await setup(), gate = Promise.withResolvers(); let current = true;
  const pending = quoteDocumentSelection({ doc: f.doc, controller: f.controller, inputActions: f.inputActions, isCurrent: () => current, hash: () => gate.promise }); current = false; gate.resolve(await referenceHash(text));
  await assert.rejects(pending, /接口已变化/); assert.equal(f.counts().insertions, 0);
});
test('split surrogate selection rejects before touching the input', async () => {
  const f = await setup(), offset = text.indexOf('😀'); f.doc.view({ selectionStart: offset, selectionEnd: offset + 1 }); await assert.rejects(quote(f), /完整字符/); assert.equal(f.counts().insertions, 0);
});
test('return verifies full content then reveals the same raw range without edits or saves', async () => {
  const f = await setup(), selected = await quote(f); f.doc.view({ selectionStart: 0, selectionEnd: 1 }); const result = await reveal(f, selected.uri);
  assert.equal(result, f.doc); assert.equal(f.doc.selection().text, selected.text); assert.equal(f.doc.getSnapshot().revealFocus, true); assert.equal(f.doc.getSnapshot().dirty, false); assert.equal(f.counts().writes, 0);
  const revision = f.doc.getSnapshot().revealRevision; f.doc.acknowledgeReveal(revision - 1); assert.equal(f.doc.getSnapshot().revealFocus, true); f.doc.acknowledgeReveal(revision); assert.equal(f.doc.getSnapshot().revealFocus, false);
});
test('changed draft refuses precise return, retaining all text and previous selection', async () => {
  const f = await setup(), selected = await quote(f); f.doc.edit('changed\n' + text); f.doc.view({ selectionStart: 1, selectionEnd: 3 }); await assert.rejects(reveal(f, selected.uri), /原文.*变化/); assert.equal(f.doc.getSnapshot().text, 'changed\n' + text); assert.equal(f.doc.getSnapshot().selectionStart, 1); assert.equal(f.counts().writes, 0);
});
test('wrong session/project references fail before opening a path', async () => {
  const f = await setup(), value = decodeReference((await quote(f)).uri);
  for (const change of [{ sessionId: 'B' }, { projectId: 'file:///other' }]) await assert.rejects(reveal(f, encodeReference({ ...value, ...change })), /另一会话或项目/);
  assert.equal(f.counts().opens, 0);
});
test('aborted return never opens a file', async () => {
  const f = await setup(), uri = (await quote(f)).uri, abort = new AbortController(); abort.abort(); await assert.rejects(reveal(f, uri, { signal: abort.signal })); assert.equal(f.counts().opens, 0);
});
test('editing while return digest is pending cannot select a stale range', async () => {
  const f = await setup(), uri = (await quote(f)).uri, gate = Promise.withResolvers();
  const pending = reveal(f, uri, { hash: () => gate.promise }); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); f.doc.edit(text + 'late'); gate.resolve(decodeReference(uri).hash);
  await assert.rejects(pending, error => error.code === 'REFERENCE_STALE'); assert.equal(f.doc.getSnapshot().text, text + 'late');
});
test('Host read refusal propagates; a reference never supplies alternate direct filesystem access', async () => {
  const f = await setup(), uri = (await quote(f)).uri; f.controller.openDocument = async () => { throw Object.assign(Error('denied'), { code: 'FS_SANDBOX_DENIED' }); };
  await assert.rejects(reveal(f, uri), { code: 'FS_SANDBOX_DENIED' }); assert.equal(f.counts().writes, 0);
});
test('closed/unselected documents cannot quote, and missing InputActions is explicit', async () => {
  const f = await setup(); await assert.rejects(quoteDocumentSelection({ doc: f.doc, controller: f.controller }), /输入接口不可用/); f.doc.view({ selectionStart: 0, selectionEnd: 0 }); await assert.rejects(quote(f), /先选择/); await f.doc.requestClose(); await assert.rejects(quote(f), { code: 'DOCUMENT_CLOSED' });
});
test('strict schema refuses extra fields, unsafe ranges, wrong hash and relative paths', async () => {
  const f = await setup(), value = decodeReference((await quote(f)).uri);
  for (const change of [{ v: 2 }, { grant: true }, { start: -1 }, { end: 2 ** 31 }, { end: 8 }, { start: 0.5 }, { path: '../outside' }, { hash: 'ABC' }, { dirty: 'false' }, { path: 'x\0y' }]) assert.throws(() => encodeReference({ ...value, ...change }));
});
test('strict encoding rejects malformed, oversized and noncanonical payloads', async () => {
  const f = await setup(), uri = (await quote(f)).uri;
  for (const bad of ['https://example.com', REFERENCE_PREFIX + '_', uri + '=', REFERENCE_PREFIX + 'a'.repeat(33000)]) assert.throws(() => decodeReference(bad));
  const value = decodeReference(uri), json = JSON.stringify(value, null, 1); assert.throws(() => decodeReference(REFERENCE_PREFIX + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')));
});
test('fresh scope refusal after hashing never reveals a cached document', async () => {
  const f = await setup(), uri = (await quote(f)).uri, before = f.doc.getSnapshot().revealRevision;
  await assert.rejects(reveal(f, uri, { validateScope: async () => { throw Error('workspace changed during hash'); } }), /workspace changed/);
  assert.equal(f.doc.getSnapshot().revealRevision, before); assert.equal(f.counts().writes, 0);
});
test('scope validation awaiting a reply cannot overwrite newer source edits', async () => {
  const f = await setup(), uri = (await quote(f)).uri, entered = Promise.withResolvers(), gate = Promise.withResolvers();
  const pending = reveal(f, uri, { validateScope: async () => { entered.resolve(); await gate.promise; } }); await entered.promise;
  f.doc.edit(text + 'during scope check'); gate.resolve(); await assert.rejects(pending, { code: 'REFERENCE_STALE' });
  assert.equal(f.doc.getSnapshot().text, text + 'during scope check');
});
test('scope-validation cancellation or provider replacement blocks the final synchronous reveal', async () => {
  for (const abort of [true, false]) {
    const f = await setup(), uri = (await quote(f)).uri, controller = new AbortController(); let current = true;
    await assert.rejects(reveal(f, uri, { signal: controller.signal, isCurrent: () => current, validateScope: async () => { if (abort) controller.abort(); else current = false; } }));
    assert.equal(f.doc.getSnapshot().revealRevision, 0);
  }
});
test('forward matcher recognizes dedicated LF/CRLF return lines but never quoted repository lines', async () => {
  const f = await setup(), uri = (await quote(f)).uri;
  assert.equal(referenceTextRule.match('> ↩ ' + uri + '\n', 0), undefined);
  const message = 'prefix\r\n↩ ' + uri + '\r\nmore\n↩ ' + uri + '\n', first = referenceTextRule.match(message, 0), second = referenceTextRule.match(message, first.end);
  assert.equal(first.start, 8); assert.equal(first.data.uri, uri); assert.equal(message.slice(first.start, first.end), '↩ ' + uri); assert.ok(second.start > first.end); assert.equal(referenceTextRule.match('↩ ' + uri + ' trailing', 0), undefined);
});
