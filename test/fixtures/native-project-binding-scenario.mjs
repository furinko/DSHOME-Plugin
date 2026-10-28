import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export async function runNativeProjectBinding({ page, root, session }) {
  const docPanel = page.locator('[data-wb-content="DOC-01"]'), original = await readFile(join(root, 'a.md')), other = join(root, 'other-project');
  await mkdir(other); await writeFile(join(other, 'a.md'), original);
  const before = await page.evaluate(() => {
    const c = window.testNative.controller(), doc = c.contents.get('DOC-01').document;
    window.projectIdentities = { doc, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), terminal: document.querySelector('.xterm-screen'), input: document.querySelector('#fixture-composer [contenteditable=true]') };
    return { text: doc.getSnapshot().text, draft: window.testNative.reference.input().state.getSnapshot().draft, start: doc.getSnapshot().selectionStart, end: doc.getSnapshot().selectionEnd };
  });
  try {
    for (const cwd of [resolve(root, '..'), other]) {
      // Mutate the actual isolated Host Session policy source, not a response.
      session.header.cwd = cwd;
      const reply = page.waitForResponse(response => response.url().endsWith('/fixture-rpc') && response.request().postDataJSON()?.endpoint === 'dshomeWorkspace/save');
      await docPanel.getByRole('button', { name: '保存文件', exact: true }).click();
      const refusal = await (await reply).json(); assert.equal(refusal.ok, false); assert.equal(refusal.error.code, 'workbench/workspace-changed');
      await page.waitForFunction(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().error?.code === 'workbench/workspace-changed');
      const state = await page.evaluate(() => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(); return { text: s.text, dirty: s.dirty, uncertain: s.uncertain }; });
      assert.equal(state.text, before.text); assert.equal(state.dirty, true); assert.equal(state.uncertain, false);
      assert.deepEqual(await readFile(join(root, 'a.md')), original); assert.deepEqual(await readFile(join(other, 'a.md')), original);
      const compare = await page.evaluate(async () => { try { await window.testNative.controller().contents.get('DOC-01').document.compareDisk(); return 'unexpected adoption'; } catch (e) { return e.code; } });
      assert.equal(compare, 'workbench/workspace-changed');
      if (cwd === resolve(root, '..')) await page.screenshot({ path: 'test-output/workspace-project-refused.png', fullPage: true });
    }
  } finally { session.header.cwd = root; }
  for (const field of ['projectId', 'absolutePath']) {
    await page.evaluate(field => { const doc = window.testNative.controller().contents.get('DOC-01').document; doc.edit(doc.getSnapshot().text + '\r\nscope-receipt-' + field); }, field);
    let altered = 0;
    const route = async request => {
      const payload = request.request().postDataJSON();
      if (payload.endpoint !== 'dshomeWorkspace/save') return request.continue();
      const response = await request.fetch(), json = await response.json(); assert.equal(json.ok, true, JSON.stringify(json));
      json.value[field] = field === 'projectId' ? 'foreign-project-response' : '/foreign/response.md'; altered++;
      await request.fulfill({ response, json });
    };
    await page.route('**/fixture-rpc', route);
    const captured = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text);
    try {
      await docPanel.getByRole('button', { name: '保存文件', exact: true }).click();
      await page.waitForFunction(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().uncertain);
      assert.equal(altered, 1); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(captured));
      assert.equal(await docPanel.getByRole('button', { name: '保存文件', exact: true }).isDisabled(), true);
    } finally { await page.unroute('**/fixture-rpc', route); }
    await docPanel.getByRole('button', { name: '核对磁盘结果', exact: true }).click();
    await page.waitForFunction(() => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(); return !s.uncertain && !s.dirty && !s.comparing; });
    assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(captured));
  }
  const kept = await page.evaluate(() => { const c = window.testNative.controller(), old = window.projectIdentities, doc = c.contents.get('DOC-01').document; return { doc: old.doc === doc, editor: old.editor === document.querySelector('textarea.wb-editor'), frame: old.frame === document.querySelector('iframe[data-wb-iframe]'), terminal: old.terminal === document.querySelector('.xterm-screen'), input: old.input === document.querySelector('#fixture-composer [contenteditable=true]'), draft: window.testNative.reference.input().state.getSnapshot().draft, start: doc.getSnapshot().selectionStart, end: doc.getSnapshot().selectionEnd }; });
  for (const field of ['doc', 'editor', 'frame', 'terminal', 'input']) assert.equal(kept[field], true, field);
  assert.equal(kept.draft, before.draft); assert.equal(kept.start, before.start); assert.equal(kept.end, before.end); assert.deepEqual(await readFile(join(other, 'a.md')), original);
  await page.screenshot({ path: 'test-output/workspace-project-reconciled.png', fullPage: true });
  return { parentWorkspaceRefusedEvenWhenOldFileContained: true, sameNameSameByteOtherWorkspaceUnchanged: true, oldDraftAndBoundComparePreserved: true, wrongProjectAndTargetReceiptsBecomeUnknown: true, actualHostWriteBeforeReceiptTamper: true, explicitOriginalReadBackRequired: true, sameEditorIframeXtermNativeInput: true, exclusions: ['Host Session policy source remains a fixture', 'project switching UI/dirty HMR and production authentication remain untested'] };
}
