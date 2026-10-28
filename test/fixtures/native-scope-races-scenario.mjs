import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function runNativeScopeRaces({ page, root, session, metrics, host, terminalNegative = false, duringEnsure = false }) {
  const other = join(root, 'scope-race-B'); await mkdir(other); await writeFile(join(other, 'ONLY-B-ENTRY.txt'), 'B only');
  const previousDirectory = host.get('workingDirectory'), previousEnsure = previousDirectory.ensure; let ensureCalls = 0;
  if (duringEnsure) previousDirectory.ensure = async (...args) => { ensureCalls++; session.header.cwd = other; try { return await previousEnsure.apply(previousDirectory, args); } finally { session.header.cwd = root; } };
  const waiting = Promise.withResolvers(); let intercepted = 0;
  const handler = async route => {
    const endpoint = route.request().postDataJSON()?.endpoint;
    const target = terminalNegative ? ['terminal/create', 'dshomeWorkspace/createTerminal'].includes(endpoint) : ['workspaceFiles/list', 'dshomeWorkspace/list'].includes(endpoint);
    if (!target || intercepted) return route.continue();
    intercepted++; if (!duringEnsure) session.header.cwd = other;
    let response, reply;
    try { response = await route.fetch(); reply = await response.json(); }
    finally { session.header.cwd = root; }
    await route.fulfill({ response }); waiting.resolve({ endpoint, reply });
  };
  await page.route('**/fixture-rpc', handler);
  const spawnBefore = metrics.spawn;
  try {
    if (terminalNegative) {
      await page.evaluate(() => window.testNative.controller().model.addPanel('terminal', { id: 'TERM-RACE' }));
      await page.locator('[data-wb-content="TERM-RACE"]').getByRole('button', { name: '启动终端', exact: true }).click();
    } else await page.locator('[data-wb-content="FILE-01"]').getByRole('button', { name: '刷新目录', exact: true }).click();
    const observed = await waiting.promise;
    const evidence = { ...observed, intercepted, spawnDelta: metrics.spawn - spawnBefore, initialRoot: root, changedRoot: other, hostRestoredBeforeResponse: session.header.cwd === root };
    await writeFile(duringEnsure ? 'test-output/terminal-ensure-observed.json' : terminalNegative ? 'test-output/terminal-scope-race-observed.json' : 'test-output/directory-scope-race-observed.json', JSON.stringify(evidence, null, 2));
    assert.equal(intercepted, 1); assert.equal(observed.reply.ok, false, 'a request arriving after the Host workspace changed must be rejected, even if it changes back before the response');
    assert.equal(observed.reply.error.code, 'workbench/workspace-changed'); assert.equal(metrics.spawn, spawnBefore);
    if (!terminalNegative) {
      const panel = page.locator('[data-wb-content="FILE-01"]'); await panel.getByRole('alert').waitFor(); assert.equal(await page.getByRole('button', { name: '▧ ONLY-B-ENTRY.txt', exact: true }).count(), 0);
      const list = host.fs.listDir.bind(host.fs); let ioReads = 0, targetPath;
      host.fs.listDir = async (target, control) => { ioReads++; targetPath = host.fs.processPath(target); session.header.cwd = other; try { return await list(target, control); } finally { session.header.cwd = root; } };
      try {
        const readback = page.waitForResponse(r => r.url().endsWith('/fixture-rpc') && r.request().postDataJSON()?.endpoint === 'dshomeWorkspace/list'); await panel.getByRole('button', { name: '重试', exact: true }).click(); const body = await (await readback).json();
        assert.equal(body.ok, true); assert.ok(body.value.entries.some(e => e.name === 'a.md')); assert.ok(!body.value.entries.some(e => e.name === 'ONLY-B-ENTRY.txt')); assert.equal(ioReads, 1); assert.equal(targetPath, root);
      } finally { host.fs.listDir = list; }
    } else {
      if (duringEnsure) assert.equal(ensureCalls, 1);
      await page.waitForFunction(() => window.testNative.controller().content('TERM-RACE').view.state.getSnapshot().phase === 'failed');
      await page.screenshot({ path: duringEnsure ? 'test-output/workspace-terminal-ensure-refused.png' : 'test-output/workspace-terminal-scope-refused.png', fullPage: true });
      const reply = page.waitForResponse(r => r.url().endsWith('/fixture-rpc') && r.request().postDataJSON()?.endpoint?.endsWith('terminal/close'));
      const dialog = page.waitForEvent('dialog'), close = page.locator('[data-wb-content="TERM-RACE"]').getByRole('button', { name: '关闭 TERM-RACE', exact: true }).click(); await (await dialog).accept(); await close; assert.equal((await (await reply).json()).ok, true);
      await page.waitForFunction(() => !window.testNative.controller().contents.has('TERM-RACE')); assert.equal(metrics.spawn, spawnBefore);
    }
    session.header.cwd = other;
    try {
      const existing = await page.evaluate(async expectedProjectId => { const remote = window.testNative.ctx.get('remote'), view = window.testNative.controller().content('TERM-01').view; const project = await remote.dshomeWorkspace.project('A'); if (!project.ok || project.value.projectId !== expectedProjectId) throw Error('existing-id test Host project not active'); const result = await remote.dshomeWorkspace.createTerminal('A', { id: view.id, cols: 80, rows: 24 }, expectedProjectId); return { ok: result.ok, code: result.error?.code, message: result.error?.message }; }, pathToFileURL(other).href);
      assert.equal(existing.ok, false); assert.equal(existing.code, 'workbench/workspace-changed', existing.message); assert.equal(metrics.spawn, spawnBefore); assert.equal(await page.evaluate(() => window.testNative.controller().content('TERM-01').view.state.getSnapshot().phase), 'connected');
    } finally { session.header.cwd = root; }
    if (!terminalNegative) await page.screenshot({ path: 'test-output/workspace-directory-scope.png', fullPage: true });
    return { existingForeignIdentityRefusedWithoutNewSpawn: true, requestArrivalBinding: !duringEnsure, queuedEnsureFinalCwdChecked: duringEnsure, directoryIoAbaPinnedToOriginal: !terminalNegative, restoredHostDidNotMaskDifferentRequestProject: true, intercepted, spawnDelta: metrics.spawn - spawnBefore, exclusions: ['Host Session/policy/owner sources are fixtures', 'ancestor-symlink syscall TOCTOU and Windows untested'] };
  } finally { session.header.cwd = root; if (duringEnsure) previousDirectory.ensure = previousEnsure; await page.unroute('**/fixture-rpc', handler); }
}
