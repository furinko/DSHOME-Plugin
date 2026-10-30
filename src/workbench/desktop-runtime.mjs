import React from 'react';
import { Workspace } from './ui.mjs';
import { BUILTINS } from './controller.mjs';
import { retainedDraftBundle } from './retained-drafts.mjs';
import { downloadDraft } from './recovery-ui.mjs';
import { createModuleRegistry } from './module-registry.mjs';
import { workspaceReloadState } from './reload-state.mjs';
import { createWorkspaceAuthority } from './workspace-authority.mjs';
import { createSharedEntry } from './shared-entry.mjs';
import { decodeReference, revealDocumentReference } from './reference.mjs';
const h = React.createElement;
export function createDesktopRuntime({ ctx, services, getOwner, hostRequire, referenceReady, referenceRevision = () => 0 }) {
  const entries = new Map(), pending = new Map(), retiring = new Set(), errors = new Map(), inputSeats = new Map(), listeners = new Set();
  let authority, disposed = false, revision = 0, snapshot = Object.freeze({ revision });
  const emit = () => { snapshot = Object.freeze({ revision: ++revision }); for (const fn of [...listeners]) fn(); };
  const modules = createModuleRegistry({reserved:BUILTINS.map(m=>m.kind),onChange:emit});
  const source = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot };
  const binding = ctx.inject(['workspaces','uiSession','connection'], scope => {
    const current = createWorkspaceAuthority({ workspaces: scope.workspaces.list, session: scope.uiSession.current, connection: scope.connection.generation });
    authority = current; const off = current.subscribe(emit); emit();
    scope.effect(() => () => { off(); current.dispose(); if (authority === current) authority = null; emit(); });
  });
  function InputSeat({ sessionId, inputActions }) {
    React.useEffect(() => { if (!sessionId || !inputActions) return; const seat = { inputActions }; let seats = inputSeats.get(sessionId); if (!seats) inputSeats.set(sessionId, seats = new Set()); seats.add(seat); emit(); return () => { seats.delete(seat); if (!seats.size) inputSeats.delete(sessionId); emit(); }; }, [sessionId, inputActions]);
    return null;
  }
  const inputs = () => { const id = authority?.getSnapshot().sessionId; return inputSeats.get(id)?.values().next().value?.inputActions; };
  async function ensure(scene) {
    if (disposed) throw Error('工作区服务已卸载');
    if (entries.has(scene.key)) return entries.get(scene.key);
    if (pending.has(scene.key)) return pending.get(scene.key);
    if (!authority || !getOwner()) throw Error('真实工作区服务正在装配');
    const currentAuthority = authority, owner = getOwner();
    const work = createSharedEntry({ owner, services, authority: currentAuthority, workspaceId: scene.workspaceId, hostRequire }).then(async entry => {
      if (disposed || authority !== currentAuthority) { await entry.release(); throw Error('工作区接口已变化'); }
      let detach; try { detach=modules.attach(entry.controller.model); } catch(error) {await entry.release();throw error;}
      const original=entry; entry=Object.freeze({...entry,release:()=>{detach();return original.release();}});
      entries.set(scene.key, entry); errors.delete(scene.key); emit(); return entry;
    }).catch(error => { errors.set(scene.key, error.message); emit(); throw error; }).finally(() => { pending.delete(scene.key); emit(); });
    pending.set(scene.key, work); return work;
  }
  const shelf = { getSnapshot: () => ({ projects:[...entries.values()], busy:pending.size>0 || retiring.size>0 }) };
  async function close(scene) {
    const entry=entries.get(scene.key); if (!entry) return;
    try { if (!entry.controller.closeWorkspace()) return; entries.delete(scene.key); errors.set(scene.key,'操作现场已关闭；布局仍保留，可重新打开。'); const release=entry.release(); retiring.add(release); emit(); try { await release; } finally { retiring.delete(release); emit(); } }
    catch (error) { entry.controller.notify(error.message); }
  }
  async function discardRetained(key) {
    const store=ctx.get('dualShellP0'),entry=entries.get(key),state=store?.getSnapshot();
    if(disposed || !entry || !store?.forgetScene || key===state.selected)throw Error('当前现场或已变化的现场不能释放');
    const scene=state.scenes.find(s=>s.key===key);
    if(!scene || scene.note || scene.url)throw Error('旧版现场仍有内容，未自动清除');
    const c=entry.controller,cleanup=c.getSnapshot().terminalCleanup;
    if([...c.contents.values()].some(i=>i.started)||cleanup?.requests.length||cleanup?.overflow)throw Error('旧现场仍有终端或未确认关闭请求；请返回所属会话，通过确认关闭旧终端逐一收尾，不能把释放当作进程已结束');
    if(!window.confirm('释放这个旧现场会删除本机内存内容；请先导出草稿包。已保存布局不受影响，确定吗？'))return false;
    if(!c.closeWorkspace())return false;
    entries.delete(key);errors.delete(key);
    const release=entry.release();retiring.add(release);store.forgetScene(key);emit();
    try{await release;}finally{retiring.delete(release);emit();}return true;
  }
  function RecoveryShelf({selectedKey}) {
    React.useSyncExternalStore(source.subscribe,source.getSnapshot);
    const [error,setError]=React.useState('');
    const retained=[...entries].filter(([key])=>key!==selectedKey);
    if(!retained.length&&!error)return null;
    return h('details',{className:'wb-retained-drafts',style:{position:'relative'}},h('summary',null,'保留现场（'+retained.length+'）'),
      h('section',{'aria-label':'保留现场草稿',style:{position:'absolute',zIndex:30,top:'100%',left:0,width:300,maxHeight:320,overflow:'auto',padding:12,background:'var(--dsw-alias-bg-base)',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8}},
        h('p',null,'旧现场未自动改绑。可导出本机内存草稿；不重连旧服务、不执行命令，也不保证终端已结束。'),
        retained.map(([key,entry],index)=>h('div',{key},h('span',null,entry.workspaceId+' · 保留现场 '+(index+1)+' '),h('button',{type:'button',onClick:()=>{try{downloadDraft('dshome-retained-'+(index+1)+'.json',retainedDraftBundle(entry));setError('');}catch(e){setError(e.message);}}},'导出草稿包 '+(index+1)),h('button',{type:'button',onClick:()=>discardRetained(key).then(()=>setError(''),e=>setError(e.message))},'释放旧现场 '+(index+1)),
           [...entry.controller.contents.values()].filter(item=>item.started).map(item=>h('button',{key:item.id,type:'button',onClick:()=>entry.closeRetainedTerminal(item.id).then(()=>setError(''),e=>setError(e.message)).finally(emit)},'确认关闭旧终端 '+item.id+' · '+item.ownerSessionId)))),
        error&&h('p',{role:'alert'},error)));
  }
  function Body({ scene, active, onOriginal }) {
    React.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const entry = entries.get(scene.key);
    React.useEffect(() => { if (active && !entry) ensure(scene).catch(() => {}); }, [active, scene.key, !!authority, !!getOwner()]);
    if (!entry) return h('section', { className:'dshome-v2', 'data-desktop-workspace':scene.workspaceId }, h('p', {role:'status'},errors.get(scene.key) ?? '正在确认真实工作区并读取布局…'), h('button',{onClick:()=>ensure(scene).catch(()=>{})},'重试连接工作区'));
    const sessionId = entry.controller.sessionId, seat = inputs(), referenceEpoch = referenceRevision();
    const isCurrent = () => active && !disposed && referenceReady() && referenceRevision() === referenceEpoch && entry.available() && authority?.getSnapshot().sessionId === sessionId && inputs() === seat;
    return h('div',{className:'wb-desktop-entry',style:{height:'100%',display:'flex',flexDirection:'column',minHeight:0}},
      h('div',{className:'wb-desktop-actions'},h('button',{disabled:!active,onClick:()=>close(scene)},'关闭操作现场')),
      h('div',{style:{flex:1,minHeight:0}},h(Workspace, { controller:entry.controller, workspaceFiles:entry.workspaceFiles, active, projectTitle:scene.title, moduleRegistry:modules,
      servicesAvailable:entry.available(), terminalAvailable:entry.terminalAvailable,
      inputActions:seat, referenceReady:referenceReady() && !!seat, referenceCurrent:isCurrent, onOriginal })));
  }
  const beforeUnload = event => { const s=workspaceReloadState({shelves:[shelf]}); if (s.dirty || s.uncertain || s.saving || s.terminals || s.webPages || s.layoutDrafts || s.layoutSaves || s.unconfirmedCloses) { event.preventDefault(); event.returnValue=''; } };
  window.addEventListener('beforeunload',beforeUnload);
  return Object.freeze({ ...source, Body, InputSeat, RecoveryShelf, ensure, entries, shelf,
    registerModule:modules.register,
    refresh:emit,
    hasUnsaved:()=>[...entries.values()].some(e=>e.controller.hasUnsaved()),
    async returnReference(uri, { sessionId, signal, enter }) {
      const value=decodeReference(uri); let identity;
      try { identity=JSON.parse(value.projectId); } catch { return false; }
      if (!Array.isArray(identity) || identity[0]!=='desktop-v1') return false;
      if (identity.length!==4 || identity[1]!==location.origin || !authority || authority.getSnapshot().sessionId!==sessionId || value.sessionId!==sessionId) throw Error('请回到引用所属的真实会话和工作区后再打开。');
      const lease=authority.capture(identity[2],signal), referenceEpoch=referenceRevision();
      const check=()=> { lease.check(); if (!referenceReady() || referenceRevision()!==referenceEpoch) throw Error('引用接口已变化，未采用引用。'); }; check();
      let entry=[...entries.values()].find(e=>e.controller.projectId===value.projectId && e.available());
      if (!entry) {
        const owner=getOwner(); if (!owner) throw Error('工作区服务尚未连接');
        const project=await services.call(owner,(ns,life)=>ns.project(lease.sessionId,life),lease.signal); check();
        if (!project.ok || project.value?.projectId!==identity[3]) throw Error('引用所属工作区根目录已变化');
        const state=ctx.get('dualShellP0')?.getSnapshot(), scene=state?.scenes.find(s=>s.key===state.selected && s.workspaceId===identity[2]);
        if (!scene) throw Error('当前工作区尚未确认');
        entry=await ensure(scene); check();
        if (entry.controller.projectId!==value.projectId) throw Error('操作现场仍属于旧根目录，请先保存并关闭旧现场再打开引用。');
      }
      const validateScope=async()=> { check(); const result=await services.call(entry.owner,(ns,life)=>ns.project(lease.sessionId,life),lease.signal); check(); if (!result.ok || result.value.projectId!==entry.project.projectId) throw Error('引用所属工作区根目录已变化'); return entry.controller.projectId; };
      await validateScope(); enter();
      await revealDocumentReference({uri,controller:entry.controller,isCurrent:()=>{try {check();return true;} catch{return false;}},signal:lease.signal,validateScope}); return true;
    },
    async dispose() { disposed=true; window.removeEventListener('beforeunload',beforeUnload); await binding.dispose(); await Promise.allSettled([...pending.values(), ...retiring]); const owned=[...entries.values()]; entries.clear(); emit(); await Promise.allSettled(owned.map(e=>e.release())); modules.dispose(); listeners.clear(); },
  });
}
