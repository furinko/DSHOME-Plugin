// Isolated SDK composition. Navigation data/access/shortcuts/settings are explicit fixtures.
import { nativeThemeSettings } from '../test/fixtures/native-theme-settings.mjs';
export async function dualShellFixture({ ctx, consume, store, React, errors, transport }) {
  const constant = value => ({ getSnapshot: () => value, subscribe: () => () => {} }), h = React.createElement;
  ctx.slots.onEntryError((key, _entry, error) => errors.push(key + ': ' + error.message));
  const dictionaries = new Map();
  const locale = { bind: ns => (key, values = {}) => { const data = dictionaries.get(ns); const text = data?.[key] ?? key.split('.').reduce((value, part) => value?.[part], data); return typeof text === 'string' ? text.replace(/\{(\w+)\}/g, (_m, name) => values[name] ?? '') : key; }, register: (ns, languages) => { dictionaries.set(ns, languages.zh); return () => dictionaries.delete(ns); }, subscribe: () => () => {}, getVersion: () => 0, getSnapshot: () => 0 };
  ctx.reflect.provide('locale', locale); ctx.slots.installLocale(locale);
  const shortcuts = new Map(), catalog = store.createSnapshotStore([]);
  const register = command => { if (shortcuts.has(command.id)) throw Error('Duplicate shortcut: ' + command.id); shortcuts.set(command.id, command); catalog.set([...shortcuts.values()]); return () => { shortcuts.delete(command.id); catalog.set([...shortcuts.values()]); }; };
  ctx.reflect.provide('shortcuts', { catalog, register, registerFixed: register, describeBinding: () => ({ keys: [] }), closeWindow: async () => {} });
  ctx.reflect.provide('remoteAccess', { source: () => constant(true) });
  ctx.reflect.provide('resources', { pin() {} });
  const themeSettings = await nativeThemeSettings({ ctx, consume, store });
  // Actual public workspace model/controller, with deliberately synthetic host rows.
  const api = consume('@deepseek-ai/dsh-api-workspace-controller');
  const workspaces = new api.ClientWorkspaceModel({});
  const baseline = { items: [
    { workspaceId: 'W1', path: '/fixture/shared', title: '产品开发', sessionIds: ['A', 'B'], createdAt: 1, updatedAt: 1 },
    { workspaceId: 'W2', path: '/fixture/shared', title: '另一个工作区（相同路径）', sessionIds: ['C'], createdAt: 1, updatedAt: 1 },
  ], archivedSessionIds: [], pinnedSessionIds: [] };
  workspaces.replaceBaseline(baseline); new api.WorkspaceController(ctx, workspaces);
  let reference, opening = 0;
  async function openSession(id) {
    const request = ++opening;
    if (reference?.sessionId === id) return;
    const next = ctx.sessions.retain(id, { source: 'mainView' });
    try { await next.ready; if (request !== opening) { next.release(); return; } reference?.release(); reference = next; ctx.layout.selectPanel(null); }
    catch (error) { next.release(); throw error; }
  }
  ctx.effect(() => () => reference?.release());
  ctx.reflect.provide('uiWorkspace', { openSession, openWorkspace: async () => { throw Error('Workspace creation is not implemented by this navigation fixture'); } });
  await ctx.plugin(consume('@deepseek-ai/dsh-client-ui-session'));
  ctx.slots.installScope('session-maybe', ctx.uiSession.adapter);
  ctx.slots.provideRoot({ hooks: { workspaces: workspaces } });
  await ctx.plugin(consume('@deepseek-ai/dsh-client-ui-layout'));
  await ctx.plugin(consume('@deepseek-ai/dsh-client-ui-conversation'));
  consume('@deepseek-ai/dsh-client-ui-chat').apply(ctx);
  await ctx.plugin(consume('@deepseek-ai/dsh-client-ui-sidebar'));
  const Navigation = () => h('nav', { 'aria-label': '隔离工作区导航', style: { padding: 10, display: 'flex', flexDirection: 'column', gap: 12 } },
    h('strong', null, '工作区 · 产品开发'), ...['A','B'].map(id => h('button', { key: id, onClick: () => openSession(id) }, '会话 ' + id)),
    h('strong', null, '另一工作区'), h('button', { onClick: () => openSession('C') }, '会话 C'),
    h('hr'), h('button', { onClick: () => ctx.layout.selectPanel('fixture-diagnostics') }, '其他主面板'), h('button', { onClick: () => ctx.layout.selectPanel(null) }, '返回会话'),
    h('p', { style: { fontSize: 12, opacity: .65 } }, '工作区记录、导航按钮和授权是测试夹具；右侧会话与输入组件为真实SDK。'));
  ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({ name: 'sidebar.workspaces' }, Navigation));
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'fixture-diagnostics' }, () => h('section', { 'aria-label': '隔离全局页面', style: { padding: 24 } }, h('h1', null, '全局页面组合验证'), h('p', null, '真实main插槽；内容为夹具，不冒充完整设置验收。'), h('button', { onClick: () => ctx.layout.selectPanel(null) }, '回到当前会话'))));
  await ctx.plugin(consume('@deepseek-ai/dsh-client-ui-sidebar-right'));
  await openSession('A');
  ctx.conversation.input.for(ctx.sessions.binding('A').ctx).setDraft('原生会话 A 的独立草稿');
  const unmount = ctx.uiRenderer.mount(document.querySelector('#app'));
  window.__dshomePlugin = { theme: true, conversation: true, minimap: true, sidebar: true, notify: false, glow: false, workbench: true };
  const product = ctx.plugin(consume('dshome-plugin')); await product;
  const productReady = await window.__dshomePluginWorkbench.ready;
  if (!productReady.ok) throw Error(productReady.reason);
  window.testP0 = { ctx, errors, transport, workspaces, baseline, openSession, themeSettings, shortcuts,
    input: id => ctx.conversation.input.for(ctx.sessions.binding(id).ctx),
    async dispose() { unmount(); await ctx.fiber.dispose(); } };
}
