/* Actual native components with explicit outer frame/ready Session data.
 * Optional reference mode installs actual ui-conversation InputActions and
 * UserText. Its textarea is a read-only state mirror, NOT native composer DOM
 * or durable history. Nothing connects to the running authenticated GUI. */
import * as cordis from '@deepseek-ai/cordis';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactJSX from 'react/jsx-runtime';
import * as slots from '@deepseek-ai/dsh-client-ui-slots';
import * as store from '@deepseek-ai/dsh-client-store';
import * as atoms from '@deepseek-ai/dsh-client-ui-primitives';
import * as dockkit from '@deepseek-ai/dsh-client-ui-dockkit';
import * as zod from 'zod';
import * as reactVirtual from '@tanstack/react-virtual';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import filesRemote from '@deepseek-ai/dsh-api-workspace-files/remote';
import terminalRemote from '@deepseek-ai/dsh-api-terminal-controller/remote';
import sessionRemote from '@deepseek-ai/dsh-api-session-controller/remote';
import { nativeShellEntry } from './native-shell-entry.mjs';
import { nativeReferenceSession } from './native-reference-session.mjs';
const modules = new Map([['@deepseek-ai/cordis', cordis], ['react', React], ['react-dom', ReactDOM], ['react-dom/client', ReactDOMClient], ['react/jsx-runtime', ReactJSX],
  ['@deepseek-ai/dsh-client-ui-slots', slots], ['@deepseek-ai/dsh-client-store', store], ['@deepseek-ai/dsh-client-ui-primitives', atoms], ['@deepseek-ai/dsh-client-ui-dockkit', dockkit], ['zod', zod], ['@tanstack/react-virtual', reactVirtual]]), factories = new Map();
