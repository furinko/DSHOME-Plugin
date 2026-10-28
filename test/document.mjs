import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/workbench/document.mjs';
const deferred = () => Promise.withResolvers();
const setup = async (overrides = {}) => {
  const disk = { text: '\uFEFF你好\r\nnext\r\n', version: 'v1' };
  let writes = 0;
  const transport = { read: async () => ({ ...disk, absolutePath: '/workspace/a.md', projectId: 'file:///workspace' }),
    save: async (_path, text, expected) => { assert.equal(expected, disk.version); writes++; Object.assign(disk, { text, version: 'v' + (writes + 1) }); return { version: disk.version }; }, ...overrides };
  const doc = createDocument({ path: 'a.md', transport }); await doc.load();
  return { doc, disk, transport, writes: () => writes };
};
test('read preserves BOM, CRLF, trailing newline and immutable snapshots', async () => {
  const { doc, disk } = await setup(); assert.equal(doc.getSnapshot().text, disk.text);
  assert.throws(() => { doc.getSnapshot().text = 'bad'; }, TypeError);
});
test('reloading never discards an edited draft or changes the content instance', async () => {
  const { doc, disk } = await setup(); doc.edit('draft'); disk.text = 'external'; await doc.load(); assert.equal(doc.getSnapshot().text, 'draft');
});
test('save captures submitted text while subsequent edits and selection remain dirty', async () => {
  const gate = deferred(); const { doc } = await setup({ save: () => gate.promise });
  doc.edit('first'); const saving = doc.save(); assert.equal(doc.save(), saving);
  doc.edit('second'); doc.view({ selectionStart: 1, selectionEnd: 4, scrollTop: 230 });
  gate.resolve({ version: 'v2' }); await saving;
  const s = doc.getSnapshot(); assert.equal(s.text, 'second'); assert.equal(s.baseText, 'first'); assert.equal(s.version, 'v2'); assert.equal(s.dirty, true); assert.equal(s.selectionStart, 1); assert.equal(s.scrollTop, 230);
});
test('unchanged documents never write and returning to exact saved bytes clears dirty', async () => {
  const { doc, writes } = await setup(); await doc.save(); assert.equal(writes(), 0);
  const base = doc.getSnapshot().text; doc.edit('changed'); doc.edit(base); assert.equal(doc.getSnapshot().dirty, false);
});
test('stale and sandbox refusals preserve draft and version without declaring unknown outcome', async () => {
  for (const code of ['FS_STALE_VERSION', 'FS_SANDBOX_DENIED', 'workbench/read-only']) {
    const error = Object.assign(Error(code), { code }); const { doc } = await setup({ save: async () => { throw error; } });
    doc.edit('draft'); await assert.rejects(doc.save(), error); assert.equal(doc.getSnapshot().text, 'draft'); assert.equal(doc.getSnapshot().version, 'v1'); assert.equal(doc.getSnapshot().dirty, true); assert.equal(doc.getSnapshot().uncertain, false);
  }
});
test('lost successful save reply requires read-back; further edits survive reconciliation', async () => {
  const { doc, disk, transport } = await setup();
  transport.save = async (_path, text) => { Object.assign(disk, { text, version: 'v2' }); throw Error('connection lost'); };
  doc.edit('submitted'); await assert.rejects(doc.save()); doc.edit('later edit');
  await assert.rejects(doc.save(), e => e.code === 'SAVE_UNCERTAIN');
  assert.equal((await doc.reconcile()).kind, 'saved'); assert.equal(doc.getSnapshot().baseText, 'submitted'); assert.equal(doc.getSnapshot().text, 'later edit'); assert.equal(doc.getSnapshot().dirty, true); assert.equal(doc.getSnapshot().version, 'v2');
});
test('unwritten timeout is retryable only after the original version and bytes are verified', async () => {
  const { doc, transport } = await setup(); const save = transport.save;
  transport.save = async () => { throw Error('timeout'); }; doc.edit('draft'); await assert.rejects(doc.save());
  assert.equal((await doc.reconcile()).kind, 'not-written'); transport.save = save; await doc.save(); assert.equal(doc.getSnapshot().dirty, false);
});
test('uncertain save plus external edits never rebases or overwrites automatically', async () => {
  const { doc, disk } = await setup({ save: async () => { throw Error('timeout'); } }); doc.edit('my draft'); await assert.rejects(doc.save()); Object.assign(disk, { text: 'external', version: 'v3' });
  const result = await doc.reconcile(); assert.equal(result.kind, 'conflict'); assert.equal(doc.getSnapshot().text, 'my draft'); assert.equal(doc.getSnapshot().version, 'v1'); await assert.rejects(doc.save(), e => e.code === 'SAVE_UNCERTAIN');
});
test('missing save version is unknown, not a successful clean draft', async () => {
  const { doc } = await setup({ save: async () => ({}) }); doc.edit('new'); await assert.rejects(doc.save()); assert.equal(doc.getSnapshot().dirty, true); assert.equal(doc.getSnapshot().uncertain, true);
});
test('selected reference is exact selected text with source location, not whole document', async () => {
  const { doc } = await setup(); doc.edit('one\ntwo\nthree'); doc.view({ selectionStart: 4, selectionEnd: 7 });
  assert.deepEqual(doc.selection(), { path: '/workspace/a.md', text: 'two', start: 4, end: 7, startLine: 2, endLine: 2, version: 'v1', editRevision: 1, dirty: true });
});
test('close refuses in-flight saves and requires explicit agreement for dirty documents', async () => {
  const gate = deferred(); const { doc } = await setup({ save: () => gate.promise }); doc.edit('draft');
  assert.equal(await doc.requestClose(), false); assert.equal(await doc.requestClose(async () => false), false);
  const saving = doc.save(); assert.equal(await doc.requestClose(async () => true), false); gate.resolve({ version: 'v2' }); await saving;
  doc.edit('later'); assert.equal(await doc.requestClose(async () => true), true); assert.throws(() => doc.edit('closed'), e => e.code === 'DOCUMENT_CLOSED');
});
