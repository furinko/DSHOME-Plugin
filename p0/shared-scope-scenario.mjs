import assert from 'node:assert/strict';
export async function runSharedScopeScenario({page,readHostSource}) {
  const scene=()=>page.locator('.p0-full-scene:not([hidden])');
  await page.evaluate(()=>{const e=[...window.testP0.ctx.get('dshomeDesktop').entries.values()].find(e=>e.available());window.scopeEntry=e;e.controller.model.activate('DOC-01');});
  const editor=()=>scene().locator('textarea.wb-editor');await editor().waitFor();
  const original=await readHostSource();
  await editor().press('Control+End');await page.keyboard.insertText(' · scope-race');
  const draft=await editor().inputValue();
  await page.evaluate(()=>{window.testP0.workspaces.replaceBaseline({...window.testP0.baseline,items:[]});});
  const refusal=await page.evaluate(async()=>{try{await window.scopeEntry.controller.content('DOC-01').document.save();return 'accepted';}catch(error){return error.message;}});
  assert.notEqual(refusal,'accepted');assert.equal(await readHostSource(),original);
  await page.evaluate(()=>window.testP0.workspaces.replaceBaseline(window.testP0.baseline));await editor().waitFor();assert.equal(await editor().inputValue(),draft);
  // The refused operation may conservatively require an explicit disk check.
  await page.evaluate(async()=>{const d=window.scopeEntry.controller.content('DOC-01').document;if(d.getSnapshot().uncertain)await d.reconcile();});
  const reached=Promise.withResolvers(),release=Promise.withResolvers();let handled=false;
  const route=async request=>{
    if(request.request().postDataJSON()?.endpoint!=='dshomeWorkspace/save')return request.continue();
    handled=true;
    try{const response=await request.fetch();reached.resolve();await release.promise;await request.fulfill({response});}
    catch(error){reached.reject(error);/* A canceled client may reject fulfilment after a real host write. */}
  };
  await page.route('**/fixture-rpc',route);
  try {
    await scene().getByRole('button',{name:'保存文件',exact:true}).click();await reached.promise;
    assert.ok((await readHostSource()).includes('scope-race'));
    await page.evaluate(()=>window.testP0.workspaces.replaceBaseline({...window.testP0.baseline,items:[]}));
    await page.evaluate(()=>window.testP0.workspaces.replaceBaseline(window.testP0.baseline));release.resolve();
    await page.waitForFunction(()=>window.scopeEntry.controller.content('DOC-01').document.getSnapshot().uncertain);
    const state=await page.evaluate(()=>window.scopeEntry.controller.content('DOC-01').document.getSnapshot());assert.equal(state.dirty,true);assert.ok(state.text.includes('scope-race'));assert.equal(handled,true);
  } finally {release.resolve();await page.unroute('**/fixture-rpc',route);await page.evaluate(()=>window.testP0.workspaces.replaceBaseline(window.testP0.baseline));}
  await page.evaluate(()=>window.scopeEntry.controller.content('DOC-01').document.reconcile());
  const reconciled=await page.evaluate(()=>window.scopeEntry.controller.content('DOC-01').document.getSnapshot());assert.equal(reconciled.uncertain,false);assert.equal(reconciled.dirty,false);
  return {withdrawnMembershipRefusesWrite:true,lateRealHostWriteNotFalselyClean:true,restoredMembershipDoesNotReviveOldLease:true,explicitDiskReconciliation:true,boundary:'Synthetic native workspace catalog withdrawal; real Host write and deliberately delayed transport response, not production permission administration.'};
}
