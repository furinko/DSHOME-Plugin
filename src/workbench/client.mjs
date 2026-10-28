import React from 'react';
import { createWorkspaceController } from './controller.mjs';
import { css, unwrap } from './ui.mjs';
import { createProjectShelf } from './project-shelf.mjs';
import { workspaceReloadState, reloadBlockedMessage, fiberUpdateTarget, workspaceLifecycle } from './reload-state.mjs';
import { createServiceEpoch } from './service-epoch.mjs';
import { createTerminalCleanup } from './terminal-cleanup.mjs';
import { ProjectDeck } from './project-deck.mjs';
import { REMOTE_TYPERT } from './wire.mjs';
import { installReferenceBridge } from './reference-client.mjs';
import { decodeReference, revealDocumentReference } from './reference.mjs';
import { createBrowserLayoutStorage } from './browser-layout-storage.mjs';
const h = React.createElement, KIND = 'dshome-workspace', ID = 'dshome-plugin.workbench-v2';
export function applyWorkbench(ctx, hostRequire) {
  const slots = ctx.get('slots');
  if (!slots?.register || !ctx.inject) return null;
  const cleanups = [], workspaces = new Map(), shelves = new Map(), retiring = new Set(), modes = new Map(), listeners = new Set();
  const ready = Promise.withResolvers(), shutdownKey = '__dshomeWorkbenchV2Shutdown', previousShutdown = window[shutdownKey]; let disposing;
  let disposed = false, terminalConstructor, activeScope, activeOwner, uiReady = false, reloadNotice = '', lastUpdate, reason = '工作台接口正在装配', snapshot = Object.freeze({ revision: 0 });
  const keep = off => { cleanups.push(off); return off; };
  const publish = () => { snapshot = Object.freeze({ revision: snapshot.revision + 1 }); for (const fn of [...listeners]) { try { fn(); } catch (error) { console.error('DSHOME subscriber', error); } } };
  const source = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot };
  const shelfOwners = new WeakMap();
  function availability() { reason = !uiReady ? '原生工作台面板暂不可用' : !activeScope ? '工作区接口暂不可用；已有草稿和内容仍保留' : ''; if (!reason) ready.resolve({ ok: true }); publish(); }
  const services = createServiceEpoch();
  const checkReload = () => workspaceReloadState({ shelves: shelves.values(), retiring: retiring.size });
  keep(ctx.on('internal/update', function (_config, _noSave, next) {
    const { affectsOwner, chain } = fiberUpdateTarget(ctx.fiber, this);
    lastUpdate = Object.freeze({ target: this?.uid, targetName: this?.name, chain, affectsOwner });
    if (!affectsOwner || disposed) return next();
    const state = checkReload(); if (state.allowed) return next();
    reloadNotice = reloadBlockedMessage(state); publish();
    // The public Cordis waterfall explicitly supports veto by omitting next.
    // Do NOT call save/close/dispose or accept an unknown result here.
  }, { global: true, prepend: true }));
  const style = document.createElement('style'); style.dataset.plugin = ID; style.textContent = css; document.head.appendChild(style);
  keep(() => style.remove());
  function current() { return ctx.get('sidebarRight')?.mounted.getSnapshot(); }
  function original(sessionId) {
    if (disposed || current() !== sessionId) return false;
    const right = ctx.get('sidebarRight'); if (right?.isExpanded()) right.toggleExpanded(); modes.set(sessionId, 'original'); publish(); return true;
  }
  function enter(sessionId = current()) {
    if (disposed || !sessionId || current() !== sessionId) return { ok: false, reason: '请在当前真实会话中打开工作台。' };
    const right = ctx.get('sidebarRight'), tabs = ctx.get('sidebarRightTabs');
    if (!right || !tabs?.get(KIND)) return { ok: false, reason: reason || '真实工作台面板尚未接入。' };
    right.openTab(KIND); modes.set(sessionId, 'workbench'); publish(); return { ok: true };
  }
  async function createEntry(sessionId, owner, project, signal) {
    const remote = owner.scope.get('remote'), layoutStore = await createBrowserLayoutStorage({ projectId: project.key, legacyStorage: localStorage });
    let terminalFiber;
    try {
      signal?.throwIfAborted(); if (disposed || !owner.live || !services.available(owner)) throw Error('工作台接口在项目加载期间已变化');
      if (!terminalConstructor) terminalConstructor = hostRequire('@deepseek-ai/dsh-api-terminal-controller').ClientTerminals;
      let terminals; const terminalCleanup = createTerminalCleanup({ retry: id => terminals.retryClose(id) });
      const guardedTerminal = new Proxy(remote.terminal, { get(target, key) {
        const value = Reflect.get(target, key, target);
        if (key === 'close') return (id, terminalId, signal) => terminalCleanup.closeRemote(value.bind(target), id, terminalId, signal);
        if (key === 'create') return (agentId, request, signal) => services.call(owner, (namespace, life) => namespace.createTerminal(agentId, request, project.projectId, life), signal);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      // Own the real SDK manager under the stable Remote/Connection owner,
      // NOT the shorter workspace namespace injection.
      terminalFiber = owner.scope.plugin(child => { terminals = new terminalConstructor(child.isolate('webTerminals'), guardedTerminal); }); await terminalFiber; terminalCleanup.bindFailures(terminals.closeFailures);
      function scopedReceipt(value, expectedPath) {
        if (value.projectId !== project.projectId || expectedPath !== undefined && value.absolutePath !== expectedPath) throw Object.assign(Error('文件回执项目或目标不匹配，未采用为文档基线'), { code: 'WORKBENCH_SCOPE_RESPONSE' });
        return value;
      }
      const call = (invoke, signal) => services.call(owner, invoke, signal);
      const transport = {
        read: (path, signal) => call((ns, life) => ns.read(sessionId, path, project.projectId, life), signal).then(unwrap).then(file => scopedReceipt(file)),
        save: (path, text, version, signal) => call((ns, life) => ns.save(sessionId, path, text, version, project.projectId, path, life), signal).then(unwrap).then(file => scopedReceipt(file, path)),
      };
      const controller = createWorkspaceController({ sessionId, projectId: project.key, transport, ...layoutStore, terminals, terminalCleanup, confirm: message => window.confirm(message) });
      return { controller, release: () => terminalFiber.dispose(), workspaceFiles: { async list(id, path, signal) { if (id !== sessionId) throw Error('目录会话不匹配'); const result = await call((ns, life) => ns.list(id, path, project.projectId, life), signal); if (result.ok) scopedReceipt(result.value); return result; } } };
    } catch (error) { layoutStore.storage.dispose(); await terminalFiber?.dispose(); throw error; }
  }
  function projectShelf(sessionId) {
    if (shelves.has(sessionId)) return shelves.get(sessionId);
    const owner = activeOwner; if (!owner || !services.available(owner)) throw Error(reason || '工作台接口不可用');
    const shelf = createProjectShelf({
      isLive: () => !disposed,
      probe: async signal => { const project = unwrap(await services.call(owner, (ns, life) => ns.project(sessionId, life), signal)); return { ...project, key: owner.scope.get('remote').$host?.isLoopback === false ? JSON.stringify([location.origin, project.projectId]) : project.projectId }; },
      create: (project, signal) => createEntry(sessionId, owner, project, signal), release: entry => entry.release?.(),
      onChange(state) { const selected = shelf.get(state.selected)?.controller; if (selected) workspaces.set(sessionId, selected); else workspaces.delete(sessionId); publish(); },
    }); shelfOwners.set(shelf, owner); shelves.set(sessionId, shelf); return shelf;
  }
  async function workspace(sessionId, signal) { return (await projectShelf(sessionId).ensure(signal)).controller; }
  let referenceReady = false, referenceGeneration = 0;

  async function returnReference(uri, { sessionId = current(), signal } = {}) {
    const value = decodeReference(uri), scope = activeScope, generation = referenceGeneration;
    const isCurrent = () => !disposed && !!scope && referenceReady && activeScope === scope && referenceGeneration === generation && current() === sessionId;
    if (!isCurrent() || value.sessionId !== sessionId) throw Error('请回到引用所属的真实会话后再打开。');
    const validateScope = async () => {
      signal?.throwIfAborted(); if (!isCurrent()) throw Error('引用接口或当前会话已变化。');
      const project = unwrap(await scope.get('remote').dshomeWorkspace.project(sessionId, signal));
      signal?.throwIfAborted(); if (!isCurrent()) throw Error('引用接口或当前会话已变化。');
      const projectId = scope.get('remote').$host?.isLoopback === false ? JSON.stringify([location.origin, project.projectId]) : project.projectId;
      if (projectId !== value.projectId) throw Error('会话工作区已变化，未打开旧项目引用。');
      return projectId;
    };
    const projectId = await validateScope();
    let controller = await workspace(sessionId, signal);
    if (controller.projectId !== projectId) controller = (await projectShelf(sessionId).openCurrent(signal)).controller;
    if (!isCurrent() || controller.projectId !== projectId) throw Error('当前工作台与引用项目不一致，未打开文件。');
    const entered = enter(sessionId); if (!entered.ok) throw Error(entered.reason);
    return revealDocumentReference({ uri, controller, isCurrent, signal, validateScope });
  }
  function Body({ sessionId, inputActions }) {
    React.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const scope = activeScope, generation = referenceGeneration;
    if (!shelves.has(sessionId) && !activeScope) return h('p', { role: 'status' }, reason);
    const shelf = projectShelf(sessionId);
    return h(ProjectDeck, { shelf, inputActions, referenceReady, servicesAvailable: services.available(shelfOwners.get(shelf)), reloadNotice, onRefreshServices: reconnectFiles,
      referenceCurrent: controller => !disposed && !!scope && services.available(shelfOwners.get(shelf)) && referenceReady && scope === activeScope && generation === referenceGeneration && current() === sessionId && workspaces.get(sessionId) === controller,
      onOriginal: () => original(sessionId) });
  }
  function Switch({ sessionId }) {
    React.useSyncExternalStore(source.subscribe, source.getSnapshot);
    return h('div', { className: 'dshome-wb-switch', role: 'group', 'aria-label': '侧栏工具' },
      h('button', { type: 'button', 'aria-pressed': modes.get(sessionId) !== 'workbench', onClick: () => original(sessionId) }, '收起工具'),
      h('button', { type: 'button', 'aria-pressed': modes.get(sessionId) === 'workbench', onClick: () => enter(sessionId), disabled: !!reason, title: reason }, '侧栏工具'));
  }
  const beforeUnload = e => { if ([...shelves.values()].some(s => s.hasUnsaved())) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload); keep(() => window.removeEventListener('beforeunload', beforeUnload));
  function startBindings() {
  keep(installReferenceBridge(ctx, { returnReference, onAvailability(value) { referenceReady = value; referenceGeneration++; publish(); } }));
  // Native seats live independently of a file namespace. Its withdrawal must
  // not unregister the tab kind, unmount React content, or dispose terminal holds.
  keep(ctx.inject(['sidebarRight', 'sidebarRightTabs'], seats => {
    seats.effect(function* () {
      yield seats.sidebarRightTabs.register({ id: ID, kind: KIND, multiple: false, title: () => '工作台', keepMounted: true });
      yield seats.sidebarRight.registerCloseHandler(KIND, sessionId => {
        const cleanup = shelves.get(sessionId)?.closeAllNow();
        if (cleanup) { const pending = cleanup.catch(error => console.error('DSHOME project cleanup', error)).finally(() => retiring.delete(pending)); retiring.add(pending); }
        shelves.delete(sessionId); workspaces.delete(sessionId); modes.delete(sessionId); publish();
      });
      yield seats.slots.inject('sidebar.right.pane.tab', () => seats.slots.register({ name: 'sidebar.right.pane.tab', key: ID }, Body));
      yield seats.slots.inject('sidebar.right.pane.tab.title', () => seats.slots.register({ name: 'sidebar.right.pane.tab.title', key: ID }, () => h('span', null, '工作台')));
      yield seats.slots.inject('conversation.session.header.utilities', () => seats.slots.register({ name: 'conversation.session.header.utilities', id: ID, order: -50 }, Switch));
      // Empty Sessions hide Header utilities. Use the actual in-flow Hero options
       // list, not a floating control over a native composer or another panel.
       yield seats.slots.inject('conversation.hero.options', () => seats.slots.register({ name: 'conversation.hero.options', id: ID, order: -50 }, Switch));
      yield seats.sidebarRight.mounted.subscribe(publish);
      uiReady = true; availability(); yield () => { uiReady = false; availability(); };
    }, 'dshome-workspace: stable native content seats');
  }));
  keep(ctx.inject(['typert', 'remote', 'remote.terminal', 'connection'], scope => {
    const owner = { scope, live: true, release: undefined, refreshing: undefined }; activeOwner = owner;
    scope.effect(async function* () {
      let binding;
      try {
        owner.release = await scope.remote.$mount(REMOTE_TYPERT);
        binding = scope.inject(['remote.dshomeWorkspace'], consumer => {
          consumer.effect(function* () {
            const detach = services.attach(owner, consumer.get('remote').dshomeWorkspace); activeScope = consumer; availability();
            yield () => { detach(); if (activeScope === consumer) activeScope = undefined; availability(); };
          }, 'dshome-workspace: replaceable namespace lease');
        });
        yield async () => { owner.live = false; if (activeOwner === owner) activeOwner = undefined; await binding.dispose(); await owner.refreshing?.catch(() => {}); await owner.release?.(); };
        await binding;
      } catch (error) { owner.live = false; if (activeOwner === owner) activeOwner = undefined; await binding?.dispose(); await owner.release?.(); reason = '工作台接入失败：' + error.message; ready.resolve({ ok: false, reason }); publish(); throw error; }
    }, 'dshome-workspace: remote-owner namespace registration');
  }));
  } // end lifetime-bound startup
  function reconnectFiles() {
    const owner = activeOwner; if (disposed || !owner?.live) return Promise.reject(Error('原远端服务已不可用，保留内容未被改绑'));
    if (owner.refreshing) return owner.refreshing;
    owner.refreshing = (async () => {
      await Promise.resolve(); const release = owner.release; owner.release = undefined; await release?.();
      if (disposed || !owner.live || activeOwner !== owner) throw Error('远端服务域已变化，未重新注册旧接口');
      const next = await owner.scope.remote.$mount(REMOTE_TYPERT);
      if (disposed || !owner.live || activeOwner !== owner) { await next(); throw Error('接口注册期间远端已撤回'); }
      owner.release = next;
    })().finally(() => { owner.refreshing = undefined; }); return owner.refreshing;
  }
  const api = { setMode: (mode, sessionId = current()) => mode === 'original' ? { ok: original(sessionId) } : enter(sessionId),
    status: () => ({ mode: modes.get(current()) ?? 'original', reason, sessionId: current() ?? null, geometry: 'isolated-workspace-content', version: 2, lifecycle: workspaceLifecycle, reload: checkReload(), lastUpdate, references: referenceReady, sessions: [...workspaces.keys()] }),
    ready: ready.promise, checkReload, returnReference, reconnectFiles, workspace: sessionId => workspaces.get(sessionId), projects: sessionId => shelves.get(sessionId)?.getSnapshot(), checkProject: sessionId => projectShelf(sessionId).check(), openCurrentProject: sessionId => projectShelf(sessionId).openCurrent(), selectProject: (sessionId, key) => projectShelf(sessionId).select(key), subscribe: source.subscribe, teardown: dispose };
  window.__dshomePluginWorkbench = api;
  async function disposeRun() {
    if (disposed) return; disposed = true; services.dispose(); ready.resolve({ ok: false, reason: '工作台已卸载' });
    if (window.__dshomePluginWorkbench === api) window.__dshomePluginWorkbench = null;
    // No process-close requests on unload: only detach/release the service's
    // own lifetime. Cordis inject returns a Fiber, not a function.
    for (const off of cleanups.reverse()) {
      if (typeof off === 'function') await off();
      else if (off?.dispose) await off.dispose();
    }
    for (const shelf of shelves.values()) await shelf.dispose(); await Promise.all([...retiring]); shelves.clear(); listeners.clear(); workspaces.clear();
  }
  function dispose() {
    if (disposing) return disposing;
    const completion = Promise.withResolvers(); disposing = completion.promise; window[shutdownKey] = disposing;
    disposeRun().then(completion.resolve, completion.reject);
    const clear = () => { if (window[shutdownKey] === disposing) delete window[shutdownKey]; };
    disposing.then(clear, clear); return disposing;
  }
  // Legacy reentrantPass deliberately does not await teardown. Publish the new
  // API/ready promise now, but never duplicate native seats while its predecessor
  // still owns them. This is a clean replacement barrier, not draft HMR recovery.
  Promise.resolve(previousShutdown).then(() => { if (!disposed) startBindings(); }).catch(error => { reason = '上一版资源未能安全退出：' + error.message; ready.resolve({ ok: false, reason }); publish(); });
  ctx.effect(() => dispose); return dispose;
}
