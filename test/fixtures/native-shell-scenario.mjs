import assert from 'node:assert/strict'; import { writeFile } from 'node:fs/promises';
export async function runNativeShellScenario({ page, metrics, handles, childURL, journal }) {
  const modes = page.getByRole('group', { name: '界面模式', exact: true }); await modes.waitFor();
  const input = page.locator('[contenteditable=true][data-lexical-editor=true]:visible'); await input.waitFor();
  assert.equal(await input.textContent(), '原生会话壳中的聊天草稿'); await input.press('Control+End'); await page.keyboard.insertText(' · 原生壳实际键入');
  await page.evaluate(() => { window.shellInput = document.querySelector('[contenteditable=true][data-lexical-editor=true]'); });
  await modes.getByRole('button', { name: '工作台', exact: true }).click(); await page.locator('.dshome-v2:visible').waitFor();
  await page.locator('[data-wb-content="FILE-01"]:visible').getByRole('button', { name: '▧ a.md', exact: true }).click();
  const editor = page.locator('textarea.wb-editor:visible'); await editor.waitFor(); await editor.press('Control+End'); await page.keyboard.insertText('原生会话壳文档草稿');
  const web = page.locator('[data-wb-content="WEB-01"]:visible'); await web.locator('input').fill(childURL); await web.getByRole('button', { name: '前往', exact: true }).click();
  const form = page.frameLocator('iframe[data-wb-iframe]').getByRole('textbox', { name: '未提交表单' }); await form.fill('原生壳内网页表单');
  const terminal = page.locator('[data-wb-content="TERM-01"]:visible'); await terminal.getByRole('button', { name: '启动终端', exact: true }).click();
  await page.waitForFunction(() => window.testNative.controller().content('TERM-01').view?.state.getSnapshot().phase === 'connected');
  await page.evaluate(() => window.testNative.controller().content('TERM-01').view.write("printf 'SHELL_PID:%s\\n' \"$$\"\r")); await page.waitForFunction(() => /SHELL_PID:\d+/.test(document.querySelector('.xterm-screen')?.textContent ?? ''));
  const pid = Number((await page.locator('.xterm-screen').textContent()).match(/SHELL_PID:(\d+)/)[1]); process.kill(pid, 0);
  await page.evaluate(() => { const c = window.testNative.controller(); window.shellProbe = { c, doc: c.content('DOC-01').document, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), xterm: document.querySelector('.xterm-screen'), view: c.content('TERM-01').view, draft: window.testNative.reference.input().state.getSnapshot().draft }; });
  await page.getByText('隔离 Host 日志中的既有消息', { exact: true }).evaluate(element => { window.shellChatNode = element; });
  const before = { ...metrics };
  for (let i = 0; i < 5; i++) { await modes.getByRole('button', { name: '原版', exact: true }).click(); await page.waitForFunction(() => !window.testNative.ctx.sidebarRight.isExpanded()); await modes.getByRole('button', { name: '工作台', exact: true }).click(); await page.locator('.dshome-v2:visible').waitFor(); }
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.testNative.controller().model.selectPreset('review')); await page.evaluate(() => window.testNative.controller().model.selectPreset('development')); }
  const sameSession = await page.evaluate(() => ({ input: document.querySelector('[contenteditable=true][data-lexical-editor=true]') === window.shellInput, chat: window.shellChatNode.isConnected, draft: window.testNative.reference.input().state.getSnapshot().draft === window.shellProbe.draft }));
  assert.deepEqual(sameSession, { input: true, chat: true, draft: true });
  await page.getByRole('button', { name: '其他主面板', exact: true }).click(); await page.getByRole('region', { name: '隔离诊断面板', exact: true }).waitFor(); await page.getByRole('button', { name: '返回会话', exact: true }).click(); await page.locator('.dshome-v2:visible').waitFor();
  const widths = [];
  for (const width of [1280, 1040, 900, 1920]) { await page.setViewportSize({ width, height: 1080 }); await page.waitForFunction(width => { const input = document.querySelector('[contenteditable=true][data-lexical-editor=true]')?.getBoundingClientRect(), work = document.querySelector('.dshome-v2')?.getBoundingClientRect(); return input?.right <= width + 1 && Math.abs(work.right - width) <= 1; }, width); await page.evaluate(async () => {
    let previous, stable = 0;
    for (let frames = 0; frames < 180; frames++) {
      await new Promise(requestAnimationFrame);
      const input = document.querySelector('[contenteditable=true][data-lexical-editor=true]').getBoundingClientRect(), work = document.querySelector('.dshome-v2').getBoundingClientRect();
      const value = JSON.stringify([input.x, input.y, input.width, input.height, work.x, work.y, work.width, work.height]);
      stable = value === previous ? stable + 1 : 0; previous = value; if (stable >= 3) return;
    }
    throw Error('Native geometry never became stable');
  }); const geometry = await page.evaluate(() => { const input = document.querySelector('[contenteditable=true][data-lexical-editor=true]'), r = input.getBoundingClientRect(), work = document.querySelector('.dshome-v2').getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hit: hit?.outerHTML.slice(0, 700), inputHTML: input.outerHTML.slice(0, 700), viewport: innerWidth, input: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, work: { x: work.x, right: work.right, width: work.width }, inputHit: input.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), outerWidth: document.documentElement.scrollWidth }; }); await writeFile('test-output/native-shell-geometry-' + width + '.json', JSON.stringify(geometry, null, 2)); assert.ok(geometry.input.width > 200); assert.equal(geometry.inputHit, true); assert.ok(geometry.work.x >= geometry.input.right - 1); assert.ok(geometry.outerWidth <= width + 1); widths.push(geometry); }
  const nativeNavigation = await page.evaluate(() => { const input = document.querySelector('[contenteditable=true][data-lexical-editor=true]'); window.shellInputBeforeSessions = input; return { inputSameAfterOtherMainPanelAndResize: input === window.shellInput }; });
  await page.screenshot({ path: 'test-output/workspace-native-shell-daily.png', fullPage: true });
  await page.getByRole('button', { name: '会话 B', exact: true }).click(); await page.waitForFunction(() => window.testNative.ctx.sidebarRight.mounted.getSnapshot() === 'B');
  assert.equal(await page.evaluate(() => window.testNative.reference.input('B').state.getSnapshot().draft), ''); await input.fill('B 会话独立草稿');
  await page.getByRole('button', { name: '会话 A', exact: true }).click(); await page.waitForFunction(() => window.testNative.ctx.sidebarRight.mounted.getSnapshot() === 'A'); await page.locator('.dshome-v2:visible').waitFor();
  await page.getByRole('button', { name: '会话 B', exact: true }).click(); await page.waitForFunction(() => window.testNative.ctx.sidebarRight.mounted.getSnapshot() === 'B');
  const restoredB = await page.evaluate(() => window.testNative.reference.input('B').state.getSnapshot().draft); assert.equal(restoredB, 'B 会话独立草稿');
  await page.getByRole('button', { name: '会话 A', exact: true }).click(); await page.waitForFunction(() => window.testNative.ctx.sidebarRight.mounted.getSnapshot() === 'A'); await page.locator('.dshome-v2:visible').waitFor();
  const after = await page.evaluate(() => { const p = window.shellProbe, c = window.testNative.controller(); return { sameController: c === p.c, sameDocument: c.content('DOC-01').document === p.doc, sameEditor: document.querySelector('textarea.wb-editor') === p.editor, sameFrame: document.querySelector('iframe[data-wb-iframe]') === p.frame, sameXterm: document.querySelector('.xterm-screen') === p.xterm, sameView: c.content('TERM-01').view === p.view, sameInput: document.querySelector('[contenteditable=true][data-lexical-editor=true]') === window.shellInput, sameInputAsBeforeSessions: document.querySelector('[contenteditable=true][data-lexical-editor=true]') === window.shellInputBeforeSessions, sameDraft: window.testNative.reference.input().state.getSnapshot().draft === p.draft, dirty: p.doc.getSnapshot().dirty }; });
  after.otherDraft = restoredB; await writeFile('test-output/native-shell-state-observed.json', JSON.stringify(after, null, 2));
  for (const key of ['sameController','sameDocument','sameEditor','sameFrame','sameXterm','sameView','sameDraft']) assert.equal(after[key], true, key); assert.equal(after.otherDraft, 'B 会话独立草稿'); assert.equal(after.dirty, true); assert.equal(await form.inputValue(), '原生壳内网页表单'); assert.equal(metrics.spawn, before.spawn); assert.equal(metrics.close, before.close); assert.equal(metrics.terminate, before.terminate); process.kill(pid, 0);
  await page.evaluate(() => { window.beforeLayoutInput = document.querySelector('[contenteditable=true][data-lexical-editor=true]'); window.testNative.controller().model.beginEdit(); }); await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.evaluate(() => document.querySelector('[contenteditable=true][data-lexical-editor=true]') === window.beforeLayoutInput), true);
  await page.screenshot({ path: 'test-output/workspace-native-shell-restored.png', fullPage: true });
  const dialog = page.waitForEvent('dialog'); const closing = page.evaluate(() => window.testNative.controller().closePanel('TERM-01')); await (await dialog).accept(); await closing; await handles[0].done; assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.deepEqual(await page.evaluate(() => window.testNative.errors), []); assert.equal(journal.metrics.prompts, 0);
  return { actualAppFrameMainHeaderAndSessionAdapter: true, realHeaderSwitches: 10, otherMainPanelRoundTrip: true, sessionDraftsIsolated: true, sameSession, nativeNavigation, nativeSessionInputBindingChanged: !after.sameInputAsBeforeSessions, widths, after, pid, exclusions: ['auxiliary left navigation/theme/settings/access sources and Host journal/session/policy remain fixtures', 'this isolated SDK shell is not the running production GUI; actual sidebar navigation provider and OS theme are not certified'] };
}
