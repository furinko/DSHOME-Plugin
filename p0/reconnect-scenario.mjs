import assert from 'node:assert/strict';
export async function runDesktopReconnect({page,readHostSource,metrics}) {
  const disk=await readHostSource(),counts={...metrics};
  await page.evaluate(()=>window.scopeEntry.controller.model.addPanel('terminal',{id:'RETAINED-TERM'}));
  await page.locator('.p0-full-scene:not([hidden]) [data-wb-content="RETAINED-TERM"]').getByRole('button',{name:'启动终端',exact:true}).click();
  await page.waitForFunction(()=>window.scopeEntry.controller.content('RETAINED-TERM').view?.state.getSnapshot().writable);
  await page.evaluate(()=>{window.oldGenerationTerminal=window.scopeEntry.controller.content('RETAINED-TERM').view;window.oldGenerationTerminal.write('echo DSHOME_RETAINED_READY\r');});
  await page.waitForFunction(()=>document.querySelector('.p0-full-scene:not([hidden]) [data-wb-content="RETAINED-TERM"] .xterm-rows')?.textContent.includes('DSHOME_RETAINED_READY'));
  assert.equal(metrics.spawn-counts.spawn,1);
  const before=await page.evaluate(()=>{
    const runtime=window.testP0.ctx.get('dshomeDesktop'),store=window.testP0.ctx.get('dualShellP0');
    window.disconnectedScene={runtime,entry:window.scopeEntry,key:store.getSnapshot().selected,document:window.scopeEntry.controller.content('DOC-01').document};
    return {key:store.getSnapshot().selected,text:window.disconnectedScene.document.getSnapshot().text,entries:runtime.entries.size};
  });
  // Real fixture WebSockets are closed. The native generation source is explicit
  // test wiring, not production connection/login discovery.
  await page.evaluate(()=>window.testP0.transport.pauseStreams());
  await page.waitForFunction(()=>window.testP0.ctx.get('dualShellP0').getSnapshot().selected===null);
  assert.equal(await page.evaluate(()=>window.disconnectedScene.entry.available()),false);
  await page.evaluate(()=>window.testP0.transport.resumeStreams());
  await page.waitForFunction(()=>{const s=window.testP0.ctx.get('dualShellP0').getSnapshot(),r=window.testP0.ctx.get('dshomeDesktop');return s.selected&&s.selected!==window.disconnectedScene.key&&r.entries.get(s.selected)?.available();});
  const after=await page.evaluate(async()=>{
    const s=window.testP0.ctx.get('dualShellP0').getSnapshot(),r=window.testP0.ctx.get('dshomeDesktop'),previous=window.disconnectedScene;
    let refused=false;try{await previous.document.save();}catch{refused=true;}
    const current=r.entries.get(s.selected);return {key:s.selected,entries:r.entries.size,retained:r.entries.get(previous.key)===previous.entry,text:previous.document.getSnapshot().text,refused,distinct:current.controller!==previous.entry.controller,started:[...current.controller.contents.values()].filter(i=>i.started).length,documents:[...current.controller.contents.values()].filter(i=>i.document).length};
  });
  assert.notEqual(after.key,before.key);assert.equal(after.entries,before.entries+1);assert.equal(after.retained,true);assert.equal(after.text,before.text);assert.equal(after.refused,true);assert.equal(after.distinct,true);assert.equal(after.started,0);assert.equal(after.documents,0);assert.equal(await readHostSource(),disk);
  assert.equal(await page.evaluate(()=>{try{window.oldGenerationTerminal.write('echo forbidden\r');return false;}catch{return true;}}),true);
  assert.equal(metrics.spawn-counts.spawn,1);assert.equal(metrics.close,counts.close);
  const closeButton=()=>page.getByRole('button',{name:'确认关闭旧终端 RETAINED-TERM · A',exact:true});
  async function openShelf(){const shelf=page.locator('.wb-retained-drafts');if(!await shelf.evaluate(n=>n.open))await shelf.locator('summary').click();}
  await page.getByRole('button',{name:'会话 B',exact:true}).click();await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='B');await openShelf();await closeButton().click();await page.getByRole('alert').filter({hasText:'请返回原所属会话 A'}).waitFor();assert.equal(metrics.close,counts.close);
  await page.getByRole('button',{name:'会话 A',exact:true}).click();await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='A');await openShelf();
  let dialog=page.waitForEvent('dialog'),click=closeButton().click();await (await dialog).dismiss();await click;assert.equal(metrics.close,counts.close);
  dialog=page.waitForEvent('dialog');click=closeButton().click();await (await dialog).accept();await click;
  await page.waitForFunction(()=>!window.scopeEntry.controller.contents.has('RETAINED-TERM'));
  assert.equal(metrics.close-counts.close,1);assert.equal(metrics.closed-counts.closed,1);assert.equal(metrics.terminate-counts.terminate,1);assert.equal(await page.evaluate(()=>window.disconnectedScene.document.getSnapshot().text),before.text);
  return {activeTerminalAcrossGeneration:true,oldInputStillRefused:true,wrongOwnerCloseRefused:true,explicitOwnerCloseConfirmed:true,cancelDoesNotClose:true,actualFixtureSocketsClosed:true,newGenerationGetsDistinctScene:true,oldDraftRetained:true,oldSaveRefused:true,noTerminalReplay:true,noAutomaticFileOpen:true,limits:['generation and reconnect hooks are fixture wiring','production login/authorization and idle expiry not verified']};
}
