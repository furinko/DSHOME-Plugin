import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceModel, createLayoutPersistence, validateProject } from '../src/workbench/model.mjs';
import { createWorkspaceController } from '../src/workbench/controller.mjs';
const projectId = 'project-A', key = 'dshome.workspace.v1:project-A';
function memory() { const map = new Map(), writes = []; return { map, writes, getItem: k => map.get(k) ?? null, setItem(k, v) { writes.push([k, v]); map.set(k, v); } }; }
function serial() { let tail = Promise.resolve(); return { request(_key, _options, fn) { const next = tail.then(fn); tail = next.catch(() => {}); return next; } }; }
function setup(options = {}) {
  const storage = options.storage ?? memory(), locks = options.locks ?? serial(), calls = { close: 0, reads: 0, saves: 0 }; let n = 0;
  const c = createWorkspaceController({ projectId, sessionId: 'A', storage, locks, uuid: () => 'nonce-' + (++n), confirm: () => true,
    transport: { read: async path => { calls.reads++; return { text: 'body\r\n', version: 'file-v1', absolutePath: '/work/' + path }; }, save: async () => { calls.saves++; return { version: 'file-v2' }; } },
    terminals: { retainTabs() {}, view: () => ({ id: 'same-view' }), close: () => { calls.close++; } }, ...options });
  return { c, storage, locks, calls };
}
const persistence = (storage, locks = serial(), uuid = () => 'epoch') => createLayoutPersistence({ storage, locks, projectId, uuid });
const data = () => setup().c.model.serialize();
test('corrupt recovery verifies a complete original backup and moves to an ABA-safe epoch', async () => {
  const f = setup(), raw = '\ufeff{broken' + String.fromCharCode(0xd800); f.storage.setItem(key, raw);
  const t = f.c.inspectLayout(), original = f.c.exportLayoutOriginal(); assert.equal(JSON.parse(original).raw, raw); assert.equal(original.isWellFormed(), true);
  const result = await f.c.resolveLayoutRecovery('backup-current'); assert.ok(result.ok); assert.match(result.revision, /^r:nonce-\d+:1$/);
  const p = persistence(f.storage); assert.equal(p.read().kind, 'ready'); assert.equal(JSON.parse(f.c.exportLayoutBackup()).raw, raw); assert.equal(JSON.parse(f.storage.getItem(result.backupKey)).raw, raw);
  assert.equal(Number.isSafeInteger(JSON.parse(f.storage.getItem(key)).storageRevision), false, 'old numeric-only readers must fail closed');
  assert.equal((await p.save(data(), 1)).error, 'LAYOUT_CONFLICT'); assert.equal(f.c.getSnapshot().layoutRecovery, null); assert.equal(t.observed.raw, raw);
});
test('normal saves after recovery keep epoch, advance counter and retain a discoverable backup', async () => {
  const s = memory(); s.setItem(key, '{bad'); const p = persistence(s), one = await p.recover(data(), '{bad');
  const two = await p.save(data(), one.revision, { expectedRaw: one.raw }); assert.equal(two.revision, 'r:epoch:2');
  const reread = persistence(s).read(); assert.equal(reread.backupKey, one.backupKey); assert.equal(JSON.parse(p.readBackup(reread.backupKey)).raw, '{bad');
  assert.throws(() => p.readBackup('other:recovery:epoch'));
});
test('backup failure never writes the active record', async () => {
  for (const mode of ['quota', 'verify']) {
    const s = memory(); s.setItem(key, '{bad'); const set = s.setItem.bind(s), get = s.getItem;
    s.setItem = (k, v) => { if (mode === 'quota' && k !== key) throw Error('quota'); set(k, v); };
    s.getItem = k => mode === 'verify' && k !== key && s.map.has(k) ? 'tampered' : get(k);
    const result = await persistence(s).recover(data(), '{bad'); assert.equal(result.ok, false); assert.equal(s.getItem(key), '{bad');
  }
});
test('failed active replacement leaves both original and independently verified backup', async () => {
  const s = memory(); s.setItem(key, '{bad'); const set = s.setItem.bind(s); s.setItem = (k, v) => { if (k === key) throw Error('quota'); set(k, v); };
  const p = persistence(s); assert.equal((await p.recover(data(), '{bad')).ok, false); assert.equal(s.getItem(key), '{bad'); assert.equal(JSON.parse(p.readBackup(key + ':recovery:epoch')).raw, '{bad');
});
test('backup-key collisions never overwrite an older original', async () => {
  const s = memory(); s.setItem(key, '{bad'); s.setItem(key + ':recovery:epoch', 'older-original'); const before = s.writes.length;
  assert.equal((await persistence(s).recover(data(), '{bad')).error, 'BACKUP_EXISTS'); assert.equal(s.writes.length, before); assert.equal(s.getItem(key + ':recovery:epoch'), 'older-original');
});
test('storage changed while backup is written is refused before primary replacement', async () => {
  const s = memory(); s.setItem(key, '{bad'); const set = s.setItem.bind(s); s.setItem = (k, v) => { set(k, v); if (k !== key) s.map.set(key, 'another-writer'); };
  const result = await persistence(s).recover(data(), '{bad'); assert.equal(result.error, 'LAYOUT_CONFLICT'); assert.equal(s.getItem(key), 'another-writer');
});
test('two recovery writers under exclusive locking have one winner, not two resets', async () => {
  const s = memory(), locks = serial(); s.setItem(key, '{bad');
  const result = await Promise.all([persistence(s, locks, () => 'a').recover(data(), '{bad'), persistence(s, locks, () => 'b').recover(data(), '{bad')]);
  assert.equal(result.filter(x => x.ok).length, 1); assert.equal(result.filter(x => x.error === 'LAYOUT_CONFLICT').length, 1);
});
test('recovery requires exclusive locks and rejects foreign project data without writes', async () => {
  const s = memory(); s.setItem(key, '{bad'); const p = persistence(s, {}), before = s.writes.length;
  assert.equal((await p.recover(data(), '{bad')).error, 'STORAGE_LOCK_UNAVAILABLE'); await assert.rejects(p.recover({ ...data(), projectId: 'foreign' }, '{bad')); assert.equal(s.writes.length, before);
});
test('exact raw CAS detects a replaced record even when its numeric revision was reused', async () => {
  const s = memory(), p = persistence(s); const first = await p.save(data(), null); const other = data(); other.panels['DOC-01'].title = 'other';
  s.setItem(key, JSON.stringify({ storageRevision: 1, project: other })); assert.equal((await p.save(data(), 1, { expectedRaw: first.raw })).error, 'LAYOUT_CONFLICT');
});
test('keeping current layout adopts only the compared baseline and requires a separate save', async () => {
  const f = setup(), other = setup({ storage: f.storage, locks: f.locks }); await other.c.saveLayout(); const before = f.c.model.serialize(), raw = f.storage.getItem(key);
  f.c.inspectLayout(); await f.c.resolveLayoutRecovery('keep-current'); assert.deepEqual(f.c.model.serialize(), before); assert.equal(f.storage.getItem(key), raw);
  assert.equal((await f.c.saveLayout()).revision, 2);
});
test('adopting stored layout preserves live content, collapses omitted live instances and never writes documents', async () => {
  const f = setup(), doc = await f.c.openDocument('a.md'); await doc.load(); doc.edit('unsaved'); doc.view({ selectionStart: 1, selectionEnd: 4, scrollTop: 20 });
  f.c.startTerminal('TERM-01'); f.c.navigate('WEB-01', 'https://example.org/form', 'https://host.example.org'); const extra = f.c.model.addPanel('web');
  const identities = new Map(f.c.contents), docState = doc.getSnapshot(), other = setup({ storage: f.storage, locks: f.locks }); other.c.model.selectPreset('review'); await other.c.saveLayout(); const raw = f.storage.getItem(key);
  f.c.inspectLayout(); await f.c.resolveLayoutRecovery('use-stored');
  for (const [id, item] of identities) assert.equal(f.c.content(id), item); assert.equal(doc.getSnapshot(), docState); assert.ok(f.c.model.getSnapshot().layout.collapsed.some(p => p.panelId === extra));
  assert.equal(f.storage.getItem(key), raw); assert.equal(f.calls.close, 0); assert.equal(f.calls.saves, 0); validateProject(f.c.model.serialize(), projectId);
});
test('panel-kind collision and foreign imports are atomic refusals', () => {
  const f = setup(), before = f.c.model.serialize(), incoming = structuredClone(before); incoming.panels['DOC-01'].kind = 'terminal';
  assert.throws(() => f.c.model.adoptLayout(incoming, before.revision), { code: 'PANEL_KIND_CONFLICT' }); assert.deepEqual(f.c.model.serialize(), before);
  assert.throws(() => f.c.model.adoptLayout({ ...before, projectId: 'foreign' }, before.revision), { code: 'WRONG_PROJECT' }); assert.deepEqual(f.c.model.serialize(), before);
});
test('layout changes after comparison invalidate every destructive or adopting choice', async () => {
  for (const choice of ['use-stored', 'keep-current', 'backup-current']) {
    const f = setup(); await f.c.saveLayout(); f.c.inspectLayout(); f.c.model.collapse('WEB-01'); const before = f.storage.getItem(key);
    await assert.rejects(f.c.resolveLayoutRecovery(choice), { code: 'LAYOUT_STALE' }); assert.equal(f.storage.getItem(key), before);
  }
});
test('storage changes after comparison require reread rather than silently adopting newer data', async () => {
  const f = setup(); f.c.inspectLayout(); f.storage.setItem(key, '{newer'); await assert.rejects(f.c.resolveLayoutRecovery('backup-current'), { code: 'LAYOUT_CONFLICT' }); assert.equal(f.storage.getItem(key), '{newer');
});
test('asynchronous confirmation never overwrites later layout edits or storage changes', async () => {
  for (const change of ['local', 'stored', 'cancel']) {
    const gate = Promise.withResolvers(), f = setup({ confirm: () => gate.promise }); f.storage.setItem(key, '{bad'); f.c.inspectLayout(); const operation = f.c.resolveLayoutRecovery('backup-current'); await Promise.resolve();
    if (change === 'local') f.c.model.collapse('WEB-01'); else if (change === 'stored') f.storage.setItem(key, '{newer'); else f.c.cancelLayoutRecovery();
    gate.resolve(true); await assert.rejects(operation); assert.equal(f.storage.getItem(key), change === 'stored' ? '{newer' : '{bad');
  }
});
test('declining recovery preserves the comparison, content and raw original', async () => {
  const f = setup({ confirm: () => false }); f.storage.setItem(key, '{bad'); const t = f.c.inspectLayout(); assert.equal(await f.c.resolveLayoutRecovery('backup-current'), false); assert.equal(f.c.getSnapshot().layoutRecovery, t); assert.equal(f.storage.getItem(key), '{bad');
});
test('cancelling or disposing while waiting for a lock never performs a late recovery write', async () => {
  for (const close of [false, true]) {
    const waiting = Promise.withResolvers(); let run; const f = setup({ locks: { request(_k, _o, fn) { run = fn; waiting.resolve(); return new Promise(resolve => { f.release = () => resolve(run()); }); } } });
    f.storage.setItem(key, '{bad'); f.c.inspectLayout(); const pending = f.c.resolveLayoutRecovery('backup-current'); await waiting.promise;
    if (close) { assert.equal(f.c.closeWorkspace(), false, 'explicit close refuses an in-flight layout save'); f.c.releaseResources(); } else f.c.cancelLayoutRecovery(); f.release(); await assert.rejects(pending, { code: 'LAYOUT_STALE' }); assert.equal(f.storage.getItem(key), '{bad');
  }
});
test('pending save persists the captured revision and labels later local changes as unsaved', async () => {
  let release; const entered = Promise.withResolvers(), f = setup({ locks: { request(_k, _o, run) { entered.resolve(); return new Promise(resolve => { release = () => resolve(run()); }); } } });
  const capture = f.c.model.serialize(), saving = f.c.saveLayout(); await entered.promise; f.c.model.collapse('WEB-01'); release(); await saving;
  assert.deepEqual(JSON.parse(f.storage.getItem(key)).project, capture); assert.match(f.c.getSnapshot().notice, /仍有新修改/);
});
test('storage outage does not become a fake empty baseline or original export', async () => {
  const f = setup({ storage: { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } } }); f.c.inspectLayout(); assert.throws(() => f.c.exportLayoutOriginal()); await assert.rejects(f.c.resolveLayoutRecovery('keep-current')); await assert.rejects(f.c.resolveLayoutRecovery('backup-current'));
});
test('silent storage no-ops never become successful normal or recovery receipts', async () => {
  const s = memory(), p = persistence(s); s.setItem = () => {}; assert.equal((await p.save(data(), null)).error, 'STORAGE_VERIFY_FAILED');
  s.map.set(key, '{bad'); s.setItem = (k, v) => { if (k !== key) s.map.set(k, v); }; assert.equal((await p.recover(data(), '{bad')).error, 'STORAGE_VERIFY_FAILED'); assert.equal(s.getItem(key), '{bad');
});
test('missing IndexedDB keeps content usable but disables unsafe legacy storage fallback', async () => {
  const { createBrowserLayoutStorage } = await import('../src/workbench/browser-layout-storage.mjs'); const legacy = memory(); legacy.setItem(key, '{original');
  const backend = await createBrowserLayoutStorage({ projectId, legacyStorage: legacy, locks: serial(), indexedDB: null, keyRange: null }); const f = setup(backend);
  assert.equal(f.c.getSnapshot().storage, 'unavailable'); assert.equal(Object.keys(f.c.model.getSnapshot().panels).length, 4); await assert.rejects(f.c.saveLayout()); assert.equal(legacy.getItem(key), '{original');
});
test('a layout draft started during an older save is not labelled fully saved', async () => {
  let release; const entered = Promise.withResolvers(), f = setup({ locks: { request(_k, _o, run) { entered.resolve(); return new Promise(resolve => { release = () => resolve(run()); }); } } });
  const saving = f.c.saveLayout(); await entered.promise; f.c.model.beginEdit(); f.c.model.addPanel('web'); release(); await saving;
  assert.match(f.c.getSnapshot().notice, /仍有新修改/); assert.equal(Object.keys(JSON.parse(f.storage.getItem(key)).project.panels).length, 4);
});

test('cancel during asynchronous comparison never reopens the dismissed region', async () => {
  const gate = Promise.withResolvers(), storage = memory(); storage.refresh = () => gate.promise; const f = setup({ storage });
  const reading = f.c.inspectLayout(); f.c.cancelLayoutRecovery(); gate.resolve(); await assert.rejects(reading, { code: 'LAYOUT_STALE' }); assert.equal(f.c.getSnapshot().layoutRecovery, null);
});
test('layout editing begun during comparison refresh is not replaced or misrepresented', async () => {
  const gate = Promise.withResolvers(), storage = memory(); storage.refresh = () => gate.promise; const f = setup({ storage });
  const reading = f.c.inspectLayout(); f.c.model.beginEdit(); f.c.model.addPanel('web'); gate.resolve(); await assert.rejects(reading, { code: 'LAYOUT_STALE' }); assert.equal(f.c.getSnapshot().layoutRecovery, null); assert.ok(f.c.model.getSnapshot().editing);
});
