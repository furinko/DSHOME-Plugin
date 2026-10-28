import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeReference, decodeReference } from '../../src/workbench/reference.mjs';
import { textareaProjection } from '../../src/workbench/textarea.mjs';
export async function runNativeReferenceScenario({ page, root, session, recovered, composer = false }) {
  const editor = page.locator('textarea.wb-editor'), preview = page.locator('#native-reference-preview');
  await page.waitForFunction(() => window.__dshomePluginWorkbench.status().references);
  // A6's confirmed-discard scene intentionally replaced the earlier long file.
  // Seed a NEW unsaved long draft for A7; never pretend those old lines survived.
  const referenceSource = recovered + '\r\n选区前 😀\r' + Array.from({ length: 180 }, (_, i) => '原生组件长文档 ' + i + '\r\n').join('');
  await page.evaluate(text => window.testNative.controller().contents.get('DOC-01').document.edit(text), referenceSource);
  const rawStart = referenceSource.indexOf('原生组件长文档 80'), rawEnd = rawStart + '原生组件长文档 80'.length; assert.ok(rawStart > 0);
  const projection = textareaProjection(referenceSource), targetLine = projection.text.slice(0, projection.toDisplay(rawStart)).split('\n').length - 1;
  // Programmatic setSelectionRange does not run React's native onSelect path.
  // Use actual keyboard navigation, as in the earlier source-offset proof.
  await editor.press('Control+Home'); for (let i = 0; i < targetLine; i++) await editor.press('ArrowDown'); await editor.press('Home');
  for (const _ of '原生组件长文档 80') await editor.press('Shift+ArrowRight');
  await page.waitForFunction(range => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(); return s.selectionStart === range[0] && s.selectionEnd === range[1]; }, [rawStart, rawEnd]);
  const draftBefore = await page.evaluate(() => {
    const c = window.testNative.controller(); window.referenceIdentities = { document: c.contents.get('DOC-01').document, editor: document.querySelector('textarea.wb-editor'), frame: document.querySelector('iframe[data-wb-iframe]'), terminal: document.querySelector('.xterm-screen'), input: window.testNative.reference.actions() };
    return window.testNative.reference.input().state.getSnapshot().draft;
  });
  await page.getByRole('button', { name: '引用选区到对话', exact: true }).click(); await preview.getByRole('button', { name: /^返回原文 a\.md:/ }).waitFor();
  const captured = await page.evaluate(() => { const c = window.testNative.controller(); return { reference: c.contents.get('DOC-01').lastReference, draft: window.testNative.reference.input().state.getSnapshot().draft }; });
  if (composer) {
    const nativeField = page.locator('#fixture-composer [contenteditable=true]');
    await page.waitForFunction(() => document.querySelector('#fixture-composer [contenteditable=true]')?.innerText.includes('↩ dshome-ref://v1/'));
    assert.ok((await nativeField.innerText()).includes('原生组件长文档 80'));
  }
  assert.ok(captured.draft.startsWith(draftBefore)); assert.ok(captured.draft.includes('> 原生组件长文档 80\n↩ dshome-ref://v1/')); assert.equal(captured.reference.start, rawStart); assert.equal(captured.reference.end, rawEnd);
  // Genuine native InputActions, not the earlier input substitute, must refuse
  // an obsolete captured revision even with no native composer DOM mounted.
  const cas = await page.evaluate(() => { const f = window.testNative.reference, before = f.input().state.getSnapshot().draft, span = f.actions().captureInsertion(); f.input().setDraft('后来修改的原生草稿'); const accepted = f.actions().insertText('MUST_NOT_APPEAR', span), after = f.input().state.getSnapshot().draft; f.input().setDraft(before); return { accepted, after }; });
  assert.deepEqual(cas, { accepted: false, after: '后来修改的原生草稿' });
  await editor.press('Control+Home'); await page.getByRole('button', { name: '返回原版', exact: true }).click();
  await preview.getByRole('button', { name: /^返回原文 a\.md:/ }).click();
  await page.waitForFunction(range => { const c = window.testNative.controller(), s = c.contents.get('DOC-01').document.getSnapshot(), node = document.querySelector('textarea.wb-editor'); return s.selectionStart === range[0] && s.selectionEnd === range[1] && document.activeElement === node && node.scrollTop > 600; }, [rawStart, rawEnd]);
  const identities = await page.evaluate(() => { const c = window.testNative.controller(), prior = window.referenceIdentities; return { document: c.contents.get('DOC-01').document === prior.document, editor: document.querySelector('textarea.wb-editor') === prior.editor, frame: document.querySelector('iframe[data-wb-iframe]') === prior.frame, terminal: document.querySelector('.xterm-screen') === prior.terminal, input: window.testNative.reference.actions() === prior.input, documentCount: [...c.contents.values()].filter(i => i.document).length }; });
  assert.deepEqual(identities, { document: true, editor: true, frame: true, terminal: true, input: true, documentCount: 1 }); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(recovered));
  await editor.press('Control+End'); await page.keyboard.insertText('引用后的编辑仍要保留');
  await preview.getByRole('button', { name: /^返回原文 a\.md:/ }).click(); await preview.getByRole('alert').filter({ hasText: '不能精确定位' }).waitFor();
  assert.equal(await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text), referenceSource + '引用后的编辑仍要保留'); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(recovered));
  const value = decodeReference(captured.reference.uri);
  for (const change of [{ sessionId: 'B' }, { projectId: 'file:///different-project' }]) {
    const result = await page.evaluate(async uri => { try { await window.__dshomePluginWorkbench.returnReference(uri); return 'unexpected success'; } catch (error) { return error.message; } }, encodeReference({ ...value, ...change })); assert.match(result, /会话|项目|工作区/);
  }
  // The browser/native route also rechecks the actual bounded Host project
  // endpoint: a changed cwd must not reveal the previous project's local draft.
  await mkdir(join(root, 'nested')); const previousCwd = session.header.cwd;
  await page.evaluate(text => window.testNative.controller().contents.get('DOC-01').document.edit(text), referenceSource);
  const revealBefore = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().revealRevision);
  let projectCalls = 0;
  const changeAfterHash = async route => {
    const body = route.request().postDataJSON();
    if (body.endpoint === 'dshomeWorkspace/project' && ++projectCalls === 2) session.header.cwd = join(root, 'nested');
    await route.continue();
  };
  await page.route('**/fixture-rpc', changeAfterHash);
  try {
    const failure = await page.evaluate(async uri => { try { await window.__dshomePluginWorkbench.returnReference(uri); return 'unexpected success'; } catch (error) { return error.message; } }, captured.reference.uri);
    assert.match(failure, /会话工作区已变化/); assert.equal(projectCalls, 2);
    assert.equal(await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().revealRevision), revealBefore, 'cached source must not be revealed after scope replacement');
  } finally { session.header.cwd = previousCwd; await page.unroute('**/fixture-rpc', changeAfterHash); }
  session.header.cwd = join(root, 'nested');
  try { const failure = await page.evaluate(async uri => { try { await window.__dshomePluginWorkbench.returnReference(uri); return 'unexpected success'; } catch (error) { return error.message; } }, captured.reference.uri); assert.match(failure, /会话工作区已变化/); }
  finally { session.header.cwd = previousCwd; }
  await page.evaluate(text => window.testNative.controller().contents.get('DOC-01').document.edit(text), referenceSource);
  await preview.getByRole('button', { name: /^返回原文 a\.md:/ }).click();
  // Clearing the previous alert happens at request START, not success. Require
  // a new reveal and the actual focused range, with the native node idle.
  await page.waitForFunction(({ range, revision }) => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(), node = document.querySelector('textarea.wb-editor'), button = document.querySelector('#native-reference-preview button'); return s.revealRevision > revision && s.selectionStart === range[0] && s.selectionEnd === range[1] && document.activeElement === node && !button.disabled && !document.querySelector('#native-reference-preview [role=alert]'); }, { range: [rawStart, rawEnd], revision: revealBefore });
  assert.equal(await page.evaluate(() => window.testNative.reference.input().state.getSnapshot().draft), captured.draft);
  if (composer) assert.equal(await page.evaluate(() => document.querySelector('#fixture-composer [contenteditable=true]') === window.probeNodes.composer), true, 'native Lexical DOM survives return navigation as well as layout/mode changes');
  await page.screenshot({ path: composer ? 'test-output/workspace-composer.png' : 'test-output/workspace-reference.png', fullPage: true });
  return { actualNativeComposerDOM: composer, actualNativeInputRevisionCAS: true, actualNativeUserTextFactoryAndNode: true, rawRange: [rawStart, rawEnd], returnedSameInstances: identities, focusedAndScrolled: true, changedDraftRefusedWithoutLoss: true, crossSessionAndProjectRefused: true, changedHostCwdRefused: true, postHashWorkspaceChangeRefused: true, originalDiskBytesRetained: true, limitations: [composer ? 'native Conversation.content/InputBar DOM mounted; this sub-scenario is an unsent UserText preview, history coverage is reported separately' : 'native input DOM not mounted; textarea is an explicit read-only mirror', 'UserText is an unsent preview, not durable chat history', 'UI scope adapter and owner admission remain fixtures; Session backend coverage is reported separately'] };
}
