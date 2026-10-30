import assert from 'node:assert/strict';
export async function runMultiDocumentScenario({page,readHostSource,readSecondarySource}) {
 const beforeA=await readHostSource(),beforeB=await readSecondarySource();
 await page.evaluate(async()=>{const s=window.testP0.ctx.get('dualShellP0').getSnapshot(),r=window.testP0.ctx.get('dshomeDesktop');window.multiDocController=r.entries.get(s.selected).controller;await window.multiDocController.openDocument('a.md');await window.multiDocController.openDocument('b.md');});
 await page.waitForFunction(()=>[...window.multiDocController.contents.values()].filter(i=>i.document?.getSnapshot().phase==='ready').length===2);
 const ids=await page.evaluate(()=>{const c=window.multiDocController,items=[...c.contents.values()].filter(i=>i.document),a=items.find(i=>i.document.getSnapshot().path.endsWith('a.md')),b=items.find(i=>i.document.getSnapshot().path.endsWith('b.md'));window.multiDocIdentity={a:a.document,b:b.document};a.document.edit(a.document.getSnapshot().text+' · A-only draft');return {a:a.id,b:b.id};});
 const pane=id=>page.locator('.p0-full-scene:not([hidden])').locator('[data-wb-content="'+id+'"]');
 await pane(ids.b).locator('textarea.wb-editor').fill('B-only saved content 🐋');
 await page.getByRole('button',{name:'会话 B',exact:true}).click();await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='B');
 await pane(ids.b).getByRole('button',{name:'保存文件',exact:true}).click();await page.waitForFunction(()=>!window.multiDocIdentity.b.getSnapshot().dirty);
 assert.equal(await readSecondarySource(),'B-only saved content 🐋');assert.equal(await readHostSource(),beforeA);assert.notEqual(await readSecondarySource(),beforeB);
 const state=await page.evaluate(()=>{const c=window.multiDocController;return {sameA:[...c.contents.values()].some(i=>i.document===window.multiDocIdentity.a),sameB:[...c.contents.values()].some(i=>i.document===window.multiDocIdentity.b),textA:window.multiDocIdentity.a.getSnapshot().text,dirtyA:window.multiDocIdentity.a.getSnapshot().dirty};});
 assert.equal(state.sameA&&state.sameB,true);assert.equal(state.dirtyA,true);assert.ok(state.textA.endsWith('A-only draft'));
 await pane(ids.b).getByRole('button',{name:'关闭 '+ids.b,exact:true}).click();
 assert.equal(await page.evaluate(()=>[...window.multiDocController.contents.values()].filter(i=>i.document).length),1);
 await page.evaluate(id=>window.multiDocController.model.activate(id),ids.a);assert.ok((await pane(ids.a).locator('textarea.wb-editor').inputValue()).endsWith('A-only draft'));
 const dialog=page.waitForEvent('dialog'),close=pane(ids.a).getByRole('button',{name:'关闭 '+ids.a,exact:true}).click();await (await dialog).dismiss();await close;assert.equal(await pane(ids.a).locator('textarea.wb-editor').count(),1);
 await page.getByRole('button',{name:'会话 A',exact:true}).click();
 return {twoRealFiles:true,independentDraftsAndSaves:true,sharedDocumentIdentityAcrossSessions:true,savingBDoesNotWriteA:true,closingBDoesNotCloseA:true,dirtyACloseCancel:true};
}
