import {runLocalFormats} from './local-formats-scenario.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
export async function runDragFiles(page) {
  const scene=page.locator('.p0-full-scene:not([hidden])');
  await scene.getByLabel('选择本机文件',{exact:true}).setInputFiles({name:'outside.txt',mimeType:'text/plain',buffer:Buffer.from('\ufeff外部文件\r\n')});
  const editor=scene.locator('textarea.wb-editor:visible');await editor.waitFor();
  assert.equal(await editor.inputValue(),'\ufeff外部文件\n');
  await editor.fill('修改副本'); assert.equal(await scene.getByRole('button',{name:'保存文件',exact:true}).filter({visible:true}).isDisabled(),true);
  const download=page.waitForEvent('download');await scene.getByRole('button',{name:'导出草稿',exact:true}).filter({visible:true}).click();assert.ok(await (await download).path());
  await editor.evaluate(n=>window.dragFileEditor=n);
  const header=editor.locator('xpath=ancestor::article').locator('[role=tab][aria-selected=true]');
  const target=scene.locator('[data-wb-content=WEB-01]');
  const beforeLayout=await page.evaluate(()=>{const v=window.testP0.ctx.get('dualShellP0').getSnapshot();return JSON.stringify(JSON.parse(window.testP0.ctx.get('dshomeDesktop').entries.get(v.selected).controller.exportLayout()).layout);});
  const hb=await header.boundingBox(),tb=await target.boundingBox();
  const exported=()=>page.evaluate(()=>{const v=window.testP0.ctx.get('dualShellP0').getSnapshot();return JSON.stringify(JSON.parse(window.testP0.ctx.get('dshomeDesktop').entries.get(v.selected).controller.exportLayout()).layout);});
  await page.mouse.move(hb.x+50,hb.y+12);await page.mouse.down();await page.mouse.move(hb.x+53,hb.y+12);await page.mouse.up();
  assert.equal(await exported(),beforeLayout);
  await page.mouse.move(hb.x+50,hb.y+12);await page.mouse.down();await page.mouse.move(tb.x+30,tb.y+120,{steps:12});await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await exported(),beforeLayout);
  await page.mouse.move(hb.x+50,hb.y+12);await page.mouse.down();await page.mouse.move(tb.x+30,tb.y+120,{steps:12});await page.mouse.up();
  assert.notEqual(await page.evaluate(()=>{const v=window.testP0.ctx.get('dualShellP0').getSnapshot();return JSON.stringify(JSON.parse(window.testP0.ctx.get('dshomeDesktop').entries.get(v.selected).controller.exportLayout()).layout);}),beforeLayout);
  assert.equal(await scene.locator('textarea.wb-editor').evaluateAll(nodes=>nodes.includes(window.dragFileEditor)),true);
  assert.equal(await scene.locator('textarea.wb-editor').filter({visible:true}).inputValue(),'修改副本');
  assert.equal(await scene.getByRole('tree',{name:'本机文件',exact:true}).getByRole('button',{name:'打开本机文件 outside.txt',exact:true}).count(),1);
  // Actual SDK listeners, with synthetic intake instead of an upload.
  const sdk=resolve(process.env.DSH_SDK_ROOT || '../audits/dshome-v2-deploy-20261028/sdk');
  const source=readFileSync(resolve(sdk,'node_modules/@deepseek-ai/dsh-client-ui-attachment/lib/client.js'),'utf8');
  const start=source.indexOf('function droppedDirectories('),end=source.indexOf('\n\t\t//#endregion',start);
  await page.evaluate(code=>{const install=Function(code+';return installDocumentDropEvents')();window.nativeDrops=0;window.nativeDrag=false;window.stopNativeDrop=install(true,()=>window.nativeDrops++,{current:0},value=>window.nativeDrag=value);},source.slice(start,end));
  const dropped=await page.evaluateHandle(()=>{const d=new DataTransfer();d.items.add(new File(['拖入内容'],'drop.txt',{type:'text/plain'}));return d;});
  await page.locator('body').dispatchEvent('dragenter',{dataTransfer:dropped});
  assert.equal(await page.evaluate(()=>window.nativeDrag),true);
  await scene.locator('.dshome-v2').dispatchEvent('dragenter',{dataTransfer:dropped});
  assert.equal(await page.evaluate(()=>window.nativeDrag),false);
  await scene.locator('.dshome-v2').dispatchEvent('dragover',{dataTransfer:dropped});
  await scene.locator('.dshome-v2').dispatchEvent('drop',{dataTransfer:dropped});
  assert.equal(await page.evaluate(()=>window.nativeDrops),0);
  await page.locator('body').dispatchEvent('drop',{dataTransfer:dropped});
  assert.equal(await page.evaluate(()=>window.nativeDrops),1);
  await page.evaluate(()=>window.stopNativeDrop());await dropped.dispose();
  await scene.getByRole('tab',{name:/drop.txt/}).filter({visible:true}).waitFor();
  const panels=scene.locator('article:visible').filter({has:page.locator('textarea.wb-editor')});
  for(const name of ['outside.txt','drop.txt']) {
    const tab=scene.getByRole('tab',{name:new RegExp(name)}).filter({visible:true});if(await tab.count())await tab.first().click();
    const close=scene.getByRole('button',{name:'关闭标签 '+name,exact:true}).filter({visible:true}).first();
    if(name==='outside.txt')page.once('dialog',d=>d.accept());await close.click();
  }
  const handleResult=await page.evaluate(async()=>{
    const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('isolated-local-handle.txt',{create:true});
    const w=await handle.createWritable();await w.write('handle-original');await w.close();
    const v=window.testP0.ctx.get('dualShellP0').getSnapshot();const c=window.testP0.ctx.get('dshomeDesktop').entries.get(v.selected).controller;
    const doc=await c.openLocalFile(await handle.getFile(),handle);const duplicate=await c.openLocalFile(await handle.getFile(),handle);
    doc.edit('handle-saved');await doc.save();const saved=await (await handle.getFile()).text();
    const id=[...c.contents.values()].find(i=>i.document===doc).id;await c.closePanel(id);await root.removeEntry('isolated-local-handle.txt');
    return {same:doc===duplicate,saved};
  });assert.deepEqual(handleResult,{same:true,saved:'handle-saved'});
  const formats=await runLocalFormats(page);
  return {formats,browserHandleWrite:true,inputImport:true,snapshotExport:true,directDockKeepsEditor:true,fileDrop:true};
}
