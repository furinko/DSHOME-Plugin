import { ensureLayout } from './interaction-helpers.mjs';
import assert from 'node:assert/strict';
export async function runUXScenario({ page, metrics, readHostSource }) {
  const scene = () => page.locator('.p0-full-scene:not([hidden])');
  const counts = { ...metrics };
  await page.evaluate(async () => { const s = window.testP0.ctx.get('dualShellP0').getSnapshot(); window.uxEntry = window.testP0.ctx.get('dshomeDesktop').entries.get(s.selected); await window.uxEntry.controller.openDocument('a.md'); });
  const editor = () => scene().locator('textarea.wb-editor:visible');
  await editor().press('Control+End'); await page.keyboard.insertText('\nUX验收·literal[a].needle'); await editor().press('Control+s');
  await page.waitForFunction(() => [...window.uxEntry.controller.contents.values()].some(i => i.document?.getSnapshot().text.includes('UX验收') && !i.document.getSnapshot().dirty));
  assert.ok((await readHostSource()).includes('UX验收·literal[a].needle'));
  await editor().press('Control+f'); await scene().getByLabel('查找文本', { exact: true }).fill('literal[a].needle');
  await scene().getByRole('button', { name: '下一个匹配', exact: true }).click();
  assert.equal(await editor().evaluate(n => n.value.slice(n.selectionStart, n.selectionEnd)), 'literal[a].needle');
  await editor().press('Escape'); assert.equal(await scene().getByLabel('查找文本', { exact: true }).count(), 0);
  const download = page.waitForEvent('download'); await scene().getByRole('button', { name: '导出草稿', exact: true }).click();
  const { readFile } = await import('node:fs/promises');
  assert.equal(await readFile(await (await download).path(), 'utf8'), await readHostSource());
  await scene().getByRole('button', { name: '布局选项', exact: true }).click();
  const tools = scene().getByLabel('布局文件与预设', { exact: true });
  await tools.getByLabel('新布局预设名称', { exact: true }).fill('acceptance'); await tools.getByRole('button', { name: '保存为预设', exact: true }).click();
  await ensureLayout(scene()); assert.equal(await scene().getByLabel('布局预设', { exact: true }).inputValue(), 'acceptance');
  const layout = await page.evaluate(() => { window.uxEditor = document.querySelector('.p0-full-scene:not([hidden]) textarea.wb-editor'); return window.uxEntry.controller.exportLayout(); });
  page.once('dialog', dialog => dialog.accept());
  await scene().getByLabel('选择布局文件', { exact: true }).setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(layout) });
  await page.waitForFunction(() => window.uxEntry.controller.getSnapshot().notice.startsWith('布局已导入'));
  assert.equal(await editor().evaluate(n => n === window.uxEditor), true);
  await scene().getByRole('button', { name: '布局选项', exact: true }).click();
  const storedBefore = await page.evaluate(() => window.uxEntry.controller.exportStoredLayout());
  await page.evaluate(() => { const c = window.uxEntry.controller; window.uxPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(value, key) { if (key === 'dshome.workspace.v1:' + encodeURIComponent(c.projectId)) throw new DOMException('owned quota failure fixture', 'QuotaExceededError'); return window.uxPut.call(this, value, key); }; });
  try {
    await ensureLayout(scene()); await scene().getByRole('button',{name:'保存布局', exact: true }).click();
    await page.waitForFunction(() => !window.uxEntry.controller.getSnapshot().savingLayout && window.uxEntry.controller.getSnapshot().notice.includes('存储空间'));
  } finally { await page.evaluate(() => { IDBObjectStore.prototype.put = window.uxPut; }); }
  assert.equal(await page.evaluate(() => window.uxEntry.controller.exportStoredLayout()), storedBefore);
  assert.equal(await editor().evaluate(n => n === window.uxEditor), true);
  await scene().getByRole('button', { name: '取消布局恢复', exact: true }).click();
  await ensureLayout(scene()); await scene().getByRole('button',{name:'编辑布局', exact: true }).click(); await scene().getByRole('heading', { name: '布局草稿', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('.wb-layout-editor')), true);
  await page.keyboard.press('Escape');
  assert.equal(await scene().getByRole('heading', { name: '布局草稿', exact: true }).count(), 0);
  assert.deepEqual({ spawn: metrics.spawn, close: metrics.close, terminate: metrics.terminate }, { spawn: counts.spawn, close: counts.close, terminate: counts.terminate });
  return { keyboardSave: true, literalFindAndEscape: true, draftExportByteExact: true, customPresetAndLayoutImport: true, importKeepsEditorIdentity: true, realQuotaFailureKeepsPriorLayoutAndContent: true, keyboardLayoutCancel: true, noProcessReplay: true };
}
