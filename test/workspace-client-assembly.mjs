/* Actual packaged classic client + public production SlotRegistry/renderer +
 * Client Gateway projection + Host Gateway/FS. The outer slot declarations,
 * Session binding, native navigation/type registry and carrier are explicit
 * integration fixtures. This is NOT production DOM/PTY acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { apply as applyHost } from '../src/host.mjs';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
import { REMOTE_TYPERT } from '../src/workbench/wire.mjs';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT required');
const sdk = createRequire(resolve(sdkRoot, 'package.json')), dev = createRequire(resolve('.dev-sdk/package.json'));
const sdkImport = name => import(pathToFileURL(sdk.resolve(name)));
const [{ Context }, cordis, { TypertRegistry }, { TypertGatewayService }, { SandboxedFileSystem }, { JSDOM }, React, ReactDOM, ReactDOMClient, ReactJSX, pureSlots] = await Promise.all([
  sdkImport('@deepseek-ai/cordis'), sdkImport('@deepseek-ai/cordis'), sdkImport('@deepseek-ai/dsh-typert-registry'), sdkImport('@deepseek-ai/dsh-api-gateway'), sdkImport('@deepseek-ai/dsh-fs-sandbox'),
  import(pathToFileURL(dev.resolve('jsdom'))), import(pathToFileURL(dev.resolve('react'))), import(pathToFileURL(dev.resolve('react-dom'))), import(pathToFileURL(dev.resolve('react-dom/client'))), import(pathToFileURL(dev.resolve('react/jsx-runtime'))), import(pathToFileURL(dev.resolve('@deepseek-ai/dsh-client-ui-slots'))),
]);
const constant = value => ({ subscribe: () => () => {}, getSnapshot: () => value });
test('full packaged client materializes Remote namespace, renders an owned Session body and tears down its registrations', { timeout: 15000 }, async t => {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost:39999/' });
  const previous = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage, location: dom.window.location,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const host = new Context(), client = new Context();
  const errors = [], missing = []; let unmount, feature;
  t.after(async () => {
    await React.act(async () => { await feature?.dispose(); unmount?.(); await client.fiber.dispose(); });
    await host.fiber.dispose(); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const cwd = resolve('.');
  host.reflect.provide('sessions', new Map([['A', { id: 'A', header: { cwd } }]]));
  host.reflect.provide('sandboxPolicy', { defaultMode: 'read-only', resolve: () => ({ mode: 'read-only', workspaceRoot: cwd }) });
  host.reflect.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'fixture-grant-denied' }) });
  new SandboxedFileSystem(host, { cwd, diffBasisMaxBytes: 1024 * 1024 }); new TypertRegistry(host);
  const carrier = createGatewayCarrier(host);
  const gateway = new TypertGatewayService(host, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 }); applyHost(host);
  const { WorkspaceFiles } = await sdkImport('@deepseek-ai/dsh-api-workspace-files');
  new WorkspaceFiles(host, { maxBytes: 2 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024, maxLines: 5000, maxEntries: 2000 });
  host.typert.register((await sdkImport('@deepseek-ai/dsh-api-workspace-files/typert')).TYPERT);
  const peer = { principal: { kind: 'owner' }, signal: new AbortController().signal };
  new TypertRegistry(client);
  client.reflect.provide('connection', { isLoopback: true, interactions: 'none', generation: constant({ host: { home: cwd } }),
    rpc: { call: (_prefix, endpoint, payload, signal) => carrier.call('/api', endpoint, payload, signal, peer), open: async function* () { throw Error('Streams are outside this fixture'); } } });
  const modules = new Map([['@deepseek-ai/cordis', cordis], ['react', React.default], ['react-dom', ReactDOM.default], ['react-dom/client', ReactDOMClient], ['react/jsx-runtime', ReactJSX], ['@deepseek-ai/dsh-client-ui-slots', pureSlots]]);
  const factories = new Map();
  window.__ModuleLoader__ = { load: ({ id, factory }) => factories.set(id, factory) };
  const consume = id => {
    if (modules.has(id)) return modules.get(id);
    const factory = factories.get(id); if (!factory) { missing.push(id); throw Error('Missing real SDK module ' + id); }
    const module = factory(consume); modules.set(id, module); return module;
  };
  const evaluate = async path => { const source = await readFile(path, 'utf8'); new Function('window', 'document', source)(window, document); };
  await evaluate(resolve(sdkRoot, 'node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js'));
  await evaluate(resolve(sdkRoot, 'node_modules/@deepseek-ai/dsh-api-gateway/lib/client.browser.js'));
  // Public ClientTerminals is loaded from its actual SDK browser factory; no
  // custom terminal class is substituted. No PTY is started in this test.
  modules.set('@deepseek-ai/dsh-client-store', await import(pathToFileURL(dev.resolve('@deepseek-ai/dsh-client-store'))));
  await evaluate(resolve(sdkRoot, 'node_modules/@deepseek-ai/dsh-api-terminal-controller/lib/client.js'));
  modules.set('@deepseek-ai/dsh-api-gateway/client', consume('@deepseek-ai/dsh-api-gateway'));
  consume('@deepseek-ai/dsh-client-ui-renderer').apply(client);
  consume('@deepseek-ai/dsh-api-gateway').apply(client);
  await client.remote.$mount((await sdkImport('@deepseek-ai/dsh-api-workspace-files/remote')).default);
  await client.remote.$mount((await sdkImport('@deepseek-ai/dsh-api-terminal-controller/remote')).default);
  // Negative control: reflection-only registration cannot create call methods.
  const reflectionOnly = client.typert.remotes.register(REMOTE_TYPERT);
  assert.equal(client.remote.dshomeWorkspace, undefined);
  await reflectionOnly();
  // Legacy visual atoms are an explicit unused fixture: every legacy feature
  // is disabled below. Product SlotRegistry, Remote projection and terminal
  // controller factories are NOT replaced by stubs.
  modules.set('@deepseek-ai/dsh-client-ui-primitives', Object.freeze({}));
  const types = new Map();
  client.reflect.provide('sidebarRightTabs', { register: definition => { if (types.has(definition.kind)) { t.diagnostic('duplicate native type during replacement'); throw Error('duplicate type'); } types.set(definition.kind, definition); return () => types.delete(definition.kind); }, get: kind => types.get(kind) });
  client.reflect.provide('sidebarRight', { mounted: constant('A'), isExpanded: () => true, toggleExpanded() {}, openTab() {}, registerCloseHandler: () => () => {} });
  client.slots.installScope('session', { current: constant({ key: 'A', ctx: client, hooks: {}, keyedHooks: {}, props: { sessionId: 'A' } }), bindingSource: () => constant({ key: 'A', ctx: client, hooks: {}, keyedHooks: {}, props: { sessionId: 'A' } }), renderArea() { throw Error('This fixture renders a scoped seat directly, not SessionProvider'); } });
  // jsdom has no Canvas. Return its documented unsupported result without
  // fabricating pixels; xterm rendering remains outside this test's coverage.
  window.HTMLCanvasElement.prototype.getContext = () => null;
  client.slots.onEntryError((_key, _entry, error) => errors.push(error.message));
  client.slots.register({ name: 'root', children: {
    'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' }, 'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
    'conversation.session.header.utilities': { kind: 'list', scope: 'session' }, 'shell.overlay': { kind: 'list', scope: 'root' },
  } }, ({ renderSlot }) => React.createElement('div', null, renderSlot('sidebar.right.pane.tab', {}, { entryKey: 'dshome-plugin.workbench-v2' })));
  window.__dshomePlugin = { theme: false, conversation: false, minimap: false, sidebar: false, notify: false, glow: false, workbench: true };
  await evaluate(resolve('lib/client.js'));
  t.diagnostic('initial feature setup');
  await React.act(async () => { feature = client.plugin(consume('dshome-plugin')); await feature; });
  await React.act(async () => { unmount = client.uiRenderer.mount(document.querySelector('#app')); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.equal(typeof client.remote.dshomeWorkspace?.project, 'function', 'registering reflection alone must not be mistaken for installing a callable namespace');
  const project = await client.remote.dshomeWorkspace.project('A'); assert.equal(project.ok, true, JSON.stringify(project));
  assert.equal(types.get('dshome-workspace')?.keepMounted, true);
  assert.ok(document.querySelector('.dshome-v2'), document.body.textContent);
  assert.equal(window.__dshomePluginWorkbench.workspace('A')?.projectId, project.value.projectId);
  assert.deepEqual(missing, []); assert.deepEqual(errors, []);
  // Exercise the shipped reentrantPass wrapper: replacement starts immediately,
  // before the previous Fiber has finished its asynchronous namespace disposal.
  for (let index = 0; index < 5; index++) {
    t.diagnostic('reentrant replacement ' + index);
    const previousFeature = feature;
    await React.act(async () => {
      feature = client.plugin({ ...consume('dshome-plugin'), name: 'dshome-reload-fixture-' + index });
      await feature;
      t.diagnostic('waiting for replacement ready ' + index);
      const outcome = await window.__dshomePluginWorkbench.ready;
      assert.equal(outcome.ok, true, outcome.reason);
    });
    await React.act(async () => { await previousFeature.dispose(); });
    assert.equal(types.size, 1);
    assert.equal(client.slots.entries('sidebar.right.pane.tab').length, 1);
    assert.equal(document.querySelectorAll('style[data-plugin="dshome-plugin.workbench-v2"]').length, 1);
    assert.equal(typeof client.remote.dshomeWorkspace.project, 'function');
  }
  await React.act(async () => { await feature.dispose(); }); feature = undefined;
  assert.equal(types.size, 0); assert.equal(client.slots.entries('sidebar.right.pane.tab').length, 0); assert.equal(window.__dshomePluginWorkbench, null);
  assert.equal(client.remote.dshomeWorkspace, undefined, 'namespace must disappear, not only its reflection description');
});
