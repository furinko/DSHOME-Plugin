import assert from 'node:assert/strict';
export async function runDesktopLayoutRecovery({page,url,readHostSource}) {
  const scene=()=>page.locator('.p0-full-scene:not([hidden])'),region=()=>scene().getByRole('region',{name:'布局存储恢复',exact:true});
  const disk=await readHostSource(),raw='{"schema":999,"synthetic":"unknown-layout-version"}';
  const projectId=await page.evaluate(()=>window.scopeEntry.controller.projectId),key='dshome.workspace.v1:'+encodeURIComponent(projectId);
  await page.evaluate(()=>{window.recoveryEditor=document.querySelector('.p0-full-scene:not([hidden]) textarea.wb-editor');window.recoveryDocument=window.scopeEntry.controller.content('DOC-01').document;window.recoveryDocument.edit(window.recoveryDocument.getSnapshot().text+' · layout-only-draft');});
  await page.evaluate(async({key,raw})=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('dshome-workspace-layouts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{await new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.objectStore('records').put(raw,key);t.oncomplete=resolve;t.onabort=()=>reject(t.error);});}finally{db.close();}}, {key,raw});
  await scene().getByRole('button',{name:'检查布局存储',exact:true}).click();await region().waitFor();assert.equal(await region().getByLabel('目前存储原记录').inputValue(),raw);
  assert.equal(await region().getByRole('button',{name:'采用存储布局，不关闭内容',exact:true}).isDisabled(),true);
  async function recover(accept){const event=page.waitForEvent('dialog');const click=region().getByRole('button',{name:'备份原件并保存当前布局',exact:true}).click();const dialog=await event;await (accept?dialog.accept():dialog.dismiss());await click;await page.waitForFunction(()=>!window.scopeEntry.controller.getSnapshot().savingLayout);}
  await recover(false);assert.equal(await region().getByLabel('目前存储原记录').inputValue(),raw);
  // Abort a real IndexedDB replacement transaction after put: backup and primary
  // must roll back together; this is not a pretend storage implementation.
  await page.evaluate(k=>{window.originalLayoutPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,name){const r=window.originalLayoutPut.call(this,value,name);if(name===k){window.abortedLayoutTransaction=true;queueMicrotask(()=>this.transaction.abort());}return r;};},key);
  try{await recover(true);await page.waitForFunction(()=>window.abortedLayoutTransaction&&!window.scopeEntry.controller.getSnapshot().savingLayout);}finally{await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalLayoutPut;});}
  await region().getByRole('button',{name:'重新检查布局',exact:true}).click();await page.waitForFunction(()=>!window.scopeEntry.controller.getSnapshot().savingLayout);assert.equal(await region().getByLabel('目前存储原记录').inputValue(),raw);
  await recover(true);await region().waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>JSON.parse(window.scopeEntry.controller.exportLayoutBackup()).raw),raw);
  const peer=await page.context().newPage();
  try{
    await peer.goto(new URL('/layout-storage-peer',url).href);await peer.evaluate(id=>window.openLayoutPeer(id),projectId);
    const extra=await page.evaluate(()=>window.scopeEntry.controller.model.addPanel('web'));
    await peer.evaluate(k=>{window.lockedLayout=navigator.locks.request(k,()=>new Promise(resolve=>{window.unlockLayout=resolve;window.layoutLockHeld=true;}));},key);await peer.waitForFunction(()=>window.layoutLockHeld);
    await peer.evaluate(()=>{const p=window.layoutPeer;window.peerSave=p.persistence.save(p.model.serialize(),p.before.revision,{expectedRaw:p.before.raw});});
    await peer.waitForFunction(async k=>(await navigator.locks.query()).pending.filter(p=>p.name===k).length===1,key);
    await page.evaluate(()=>{window.mainSave=window.scopeEntry.controller.saveLayout().then(()=> 'unexpected-success',e=>e.code);});
    await peer.waitForFunction(async k=>(await navigator.locks.query()).pending.filter(p=>p.name===k).length===2,key);await peer.evaluate(()=>window.unlockLayout());
    assert.equal((await peer.evaluate(()=>window.peerSave)).ok,true);assert.equal(await page.evaluate(()=>window.mainSave),'LAYOUT_CONFLICT');await region().waitFor();
    const local=await page.evaluate(()=>window.scopeEntry.controller.exportLayout());await region().getByRole('button',{name:'保留当前布局，采用存储基线',exact:true}).click();await region().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.scopeEntry.controller.exportLayout()),local);
    await scene().getByRole('button',{name:'检查布局存储',exact:true}).click();await region().waitFor();
    await region().getByRole('button',{name:'采用存储布局，不关闭内容',exact:true}).click();await region().waitFor({state:'detached'});
    assert.equal(await page.evaluate(id=>window.scopeEntry.controller.model.getSnapshot().layout.collapsed.some(p=>p.panelId===id),extra),true);
    assert.equal(await page.evaluate(()=>window.recoveryDocument===window.scopeEntry.controller.content('DOC-01').document&&window.recoveryEditor===document.querySelector('.p0-full-scene:not([hidden]) textarea.wb-editor')&&window.recoveryDocument.getSnapshot().text.endsWith('layout-only-draft')),true);
    const restored=await peer.evaluate(id=>window.probeLayoutPersistence(id),projectId);assert.equal(restored.kind,'ready');assert.equal(JSON.parse(restored.backup).raw,raw);
    assert.equal((await peer.evaluate(id=>window.probeLayoutPersistence(id+'-neighbor'),projectId)).kind,'empty');assert.equal(await readHostSource(),disk);
    return {unsupportedOriginalPreserved:true,cancelDoesNotReplace:true,realTransactionAbortPreservesOriginal:true,backupVerified:true,realCrossPageWebLocksAndCAS:true,storedLayoutKeepsExtraContentCollapsed:true,editorIdentityAndDirtyDraftKept:true,neighborIsolated:true,layoutNeverSavesDocument:true};
  }finally{if(!peer.isClosed()){await peer.evaluate(()=>window.unlockLayout?.()).catch(()=>{});await peer.close();}}
}
