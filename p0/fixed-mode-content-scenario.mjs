import {setMode} from './interaction-helpers.mjs';
import assert from 'node:assert/strict';
export async function runFixedModeContentScenario({ page, childURL, readHostSource, iframeLoads, metrics }) {
  const scene=()=>page.locator('.p0-full-scene:not([hidden])');
  const mode=title=>setMode(page,title);
  const disk=await readHostSource(), before={spawn:metrics.spawn,close:metrics.close,terminate:metrics.terminate};
  await page.setViewportSize({width:1920,height:1080}); await mode('工作台');
  await scene().getByRole('button',{name:'打开文件 a.md',exact:true}).click();
  const editor=()=>scene().locator('textarea.wb-editor'); await editor().waitFor();
  await editor().press('Control+End'); await page.keyboard.insertText('固定入口文档草稿 🐋');
  const draft=await editor().inputValue();
  await scene().getByLabel('网页地址',{exact:true}).fill(childURL); await scene().getByRole('button',{name:'前往',exact:true}).click();
  const form=()=>page.frameLocator('.p0-full-scene:not([hidden]) iframe[data-wb-iframe]').getByLabel('未提交表单');
  await form().fill('固定入口未提交网页表单');
  const nonce=await form().evaluate(()=>window.probeNonce),loads=iframeLoads();
  const chatDraft=await page.locator('[data-lexical-editor=true]').textContent();
  await page.evaluate(()=>{window.fixedContentNodes={editor:document.querySelector('textarea.wb-editor'),web:document.querySelector('iframe[data-wb-iframe]'),input:document.querySelector('[data-lexical-editor=true]')};});
  for(const width of [1920,1366,760,390]) {
    await page.setViewportSize({width,height:900});
    const box=await page.getByRole('switch',{name:'工作台模式',exact:true}).boundingBox();
    for(let i=0;i<3;i++) { await mode('聊天'); await mode('工作台'); }
    assert.deepEqual(await page.getByRole('switch',{name:'工作台模式',exact:true}).boundingBox(),box);
    assert.equal(await editor().inputValue(),draft); assert.equal(await form().inputValue(),'固定入口未提交网页表单');
    assert.equal(await form().evaluate(()=>window.probeNonce),nonce);
    assert.equal(await page.locator('[data-lexical-editor=true]').textContent(),chatDraft);
    assert.equal(await page.evaluate(()=>window.fixedContentNodes.editor===document.querySelector('textarea.wb-editor')&&window.fixedContentNodes.web===document.querySelector('iframe[data-wb-iframe]')&&window.fixedContentNodes.input===document.querySelector('[data-lexical-editor=true]')),true);
  }
  assert.equal(iframeLoads(),loads); assert.equal(await readHostSource(),disk);
  assert.deepEqual({spawn:metrics.spawn,close:metrics.close,terminate:metrics.terminate},before);
  await page.setViewportSize({width:1366,height:900}); await page.screenshot({path:'test-output/fixed-mode-retained.png'});
  return {realDocumentDraftRetained:true,realWebFormAndNonceRetained:true,nativeChatDraftRetained:true,noContentReparenting:true,noImplicitSaveOrTerminalAction:true,repeatedModeRoundTrips:12};
}
