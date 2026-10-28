import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function runNativeLayoutRecovery({ page, url, projectId, rawOriginal, root }) {
  const key = 'dshome.workspace.v1:' + encodeURIComponent(projectId), region = page.getByRole('region', { name: '布局存储恢复', exact: true });
  const diskBefore = await readFile(join(root, 'a.md'));
  const stateBefore = await page.evaluate(() => {
    const c = window.testNative.controller(), doc = c.contents.get('DOC-01').document;
    window.layoutIdentities = { editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), terminal: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]'), doc, view: c.contents.get('TERM-01').view };
    return { text: doc.getSnapshot().text, start: doc.getSnapshot().selectionStart, end: doc.getSnapshot().selectionEnd, draft: window.testNative.reference.input().state.getSnapshot().draft, terminal: c.contents.get('TERM-01').view.id };
  });
  assert.equal(await page.evaluate(k => localStorage.getItem(k), key), rawOriginal);
  await page.getByRole('button', { name: '检查布局存储', exact: true }).click(); await region.waitFor();
  const download = await Promise.all([page.waitForEvent('download'), region.getByRole('button', { name: '导出原布局记录', exact: true }).click()]);
  const originalExport = JSON.parse(await readFile(await download[0].path(), 'utf8')); assert.equal(originalExport.raw, rawOriginal); assert.equal(originalExport.projectId, projectId);
  async function confirmRecovery(accept) {
    const event = page.waitForEvent('dialog'), click = region.getByRole('button', { name: '备份原件并保存当前布局' }).click();
    const dialog = await event; if (accept) await dialog.accept(); else await dialog.dismiss(); await click;
    await page.waitForFunction(() => !window.testNative.controller().getSnapshot().savingLayout);
  }
  await confirmRecovery(false); assert.equal(await page.evaluate(k => localStorage.getItem(k), key), rawOriginal);
  await page.evaluate(k => { window.layoutOriginalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, name) { const request = window.layoutOriginalPut.call(this, value, name); if (name === k) { window.layoutAbortTriggered = true; queueMicrotask(() => this.transaction.abort()); } return request; }; }, key);
  try { await confirmRecovery(true); } finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.layoutOriginalPut; }); }
  assert.equal(await page.evaluate(() => window.layoutAbortTriggered), true);
  const aborted = await page.evaluate(async k => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('dshome-workspace-layouts', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readonly'), store = tx.objectStore('records'), primary = store.get(k), backups = store.getAllKeys(IDBKeyRange.bound(k + ':recovery:', k + ':recovery:\uffff')); tx.oncomplete = () => resolve({ primary: primary.result !== undefined, backups: backups.result.length }); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
  }, key);
  assert.deepEqual(aborted, { primary: false, backups: 0 }); assert.equal(await page.evaluate(k => localStorage.getItem(k), key), rawOriginal);
  await confirmRecovery(true);
  await region.waitFor({ state: 'detached' });
  const backup = await page.evaluate(() => { const c = window.testNative.controller(); return { json: c.exportLayoutBackup(), key: c.getSnapshot().layoutBackupKey }; });
  assert.equal(JSON.parse(backup.json).raw, rawOriginal); assert.equal(await page.evaluate(k => localStorage.getItem(k), key), rawOriginal, 'legacy source remains untouched');
  const peer = await page.context().newPage();
  try {
    await peer.goto(new URL('/layout-storage-peer', url).href); await peer.evaluate(id => window.openLayoutPeer(id), projectId);
    const readPeer = () => peer.evaluate(async () => { await window.layoutPeer.persistence.refresh(); return window.layoutPeer.persistence.read().raw; });
    assert.equal(await peer.evaluate(() => JSON.parse(window.layoutPeer.persistence.readBackup(window.layoutPeer.persistence.read().backupKey)).raw), rawOriginal);
    const extra = await page.evaluate(() => window.testNative.controller().model.addPanel('web'));
    // Hold a REAL Web Lock, enqueue peer then main, and observe both pending
    // requests before releasing. No sleep, fake mutex or read/check/set race.
    await peer.evaluate(k => { window.layoutHeld = navigator.locks.request(k, () => new Promise(resolve => { window.layoutUnlock = resolve; window.layoutLocked = true; })); }, key);
    await peer.waitForFunction(() => window.layoutLocked);
    await peer.evaluate(() => { const p = window.layoutPeer; window.peerSave = p.persistence.save(p.model.serialize(), p.before.revision, { expectedRaw: p.before.raw }); });
    await peer.waitForFunction(async k => (await navigator.locks.query()).pending.filter(p => p.name === k).length === 1, key);
    await page.evaluate(() => { window.layoutMainSave = window.testNative.controller().saveLayout().then(receipt => ({ unexpectedSuccess: receipt }), e => e.code); });
    await peer.waitForFunction(async k => (await navigator.locks.query()).pending.filter(p => p.name === k).length === 2, key);
    await peer.evaluate(() => window.layoutUnlock());
    const winner = await peer.evaluate(() => window.peerSave); assert.equal(winner.ok, true); assert.equal(await page.evaluate(() => window.layoutMainSave), 'LAYOUT_CONFLICT');
    await region.waitFor(); let peerRaw = await readPeer();
    const localBefore = await page.evaluate(() => window.testNative.controller().model.serialize());
    await region.getByRole('button', { name: '保留当前布局，采用存储基线' }).click(); await region.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate(() => window.testNative.controller().model.serialize()), localBefore); assert.equal(await readPeer(), peerRaw);
    await page.getByRole('button', { name: '检查布局存储', exact: true }).click(); await region.waitFor();
    await peer.evaluate(async () => { const p = window.layoutPeer; await p.persistence.refresh(); const before = p.persistence.read(); const incoming = p.model.serialize(); incoming.panels['DOC-01'].title = '远端更新布局'; const result = await p.persistence.save(incoming, before.revision, { expectedRaw: before.raw }); if (!result.ok) throw Error(result.error); });
    assert.equal(await page.evaluate(async () => { try { await window.testNative.controller().resolveLayoutRecovery('use-stored'); return 'unexpected success'; } catch (e) { return e.code; } }), 'LAYOUT_CONFLICT');
    peerRaw = await readPeer();
    await page.evaluate(() => window.testNative.controller().model.maximize('DOC-01'));
    assert.equal(await region.getByRole('button', { name: '采用存储布局，不关闭内容' }).isDisabled(), true); assert.equal(await region.getByRole('button', { name: '备份原件并保存当前布局' }).isDisabled(), true);
    await page.evaluate(() => window.testNative.controller().model.maximize('DOC-01'));
    const previous = await page.evaluate(() => window.testNative.controller().getSnapshot().layoutRecovery.id);
    await region.getByRole('button', { name: '重新检查布局', exact: true }).click();
    await page.waitForFunction(previous => { const s = window.testNative.controller().getSnapshot(); return s.layoutRecovery?.id > previous && !s.savingLayout; }, previous);
    await page.screenshot({ path: 'test-output/workspace-layout-comparison.png', fullPage: true });
    await region.getByRole('button', { name: '采用存储布局，不关闭内容' }).click(); await region.waitFor({ state: 'detached' });
    assert.equal(await readPeer(), peerRaw);
    assert.equal(await page.evaluate(id => window.testNative.controller().model.getSnapshot().layout.collapsed.some(p => p.panelId === id), extra), true);
    const kept = await page.evaluate(() => { const c = window.testNative.controller(), before = window.layoutIdentities, doc = c.contents.get('DOC-01').document; return {
      editor: before.editor === document.querySelector('textarea.wb-editor'), frame: before.frame === document.querySelector('iframe[data-wb-iframe]'), terminal: before.terminal === document.querySelector('.xterm-screen'), input: before.input === document.querySelector('#fixture-composer [contenteditable=true]'), document: before.doc === doc, view: before.view === c.contents.get('TERM-01').view,
      text: doc.getSnapshot().text, start: doc.getSnapshot().selectionStart, end: doc.getSnapshot().selectionEnd, draft: window.testNative.reference.input().state.getSnapshot().draft, terminalId: c.contents.get('TERM-01').view.id }; });
    for (const field of ['editor', 'frame', 'terminal', 'input', 'document', 'view']) assert.equal(kept[field], true, field);
    assert.equal(kept.text, stateBefore.text); assert.equal(kept.start, stateBefore.start); assert.equal(kept.end, stateBefore.end); assert.equal(kept.draft, stateBefore.draft); assert.equal(kept.terminalId, stateBefore.terminal);
    await page.getByRole('button', { name: '保存布局', exact: true }).click(); await page.waitForFunction(() => !window.testNative.controller().getSnapshot().savingLayout);
    const saved = JSON.parse(await readPeer()); assert.ok(saved.project.panels[extra]); assert.equal(JSON.stringify(saved).includes('原生组件长文档'), false);
    const cold = await peer.evaluate(id => window.probeLayoutPersistence(id), projectId); assert.deepEqual(JSON.parse(cold.raw), saved); assert.equal(JSON.parse(cold.backup).raw, rawOriginal); assert.equal(cold.outsideRejected, true);
    const neighbor = await peer.evaluate(id => window.probeLayoutPersistence(id + '-neighbor'), projectId); assert.equal(neighbor.kind, 'empty'); assert.equal(neighbor.outsideRejected, true); assert.equal(await readPeer(), cold.raw);
    assert.deepEqual(await readFile(join(root, 'a.md')), diskBefore);
    await page.getByRole('combobox', { name: '布局预设', exact: true }).selectOption('development');
    await page.screenshot({ path: 'test-output/workspace-layout-restored.png', fullPage: true });
    return { corruptOriginalExportedLosslessly: true, declinedRecoveryDidNotWrite: true, verifiedBackupBeforeReplacement: true, actualTransactionAbortRolledBackBothRecords: true, freshDatabaseBeforeAdoption: true, realCrossPageWebLocks: true, indexedDBTransactionAuthority: true, legacyOriginalUntouched: true, peerWonMainRefused: true, explicitBaselineNoWrite: true, staleChoiceDisabled: true, adoptedStoredWithoutWritingOrClosing: true, missingLivePanelCollapsed: true, sameDocumentIframeXtermNativeInput: true, diskBytesRetained: true, coldReadRestoredSavedGraphAndBackup: true, adjacentProjectIsolated: true };
  } finally { if (!peer.isClosed()) { await peer.evaluate(() => window.layoutUnlock?.()).catch(() => {}); await peer.close(); } }
}
