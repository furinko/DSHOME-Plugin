/* Actual SDK native Sidebar controller, registry, dockkit, Session-scoped
 * stores, SlotRegistry/renderer and UI atoms + the complete packaged plugin.
 * Only the outer frame/Session data, locale/access/shortcuts and carrier are
 * explicit fixtures. This is an isolated native-component composition, NOT
 * the running authenticated GUI or a viewport-geometry acceptance test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { apply as applyHost } from '../src/host.mjs';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
import { publicBrowserModule } from './fixtures/public-browser-module.mjs';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT required for actual native Sidebar composition');
const sdk = createRequire(resolve(sdkRoot, 'package.json')), dev = createRequire(resolve('.dev-sdk/package.json'));
const load = name => import(pathToFileURL(sdk.resolve(name)));
const [cordis, { TypertRegistry }, { TypertGatewayService }, { SandboxedFileSystem }, { JSDOM }, React, ReactDOM, ReactDOMClient, ReactJSX, pureSlots, store, zod] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'), load('@deepseek-ai/dsh-fs-sandbox'),
  import(pathToFileURL(dev.resolve('jsdom'))), import(pathToFileURL(dev.resolve('react'))), import(pathToFileURL(dev.resolve('react-dom'))), import(pathToFileURL(dev.resolve('react-dom/client'))), import(pathToFileURL(dev.resolve('react/jsx-runtime'))),
  import(pathToFileURL(dev.resolve('@deepseek-ai/dsh-client-ui-slots'))), import(pathToFileURL(dev.resolve('@deepseek-ai/dsh-client-store'))), import('zod'),
]);
const constant = value => ({ subscribe: () => () => {}, getSnapshot: () => value });
test('packaged workbench integrates with actual native Sidebar type/store/body and close guard without occupying another owner seat', { timeout: 30000 }, async t => {
  const host = new cordis.Context(), client = new cordis.Context(), dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost:39997/' });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, location: dom.window.location,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // No pixel fabrication: Canvas and geometry are not covered in jsdom.
  window.HTMLCanvasElement.prototype.getContext = () => null; window.confirm = () => false;
  let nativeFiber, feature, unmount, retained = 0, released = 0;
  t.after(async () => {
    await React.act(async () => { await feature?.dispose(); unmount?.(); await nativeFiber?.dispose(); await client.fiber.dispose(); });
    await host.fiber.dispose(); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const cwd = resolve('.'); host.reflect.provide('sessions', new Map([['A', { id: 'A', header: { cwd } }]]));
  host.reflect.provide('sandboxPolicy', { defaultMode: 'read-only', resolve: () => ({ mode: 'read-only', workspaceRoot: cwd }) });
  host.reflect.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'fixture-denied' }) });
  new SandboxedFileSystem(host, { cwd, diffBasisMaxBytes: 1048576 }); new TypertRegistry(host); new TypertRegistry(client);
  const carrier = createGatewayCarrier(host), gateway = new TypertGatewayService(host, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 }); applyHost(host);
  const { WorkspaceFiles } = await load('@deepseek-ai/dsh-api-workspace-files');
  new WorkspaceFiles(host, { maxBytes: 2097152, maxFileBytes: 33554432, maxLines: 5000, maxEntries: 2000 });
  host.typert.register((await load('@deepseek-ai/dsh-api-workspace-files/typert')).TYPERT);
  const peer = { id: 'native-sidebar-owner-fixture', principal: { kind: 'owner' }, signal: new AbortController().signal };
  client.reflect.provide('connection', { isLoopback: true, interactions: 'none', generation: constant({ host: { home: cwd } }),
    rpc: { call: (_prefix, endpoint, payload, signal) => carrier.call('/api', endpoint, payload, signal, peer), open: async function* () { throw Error('No terminal/stream is started in native Sidebar test'); } } });
  const modules = new Map([['@deepseek-ai/cordis', cordis], ['react', React.default], ['react-dom', ReactDOM.default], ['react-dom/client', ReactDOMClient], ['react/jsx-runtime', ReactJSX],
    ['@deepseek-ai/dsh-client-ui-slots', pureSlots], ['@deepseek-ai/dsh-client-store', store], ['zod', zod]]), factories = new Map(), errors = [];
  window.__ModuleLoader__ = { load: ({ id, factory }) => factories.set(id, factory) };
  const consume = id => { if (!modules.has(id)) { const factory = factories.get(id); if (!factory) throw Error('Missing published module ' + id); modules.set(id, factory(consume)); } return modules.get(id); };
  const evaluate = source => new Function('window', 'document', source)(window, document);
  for (const id of ['@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit']) {
    const output = await publicBrowserModule(id); evaluate(output.js); const style = document.createElement('style'); style.textContent = output.css; document.head.appendChild(style);
  }
  const { sdkClientSource } = await import('./fixtures/sdk-client-source.mjs');
  for (const id of ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-api-terminal-controller', '@deepseek-ai/dsh-client-ui-sidebar-right']) evaluate(await sdkClientSource(id, sdk));
  modules.set('@deepseek-ai/dsh-api-gateway/client', consume('@deepseek-ai/dsh-api-gateway'));
  consume('@deepseek-ai/dsh-client-ui-renderer').apply(client); consume('@deepseek-ai/dsh-api-gateway').apply(client);
  await client.remote.$mount((await load('@deepseek-ai/dsh-api-workspace-files/remote')).default);
  await client.remote.$mount((await load('@deepseek-ai/dsh-api-terminal-controller/remote')).default);
  // The renderer supplies scope/owner machinery. This fixture only supplies an
  // already-ready Session binding and retained reference data, not replacement
  // sidebar stores, bodies, docking algorithms, types or content lifetimes.
  const binding = { key: 'A', ctx: client, hooks: {}, keyedHooks: {}, props: { sessionId: 'A' } }, bindingSource = constant(binding);
  client.slots.bindStoreScope(binding);
  const adapter = { current: bindingSource, bindingSource: reference => reference?.sessionId === 'A' ? bindingSource : constant({ key: undefined, hooks: {}, keyedHooks: {}, props: { sessionId: undefined } }), renderArea: (_binding, props) => props.children };
  client.slots.installScope('session', adapter); client.reflect.provide('uiSession', { adapter });
  client.reflect.provide('sessions', { retain(sessionId) { assert.equal(sessionId, 'A'); retained++; let active = true; return { sessionId, ready: Promise.resolve(), release() { if (active) { active = false; released++; } } }; } });
  const panelInfo = constant({ activePanelId: null });
  client.reflect.provide('layout', { panelInfo, openRightbar() {}, closeRightbar() {} });
  client.slots.provideRoot({ hooks: { panelInfo } });
  const locale = { bind: () => key => key, register: () => () => {}, subscribe: () => () => {}, getVersion: () => 0, getSnapshot: () => 0 };
  client.reflect.provide('locale', locale); client.slots.installLocale(locale);
  client.reflect.provide('resources', { pin() {} });
  client.reflect.provide('shortcuts', { catalog: constant([]), register: () => () => {}, closeWindow: async () => {} });
  client.slots.onEntryError((_key, _entry, error) => errors.push(error.message));
  const h = React.createElement;
  client.slots.register({ name: 'root', children: { rightbar: { kind: 'single', scope: 'root' }, 'conversation.session.header.corner': { kind: 'single', scope: 'session' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'shell.overlay': { kind: 'list', scope: 'root' } } }, ({ renderSlot }) => h('main', null,
      h('section', { id: 'fixture-chat' }, h('textarea', { id: 'fixture-composer', defaultValue: '原有未发送草稿' })),
      renderSlot('rightbar', { width: 1000, viewportWidth: 1800, canShow: true })));
  await React.act(async () => { nativeFiber = client.plugin(consume('@deepseek-ai/dsh-client-ui-sidebar-right')); await nativeFiber; });
  assert.equal(client.slots.entries('rightbar.session').length, 1);
  const originalSeat = client.slots.entries('rightbar.session')[0], declaration = client.slots.spec('sidebar.right.pane.tab');
  assert.equal(originalSeat.children['sidebar.right.pane.tab'].scope, 'session'); assert.equal(declaration.kind, 'keyed');
  await React.act(async () => { unmount = client.uiRenderer.mount(document.querySelector('#app')); });
  assert.equal(client.sidebarRight.mounted.getSnapshot(), 'A');
  window.__dshomePlugin = { theme: false, conversation: false, minimap: false, sidebar: false, notify: false, glow: false, workbench: true };
  evaluate(await readFile(resolve('lib/client.js'), 'utf8'));
  await React.act(async () => { feature = client.plugin(consume('dshome-plugin')); await feature; assert.equal((await window.__dshomePluginWorkbench.ready).ok, true); });
  const api = window.__dshomePluginWorkbench;
  await React.act(async () => { assert.equal(api.setMode('workbench').ok, true); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.equal(client.sidebarRight.active().kind, 'dshome-workspace'); assert.equal(client.sidebarRightTabs.get('dshome-workspace').keepMounted, true);
  assert.equal(client.slots.entries('rightbar.session')[0], originalSeat, 'do not shadow native owner'); assert.equal(client.slots.spec('sidebar.right.pane.tab'), declaration);
  const body = document.querySelector('.dshome-v2'), chat = document.querySelector('#fixture-chat'), composer = document.querySelector('#fixture-composer');
  assert.ok(body, document.body.textContent);
  const c = api.workspace('A'); let doc;
  await React.act(async () => { doc = await c.openDocument('package.json'); await doc.load(); doc.edit(doc.getSnapshot().text + '\n'); });
  await React.act(async () => { api.setMode('original'); assert.equal(client.sidebarRight.isExpanded(), false); api.setMode('workbench'); });
  assert.equal(document.querySelector('.dshome-v2'), body); assert.equal(document.querySelector('#fixture-chat'), chat); assert.equal(document.querySelector('#fixture-composer'), composer); assert.equal(composer.value, '原有未发送草稿');
  const tab = client.sidebarRight.active();
  assert.throws(() => client.sidebarRight.close(tab.id), /未保存/); assert.equal(client.sidebarRight.active().id, tab.id); assert.equal(doc.getSnapshot().dirty, true);
  window.confirm = () => true;
  await React.act(async () => { client.sidebarRight.close(tab.id); });
  assert.equal(client.sidebarRight.tabsIn('A').some(record => record.id === tab.id), false); assert.equal(api.workspace('A'), undefined);
  await React.act(async () => { await feature.dispose(); }); feature = undefined;
  assert.equal(client.sidebarRightTabs.get('dshome-workspace'), undefined); assert.equal(client.slots.entries('rightbar.session')[0], originalSeat);
  assert.deepEqual(errors, []);
  await React.act(async () => { unmount(); unmount = undefined; await nativeFiber.dispose(); }); nativeFiber = undefined;
  assert.equal(retained, released);
});
