import assert from 'node:assert/strict';
import { writeFile, readFile, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
export async function runNativeTerminalReconnect({ page, handles, metrics, root, pid }) {
  const before = { ...metrics }; let refused = false, requests = 0;
  const handler = async route => { const data = route.request().postDataJSON(); if (data?.endpoint !== 'dshomeWorkspace/createTerminal') return route.continue(); requests++; if (refused) return route.continue(); refused = true; await route.fulfill({ status: 503, body: 'fixture refuses first create before Host allocation' }); };
  await page.route('**/fixture-rpc', handler);
  try {
    await page.evaluate(() => window.testNative.controller().model.addPanel('terminal', { id: 'TERM-RETRY' })); const pane = page.locator('[data-wb-content="TERM-RETRY"]'); await pane.getByRole('button', { name: '启动终端', exact: true }).click();
    await page.waitForFunction(() => window.testNative.controller().content('TERM-RETRY').view?.state.getSnapshot().phase === 'failed');
    const initial = await page.evaluate(() => { const view = window.testNative.controller().content('TERM-RETRY').view; return { id: view.id, info: view.state.getSnapshot().info, phase: view.state.getSnapshot().phase }; }); assert.equal(initial.info, undefined); assert.equal(metrics.spawn, before.spawn);
    await pane.getByRole('button', { name: /重试启动|重新连接/, exact: true }).click();
    try { await page.waitForFunction(() => window.testNative.controller().content('TERM-RETRY').view?.state.getSnapshot().phase === 'connected', null, { timeout: 5000 }); }
    catch (error) { await writeFile('test-output/terminal-retry-old-observed.json', JSON.stringify({ initial, requests, spawnDelta: metrics.spawn - before.spawn, state: await page.evaluate(() => { const s = window.testNative.controller().content('TERM-RETRY').view.state.getSnapshot(); return { phase: s.phase, writable: s.writable, info: s.info }; }), observation: 'old connect() cannot retry a failed allocation without info; assertion still requires connected' }, null, 2)); throw error; }
    assert.equal(requests, 2); assert.equal(metrics.spawn - before.spawn, 1); assert.equal(await page.evaluate(() => window.testNative.controller().content('TERM-RETRY').view.id), initial.id);
    const response = page.waitForResponse(r => r.url().endsWith('/fixture-rpc') && r.request().postDataJSON()?.endpoint === 'terminal/close'), dialog = page.waitForEvent('dialog'), click = pane.getByRole('button', { name: '关闭 TERM-RETRY', exact: true }).click(); await (await dialog).accept(); await click; const receipt=await (await response).json();assert.equal(receipt.ok, true,JSON.stringify(receipt)); await handles.at(-1).done;
    const stream = await checkPhysicalOutage({ page, metrics, root, pid });
    return { failedCreationExplicitRetryKeepsIdentity: true, newProcessOnlyAfterExplicitRetry: true, stream, exclusions: ['Host connection generation source remains an explicit fixture; actual SDK stream supervisor, Gateway WebSockets and PTY', 'production full connection/authorization, HMR and idle expiry remain untested'] };
  } finally { await page.unroute('**/fixture-rpc', handler); }
}

async function checkPhysicalOutage({ page, metrics, root, pid }) {
  const before = { ...metrics }, marker = join(root, '.r13-output-done'), complete = Promise.withResolvers(); let timer, watcher;
  watcher = watch(root, async (_event, name) => { if (String(name) !== '.r13-output-done') return; try { if (await readFile(marker, 'utf8') === 'done') complete.resolve(); } catch {} });
  watcher.on('error', complete.reject); timer = setTimeout(() => complete.reject(Error('real shell did not produce offline output marker')), 15000);
  await page.evaluate(() => { const c = window.testNative.controller(), view = c.content('TERM-01').view; window.r13 = { c, view, id: view.id, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), xterm: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]'), doc: c.content('DOC-01').document, events: [], snapshots: [], revision: -1 }; const p = window.r13; p.text = p.doc.getSnapshot().text; p.draft = window.testNative.reference.input().state.getSnapshot().draft; p.off = view.state.subscribe(() => { const s = view.state.getSnapshot(); if (p.events.length < 200) p.events.push({ phase: s.phase, writable: s.writable }); if (s.render && s.render.revision !== p.revision) { p.revision = s.render.revision; if (s.render.frame.type === 'snapshot') p.snapshots.push(s.render.frame.screen); } }); });
  try {
    let command="printf 'R13_%s\\n' GATE_READY; while [ ! -f .r13-output-go ]; do sleep 0.02; done; for i in $(seq 1 40); do printf 'R13_GAP:%02d\\n' \"$i\"; done; printf done > .r13-output-done\r";
    if(process.platform==='win32') {
      await writeFile(join(root,'.r13-gap.cjs'),"const fs=require('node:fs');console.log('R13_GATE_READY');const t=setInterval(()=>{if(!fs.existsSync('.r13-output-go'))return;clearInterval(t);for(let i=1;i<=40;i++)console.log('R13_GAP:'+String(i).padStart(2,'0'));fs.writeFileSync('.r13-output-done','done')},20);");
      await writeFile(join(root,'.r13-pid.cjs'),"console.log('R13_PID:'+process.ppid);");
      command='"'+process.execPath+'" ".r13-gap.cjs"\r';
    }
    await page.evaluate(command=>window.r13.view.write(command),command);
    await page.waitForFunction(() => document.querySelector('.xterm-screen')?.textContent.includes('R13_GATE_READY'));
    await page.evaluate(() => window.testNative.transport.pauseStreams());
    await page.waitForFunction(() => { const s = window.r13.view.state.getSnapshot(); return s.phase === 'disconnected' && !s.writable; });
    const field = page.locator('[data-wb-content="TERM-01"] .xterm-helper-textarea'); await page.waitForFunction(() => document.querySelector('[data-wb-content="TERM-01"] .xterm-helper-textarea')?.getAttribute('aria-disabled') === 'true');
    await field.focus(); await page.keyboard.type("echo bad > .r13-replayed"); await page.keyboard.press('Enter');
    await writeFile(join(root, '.r13-output-go'), 'go'); await complete.promise; assert.equal(await readFile(marker, 'utf8'), 'done'); process.kill(pid, 0);
    assert.equal(metrics.spawn, before.spawn); assert.equal(metrics.terminate, before.terminate); assert.equal(metrics.close, before.close);
    await page.screenshot({ path: 'test-output/workspace-terminal-disconnected.png', fullPage: true });
    await page.evaluate(() => window.testNative.transport.resumeStreams());
    await page.waitForFunction(() => window.r13.view.state.getSnapshot().phase === 'connected' && window.r13.view.state.getSnapshot().writable);
    await page.waitForFunction(() => document.querySelector('.xterm-screen')?.textContent.includes('R13_GAP:40'));
    await page.evaluate(command => window.r13.view.write(command),process.platform==='win32'?'"'+process.execPath+'" ".r13-pid.cjs"\r':"printf 'R13_PID:%s\\n' \"$$\"\r"); await page.waitForFunction(pid => document.querySelector('.xterm-screen')?.textContent.includes('R13_PID:' + pid), pid);
    await assert.rejects(access(join(root, '.r13-replayed')), { code: 'ENOENT' });
    const state = await page.evaluate(() => { const p = window.r13, s = p.view.state.getSnapshot(); return { sameController: window.testNative.controller() === p.c, sameView: p.c.content('TERM-01').view === p.view, id: p.view.id, sameEditor: document.querySelector('textarea.wb-editor') === p.editor, sameFrame: document.querySelector('iframe[data-wb-iframe]') === p.frame, sameXterm: document.querySelector('.xterm-screen') === p.xterm, sameInput: document.querySelector('#fixture-composer [contenteditable=true]') === p.input, sameDoc: p.c.content('DOC-01').document === p.doc && p.doc.getSnapshot().text === p.text, sameDraft: window.testNative.reference.input().state.getSnapshot().draft === p.draft, phase: s.phase, writable: s.writable, readonly: p.xterm.parentElement.querySelector('textarea')?.getAttribute('aria-disabled'), events: p.events, snapshotsContainOfflineOutput: p.snapshots.some(text => text.includes('R13_GAP:01') && text.includes('R13_GAP:40')) }; });
    for (const key of ['sameController','sameView','sameEditor','sameFrame','sameXterm','sameInput','sameDoc','sameDraft','snapshotsContainOfflineOutput']) assert.equal(state[key], true, key);
    assert.equal(state.writable, true); assert.ok(state.events.some(e => e.phase === 'disconnected' && !e.writable)); assert.ok(metrics.upgrades > before.upgrades); assert.equal(metrics.spawn, before.spawn); assert.equal(metrics.terminate, before.terminate); process.kill(pid, 0);
    // Explicit retry cancels the old logical attachment but must not allocate.
    await page.evaluate(() => window.testNative.transport.pauseStreams());
    await page.waitForFunction(() => window.r13.view.state.getSnapshot().phase === 'disconnected');
    await page.locator('[data-wb-content="TERM-01"]').getByRole('button', { name: '重新连接', exact: true }).click();
    await page.evaluate(() => window.testNative.transport.resumeStreams());
    await page.waitForFunction(() => window.r13.view.state.getSnapshot().phase === 'connected' && window.r13.view.state.getSnapshot().writable);
    assert.equal(await page.evaluate(() => window.testNative.controller().content('TERM-01').view === window.r13.view), true);
    assert.equal(metrics.spawn, before.spawn); assert.equal(metrics.close, before.close); assert.equal(metrics.terminate, before.terminate); process.kill(pid, 0);
    await page.screenshot({ path: 'test-output/workspace-terminal-reconnected.png', fullPage: true });
    return { physicalSocketCut: true, manualReattachAlsoKeepsOriginalProcess: true, lostOutputActuallyProducedWhileDisconnected: 40, writableDisabledAndKeysNotReplayed: true, sameKernelPid: pid, spawnDelta: metrics.spawn - before.spawn, closeDelta: metrics.close - before.close, newWebSocketConnections: metrics.upgrades - before.upgrades, ...state };
  } finally { clearTimeout(timer); watcher.close(); await page.evaluate(() => { window.r13?.off(); if (!window.testNative.ctx.connection.generation.getSnapshot()) window.testNative.transport.resumeStreams(); }); }
}
