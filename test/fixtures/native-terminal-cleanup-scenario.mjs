import assert from 'node:assert/strict';
export async function runNativeTerminalCleanup({ page, handles, metrics, fault, originalPid, onUnconfirmed }) {
  const before = await page.evaluate(() => { const c = window.testNative.controller(); window.cleanupProbe = { c, doc: c.content('DOC-01').document, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), xterm: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]') }; return { text: window.cleanupProbe.doc.getSnapshot().text, start: window.cleanupProbe.doc.getSnapshot().selectionStart }; });
  const start = async id => {
    await page.evaluate(id => window.testNative.controller().model.addPanel('terminal', { id }), id);
    const pane = page.locator('[data-wb-content="' + id + '"]'); await pane.getByRole('button', { name: '启动终端', exact: true }).click();
    await page.waitForFunction(id => window.testNative.controller().content(id).view?.state.getSnapshot().phase === 'connected', id);
    await page.evaluate(id => window.testNative.controller().content(id).view.write("printf 'CLEANUP_PID:%s\\n' \"$$\"\r"), id);
    await page.waitForFunction(id => /CLEANUP_PID:\d+/.test(document.querySelector('[data-wb-content="' + id + '"] .xterm-screen')?.textContent ?? ''), id);
    const pid = Number((await pane.locator('.xterm-screen').textContent()).match(/CLEANUP_PID:(\d+)/)[1]);
    const terminalId = await page.evaluate(id => window.testNative.controller().content(id).view.id, id); return { pane, pid, terminalId, handle: handles.at(-1) };
  };
  const close = async (pane, id) => { const dialog = page.waitForEvent('dialog'), click = pane.getByRole('button', { name: '关闭 ' + id, exact: true }).click(); await (await dialog).accept(); await click; };
  const assertBlocked = async () => { const result = await page.evaluate(() => { const c = window.testNative.controller(), right = window.testNative.ctx.sidebarRight; const project = c.closeWorkspace(); try { right.close(right.active().id); return { project, nativeBlocked: false }; } catch { return { project, nativeBlocked: true }; } }); assert.equal(result.project, false); assert.equal(result.nativeBlocked, true); };
  const retry = async terminalId => { const response = page.waitForResponse(r => r.url().endsWith('/fixture-rpc') && r.request().postDataJSON()?.endpoint === 'terminal/close'); await page.getByRole('button', { name: '重试关闭 ' + terminalId, exact: true }).click(); assert.equal((await (await response).json()).ok, true); await page.waitForFunction(() => window.testNative.controller().getSnapshot().terminalCleanup.requests.length === 0); };
  const first = await start('TERM-CLOSE-FAIL'); fault.handle = first.handle; fault.terminalId = first.terminalId; fault.enabled = true; fault.closeRequests = 0;
  const closeBefore = metrics.close, spawnBefore = metrics.spawn;
  await close(first.pane, 'TERM-CLOSE-FAIL');
  await page.locator('[data-close-terminal="' + first.terminalId + '"][role=alert]').waitFor(); assert.equal(fault.closeRequests, 1); assert.equal(metrics.closed < metrics.close, true);
  assert.equal(await page.locator('[data-wb-content="TERM-CLOSE-FAIL"]').count(), 0); process.kill(first.pid, 0); process.kill(originalPid, 0); await assertBlocked();
  await onUnconfirmed?.();
  await page.screenshot({ path: 'test-output/workspace-terminal-close-failed.png', fullPage: true });
  await retry(first.terminalId); await first.handle.done; assert.equal(fault.closeRequests, 2); assert.equal(metrics.close - closeBefore, 2); assert.equal(metrics.spawn, spawnBefore); assert.throws(() => process.kill(first.pid, 0), { code: 'ESRCH' }); process.kill(originalPid, 0);
  fault.enabled = false; fault.handle = null; fault.terminalId = null;
  const second = await start('TERM-CLOSE-LOST'), loss = Promise.withResolvers(), release = Promise.withResolvers(); let lost = false;
  const routeHandler = async route => { const body = route.request().postDataJSON(); if (lost || body?.endpoint !== 'terminal/close' || body.payload?.args?.id !== second.terminalId) return route.continue(); lost = true; const reply = await (await route.fetch()).json(); assert.equal(reply.ok, true); loss.resolve(); await release.promise; await route.abort('failed'); };
  await page.route('**/fixture-rpc', routeHandler);
  try {
    await close(second.pane, 'TERM-CLOSE-LOST'); await loss.promise; await second.handle.done;
    assert.equal(await page.evaluate(() => window.testNative.controller().getSnapshot().terminalCleanup.requests[0].phase), 'pending'); await assertBlocked(); await onUnconfirmed?.();
    release.resolve(); await page.locator('[data-close-terminal="' + second.terminalId + '"][role=alert]').waitFor(); assert.throws(() => process.kill(second.pid, 0), { code: 'ESRCH' }); await assertBlocked();
    await onUnconfirmed?.();
    await page.screenshot({ path: 'test-output/workspace-terminal-close-unknown.png', fullPage: true });
    const terminations = metrics.terminate; await retry(second.terminalId); assert.equal(metrics.terminate, terminations); process.kill(originalPid, 0);
  } finally { release.resolve(); await page.unroute('**/fixture-rpc', routeHandler); fault.enabled = false; }
  const after = await page.evaluate(() => { const p = window.cleanupProbe; return { c: window.testNative.controller() === p.c, doc: p.c.content('DOC-01').document === p.doc, editor: document.querySelector('textarea.wb-editor') === p.editor, frame: document.querySelector('iframe[data-wb-iframe]') === p.frame, xterm: document.querySelector('.xterm-screen') === p.xterm, input: document.querySelector('#fixture-composer [contenteditable=true]') === p.input, text: p.doc.getSnapshot().text, start: p.doc.getSnapshot().selectionStart }; });
  for (const key of ['c','doc','editor','frame','xterm','input']) assert.equal(after[key], true, key); assert.equal(after.text, before.text); assert.equal(after.start, before.start);
  return { failedCloseActuallyLeavesProcessAlive: true, uiPersistsAfterPanelRemoval: true, nativeAndProjectCloseBlockedUntilAck: true, manualSdkRetryEndsOnlyTargetProcess: true, successfulCloseLostAckRemainsUnknown: true, idempotentRetryDidNotTerminateAgain: true, sameEditorIframeOriginalPtyNativeInput: true, exclusions: ['termination refusal and lost reply are explicit fixture injections', 'SDK runtime/PTY/close queue are actual; production authorization and HMR/idle recovery remain untested'] };
}