const consume = id => { if (!modules.has(id)) { const factory = factories.get(id); if (!factory) throw Error('Missing published factory ' + id); modules.set(id, factory(consume)); } return modules.get(id); };
window.__ModuleLoader__ = { load: ({ id, factory }) => factories.set(id, factory) };
const constant = value => ({ subscribe: () => () => {}, getSnapshot: () => value });
window.startNativeFixture = async ({ references = false, composer = false, history = false, nativeShell = false, nativeChrome = false, nativeHmr = false } = {}) => {
  const ctx = new cordis.Context(), errors = [];
  new TypertRegistry(ctx);
  if (nativeHmr) new (consume('@deepseek-ai/cordis-plugin-loader').Loader)(ctx); else ctx.reflect.provide('loader', { await: () => Promise.resolve() });
  let connectionHooks; let epoch = 1, generationLife = new AbortController(); const sockets = new Set(), generation = store.createSnapshotStore({ id: 'isolated-browser-generation-1', signal: generationLife.signal, host: { home: '/' } });
  const transport = { pauseStreams() { generation.set(undefined); generationLife.abort(); for (const socket of sockets) socket.close(4000, 'owned fixture stream outage'); }, resumeStreams() { generationLife = new AbortController(); generation.set({ id: 'isolated-browser-generation-' + ++epoch, signal: generationLife.signal, host: { home: '/' } }); connectionHooks?.onReconnectRequested(); connectionHooks?.onConnected(); } };
  ctx.reflect.provide('connection', { isLoopback: true, interactions: 'answer', generation,
    start(hooks) { connectionHooks = hooks; return { stop() { if (connectionHooks === hooks) connectionHooks = undefined; } }; },
    registerGenerationSource: () => () => {}, openWebSocket: path => { const socket = new WebSocket(new URL(generation.getSnapshot() ? path : '/fixture-stream-outage', location.href).href.replace(/^http/, 'ws')); sockets.add(socket); socket.addEventListener('close', () => sockets.delete(socket), { once: true }); return socket; },
    rpc: { async call(prefix, endpoint, payload, signal) {
      const response = await fetch('/fixture-rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, endpoint, payload }), signal });
      if (!response.ok) throw Error('Fixture carrier HTTP ' + response.status); return response.json();
    } },
  });
  modules.set('@deepseek-ai/dsh-api-gateway/client', consume('@deepseek-ai/dsh-api-gateway'));
  consume('@deepseek-ai/dsh-client-ui-renderer').apply(ctx); consume('@deepseek-ai/dsh-api-gateway').apply(ctx);
  await ctx.remote.$mount(filesRemote); await ctx.remote.$mount(terminalRemote);
  let retained = 0, released = 0;
  const retain = sessionId => { retained++; let active = true; return { sessionId, ready: Promise.resolve(), release() { if (active) { active = false; released++; } } }; };
  let nativeOwner;
  if (history) {
    await ctx.remote.$mount(sessionRemote);
    ctx.reflect.provide('fileUpload', {});
    // Public apply creates the actual ClientSessions/Session object layer;
    // the backend is the explicitly labelled isolated Host journal fixture.
    consume('@deepseek-ai/dsh-api-session-controller').apply(ctx);
    const catalog = ctx.get('sessions').list;
    await new Promise((resolve, reject) => {
      const check = () => { const s = catalog.getSnapshot(); if (s.byId.A) { off(); resolve(); } else if (s.phase !== 'pending') { off(); reject(Error('Native Session catalog did not include A: ' + JSON.stringify(s))); } };
      const off = catalog.subscribe(check); ctx.effect(() => off); check();
    });
    const reference = ctx.get('sessions').retain('A', { source: 'controllerOperation' });
    ctx.effect(() => () => reference.release()); await reference.ready;
    nativeOwner = ctx.get('sessions').binding('A');
    if (nativeOwner.session.getSnapshot().openState !== 'open') throw Error('Native Session failed to open: ' + JSON.stringify(nativeOwner.session.getSnapshot().openError));
  }
  if (nativeShell) return nativeShellEntry({ ctx, consume, store, React, errors, transport, chrome: nativeChrome, hmr: nativeHmr ? { factories, modules } : undefined });
  const referenceSession = references ? nativeReferenceSession(ctx, store, retain, nativeOwner) : null;
  const binding = referenceSession?.binding ?? { key: 'A', ctx, hooks: {}, keyedHooks: {}, props: { sessionId: 'A' } }, source = referenceSession?.source ?? constant(binding);
  const adapter = referenceSession?.adapter ?? { current: source, bindingSource: () => source, renderArea: (_binding, props) => props.children };
  ctx.slots.installScope('session', adapter); if (composer) ctx.slots.installScope('session-maybe', adapter);
  ctx.reflect.provide('uiSession', referenceSession?.uiSession ?? { adapter });
  if (composer) ctx.slots.provideRoot({ hooks: { sessions: referenceSession.sessions.list, sessionStatus: constant(new Map()), workspaces: constant({ phase: 'ready', items: [] }) } });
  if (!history) ctx.reflect.provide('sessions', referenceSession?.sessions ?? { retain });
  const panelInfo = constant({ activePanelId: null }); ctx.reflect.provide('layout', { panelInfo, openRightbar() {}, closeRightbar() {} }); ctx.slots.provideRoot({ hooks: { panelInfo } });
  const locale = { bind: () => key => key, register: () => () => {}, subscribe: () => () => {}, getVersion: () => 0, getSnapshot: () => 0 };
  ctx.reflect.provide('locale', locale); ctx.slots.installLocale(locale); ctx.reflect.provide('resources', { pin() {} });
  ctx.reflect.provide('shortcuts', { catalog: constant([]), register: () => () => {}, registerFixed: () => () => {}, describeBinding: () => ({ keys: [] }), closeWindow: async () => {} });
  if (references) {
    const settings = store.createSnapshotStore({ value: {} });
    ctx.reflect.provide('configForms', { get: () => history ? settings : undefined, developerTools: { enabled: constant(false) } });
    if (!history) ctx.reflect.provide('fileUpload', {}); ctx.reflect.provide('uiWorkspace', {});
    const conversation = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-conversation')); await conversation;
    if (history) consume('@deepseek-ai/dsh-client-ui-chat').apply(ctx);
    referenceSession.input().setDraft('既有聊天草稿不应被布局改变');
  }
  ctx.slots.bindStoreScope(binding);
  ctx.slots.onEntryError((key, _entry, error) => { errors.push(key + ': ' + error.message); });
  const h = React.createElement;
  function NativeDraft({ useInput, renderFactorySlot }) {
    const draft = useInput(s => s.draft);
    return h(React.Fragment, null, !composer && h('textarea', { id: 'fixture-composer', readOnly: true, value: draft, 'aria-label': '原生输入状态只读镜像' }),
      h('aside', { id: 'native-reference-preview' }, h('strong', null, '原生 UserText 预览（未发送，非历史记录）'), renderFactorySlot('conversation.user.text', { text: draft, facts: {}, interactive: true })));
  }
  if (references) ctx.slots.inject('fixture.native-draft', () => ctx.slots.register({ name: 'fixture.native-draft' }, composer
    ? function NativeComposer(props) { return h('div', { id: 'fixture-composer', style: { height: '100%', minHeight: 0 } }, history && h(NativeDraft, props), props.renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, history ? undefined : { slots: { views: NativeDraft } })); }
    : NativeDraft));
  function Frame({ renderSlot }) {
    const ref = React.useRef(null), [room, setRoom] = React.useState({ width: 1200, viewport: innerWidth });
    React.useLayoutEffect(() => { const observer = new ResizeObserver(() => { if (ref.current?.clientWidth) setRoom({ width: ref.current.clientWidth, viewport: innerWidth }); }); observer.observe(ref.current); return () => observer.disconnect(); }, []);
    return h('main', { className: 'fixture-frame' }, h('section', { id: 'fixture-chat' }, h('h2', null, history ? '隔离测试 · 原生客户端会话／Chat' : composer ? '隔离测试 · 原生输入栏组件' : references ? '隔离测试 · 原生输入模型／文本预览' : '隔离测试 · 聊天/输入是夹具'), composer
      ? h('div', null, h('button', { onClick: () => window.__dshomePluginWorkbench.setMode('original') }, '原版'), h('button', { onClick: () => window.__dshomePluginWorkbench.setMode('workbench') }, '工作台')) : renderSlot('conversation.session.header.utilities', {}),
      h('p', { style: composer ? { flex: 'none' } : undefined }, history ? '真实 ClientSessions / SessionEventStream / Chat；Host 日志端与授权、设置及 UI scope adapter 为夹具。上方按钮是测试入口；下方预览非已发送记录。' : composer ? '真实原生 Conversation content / InputBar / Lexical；会话数据及预览仍是夹具，非历史记录。上方工作台按钮是测试入口。' : references ? '真实 InputActions / Lexical 和原生 UserText；输入 DOM 与历史仍未验。不连接运行 DSH。' : '右侧是实际 SDK 原生侧栏，不连接运行中的 DSH。'),
      references ? renderSlot('fixture.native-draft', {}) : h('textarea', { id: 'fixture-composer', defaultValue: '既有聊天草稿不应被布局改变' })),
      h('section', { id: 'native-region', ref }, renderSlot('rightbar', { width: room.width, viewportWidth: room.viewport, canShow: true })));
  }
  ctx.slots.register({ name: 'root', children: { rightbar: { kind: 'single', scope: 'root' }, 'fixture.native-draft': { kind: 'single', scope: 'session' },
    ...(composer ? { main: { kind: 'keyed', scope: 'root' } } : { 'conversation.session.header.corner': { kind: 'single', scope: 'session' }, 'conversation.session.header.utilities': { kind: 'list', scope: 'session' } }), 'shell.overlay': { kind: 'list', scope: 'root' } } }, Frame);
  const native = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-sidebar-right')); await native;
  const unmount = ctx.uiRenderer.mount(document.querySelector('#app'));
  window.__dshomePlugin = { theme: false, conversation: false, minimap: false, sidebar: false, notify: false, glow: false, workbench: true };
  const product = ctx.plugin(consume('dshome-plugin')); await product;
  const readiness = await window.__dshomePluginWorkbench.ready; if (!readiness.ok) throw Error(readiness.reason);
  window.testNative = { ctx, product, errors, transport, reference: referenceSession, sessionAPI: history ? consume('@deepseek-ai/dsh-api-session-controller') : null, get nativeRetention() { return history ? referenceSession.sessions.retainInfo('A').getSnapshot() : null; }, get retained() { return retained; }, get released() { return released; },
    controller: () => window.__dshomePluginWorkbench?.workspace('A'),
    async dispose() { await product.dispose(); unmount(); await native.dispose(); await ctx.fiber.dispose(); } };
};
