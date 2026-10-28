import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceController } from '../src/workbench/controller.mjs';
const storage = () => { const map = new Map(); return { map, getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; };
const locks = { request: async (_name, _options, run) => run() }; // Explicit unit double, not a browser Web Locks proof.
function setup(options = {}) {
  const calls = { views: [], holds: [], close: [] };
  const terminals = { retainTabs: tabs => calls.holds.push(tabs), view: (...args) => { calls.views.push(args); return { id: 'real-view-test-double' }; }, close: (...args) => calls.close.push(args) };
  let sequence = 0;
  const c = createWorkspaceController({ sessionId: 'A', projectId: 'project-A', storage: storage(), locks,
    transport: { read: async path => ({ text: 'body\n', version: 'v1', absolutePath: '/workspace/' + path }), save: async () => ({ version: 'v2' }) },
    terminals, uuid: () => 'uuid-' + (++sequence), confirm: () => true, ...options });
  return { c, calls };
}
test('initial workspace describes four modules but never starts a terminal or loads a file', () => {
  let reads = 0; const { c, calls } = setup({ transport: { read: () => { reads++; }, save() {} } });
  assert.equal(Object.keys(c.model.getSnapshot().panels).length, 4); assert.equal(calls.views.length, 0); assert.equal(reads, 0);
});
test('changing presets, collapsing and maximizing preserve identical content and document state', async () => {
  const { c, calls } = setup(); const doc = await c.openDocument('a.md'); await doc.load(); doc.edit('unsaved'); doc.view({ selectionStart: 1, selectionEnd: 3, scrollTop: 140 });
  const before = new Map(c.contents), documentState = doc.getSnapshot();
  for (let i = 0; i < 10; i++) { c.model.selectPreset('review'); c.model.selectPreset('development'); c.model.maximize('DOC-01'); c.model.maximize('DOC-01'); }
  assert.equal(doc.getSnapshot(), documentState); for (const [id, item] of before) assert.equal(c.content(id), item);
  assert.equal(calls.views.length, 0); assert.equal(calls.close.length, 0);
});
test('layout draft and cancel never allocate pending content instances or PTYs', () => {
  const { c, calls } = setup(); c.model.beginEdit(); const id = c.model.addPanel('terminal');
  assert.equal(c.contents.has(id), false); assert.equal(calls.views.length, 0); c.model.cancelEdit(); assert.equal(c.contents.has(id), false);
  c.model.beginEdit(); const second = c.model.addPanel('web'); c.model.applyEdit(); assert.equal(c.content(second).url, '');
});
test('terminal starts only on explicit action, has a stable content identity, and layout changes never close it', () => {
  const { c, calls } = setup(); const view = c.startTerminal('TERM-01'); assert.equal(c.startTerminal('TERM-01'), view); assert.equal(calls.views.length, 1);
  assert.ok(calls.holds.at(-1).some(t => t.tabId === 'TERM-01' && t.contentId === c.content('TERM-01').contentId));
  c.model.selectPreset('review'); c.model.beginEdit(); c.model.cancelEdit(); assert.equal(calls.close.length, 0); assert.equal(calls.views.length, 1);
});
test('panel close rejects dirty draft dismissal and does not remove metadata or content', async () => {
  const { c } = setup({ confirm: () => false }); const doc = await c.openDocument('a.md'); await doc.load(); doc.edit('keep me');
  assert.equal(await c.closePanel('DOC-01'), false); assert.equal(c.content('DOC-01').document, doc); assert.ok(c.model.getSnapshot().panels['DOC-01']);
  assert.equal(c.closeWorkspace(), false);
});
test('confirmed terminal close records exactly one process cleanup and removes its membership', async () => {
  const { c, calls } = setup(); c.startTerminal('TERM-01'); await c.closePanel('TERM-01'); assert.equal(calls.close.length, 1); assert.equal(c.contents.has('TERM-01'), false); assert.deepEqual(calls.holds.at(-1), []);
});
test('saving layout does not persist document bodies, URLs, terminal identities or hidden editor drafts', async () => {
  const store = storage(); const { c } = setup({ storage: store }); const doc = await c.openDocument('a.md'); await doc.load(); doc.edit('private unsaved body');
  c.navigate('WEB-01', 'https://example.org/private', 'https://host.example.org'); c.startTerminal('TERM-01');
  await c.saveLayout(); const json = [...store.map.values()][0];
  for (const privateText of ['private unsaved body', 'example.org/private', 'real-view-test-double', '/workspace/a.md']) assert.equal(json.includes(privateText), false);
  assert.equal(doc.getSnapshot().dirty, true);
});
test('project scopes never share content or saved layout keys', async () => {
  const store = storage(); const a = setup({ storage: store }).c, b = setup({ storage: store, projectId: 'project-B', sessionId: 'B' }).c;
  const doc = await a.openDocument('a.md'); await doc.load(); doc.edit('A draft'); assert.equal(b.content('DOC-01').document, null);
  await a.saveLayout(); await b.saveLayout(); assert.equal(store.map.size, 2);
});
test('corrupt saved layout is preserved and cannot be silently overwritten', async () => {
  const store = storage(); store.setItem('dshome.workspace.v1:project-A', '{bad-data'); const { c } = setup({ storage: store });
  assert.equal(c.getSnapshot().storage, 'corrupt'); assert.equal(c.exportStoredLayout(), '{bad-data'); await assert.rejects(c.saveLayout()); assert.equal(c.exportStoredLayout(), '{bad-data');
});
test('web rejects script/data URLs, credential URLs and the host control origin', () => {
  const { c } = setup(); for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://name:secret@example.org', 'https://host.example.org/settings']) assert.throws(() => c.navigate('WEB-01', url, 'https://host.example.org'));
  c.navigate('WEB-01', 'https://example.org/page', 'https://host.example.org'); assert.equal(c.content('WEB-01').url, 'https://example.org/page');
});

test('cleanup-aware workspace close keeps drafts through terminal request and acknowledgement', async () => {
  const { createTerminalCleanup } = await import('../src/workbench/terminal-cleanup.mjs'); const cleanup = createTerminalCleanup(); let confirmations = 0;
  const { c, calls } = setup({ terminalCleanup: cleanup, confirm: () => { confirmations++; return true; } }); const doc = await c.openDocument('a.md'); await doc.load(); doc.edit('kept draft'); c.startTerminal('TERM-01');
  assert.equal(c.closeWorkspace(), false); assert.equal(calls.close.length, 1); assert.equal(c.contents.has('TERM-01'), false); assert.equal(doc.getSnapshot().text, 'kept draft'); assert.equal(cleanup.hasUnconfirmed(), true);
  assert.equal(c.closeWorkspace(), false); assert.equal(confirmations, 1); assert.equal(c.content('DOC-01').document, doc);
  await cleanup.closeRemote(async () => ({ ok: true }), 'A', 'real-view-test-double'); assert.equal(c.closeWorkspace(), true); assert.equal(confirmations, 2);
});
test('cancelled terminal close creates no close intent', async () => { const { createTerminalCleanup } = await import('../src/workbench/terminal-cleanup.mjs'); const cleanup = createTerminalCleanup(), { c, calls } = setup({ terminalCleanup: cleanup, confirm: () => false }); c.startTerminal('TERM-01'); assert.equal(await c.closePanel('TERM-01'), false); assert.equal(cleanup.hasUnconfirmed(), false); assert.equal(calls.close.length, 0); });
test('explicit resource release does not claim queued terminal cleanup succeeded', async () => { const { createTerminalCleanup } = await import('../src/workbench/terminal-cleanup.mjs'); const cleanup = createTerminalCleanup(), { c } = setup({ terminalCleanup: cleanup }); c.startTerminal('TERM-01'); await c.closePanel('TERM-01'); c.releaseResources(); assert.equal(cleanup.hasUnconfirmed(), true); assert.equal(cleanup.getSnapshot().confirmed, 0); });

test('terminal acknowledgement clears its own warning but not newer unrelated feedback', async () => { const { createTerminalCleanup } = await import('../src/workbench/terminal-cleanup.mjs'); for (const unrelated of [false, true]) { const cleanup = createTerminalCleanup(), { c } = setup({ terminalCleanup: cleanup }); c.startTerminal('TERM-01'); await c.closePanel('TERM-01'); assert.equal(c.closeWorkspace(), false); if (unrelated) c.notify('another operation failed'); await cleanup.closeRemote(async () => ({ ok: true }), 'A', 'real-view-test-double'); if (unrelated) assert.equal(c.getSnapshot().notice, 'another operation failed'); else assert.match(c.getSnapshot().notice, /宿主已确认/); } });
