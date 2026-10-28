import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
export async function runNativeHmrScenario({ page, metrics, sendHmr, childURL, closeOwnedTerminal, original, readHostSource }) {
  const modes = page.getByRole('group', { name: '界面模式', exact: true }); await modes.waitFor();
  await modes.getByRole('button', { name: '工作台', exact: true }).click(); await page.locator('.dshome-v2:visible').waitFor();
  await page.locator('[data-wb-content="FILE-01"]:visible').getByRole('button', { name: '▧ a.md', exact: true }).click();
  const editor = page.locator('textarea.wb-editor:visible'); await editor.waitFor(); await editor.press('Control+End'); await page.keyboard.insertText('HMR 未保存草稿 😀');
  const web = page.locator('[data-wb-content="WEB-01"]:visible'); await web.locator('input').fill(childURL); await web.getByRole('button', { name: '前往', exact: true }).click();
  await page.frameLocator('iframe[data-wb-iframe]').getByRole('textbox', { name: '未提交表单' }).fill('HMR 前的网页表单');
  const terminal = page.locator('[data-wb-content="TERM-01"]:visible'); await terminal.getByRole('button', { name: '启动终端', exact: true }).click();
  await page.waitForFunction(() => window.testNative.controller().content('TERM-01').view?.state.getSnapshot().phase === 'connected');
  await page.evaluate(() => window.testNative.controller().content('TERM-01').view.write("printf 'HMR_PID:%s\\n' \"$$\"\r"));
  await page.waitForFunction(() => /HMR_PID:\d+/.test(document.querySelector('.xterm-screen')?.textContent ?? ''));
  const pid = Number((await page.locator('.xterm-screen').textContent()).match(/HMR_PID:(\d+)/)[1]); process.kill(pid, 0);
  const before = await page.evaluate(() => { const c = window.testNative.controller(); window.hmrProbe = { api: window.__dshomePluginWorkbench, c, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), input: document.querySelector('[data-lexical-editor=true]'), doc: c.content('DOC-01').document, draft: window.testNative.reference.input().state.getSnapshot().draft };
    return { fiber: window.testNative.hmr.entry.fiber.uid, terminalId: c.content('TERM-01').view.id, raw: window.hmrProbe.doc.getSnapshot().text, reload: window.hmrProbe.api.checkReload() }; });
  assert.equal(before.reload.allowed, false); assert.equal(before.reload.dirty, 1); assert.equal(metrics.activeRetains, 1);
  assert.equal(await page.evaluate(() => window.__hmrNodeFallbackCalls), 0);
  assert.equal(await page.evaluate(() => window.__dshomePluginWorkbench.status().lifecycle.codeReplacement), 'not-preserved');
  await page.locator('.wb-lifecycle-help:visible summary').click(); assert.ok((await page.locator('.wb-lifecycle-help:visible').innerText()).includes('不能从布局恢复'));
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出草稿', exact: true }).click(); const download = await downloadEvent; await download.saveAs('test-output/workspace-hmr-exported-draft.md');
  const exported = await readFile('test-output/workspace-hmr-exported-draft.md', 'utf8'); assert.equal(exported, before.raw); assert.ok(exported.startsWith('\ufeff')); assert.ok(exported.includes('\r\n'));
  await page.screenshot({ path: 'test-output/workspace-hmr-before.png', fullPage: true });
  // Send a genuine SSE rebuilt frame to the actual SDK receiver, not a call to
  // product.teardown, Fiber.update, a test copy of replace(), or fake retain data.
  await sendHmr({ type: 'rebuilt', id: 'dshome-plugin', rev: 'owned-rebuilt-2' });
  await page.waitForFunction(uid => { const h = window.testNative.hmr; return h.entry.fiber?.uid !== uid && !h.system.entries.state.getSnapshot().syncing && window.__dshomePluginWorkbench && window.__dshomePluginWorkbench !== window.hmrProbe.api; }, before.fiber);
  const after = await page.evaluate(() => { const p = window.hmrProbe, h = window.testNative.hmr; return { fiber: h.entry.fiber.uid, state: h.system.entries.state.getSnapshot(), apiReplaced: p.api !== window.__dshomePluginWorkbench, editorConnected: p.editor.isConnected, frameConnected: p.frame.isConnected, inputSame: p.input === document.querySelector('[data-lexical-editor=true]'), chatDraftSame: p.draft === window.testNative.reference.input().state.getSnapshot().draft, controllerRestored: window.testNative.controller() === p.c, oldLastUpdate: p.api.status().lastUpdate, observations: h.observations }; });
  assert.deepEqual(after.state.failures, []); assert.equal(after.apiReplaced, true); assert.equal(after.editorConnected, false); assert.equal(after.frameConnected, false); assert.equal(after.inputSame, true); assert.equal(after.chatDraftSame, true); assert.equal(after.controllerRestored, false);
  await page.waitForFunction(() => window.__dshomePluginWorkbench?.status().reason === '');
  assert.equal(metrics.activeRetains, 0); const kernelAliveAfterDetach = (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
  await sendHmr({ type: 'rebuilt', id: 'dshome-plugin', rev: 'owned-rebuilt-2' });
  const barrier = await page.evaluate(() => window.testNative.hmr.graph('owned-rebuilt-2')); await sendHmr({ type: 'graph', graph: barrier });
  await page.waitForFunction(rev => window.testNative.hmr.system.manifest.rev === rev && !window.testNative.hmr.system.entries.state.getSnapshot().syncing, barrier.rev);
  assert.equal(await page.evaluate(() => window.testNative.hmr.entry.fiber.uid), after.fiber, 'same revision must not remount again before the serial graph barrier');
  await closeOwnedTerminal(before.terminalId); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  await modes.getByRole('button', { name: '工作台', exact: true }).click(); await page.locator('.dshome-v2:visible').waitFor();
  const restoredDocument = await page.evaluate(() => window.testNative.controller().content('DOC-01').document?.getSnapshot()); assert.equal(restoredDocument, undefined);
  await page.screenshot({ path: 'test-output/workspace-hmr-after.png', fullPage: true });
  const removal = await page.evaluate(() => window.testNative.hmr.graph('owned-removed-3', false)); await sendHmr({ type: 'graph', graph: removal });
  await page.waitForFunction(rev => { const h = window.testNative.hmr; return h.system.manifest.rev === rev && !h.system.entries.state.getSnapshot().syncing && !h.entry && window.__dshomePluginWorkbench === null; }, removal.rev);
  const removalPreservedNativeInput = await page.evaluate(() => window.hmrProbe.input === document.querySelector('[data-lexical-editor=true]')); assert.equal(removalPreservedNativeInput, true);
  const readd = await page.evaluate(() => window.testNative.hmr.graph('owned-readded-4')); await sendHmr({ type: 'graph', graph: readd });
  await page.waitForFunction(rev => { const h = window.testNative.hmr; return h.system.manifest.rev === rev && !h.system.entries.state.getSnapshot().syncing && h.entry?.fiber && window.__dshomePluginWorkbench?.status().reason === ''; }, readd.rev);
  const readded = await page.evaluate(() => ({ uid: window.testNative.hmr.entry.fiber.uid, failures: window.testNative.hmr.system.entries.state.getSnapshot().failures, nativeInputSame: window.hmrProbe.input === document.querySelector('[data-lexical-editor=true]'), nodeFallbackCalls: window.__hmrNodeFallbackCalls }));
  assert.notEqual(readded.uid, after.fiber); assert.deepEqual(readded.failures, []); assert.equal(readded.nativeInputSame, true); assert.equal(readded.nodeFallbackCalls, 0);
  assert.equal(await readHostSource(), original, 'HMR/export must not silently save the document');
  return { before: { ...before, raw: undefined }, after, barrier, removalPreservedNativeInput, readded, kernelAliveAfterDetach, rawDraftExportExact: exported === before.raw, hostSourceUnchanged: true, exclusions: ['HMR is NOT protected by Fiber.update preflight; this is an explicit destructive-path regression, not live-state recovery', 'manual exported text is verified for this BOM/CRLF/Unicode draft only; not automatic restore or an unknown-save receipt', 'module graph, SSE publisher, bootstrap seeds and no-Node platform boundary, Host identity/policy and auxiliary UI services are owned fixtures; installed SDK exports/Loader/receiver/reconciliation and real FS/PTY are not faked'] };
}
