import assert from 'node:assert/strict';
import { mkdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function runNativeProjectShelf({ page, root, session, handles, metrics, pid }) {
  const bRoot = join(root, 'project-B'), aKey = pathToFileURL(root).href, bKey = pathToFileURL(bRoot).href;
  await mkdir(bRoot); await writeFile(join(bRoot, 'a.md'), '\ufeffproject B\r\n');
  const aPane = page.locator('[data-workspace-project=' + JSON.stringify(aKey) + ']'), bPane = page.locator('[data-workspace-project=' + JSON.stringify(bKey) + ']');
  const beforeDisk = await readFile(join(root, 'a.md')), form = await page.frameLocator('iframe[data-wb-iframe="WEB-01"]').getByRole('textbox').inputValue(), initialSpawn = metrics.spawn;
  const readLayouts = () => page.evaluate(async ({ a, b }) => { const db = await new Promise((resolve, reject) => { const request = indexedDB.open('dshome-workspace-layouts', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); try { return await new Promise((resolve, reject) => { const tx = db.transaction('records', 'readonly'), store = tx.objectStore('records'), ar = store.get('dshome.workspace.v1:' + encodeURIComponent(a)), br = store.get('dshome.workspace.v1:' + encodeURIComponent(b)); tx.oncomplete = () => resolve({ a: ar.result ?? null, b: br.result ?? null }); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }, { a: aKey, b: bKey });
  const originalLayouts = await readLayouts();
  const before = await page.evaluate(() => { const c = window.testNative.controller(), doc = c.content('DOC-01').document; window.shelfA = { c, doc, frame: document.querySelector('iframe[data-wb-iframe]'), editor: document.querySelector('textarea.wb-editor'), xterm: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]') }; return { text: doc.getSnapshot().text, start: doc.getSnapshot().selectionStart, end: doc.getSnapshot().selectionEnd, draft: window.testNative.reference.input().state.getSnapshot().draft }; });
  try {
    session.header.cwd = bRoot;
    await page.getByRole('button', { name: '检查 Host 项目', exact: true }).click();
    await page.waitForFunction(key => { const s = window.__dshomePluginWorkbench.projects('A'); return s.observed?.key === key && !s.busy; }, bKey);
    assert.equal(await page.evaluate(() => window.testNative.controller() === window.shelfA.c), true);
    await aPane.getByRole('button', { name: '刷新目录', exact: true }).click();
    await aPane.getByRole('alert').filter({ hasText: '工作区已变化' }).waitFor();
    const cancelledDialog = page.waitForEvent('dialog'), cancelledClose = page.getByRole('button', { name: '关闭所选项目', exact: true }).click(); await (await cancelledDialog).dismiss(); await cancelledClose;
    assert.equal(await page.evaluate(() => window.testNative.controller() === window.shelfA.c && window.shelfA.doc.getSnapshot().dirty), true); process.kill(pid, 0);
    await page.getByRole('button', { name: '打开 Host 当前项目', exact: true }).click();
    await page.waitForFunction(key => { const s = window.__dshomePluginWorkbench.projects('A'); return s.selected === key && s.projects.length === 2 && !s.busy; }, bKey);
    await bPane.getByRole('button', { name: '▧ a.md', exact: true }).click();
    await page.waitForFunction(() => window.testNative.controller().content('DOC-01').document?.getSnapshot().phase === 'ready');
    await bPane.locator('textarea.wb-editor').fill('project B saved only here\n'); await bPane.getByRole('button', { name: '保存文件', exact: true }).click();
    await page.waitForFunction(() => { const s = window.testNative.controller().content('DOC-01').document.getSnapshot(); return !s.dirty && s.phase === 'ready'; });
    assert.deepEqual(await readFile(join(root, 'a.md')), beforeDisk); assert.equal(await readFile(join(bRoot, 'a.md'), 'utf8'), 'project B saved only here\r\n');
    await bPane.getByRole('button', { name: '启动终端', exact: true }).click();
    await page.waitForFunction(() => window.testNative.controller().content('TERM-01').view?.state.getSnapshot().phase === 'connected');
    assert.equal(metrics.spawn - initialSpawn, 1);
    await page.evaluate(() => window.testNative.controller().content('TERM-01').view.write("printf 'PROJECT_B_PID:%s\\n' \"$$\"\r"));
    await page.waitForFunction(key => /PROJECT_B_PID:\d+/.test(document.querySelector('[data-retained-project=\"' + key + '\"] .xterm-screen')?.textContent ?? ''), bKey);
    const bPid = Number((await bPane.locator('.xterm-screen').textContent()).match(/PROJECT_B_PID:(\d+)/)[1]); assert.equal(await readlink('/proc/' + bPid + '/cwd'), bRoot); assert.equal(await readlink('/proc/' + pid + '/cwd'), root);
    assert.equal(await page.evaluate(() => window.testNative.controller().content('TERM-01').view.state.getSnapshot().info.cwd), bRoot);
    await page.evaluate(() => { const c = window.testNative.controller(); window.shelfB = { c, doc: c.content('DOC-01').document, editor: document.querySelector('[data-retained-project="' + c.projectId + '"] textarea.wb-editor'), xterm: document.querySelector('[data-retained-project="' + c.projectId + '"] .xterm-screen') }; c.model.collapse('FILE-01'); });
    await bPane.getByRole('button', { name: '保存布局', exact: true }).click(); await page.waitForFunction(() => !window.testNative.controller().getSnapshot().savingLayout);
    const stored = await readLayouts(); assert.equal(stored.a, originalLayouts.a); assert.ok(JSON.parse(stored.b).project.layout.collapsed.some(x => x.panelId === 'FILE-01'));
    for (let i = 0; i < 6; i++) { await page.getByRole('combobox', { name: '保留项目', exact: true }).selectOption(aKey); await page.getByRole('combobox', { name: '保留项目', exact: true }).selectOption(bKey); }
    const same = await page.evaluate(() => { const a = window.shelfA, b = window.shelfB; return { aEditor: a.editor === document.querySelector('[data-retained-project="' + a.c.projectId + '"] textarea.wb-editor'), aFrame: a.frame === document.querySelector('iframe[data-wb-iframe]'), aTerminal: a.xterm === document.querySelector('[data-retained-project="' + a.c.projectId + '"] .xterm-screen'), bEditor: b.editor === document.querySelector('[data-retained-project="' + b.c.projectId + '"] textarea.wb-editor'), bTerminal: b.xterm === document.querySelector('[data-retained-project="' + b.c.projectId + '"] .xterm-screen'), input: a.input === document.querySelector('#fixture-composer [contenteditable=true]'), text: a.doc.getSnapshot().text, start: a.doc.getSnapshot().selectionStart, end: a.doc.getSnapshot().selectionEnd, draft: window.testNative.reference.input().state.getSnapshot().draft }; });
    for (const field of ['aEditor','aFrame','aTerminal','bEditor','bTerminal','input']) assert.equal(same[field], true, field);
    for (const field of ['text','start','end','draft']) assert.equal(same[field], before[field], field);
    assert.equal(metrics.spawn - initialSpawn, 1); assert.equal(await page.frameLocator('iframe[data-wb-iframe="WEB-01"]').getByRole('textbox').inputValue(), form);
    await page.screenshot({ path: 'test-output/workspace-project-B.png', fullPage: true });
    session.header.cwd = root;
    await page.getByRole('button', { name: '检查 Host 项目', exact: true }).click(); await page.waitForFunction(() => !window.__dshomePluginWorkbench.projects('A').busy);
    await page.getByRole('combobox', { name: '保留项目', exact: true }).selectOption(aKey);
    assert.equal(await page.evaluate(() => window.testNative.controller() === window.shelfA.c), true);
    await page.screenshot({ path: 'test-output/workspace-project-A-retained.png', fullPage: true });
    await page.getByRole('combobox', { name: '保留项目', exact: true }).selectOption(bKey);
    const beforeBStop = { close: metrics.close, terminate: metrics.terminate };
    const reply = page.waitForResponse(r => r.url().endsWith('/fixture-rpc') && r.request().postDataJSON()?.endpoint?.endsWith('terminal/close'));
    const dialog = page.waitForEvent('dialog'), click = bPane.getByRole('button', { name: '关闭 TERM-01', exact: true }).click(); await (await dialog).accept(); await click;
    assert.equal((await (await reply).json()).ok, true); await handles.at(-1).done; assert.equal(metrics.close - beforeBStop.close, 1); assert.equal(metrics.terminate - beforeBStop.terminate, 1);
    await page.getByRole('button', { name: '关闭所选项目', exact: true }).click();
    await page.waitForFunction(key => { const s = window.__dshomePluginWorkbench.projects('A'); return s.projects.length === 1 && s.selected === key; }, aKey);
    assert.equal(await page.evaluate(() => window.testNative.controller() === window.shelfA.c), true); process.kill(pid, 0);
    assert.equal(await aPane.locator('textarea.wb-editor').inputValue(), before.text.replace(/\r\n?/g, '\n'));
    const nativeDialog = page.waitForEvent('dialog'); const guardedClose = page.evaluate(() => { const right = window.testNative.ctx.sidebarRight; try { right.close(right.active().id); return { blocked: false }; } catch (error) { return { blocked: true, message: error.message }; } }); await (await nativeDialog).dismiss(); const blocked = await guardedClose; assert.equal(blocked.blocked, true); assert.match(blocked.message, /未保存/); assert.equal(await page.evaluate(() => window.testNative.controller() === window.shelfA.c && window.shelfA.doc.getSnapshot().dirty), true);
    return { checkDidNotRebind: true, cancelledClosePreservedDraftAndPty: true, cancelledNativeCloseKeptWorkspace: true, bothKernelProcessCwdsVerified: true, staleDirectoryRefused: true, explicitTwoProjects: true, separateFilesAndLayouts: true, twelveSelectionsSameDom: true, originalDraftSelectionFormNativeInputRetained: true, secondRealPtyInitialCwd: bRoot, originalPtyStillAliveAfterClosingB: true, retainedProjectCountAfterBClosed: 1,
      exclusions: ['Host Session/cwd sources and outer frame remain fixtures', 'selecting retained projects does not change Host cwd; startup binding is covered separately by the scope-race regressions', 'dependency reconnect and dirty HMR recovery remain untested'] };
  } finally { session.header.cwd = root; }
}
