import assert from 'node:assert/strict'; import { writeFile } from 'node:fs/promises';
export async function assertNativeUpdateBlocked({ page, metrics, phase, field }) {
  const before = { ...metrics };
  await page.evaluate(() => { const api = window.__dshomePluginWorkbench, c = api.workspace('A'); window.updateBefore = { api, c, doc: c.content('DOC-01').document, text: c.content('DOC-01').document.getSnapshot().text, view: c.content('TERM-01').view, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), xterm: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]'), config: window.testNative.product.config }; });
  await page.evaluate(async () => { window.testNative.product.update({ attemptedWorkbenchUpdate: 'must-not-apply' }); await window.testNative.product.await(); });
  await page.waitForFunction(() => !!window.__dshomePluginWorkbench); await page.evaluate(() => window.__dshomePluginWorkbench.ready);
  const state = await page.evaluate(() => { const p = window.updateBefore, api = window.__dshomePluginWorkbench, c = api.workspace('A'); return { sameApi: api === p.api, sameController: c === p.c, sameEditor: document.querySelector('textarea.wb-editor') === p.editor, sameFrame: document.querySelector('iframe[data-wb-iframe]') === p.frame, sameXterm: document.querySelector('.xterm-screen') === p.xterm, sameInput: document.querySelector('#fixture-composer [contenteditable=true]') === p.input, sameText: c ? c.content('DOC-01').document.getSnapshot().text === p.text : false, sameView: c ? c.content('TERM-01').view === p.view : false, lastUpdate: p.api.status().lastUpdate, previousReload: p.api.checkReload?.(), configAdopted: window.testNative.product.config?.attemptedWorkbenchUpdate === 'must-not-apply', reload: api.checkReload?.(), phase: c?.content('TERM-01').view.state.getSnapshot().phase }; });
  await writeFile('test-output/update-guard-' + phase + '-observed.json', JSON.stringify({ ...state, before, after: { ...metrics } }, null, 2));
  for (const key of ['sameApi','sameController','sameEditor','sameFrame','sameXterm','sameInput','sameText','sameView']) assert.equal(state[key], true, phase + ': ' + key);
  assert.equal(state.configAdopted, false); assert.equal(state.reload.allowed, false); assert.ok(state.reload[field] > 0, field); assert.equal(metrics.spawn, before.spawn); assert.equal(metrics.close, before.close); assert.equal(metrics.terminate, before.terminate); assert.equal(metrics.activeRetains, before.activeRetains);
  await page.getByRole('status').filter({ hasText: '工作台更新已暂缓' }).first().waitFor();
  return { phase, actualPublicFiberUpdateVetoed: true, ...state };
}
export async function runNativeUpdateGuard({ page, metrics }) {
  const blocked = await assertNativeUpdateBlocked({ page, metrics, phase: 'dirty', field: 'dirty' });
  const unrelated = await page.evaluate(async () => { let loads = 0; const fiber = window.testNative.ctx.plugin(() => { loads++; }); await fiber; fiber.update({ unrelated: true }); await fiber.await(); await fiber.dispose(); return loads; }); assert.equal(unrelated, 2);
  await page.screenshot({ path: 'test-output/workspace-update-blocked.png', fullPage: true });
  return { blocked, unrelatedFiberUpdateUnaffected: true, exclusions: ['only public Cordis Fiber.update waterfall; production HMR receiver path not certified', 'restart/dispose/dependency loss/browser refresh do not run this veto and remain outside its protection'] };
}
export async function assertNativeCleanUpdate({ page }) {
  await page.evaluate(async () => { const c = window.testNative.controller(); for (const item of c.contents.values()) if (item.document?.getSnapshot().dirty) await item.document.save(); window.testNative.ctx.sidebarRight.close(window.testNative.ctx.sidebarRight.active().id); });
  await page.waitForFunction(() => window.__dshomePluginWorkbench.checkReload().allowed);
  await page.evaluate(async () => { window.cleanUpdatePreviousApi = window.__dshomePluginWorkbench; window.cleanUpdateInput = document.querySelector('#fixture-composer [contenteditable=true]'); window.testNative.product.update({ cleanWorkbenchUpdate: true }); await window.testNative.product.await(); });
  await page.waitForFunction(() => window.__dshomePluginWorkbench && window.__dshomePluginWorkbench !== window.cleanUpdatePreviousApi); const readiness = await page.evaluate(() => window.__dshomePluginWorkbench.ready); assert.equal(readiness.ok, true); assert.equal(await page.evaluate(() => window.testNative.product.config.cleanWorkbenchUpdate), true);
  assert.equal(await page.evaluate(() => window.cleanUpdateInput === document.querySelector('#fixture-composer [contenteditable=true]')), true);
  return { explicitCloseAndConfirmedWritesAllowActualFiberUpdate: true, nativeInputNotRemountedByAllowedUpdate: true };
}
