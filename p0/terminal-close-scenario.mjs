import assert from 'node:assert/strict';
export async function runDesktopTerminalClose({page,metrics}) {
 const before={...metrics},seen=Promise.withResolvers(),release=Promise.withResolvers();let intercepted=false;
 const id=await page.evaluate(()=>{const c=[...window.testP0.ctx.get('dshomeDesktop').entries.values()].find(e=>e.available()).controller;window.desktopCloseProbe={c,doc:c.content('DOC-01').document};return c.content('TERM-01').view.id;});
 const handler=async route=>{const body=route.request().postDataJSON();if(intercepted||body?.endpoint!=='terminal/close'||body.payload?.args?.id!==id)return route.continue();intercepted=true;try {const reply=await (await route.fetch()).json();seen.resolve(reply);await release.promise;await route.abort('failed');}catch(error){seen.reject(error);}};
 await page.route('**/fixture-rpc',handler);
 try {
  const dialog=page.waitForEvent('dialog'),click=page.locator('.p0-full-scene:not([hidden])').getByRole('button',{name:'关闭 TERM-01',exact:true}).click();await (await dialog).accept();await click;
  const receipt=await seen.promise;assert.equal(receipt.ok,true,JSON.stringify(receipt));assert.equal(metrics.closed-before.closed,1);assert.equal(metrics.terminate-before.terminate,1);
  const blocked=await page.evaluate(()=>{const c=window.desktopCloseProbe.c;return {pending:c.getSnapshot().terminalCleanup.requests.some(x=>x.phase==='pending'),panelRemoved:!c.contents.has('TERM-01'),close:c.closeWorkspace(),reload:window.__dshomePluginWorkbench.checkReload().allowed};});
  assert.deepEqual(blocked,{pending:true,panelRemoved:true,close:false,reload:false});
  release.resolve();await page.locator('.p0-full-scene:not([hidden]) [data-close-terminal="'+id+'"][role=alert]').waitFor();
  const response=page.waitForResponse(r=>r.url().endsWith('/fixture-rpc')&&r.request().postDataJSON()?.endpoint==='terminal/close');await page.getByRole('button',{name:'重试关闭 '+id,exact:true}).click();const retried=await (await response).json();assert.equal(retried.ok,true,JSON.stringify(retried));
  await page.waitForFunction(()=>window.desktopCloseProbe.c.getSnapshot().terminalCleanup.requests.length===0);
  assert.equal(metrics.terminate-before.terminate,1);assert.equal(metrics.close-before.close,2);assert.equal(metrics.spawn,before.spawn);
  assert.equal(await page.evaluate(()=>window.desktopCloseProbe.c.content('DOC-01').document===window.desktopCloseProbe.doc),true);
  return {actualHostCloseLostReply:true,unknownBlocksWorkspaceReleaseAndReload:true,visibleRetryAfterPanelRemoval:true,idempotentRetryDoesNotTerminateTwice:true,documentPreserved:true};
 } finally {release.resolve();await page.unroute('**/fixture-rpc',handler);}
}
