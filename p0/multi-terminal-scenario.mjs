import assert from 'node:assert/strict';
export async function runMultiTerminalScenario({page,metrics}) {
 const before={...metrics};
 await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='A');
 await page.evaluate(()=>{const s=window.testP0.ctx.get('dualShellP0').getSnapshot();window.multiTerminalController=window.testP0.ctx.get('dshomeDesktop').entries.get(s.selected).controller;window.multiTerminalController.model.addPanel('terminal',{id:'MULTI-A'});});
 const pane=id=>page.locator('.p0-full-scene:not([hidden]) [data-wb-content="'+id+'"]');
 await pane('MULTI-A').getByRole('button',{name:'启动终端',exact:true}).click();
 await page.waitForFunction(()=>window.multiTerminalController.content('MULTI-A').view?.state.getSnapshot().writable);
 await page.evaluate(()=>window.multiTerminalController.content('MULTI-A').view.write('echo DSHOME_MULTI_A\r'));
 await page.waitForFunction(()=>document.querySelector('[data-wb-content="MULTI-A"] .xterm-rows')?.textContent.includes('DSHOME_MULTI_A'));
 await page.getByRole('button',{name:'会话 B',exact:true}).click();await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='B');
 assert.equal(await page.evaluate(()=>{try{window.multiTerminalController.content('MULTI-A').view.write('echo FORBIDDEN\r');return false;}catch{return true;}}),true);
 await page.evaluate(()=>window.multiTerminalController.model.addPanel('terminal',{id:'MULTI-B'}));await pane('MULTI-B').getByRole('button',{name:'启动终端',exact:true}).click();
 await page.waitForFunction(()=>window.multiTerminalController.content('MULTI-B').view?.state.getSnapshot().writable);
 await page.evaluate(()=>window.multiTerminalController.content('MULTI-B').view.write('echo DSHOME_MULTI_B\r'));
 await page.waitForFunction(()=>document.querySelector('[data-wb-content="MULTI-B"] .xterm-rows')?.textContent.includes('DSHOME_MULTI_B'));
 const owned=await page.evaluate(()=>{const c=window.multiTerminalController,a=c.content('MULTI-A'),b=c.content('MULTI-B');let refused=false;try{c.closeWorkspace();}catch{refused=true;}return {owners:[a.ownerSessionId,b.ownerSessionId],distinct:a.view.id!==b.view.id,refused,retained:c.contents.has('MULTI-A')&&c.contents.has('MULTI-B')};});
 assert.deepEqual(owned.owners,['A','B']);assert.equal(owned.distinct&&owned.refused&&owned.retained,true);assert.equal(metrics.spawn-before.spawn,2);assert.equal(metrics.close-before.close,0);
 async function close(id){const event=page.waitForEvent('dialog'),click=pane(id).getByRole('button',{name:'关闭 '+id,exact:true}).click();await (await event).accept();await click;await page.waitForFunction(()=>!window.multiTerminalController.getSnapshot().terminalCleanup?.requests.length);}
 await close('MULTI-B');assert.equal(await page.evaluate(()=>window.multiTerminalController.contents.has('MULTI-A')),true);
 await page.getByRole('button',{name:'会话 A',exact:true}).click();await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='A');await page.evaluate(()=>window.multiTerminalController.model.activate('MULTI-A'));await close('MULTI-A');
 assert.equal(metrics.close-before.close,2);
 return {realProcessesCreated:2,distinctOwnersAndViews:true,crossOwnerWriteRefused:true,mixedOwnerWorkspaceCloseHasNoPartialEffect:true,closeBRetainsA:true,eachOwnerClosesOwnProcess:true};
}
