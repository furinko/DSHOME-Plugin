import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/workbench/document.mjs';
const base = '\ufeffone\r\ntwo\nlast\r';
const code = value => error => error.code === value;
async function fixture() {
  const disk = { text: base, version: 'v1' }; let writes = 0;
  const transport = { read: async () => ({ ...disk, absolutePath: '/work/a.md', projectId: 'file:///work' }),
    save: async (_path, text, version) => { if (version !== disk.version) throw Object.assign(Error('磁盘版本过旧'), { code: 'FS_STALE_VERSION' }); writes++; Object.assign(disk, { text, version: 'saved-' + writes }); return { version: disk.version }; } };
  const doc = createDocument({ path: 'a.md', transport }); await doc.load(); return { doc, disk, transport, writes: () => writes };
}
test('late close confirmation cannot discard edits made after the question', async () => {
  const f = await fixture(), answer = Promise.withResolvers(); f.doc.edit('before question'); const closing = f.doc.requestClose(() => answer.promise); f.doc.edit('newer draft'); answer.resolve(true);
  assert.equal(await closing, false); assert.equal(f.doc.getSnapshot().text, 'newer draft'); f.doc.edit('still usable');
});
test('late close confirmation cannot orphan a newly started save', async () => {
  const f = await fixture(), answer = Promise.withResolvers(), write = Promise.withResolvers(); f.doc.edit('draft'); const closing = f.doc.requestClose(() => answer.promise); f.transport.save = () => write.promise; const saving = f.doc.save(); answer.resolve(true);
  assert.equal(await closing, false); write.resolve({ version: 'v2' }); await saving; assert.equal(f.doc.getSnapshot().dirty, false);
});
test('synchronous subscriber cancellation cannot let read-back adopt a cancelled comparison', async () => {
  const f = await fixture(); const off = f.doc.subscribe(() => { if (f.doc.getSnapshot().comparison) f.doc.cancelComparison(); });
  await assert.rejects(f.doc.compareDisk(), code('COMPARE_CANCELLED')); off(); assert.equal(f.doc.getSnapshot().comparison, null); assert.equal(f.doc.getSnapshot().version, 'v1');
});
test('comparison is immutable bounded transport data and never edits/writes/advances base', async () => {
  const f = await fixture(); f.doc.edit(base + 'draft'); f.doc.view({ selectionStart: 2, selectionEnd: 6, scrollTop: 350 }); Object.assign(f.disk, { text: 'external', version: 'v2' });
  const comparison = await f.doc.compareDisk(); assert.equal(comparison.disk.text, 'external'); assert.equal(f.doc.getSnapshot().baseText, base); assert.equal(f.doc.getSnapshot().version, 'v1'); assert.equal(f.doc.getSnapshot().selectionStart, 2); assert.equal(f.writes(), 0);
  assert.throws(() => { comparison.disk.text = 'tamper'; }, TypeError); assert.throws(() => { comparison.token = 8; }, TypeError);
});
test('explicit keep-draft adopts exact disk baseline without writing; subsequent save stays version guarded', async () => {
  const f = await fixture(); f.doc.edit(base + 'draft'); Object.assign(f.disk, { text: 'external', version: 'v2' }); const comparison = await f.doc.compareDisk();
  f.doc.resolveComparison(comparison.token, 'keep-draft'); const s = f.doc.getSnapshot(); assert.equal(s.baseText, 'external'); assert.equal(s.text, base + 'draft'); assert.equal(s.version, 'v2'); assert.equal(s.dirty, true); assert.equal(f.writes(), 0);
  await f.doc.save(); assert.equal(f.disk.text, base + 'draft'); assert.equal(f.writes(), 1);
});
test('disk changing after comparison/adoption is still rejected, never silently overwritten', async () => {
  const f = await fixture(); f.doc.edit('draft'); const comparison = await f.doc.compareDisk(); Object.assign(f.disk, { text: 'newer', version: 'v3' });
  f.doc.resolveComparison(comparison.token, 'keep-draft'); await assert.rejects(f.doc.save(), code('FS_STALE_VERSION')); assert.equal(f.disk.text, 'newer'); assert.equal(f.doc.getSnapshot().text, 'draft'); assert.equal(f.writes(), 0);
});
test('explicit use-disk is a local discard with reset view and exact BOM/mixed endings, not a disk write', async () => {
  const f = await fixture(); f.doc.edit('draft'); f.doc.view({ selectionStart: 3, selectionEnd: 5, scrollTop: 90 }); const comparison = await f.doc.compareDisk();
  f.doc.resolveComparison(comparison.token, 'use-disk'); const s = f.doc.getSnapshot(); assert.equal(s.text, base); assert.equal(s.dirty, false); assert.equal(s.selectionStart, 0); assert.equal(s.scrollTop, 0); assert.equal(s.revealRevision, 1); assert.equal(f.writes(), 0);
});
test('editing after comparison invalidates both adoption choices until refreshed', async () => {
  const f = await fixture(); const old = await f.doc.compareDisk(); f.doc.edit('later');
  for (const mode of ['keep-draft', 'use-disk']) assert.throws(() => f.doc.resolveComparison(old.token, mode), code('COMPARISON_STALE'));
  const fresh = await f.doc.compareDisk(); assert.notEqual(fresh.token, old.token); f.doc.resolveComparison(fresh.token, 'keep-draft'); assert.equal(f.doc.getSnapshot().text, 'later');
});
test('an obsolete dismiss cannot remove a newer comparison, and tokens cannot be reused', async () => {
  const f = await fixture(), old = await f.doc.compareDisk(), fresh = await f.doc.compareDisk(); f.doc.dismissComparison(old.token); assert.equal(f.doc.getSnapshot().comparison, fresh);
  f.doc.dismissComparison(fresh.token); assert.equal(f.doc.getSnapshot().comparison, null); assert.throws(() => f.doc.resolveComparison(fresh.token, 'use-disk'), code('COMPARISON_STALE'));
});
test('compare reads deduplicate, block writes/close, but allow safe ongoing draft edits', async () => {
  const f = await fixture(), gate = Promise.withResolvers(); f.transport.read = () => gate.promise;
  const read = f.doc.compareDisk(); assert.equal(f.doc.compareDisk(), read); await assert.rejects(f.doc.save(), code('COMPARE_IN_PROGRESS')); assert.equal(await f.doc.requestClose(() => true), false);
  f.doc.edit('during compare'); gate.resolve({ text: 'disk', version: 'v2' }); const comparison = await read; f.doc.resolveComparison(comparison.token, 'keep-draft'); assert.equal(f.doc.getSnapshot().text, 'during compare');
});
test('cancel forwards AbortSignal and rejects late ignored-signal replies without backwashing a newer comparison', async () => {
  const f = await fixture(), first = Promise.withResolvers(), second = Promise.withResolvers(); let signal, count = 0;
  f.transport.read = (_path, s) => { signal = s; return ++count === 1 ? first.promise : second.promise; };
  const oldRead = f.doc.compareDisk(); await Promise.resolve(); const oldFailure = assert.rejects(oldRead, code('COMPARE_CANCELLED'));
  f.doc.cancelComparison(); assert.equal(signal.aborted, true); assert.equal(f.doc.getSnapshot().comparing, false);
  const newRead = f.doc.compareDisk(); second.resolve({ text: 'new', version: 'v2' }); const fresh = await newRead;
  first.resolve({ text: 'obsolete', version: 'v0' }); await oldFailure; assert.equal(f.doc.getSnapshot().comparison, fresh); assert.equal(f.doc.getSnapshot().error, null);
});
test('comparison read refusal, wrong scope and incomplete responses leave draft/base/pending safe', async () => {
  for (const response of [{ text: 'bad' }, { text: 'x', version: 'v2', absolutePath: '/other/file' }, { text: 'x', version: 'v2', projectId: 'file:///other' }]) {
    const f = await fixture(); f.doc.edit('draft'); f.transport.read = async () => response; await assert.rejects(f.doc.compareDisk());
    assert.equal(f.doc.getSnapshot().text, 'draft'); assert.equal(f.doc.getSnapshot().baseText, base); assert.equal(f.doc.getSnapshot().comparing, false); assert.equal(f.writes(), 0);
  }
});
test('unknown save conflict exposes comparison; only explicit adoption clears pending and never writes by itself', async () => {
  const f = await fixture(), save = f.transport.save; f.transport.save = async () => { throw Error('lost reply'); }; f.doc.edit('submitted'); await assert.rejects(f.doc.save()); f.doc.edit('later'); Object.assign(f.disk, { text: 'external', version: 'v2' });
  assert.equal((await f.doc.reconcile()).kind, 'conflict'); assert.equal(f.doc.getSnapshot().uncertain, true); const comparison = f.doc.getSnapshot().comparison;
  f.doc.resolveComparison(comparison.token, 'keep-draft'); assert.equal(f.doc.getSnapshot().text, 'later'); assert.equal(f.doc.getSnapshot().uncertain, false); assert.equal(f.writes(), 0); f.transport.save = save; await f.doc.save(); assert.equal(f.disk.text, 'later');
});
test('save invalidates previous comparison; malformed resolution is side-effect free', async () => {
  const f = await fixture(); f.doc.edit('draft'); const comparison = await f.doc.compareDisk(); assert.throws(() => f.doc.resolveComparison(comparison.token, 'overwrite'), TypeError); assert.equal(f.doc.getSnapshot().comparison, comparison);
  await f.doc.save(); assert.throws(() => f.doc.resolveComparison(comparison.token, 'use-disk'), code('COMPARISON_STALE')); assert.equal(f.doc.getSnapshot().text, 'draft');
});
test('synchronous transport refusals release ownership and permit a legitimate retry', async () => {
  const transport = { read() { throw Error('sync'); }, save() { throw Object.assign(Error('sync save'), { code: 'FS_STALE_VERSION' }); } }, doc = createDocument({ path: 'x', transport });
  await assert.rejects(doc.load()); transport.read = async () => ({ text: base, version: 'v1' }); await doc.load(); doc.edit('draft');
  await assert.rejects(doc.save()); transport.save = async () => ({ version: 'v2' }); await doc.save(); assert.equal(doc.getSnapshot().dirty, false);
  transport.read = () => { throw Error('sync compare'); }; await assert.rejects(doc.compareDisk()); transport.read = async () => ({ text: 'disk', version: 'v3' }); assert.equal((await doc.compareDisk()).disk.text, 'disk');
});

for (const field of ['projectId', 'absolutePath']) test('mismatched save receipt ' + field + ' cannot clean a draft or clear unknown ownership', async () => {
  const { createDocument } = await import('../src/workbench/document.mjs');
  const original = { text: 'original', version: 'v1', projectId: 'project-A', absolutePath: '/work/a.md' };
  const doc = createDocument({ path: 'a.md', transport: { read: async () => original, save: async () => ({ version: 'v2', projectId: 'project-A', absolutePath: '/work/a.md', [field]: field === 'projectId' ? 'foreign' : '/work/b.md' }) } });
  await doc.load(); doc.edit('kept draft'); await assert.rejects(doc.save(), { code: 'INVALID_RESPONSE' });
  assert.equal(doc.getSnapshot().baseText, 'original'); assert.equal(doc.getSnapshot().dirty, true); assert.equal(doc.getSnapshot().uncertain, true);
  await assert.rejects(doc.save(), { code: 'SAVE_UNCERTAIN' }); assert.equal((await doc.reconcile()).kind, 'not-written'); assert.equal(doc.getSnapshot().text, 'kept draft');
});
