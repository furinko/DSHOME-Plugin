// Actual public ui-session adapter + ui-layout AppFrame + ui-conversation
// Main/Header/composer + ui-chat + right Sidebar. Only auxiliary services below
// (theme data, settings, locale, access answers and navigation controls) are fixtures.
import { nativeHmrEntry } from './native-hmr-entry.mjs';
import { nativeThemeSettings } from './native-theme-settings.mjs';
export async function nativeShellEntry({ ctx, consume, store, React, errors, transport, chrome = false, hmr: hmrOptions }) {
  const constant = value => ({ getSnapshot: () => value, subscribe: () => () => {} }), h = React.createElement;
  ctx.slots.onEntryError((key, _entry, error) => errors.push(key + ': ' + error.message));
  const locale = { bind: () => key => key, register: () => () => {}, subscribe: () => () => {}, getVersion: () => 0, getSnapshot: () => 0 };
  ctx.reflect.provide('locale', locale); ctx.slots.installLocale(locale);
  ctx.reflect.provide('shortcuts', { catalog: constant([]), register: () => () => {}, registerFixed: () => () => {}, describeBinding: () => ({ keys: [] }), closeWindow: async () => {} });
  ctx.reflect.provide('remoteAccess', { source: () => constant(true) });
  if (!chrome) ctx.reflect.provide('theme', { getTheme: () => ({ preference: 'light', active: { colorScheme: 'light', tokens: { '--dsw-alias-bg-base': '#fff', '--dsw-specific-sidebar-fill': '#eef2f7', '--dsw-alias-border-l3': '#d6dfef', '--dsw-alias-border-l2': '#ccd6e7', '--dsw-alias-text-primary': '#173050', '--dsw-alias-text-secondary': '#60728c', '--dsw-alias-brand-primary': '#4d6bfe' } }, fontSizes: { text: 14, code: 13, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '', ui: '', mono: '' } }) });
  ctx.reflect.provide('resources', { pin() {} });
  let themeSettings;
  if (chrome) themeSettings = await nativeThemeSettings({ ctx, consume, store });
  else { const settings = store.createSnapshotStore({ value: {} }); ctx.reflect.provide('configForms', { get: () => settings, developerTools: { enabled: constant(false) } }); }
  let mainReference;
  const openSession = async id => { if (mainReference?.sessionId === id) return; const next = ctx.sessions.retain(id, { source: 'mainView' }); mainReference?.release(); mainReference = next; await next.ready; ctx.layout.selectPanel(null); };
  ctx.effect(() => () => mainReference?.release());
  ctx.reflect.provide('uiWorkspace', { openSession, openWorkspace: async () => { throw Error('Workspace creation is outside this isolated shell fixture'); } });
  const sessionUI = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-session')); await sessionUI;
  ctx.slots.installScope('session-maybe', ctx.uiSession.adapter);
  ctx.slots.provideRoot({ hooks: { workspaces: constant({ phase: 'ready', items: chrome ? [{ workspaceId: 'explicit-fixture-workspace', title: '隔离测试工作区', sessionIds: ['A', 'B'] }] : [] }) } });
  const layout = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-layout')); await layout;
  const conversation = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-conversation')); await conversation;
  consume('@deepseek-ai/dsh-client-ui-chat').apply(ctx);
  ctx.slots.inject('sidebar', () => ctx.slots.register({ name: 'sidebar' }, () => h('nav', { 'aria-label': '隔离测试导航夹具', style: { padding: 12, overflowWrap: 'anywhere' } }, h('h3', null, 'DSHOME 隔离验证'), h('p', null, '真实 AppFrame / Main / Header；此导航、设置、调色及 Host 数据仍是夹具。'), h('button', { onClick: () => openSession('A') }, '会话 A'), h('button', { onClick: () => openSession('B') }, '会话 B'), h('button', { onClick: () => ctx.layout.selectPanel('fixture-diagnostics') }, '其他主面板'), h('button', { onClick: () => ctx.layout.selectPanel(null) }, '返回会话'), h('button', { onClick: () => ctx.layout.toggleSidebar() }, '收起导航'))));
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'fixture-diagnostics' }, () => h('section', { 'aria-label': '隔离诊断面板' }, '这是独立主面板，不属于工作台内容。')));
  const native = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-sidebar-right')); await native;
  await openSession('A'); const owner = ctx.sessions.binding('A'); ctx.conversation.input.for(owner.ctx).setDraft('原生会话壳中的聊天草稿');
  const unmount = ctx.uiRenderer.mount(document.querySelector('#app'));
  window.__dshomePlugin = { theme: false, conversation: false, minimap: false, sidebar: false, notify: false, glow: false, workbench: true };
  const hmr = hmrOptions ? await nativeHmrEntry({ ctx, consume, ...hmrOptions }) : undefined;
  const product = hmr?.entry.fiber ?? ctx.plugin(consume('dshome-plugin')); await product; const ready = await window.__dshomePluginWorkbench.ready; if (!ready.ok) throw Error(ready.reason);
  window.testNative = { ctx, product, errors, transport, openSession, themeSettings, hmr, reference: { input: (id = 'A') => ctx.conversation.input.for(ctx.sessions.binding(id).ctx) }, controller: (id = 'A') => window.__dshomePluginWorkbench?.workspace(id),
    async dispose() { if (hmr) { await hmr.receiver.dispose(); await hmr.entry?.fiber?.dispose(); } else await product.dispose(); unmount(); await native.dispose(); await ctx.fiber.dispose(); } };
}
