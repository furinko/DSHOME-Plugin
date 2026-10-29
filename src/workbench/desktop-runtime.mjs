import React from 'react';
import { Workspace } from './ui.mjs';
import { workspaceReloadState } from './reload-state.mjs';
import { createWorkspaceAuthority } from './workspace-authority.mjs';
import { createSharedEntry } from './shared-entry.mjs';
import { decodeReference, revealDocumentReference } from './reference.mjs';
const h = React.createElement;
export function createDesktopRuntime({ ctx, services, getOwner, hostRequire, referenceReady, referenceRevision = () => 0 }) {
  const entries = new Map(), pending = new Map(), retiring = new Set(), errors = new Map(), inputSeats = new Map(), listeners = new Set();
  let authority, disposed = false, revision = 0, snapshot = Object.freeze({ revision });
  const emit = () => { snapshot = Object.freeze({ revision: ++revision }); for (const fn of [...listeners]) fn(); };
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
  function Body({ scene, active, onOriginal }) {
    React.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const entry = entries.get(scene.key);
    React.useEffect(() => { if (active && !entry) ensure(scene).catch(() => {}); }, [active, scene.key, !!authority, !!getOwner()]);
    if (!entry) return h('section', { className:'dshome-v2', 'data-desktop-workspace':scene.workspaceId }, h('p', {role:'status'},errors.get(scene.key) ?? '正在确认真实工作区并读取布局…'), h('button',{onClick:()=>ensure(scene).catch(()=>{})},'重试连接工作区'));
    const sessionId = entry.controller.sessionId, seat = inputs(), referenceEpoch = referenceRevision();
    const isCurrent = () => active && !disposed && referenceReady() && referenceRevision() === referenceEpoch && entry.available() && authority?.getSnapshot().sessionId === sessionId && inputs() === seat;
    return h('div',{className:'wb-desktop-entry',style:{height:'100%',display:'flex',flexDirection:'column',minHeight:0}},
      h('div',{className:'wb-desktop-actions'},h('button',{disabled:!active,onClick:()=>close(scene)},'关闭操作现场')),
      h('div',{style:{flex:1,minHeight:0}},h(Workspace, { controller:entry.controller, workspaceFiles:entry.workspaceFiles, active, projectTitle:scene.title,
      servicesAvailable:entry.available(), terminalAvailable:entry.terminalAvailable,
      inputActions:seat, referenceReady:referenceReady() && !!seat, referenceCurrent:isCurrent, onOriginal })));
  }
  const beforeUnload = event => { const s=workspaceReloadState({shelves:[shelf]}); if (s.dirty || s.uncertain || s.saving || s.terminals || s.webPages || s.layoutDrafts || s.layoutSaves || s.unconfirmedCloses) { event.preventDefault(); event.returnValue=''; } };
  window.addEventListener('beforeunload',beforeUnload);
  return Object.freeze({ ...source, Body, InputSeat, ensure, entries, shelf,
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
    async dispose() { disposed=true; window.removeEventListener('beforeunload',beforeUnload); await binding.dispose(); await Promise.allSettled([...pending.values(), ...retiring]); const owned=[...entries.values()]; entries.clear(); emit(); await Promise.allSettled(owned.map(e=>e.release())); listeners.clear(); },
  });
}
