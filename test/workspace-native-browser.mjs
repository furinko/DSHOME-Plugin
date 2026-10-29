/* End-to-end isolated composition, not the running DSH GUI. Actual SDK
 * native Sidebar + public UI atoms/renderer/stores + packaged product +
 * Gateway's own WebSocket mux + real TerminalController/node-pty and FS.
 * Only frame/Session/working-directory/locale/shortcut/admission are fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, join, sep } from 'node:path';
import { mkdir, mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { apply as applyHost } from '../src/host.mjs';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
import { runNativeReferenceScenario } from './fixtures/native-reference-scenario.mjs';
const layoutRecovery = process.env.WORKBENCH_NATIVE_LAYOUT_RECOVERY === '1';
const projectBinding = process.env.WORKBENCH_NATIVE_PROJECT_BINDING === '1';
const projectShelf = process.env.WORKBENCH_NATIVE_PROJECT_SHELF === '1';
const scopeRaces = process.env.WORKBENCH_NATIVE_SCOPE_RACES === '1';
const nativeHmrMode = process.env.WORKBENCH_NATIVE_HMR === '1';
const dualP0 = process.env.WORKBENCH_DUAL_P0 === '1';
const applicationShellMode = process.env.WORKBENCH_APPLICATION_SHELL === '1';
const nativeChromeMode = process.env.WORKBENCH_NATIVE_CHROME === '1', chromeBaseline = process.env.WORKBENCH_NATIVE_CHROME_BASELINE === '1';
const nativeShellMode = dualP0 || applicationShellMode || nativeHmrMode || nativeChromeMode || process.env.WORKBENCH_NATIVE_SHELL === '1';
const updateGuardMode = process.env.WORKBENCH_NATIVE_UPDATE_GUARD === '1';
const serviceRebindMode = updateGuardMode || process.env.WORKBENCH_NATIVE_SERVICE_REBIND === '1';
const reconnectMode = process.env.WORKBENCH_NATIVE_RECONNECT === '1';
const terminalCleanupMode = updateGuardMode || process.env.WORKBENCH_NATIVE_TERMINAL_CLEANUP === '1';
const history = nativeShellMode || updateGuardMode || serviceRebindMode || reconnectMode || terminalCleanupMode || layoutRecovery || projectBinding || projectShelf || scopeRaces || process.env.WORKBENCH_NATIVE_HISTORY === '1';
const composer = history || process.env.WORKBENCH_NATIVE_COMPOSER === '1';
const references = composer || process.env.WORKBENCH_NATIVE_REFERENCE === '1';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT required; no fake PTY fallback');
const sdk = createRequire(resolve(sdkRoot, 'package.json')), dev = createRequire(resolve('.dev-sdk/package.json'));
const load = name => import(pathToFileURL(sdk.resolve(name)));
const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { SandboxedFileSystem }, { TerminalController }, { LocalSubprocessRuntime }, { WorkspaceFiles }] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'), load('@deepseek-ai/dsh-fs-sandbox'), load('@deepseek-ai/dsh-api-terminal-controller'), load('@deepseek-ai/dsh-subprocess-local'), load('@deepseek-ai/dsh-api-workspace-files'),
]);
const listen = server => new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', () => yes('http://127.0.0.1:' + server.address().port)); });
const close = server => new Promise(resolve => server.close(resolve));
test(dualP0 ? 'P0 single-root original/workbench and native-workspace scene preservation' : applicationShellMode ? 'Application root shell preserves native chat, retained workspaces and actual PTY across layout, global-page and Session switches' : nativeHmrMode ? 'Actual SDK SSE HMR and graph removal release product content; manual export and native input boundaries are measured' : 'Chromium actual native Sidebar/xterm with real Gateway WebSocket/PTY preserves all four modules over layout and mode switches', { timeout: 120000 }, async t => {
  const parent = resolve('test-output/native-browser'); await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, 'case-'));
  const original = '\ufefffirst\r\nsecond 😀\r\n' + Array.from({ length: 180 }, (_, index) => '原生组件长文档 ' + index + '\r\n').join(''); await writeFile(join(root, 'a.md'), original); await writeFile(join(root, '.bashrc'), 'PS1="BROWSER_PTY> "; HISTFILE=/dev/null\n');
  const host = new Context(), metrics = { spawn: 0, terminate: 0, close: 0, closed: 0, activeRetains: 0, upgrades: 0 }, handles = [], upgradeRoutes = new Map(), admissions = new WeakMap(), wsEvents = [], browserConsole = [];
  const terminateFault = { handle: null, terminalId: null, enabled: false, closeRequests: 0 };
  let browser, page, complete = false, iframeLoads = 0, dropNextSaveReply = false;
  const child = createServer((_req, res) => { iframeLoads++; res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>Opaque origin probe</title><input aria-label="未提交表单"><script>window.probeNonce=crypto.randomUUID()</script>'); });
  const assets = new Map(), hmrStreams = new Set(), hmrFrames = [], hmrRequests = []; let carrier;
  const sendHmr = async frame => { assert.ok(hmrStreams.size > 0, 'actual EventSource must be connected'); hmrFrames.push(frame); for (const stream of hmrStreams) stream.write('data: ' + JSON.stringify(frame) + '\n\n'); };
  const server = createServer(async (req, res) => {
    try {
      if (nativeHmrMode && req.url === '/plugins/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }); hmrStreams.add(res); res.write(': owned isolated HMR publisher\n\n'); res.once('close', () => hmrStreams.delete(res)); return; }
      if (req.method === 'POST' && req.url === '/fixture-rpc') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4 * 1024 * 1024) throw Error('Fixture body too large'); }
        const { prefix, endpoint, payload } = JSON.parse(body), lifetime = new AbortController();
        res.once('close', () => { if (!res.writableEnded) lifetime.abort(); });
        const value = await carrier.call(prefix, endpoint, payload, lifetime.signal, { id: 'explicit-browser-owner-fixture', principal: { kind: 'owner' }, interactions: 'answer', signal: lifetime.signal });
        // Deliberately lose ONE actual successful Host save reply, not the write.
        if (endpoint === 'dshomeWorkspace/save' && dropNextSaveReply) { assert.equal(value.ok, true); dropNextSaveReply = false; res.statusCode = 502; res.end('Fixture proxy lost the actual successful save receipt'); return; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); return;
      }
      if (nativeHmrMode) hmrRequests.push(req.url);
      const asset = assets.get(nativeHmrMode ? new URL(req.url, 'http://localhost').pathname : req.url); if (!asset) { res.statusCode = 404; res.end('Unknown isolated test asset'); return; }
      res.setHeader('cache-control', 'no-store'); res.setHeader('content-type', asset.type); res.end(asset.body);
    } catch (error) { res.statusCode = 500; res.end('Isolated fixture: ' + error.message); }
  });
  server.on('upgrade', async (req, socket, head) => {
    const route = upgradeRoutes.get(new URL(req.url, 'http://localhost').pathname); if (!route) return socket.destroy();
    let peerContext, peerFiber;
    try {
      // Public Gateway admission is synchronous; prepare this fixture's real
      // Cordis peer scope BEFORE invoking that contract, never reuse a dead peer.
      peerFiber = host.plugin({ name: 'isolated-fixture-peer', apply(ctx) { peerContext = ctx; } }); await peerFiber;
      if (socket.destroyed) { await peerFiber.dispose(); return; }
      const lifetime = new AbortController(); let released = false;
      admissions.set(req, { peer: { id: 'explicit-websocket-owner-fixture', ctx: peerContext, principal: { kind: 'owner' }, interactions: 'answer', signal: lifetime.signal }, release: async () => { if (released) return; released = true; lifetime.abort(); await peerFiber.dispose(); } });
      metrics.upgrades++; route.handler(req, socket, head);
    } catch (error) { browserConsole.push('Fixture peer preparation failed: ' + error.message); socket.destroy(); await peerFiber?.dispose(); }
  });
  t.after(async () => {
    if (page && !page.isClosed() && !complete) {
      await page.screenshot({ path: 'test-output/native-browser-failure.png', fullPage: true });
      const state = await page.evaluate(() => { const c = window.testNative?.controller(); return { boot: window.fixtureBootError, slotErrors: window.testNative?.errors, terminal: c?.contents.get('TERM-01')?.view?.state.getSnapshot(), notice: c?.getSnapshot().notice, hmr: window.testNative?.hmr && { entryUid: window.testNative.hmr.entry.fiber?.uid, state: window.testNative.hmr.system.entries.state.getSnapshot(), manifest: window.testNative.hmr.system.manifest, observations: window.testNative.hmr.observations, nodeFallbackCalls: window.__hmrNodeFallbackCalls, oldApiSame: window.hmrProbe?.api === window.__dshomePluginWorkbench }, text: document.body.innerText.slice(0, 5000), iframe: document.querySelector('iframe[data-wb-iframe]')?.src }; });
      await writeFile('test-output/native-browser-failure.json', JSON.stringify({ metrics, state, wsEvents, browserConsole, hmrFrames, hmrRequests }, null, 2));
    }
    await browser?.close(); await host.fiber.dispose(); await Promise.all([close(server), close(child)]);
    const checked = await realpath(root), allowed = await realpath(parent); assert.ok(checked.startsWith(allowed + sep)); await rm(checked, { recursive: true });
  });
  host.reflect.provide('sessions', new Map([['A', { id: 'A', header: { cwd: root } }]]));
  host.reflect.provide('sandboxPolicy', { defaultMode: 'workspace-write', resolve: ({ session } = {}) => ({ mode: 'workspace-write', workspaceRoot: session?.header.cwd ?? root }) });
  host.reflect.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'nonowner-fixture-denied' }) });
  host.reflect.provide('workingDirectory', { get: session => session.header.cwd, ensure: async (agent, signal) => { signal.throwIfAborted(); return agent.session.header.cwd; } });
  new SandboxedFileSystem(host, { cwd: root, diffBasisMaxBytes: 2097152 }); new TypertRegistry(host);
  carrier = createGatewayCarrier(host, { admitConnection(req) {
    const admission = admissions.get(req); if (!admission) throw Error('No prepared owner fixture admission'); admissions.delete(req); return admission;
  } });
  host.reflect.provide('webServer', { registerUpgrade(route) { upgradeRoutes.set(route.path, route); return () => upgradeRoutes.delete(route.path); } });
  new TypertGatewayService(host, { websocketHeartbeatIntervalMs: 1000, streamInboxBytes: 1048576 }); applyHost(host);
  new WorkspaceFiles(host, { maxBytes: 2097152, maxFileBytes: 33554432, maxLines: 5000, maxEntries: 2000 }); host.typert.register((await load('@deepseek-ai/dsh-api-workspace-files/typert')).TYPERT);
  class ObservedRuntime extends LocalSubprocessRuntime {
    async spawnTerminal(spec) {
      const handle = await super.spawnTerminal({ ...spec, env: { ...spec.env, HOME: root, HISTFILE: '/dev/null' } }); metrics.spawn++; handles.push(handle);
      return new Proxy(handle, { get(target, key) { if (key === 'terminate') return async (...args) => { metrics.terminate++; if (terminateFault.enabled && terminateFault.handle === handle) throw Error('fixture explicit terminate refusal'); return target.terminate(...args); }; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
    }
  }
  new ObservedRuntime(host);
  const journal = history ? await (await import('./fixtures/session-journal-host.mjs')).sessionJournalHost(root) : null;
  const journalB = nativeShellMode ? await (await import('./fixtures/session-journal-host.mjs')).sessionJournalHost(root, 'B') : null;
  const journalC = dualP0 ? await (await import('./fixtures/session-journal-host.mjs')).sessionJournalHost(root, 'C') : null;
  if (journalC) host.sessions.set('C', { id: 'C', header: { cwd: root } });
  if (journalB) { host.sessions.set('B', { id: 'B', header: { cwd: root } }); if (!nativeChromeMode) await journalB.appendUser('B 会话独立的已有记录'); }
  if (journal) {
    const { TypertRemoteService } = await load('@deepseek-ai/dsh-typert-protocol');
    class JournalRemote extends TypertRemoteService {
      constructor(ctx) { super(ctx, 'sessionController', { namespace: 'session' }); }
      async list(_request, signal) { const a = await journal.service.list(_request, signal); return journalB ? { items: [...a.items, ...(journalC ? (await journalC.service.list()).items : []), ...(await journalB.service.list(_request, signal)).items.map(item => nativeChromeMode ? { ...item, blank: true } : item)] } : a; }
      control(signal) { return journal.service.control(signal); }
      follow(request, signal) { return (request.address.sessionId === 'C' && journalC ? journalC : request.address.sessionId === 'B' && journalB ? journalB : journal).service.follow(request, signal); }
      page(request, signal) { return journal.service.page(request, signal); }
      projections(request, signal) { return journal.service.projections(request, signal); }
      prompt(request, signal) { return journal.service.prompt(request, signal); }
    }
    new JournalRemote(host); host.typert.register((await load('@deepseek-ai/dsh-api-session-controller/typert')).TYPERT); await journal.appendUser('隔离 Host 日志中的既有消息');
  }
  const session = host.sessions.get('A'), agent = { id: 'A', session, ctx: host };
  host.typert.lookups.register('agent', { parameter: 'agent', wire: 'agentId', resource: 'session', hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: id => id === 'A' ? agent : undefined });
  class ObservedController extends TerminalController {
    async *retain(sessionId, id, signal) { metrics.activeRetains++; try { yield* super.retain(sessionId, id, signal); } finally { metrics.activeRetains--; } }
    async close(agent, id) { metrics.close++; if (terminateFault.terminalId === id && ++terminateFault.closeRequests >= 2) terminateFault.enabled = false; await super.close(agent, id); metrics.closed++; }
  }
  const fixtureShell = process.platform === 'win32' ? { path: process.env.ComSpec || 'C:/Windows/System32/cmd.exe', name: 'Fixture CMD', args: ['/Q'] } : { path: '/bin/bash', name: 'Fixture bash', args: ['-i'] };
  const hostTerminals = new ObservedController(host, { shell: fixtureShell, shellCandidates: [fixtureShell.path], maxTerminals: 8, maxCols: 200, maxRows: 80, scrollback: 1000, maxBufferedBytes: 2097152, maxInputBytes: 65536, disposeGraceMs: 100, unattendedTimeoutMs: 0, activityPollIntervalMs: 100, cleanupRetryMs: 100 });
  host.typert.register((await load('@deepseek-ai/dsh-api-terminal-controller/typert')).TYPERT);
  const aliases = {};
  for (const id of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit', '@deepseek-ai/dsh-typert-registry']) aliases[id] = dev.resolve(id);
  Object.assign(aliases, { '@tanstack/react-virtual': dev.resolve('@tanstack/react-virtual'), react: resolve('.dev-sdk/node_modules/react'), 'react-dom': resolve('.dev-sdk/node_modules/react-dom'), '@deepseek-ai/dsh-api-workspace-files/remote': sdk.resolve('@deepseek-ai/dsh-api-workspace-files/remote'), '@deepseek-ai/dsh-api-terminal-controller/remote': sdk.resolve('@deepseek-ai/dsh-api-terminal-controller/remote'), '@deepseek-ai/dsh-api-session-controller/remote': sdk.resolve('@deepseek-ai/dsh-api-session-controller/remote') });
  const runtime = await build({ entryPoints: ['test/fixtures/native-workspace-entry.mjs'], alias: aliases, bundle: true, write: false, outdir: resolve('test-output/native-browser-assets'), entryNames: 'runtime', assetNames: 'assets/[name]-[hash]', format: 'iife', platform: 'browser', target: 'es2022', loader: { '.css': 'local-css', '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, define: { 'process.env.NODE_ENV': '"development"' } });
  for (const file of runtime.outputFiles) { const name = '/' + file.path.slice(resolve('test-output/native-browser-assets').length + 1); assets.set(name, { type: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', body: file.contents }); }
  const sdkAssets = [['renderer', '@deepseek-ai/dsh-client-ui-renderer'], ['gateway', '@deepseek-ai/dsh-api-gateway'], ['terminal', '@deepseek-ai/dsh-api-terminal-controller'], ['sidebar', '@deepseek-ai/dsh-client-ui-sidebar-right'], ['conversation', '@deepseek-ai/dsh-client-ui-conversation'], ...(history ? [['session-controller', '@deepseek-ai/dsh-api-session-controller'], ['chat', '@deepseek-ai/dsh-client-ui-chat']] : [])];
  if (nativeHmrMode) {
    sdkAssets.push(['modules', '@deepseek-ai/dsh-client-modules'], ['hmr', '@deepseek-ai/dsh-client-hmr']);
    const loader = await (await import('./fixtures/public-browser-loader.mjs')).publicBrowserLoader(sdk);
    assets.set('/loader.js', { type: 'text/javascript', body: loader });
  }
  if (nativeShellMode) sdkAssets.push(['ui-session', '@deepseek-ai/dsh-client-ui-session'], ['ui-layout', '@deepseek-ai/dsh-client-ui-layout']);
  if (dualP0) sdkAssets.push(['workspace-controller', '@deepseek-ai/dsh-api-workspace-controller']);
  if (applicationShellMode || dualP0) sdkAssets.push(['ui-navigation', '@deepseek-ai/dsh-client-ui-sidebar']);
  if (nativeChromeMode) sdkAssets.push(['ui-theme', '@deepseek-ai/dsh-client-ui-theme']);
  if (layoutRecovery) {
    const peer = await build({ entryPoints: ['test/fixtures/layout-storage-peer.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022' });
    assets.set('/layout-storage-peer.js', { type: 'text/javascript', body: peer.outputFiles[0].text });
    assets.set('/layout-storage-peer', { type: 'text/html', body: '<!doctype html><title>Isolated layout storage peer</title><script src="/layout-storage-peer.js"></script>' });
  }
  const { sdkClientSource } = await import('./fixtures/sdk-client-source.mjs');
  for (const [name, id] of sdkAssets) assets.set('/' + name + '.js', { type: 'text/javascript', body: name === 'ui-layout' ? await readFile(dualP0 ? 'p0/dist/layout-client.js' : 'layout/lib/client.js', 'utf8') : await sdkClientSource(id, sdk) });
  assets.set('/product.js', { type: 'text/javascript', body: await readFile(resolve(chromeBaseline ? 'test-output/round18-old-client.js' : 'lib/client.js')) });
  assets.set('/', { type: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>实际原生侧栏/PTY隔离验证 · 非运行GUI</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/runtime.css"><style>html,body,#app{height:100%;margin:0}#app>[data-slot=root]{height:100%}.fixture-frame{height:100%;display:grid;grid-template-columns:464px minmax(0,1fr);gap:12px;padding:12px;box-sizing:border-box;background:#edf2f8;font:14px Arial}#fixture-chat{display:flex;flex-direction:column;background:white;padding:16px;border-radius:10px}#fixture-chat>p{flex:1}#fixture-composer{height:130px}#native-region,#native-region>[data-slot=rightbar]{height:100%;min-height:0;min-width:0}#native-region{position:relative}' + (nativeShellMode ? '' : '.dshome-v2{min-height:400px}') + '</style><div id="app"></div><script src="/runtime.js"></script>' + sdkAssets.map(([name]) => '<script src="/' + name + '.js"></script>').join('') + (nativeHmrMode ? '<script src="/loader.js"></script>' : '') + '<script src="/product.js"></script><script>startNativeFixture(' + JSON.stringify({ references, composer, history, nativeShell: nativeShellMode, nativeChrome: nativeChromeMode, nativeHmr: nativeHmrMode, dualP0 }) + ').catch(e=>{window.fixtureBootError=e.message;console.error(e)})</script>' });
  if (dualP0) {
    assets.set('/ui-layout-base.js', {type:'text/javascript', body: await readFile('p0/vendor/ui-layout.rc3.js','utf8')});
    const baselineHtml = assets.get('/').body.replace('/ui-layout.js', '/ui-layout-base.js').replace('<div id="app"></div>', '<header style="height:44px;box-sizing:border-box;padding:12px;background:#edf2f8">未改动的安装版原版布局对照 · 隔离数据</header><div id="app" style="height:calc(100% - 44px)"></div>');
    assets.set('/baseline', {type:'text/html',body:baselineHtml});
  }
  const childURL = await listen(child), url = await listen(server);
  assert.equal(upgradeRoutes.size, 1, 'actual Gateway must register its own WebSocket route');
  browser = await chromium.launch({ headless: true, ...(process.env.WORKBENCH_BROWSER ? { executablePath: process.env.WORKBENCH_BROWSER } : { channel: 'chromium' }), args: dualP0 ? [] : ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const externalRequests = [];
  if (nativeChromeMode) await context.route('**/*', route => { const u = new URL(route.request().url()); if (['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname)) { externalRequests.push(u.href); return route.abort('blockedbyclient'); } return route.continue(); });
  page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') browserConsole.push(message.text().slice(0, 1500)); });
  page.on('websocket', socket => {
    socket.on('framesent', frame => wsEvents.push({ direction: 'sent', text: String(frame.payload).slice(0, 1500) }));
    socket.on('framereceived', frame => wsEvents.push({ direction: 'received', text: String(frame.payload).slice(0, 1500) }));
    socket.on('socketerror', error => wsEvents.push({ direction: 'error', error }));
    socket.on('close', () => wsEvents.push({ direction: 'closed' }));
  });
  const recoveryProjectId = layoutRecovery ? host.fs.fileUrl(await host.fs.resolve(root)) : null;
  const recoveryOriginal = '\ufeff{broken-layout' + String.fromCharCode(0xd800);
  if (layoutRecovery) await page.addInitScript(({ origin, projectId, raw }) => { if (location.origin === origin && location.pathname === '/') localStorage.setItem('dshome.workspace.v1:' + encodeURIComponent(projectId), raw); }, { origin: new URL(url).origin, projectId: recoveryProjectId, raw: recoveryOriginal });
  await page.goto(url); await page.waitForFunction(() => window.testP0 || window.testNative || window.fixtureBootError);
  assert.equal(await page.evaluate(() => window.fixtureBootError), undefined);
  if (dualP0) {
    const evidence = await (await import('../p0/full-scenario.mjs')).runScenario({page, context, url, childURL, metrics, errors, browserConsole, iframeLoads:()=>iframeLoads, readHostSource:()=>readFile(join(root,'a.md'),'utf8'), writeHostSource:text=>writeFile(join(root,'a.md'),text), setHostRoot:changed=>{host.sessions.get('A').header.cwd=changed?join(root,'..'):root;}});
    await page.evaluate(() => window.testP0.dispose());
    assert.deepEqual(errors, []); assert.deepEqual(browserConsole, []); assert.equal(metrics.spawn,1); assert.equal(metrics.activeRetains,0);
    await writeFile('test-output/p0-result.json', JSON.stringify({evidence, metrics, errors, browserConsole, journals: [journal.metrics,journalB.metrics,journalC.metrics]}, null, 2)); complete = true; return;
  }
  if (nativeShellMode) {
    if (applicationShellMode) {
      const evidence = await (await import('./fixtures/application-shell-scenario.mjs')).runApplicationShellScenario({ page, metrics, childURL, windows: process.platform === 'win32', readHostSource: () => readFile(join(root, 'a.md'), 'utf8') });
      await page.evaluate(() => window.testNative.dispose()); assert.deepEqual(errors, []); assert.equal(metrics.activeRetains, 0);
      await writeFile('test-output/application-shell-result.json', JSON.stringify({ evidence, metrics, errors, browserConsole }, null, 2)); complete = true; return;
    }
    const evidence = nativeHmrMode ? await (await import('./fixtures/native-hmr-scenario.mjs')).runNativeHmrScenario({ page, metrics, sendHmr, childURL, closeOwnedTerminal: id => hostTerminals.close(agent, id), original, readHostSource: () => readFile(join(root, 'a.md'), 'utf8') }) : nativeChromeMode ? await (await import('./fixtures/native-chrome-scenario.mjs')).runNativeChromeScenario({ page, baseline: chromeBaseline, metrics }) : await (await import('./fixtures/native-shell-scenario.mjs')).runNativeShellScenario({ page, root, metrics, handles, childURL, journal });
    await page.evaluate(() => window.testNative.dispose()); assert.deepEqual(errors, []); assert.equal(metrics.activeRetains, 0); assert.equal(journal.metrics.activeFollowers, 0); assert.equal(journalB.metrics.activeFollowers, 0); assert.equal(journalB.metrics.prompts, 0);
    await writeFile(nativeHmrMode ? 'test-output/workspace-native-hmr-result.json' : nativeChromeMode ? 'test-output/workspace-native-chrome-result.json' : 'test-output/workspace-native-shell-result.json', JSON.stringify({ layer: 'actual public AppFrame/Main/Header/Session adapter + Sidebar/Chat/composer and SDK Gateway', evidence, metrics, journal: journal?.metrics, journalB: journalB?.metrics, errors, browserConsole, externalRequests, hmrFrames, hmrRequests }, null, 2)); complete = true; return;
  }
  if (composer) {
    const nativeField = page.locator('#fixture-composer [contenteditable=true]'); await nativeField.waitFor();
    assert.equal(await nativeField.getAttribute('data-lexical-editor'), 'true');
    await nativeField.press('Control+End'); await page.keyboard.insertText(' · 原生输入栏实际键入');
    await page.waitForFunction(() => window.testNative.reference.input().state.getSnapshot().draft.endsWith(' · 原生输入栏实际键入'));
    assert.ok((await nativeField.innerText()).includes('原生输入栏实际键入'));
  }
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await page.locator('.dshome-v2').waitFor();
  await page.getByRole('button', { name: '▧ a.md', exact: true }).click(); const editor = page.locator('textarea.wb-editor'); await editor.waitFor();
  await editor.press('Control+End'); await page.keyboard.insertText('浏览器保留的草稿');
  await editor.press('Control+Home');
  for (let index = 0; index < 3; index++) await editor.press('ArrowRight');
  for (let index = 0; index < 6; index++) await editor.press('Shift+ArrowRight');
  await editor.evaluate(node => { node.scrollTop = 350; node.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await page.getByLabel('网页地址', { exact: true }).fill(childURL); await page.getByRole('button', { name: '前往', exact: true }).click();
  const childFrame = page.frameLocator('iframe[data-wb-iframe]'); await childFrame.getByLabel('未提交表单').fill('网页表单保留'); const nonce = await childFrame.locator('body').evaluate(() => window.probeNonce);
  await page.getByRole('button', { name: '启动终端', exact: true }).click();
  await page.waitForFunction(() => { const state = window.testNative.controller().content('TERM-01').view?.state.getSnapshot(); return state?.writable || state?.phase === 'failed' || window.testNative.errors.length; });
  const terminalState = await page.evaluate(() => window.testNative.controller().content('TERM-01').view?.state.getSnapshot());
  assert.equal(terminalState?.writable, true, JSON.stringify(terminalState));
  const pid = handles[0].pid; assert.equal(metrics.spawn, 1); assert.equal(metrics.activeRetains, 1); assert.equal(metrics.upgrades, 1);
  await page.locator('.xterm-helper-textarea').focus(); await page.keyboard.type("printf 'WB_%s:%s\\n' PID \"$$\"; for i in 1 2 3 4 5; do printf 'WB_%s:%s\\n' TICK \"$i\"; sleep 0.1; done"); await page.keyboard.press('Enter');
  await page.waitForFunction(pid => document.querySelector('.xterm-rows')?.textContent.includes('WB_PID:' + pid), pid);
  const baseline = await page.evaluate(() => { window.probeNodes = { editor: document.querySelector('textarea.wb-editor'), iframe: document.querySelector('iframe[data-wb-iframe]'), terminal: document.querySelector('.xterm-screen'), chat: document.querySelector('#fixture-chat'), composer: document.querySelector('#fixture-composer [contenteditable=true]') ?? document.querySelector('#fixture-composer') }; return { viewport: { start: window.probeNodes.editor.selectionStart, end: window.probeNodes.editor.selectionEnd, scroll: window.probeNodes.editor.scrollTop }, text: window.probeNodes.editor.value, draft: window.testNative.reference?.input().state.getSnapshot().draft ?? window.probeNodes.composer.value, terminalId: window.testNative.controller().content('TERM-01').view.id }; });
  const before = { spawn: metrics.spawn, close: metrics.close, terminate: metrics.terminate };
  for (let index = 0; index < 5; index++) { await page.getByLabel('布局预设', { exact: true }).selectOption('review'); await page.getByLabel('布局预设', { exact: true }).selectOption('development'); }
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('WB_TICK:5'));
  await page.getByRole('button', { name: '原版', exact: true }).first().click(); await page.getByRole('button', { name: '工作台', exact: true }).first().click();
  const after = await page.evaluate(() => ({ sameEditor: window.probeNodes.editor === document.querySelector('textarea.wb-editor'), sameIframe: window.probeNodes.iframe === document.querySelector('iframe[data-wb-iframe]'), sameTerminal: window.probeNodes.terminal === document.querySelector('.xterm-screen'), sameChat: window.probeNodes.chat === document.querySelector('#fixture-chat'), sameComposer: window.probeNodes.composer === (document.querySelector('#fixture-composer [contenteditable=true]') ?? document.querySelector('#fixture-composer')), viewport: { start: window.probeNodes.editor.selectionStart, end: window.probeNodes.editor.selectionEnd, scroll: window.probeNodes.editor.scrollTop }, text: window.probeNodes.editor.value, draft: window.testNative.reference?.input().state.getSnapshot().draft ?? window.probeNodes.composer.value, terminalId: window.testNative.controller().content('TERM-01').view.id, slotErrors: window.testNative.errors }));
  assert.equal(after.sameEditor && after.sameIframe && after.sameTerminal && after.sameChat && after.sameComposer, true); assert.equal(after.text, baseline.text); assert.equal(after.draft, baseline.draft); assert.equal(after.terminalId, baseline.terminalId); assert.deepEqual(after.slotErrors, []);
  assert.equal(baseline.viewport.start, 3); assert.equal(baseline.viewport.end, 9); assert.ok(baseline.viewport.scroll > 0); assert.deepEqual(after.viewport, baseline.viewport);
  assert.deepEqual({ spawn: metrics.spawn, close: metrics.close, terminate: metrics.terminate }, before); process.kill(pid, 0);
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('WB_TICK:5'));
  assert.equal(await childFrame.getByLabel('未提交表单').inputValue(), '网页表单保留'); assert.equal(await childFrame.locator('body').evaluate(() => window.probeNonce), nonce); assert.equal(iframeLoads, 1);
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(original), 'editing must not implicitly save');
  await page.getByRole('button', { name: '保存文件', exact: true }).click();
  await page.waitForFunction(() => window.testNative.controller().contents.get('DOC-01')?.document?.getSnapshot().dirty === false);
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(original + '浏览器保留的草稿'), 'native packaged path must preserve BOM/CRLF byte-for-byte');
  await page.screenshot({ path: references ? 'test-output/workspace-reference-baseline.png' : 'test-output/workspace-native-browser.png', fullPage: true });
  // External-editor conflict through real FS, followed by explicit UI recovery.
  const external = '\ufeff外部修改\r\n<script>window.workbenchInjected=true</script>\r\n';
  await writeFile(join(root, 'a.md'), external);
  await editor.press('Control+End'); await page.keyboard.insertText('\n本地追加');
  const draftText = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text);
  await page.getByRole('button', { name: '保存文件', exact: true }).click();
  await page.waitForFunction(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().error?.code === 'FS_STALE_VERSION');
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(external));
  await page.getByRole('button', { name: '比较磁盘', exact: true }).click(); await page.getByRole('region', { name: '文档比较与恢复', exact: true }).waitFor();
  assert.equal(await page.getByLabel('磁盘快照全文', { exact: true }).textContent(), external); assert.equal(await page.getByLabel('当前草稿全文', { exact: true }).textContent(), draftText);
  assert.equal(await page.evaluate(() => window.workbenchInjected), undefined, 'repository HTML remains escaped comparison text');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出草稿', exact: true }).click()]);
  assert.equal(download.suggestedFilename(), 'a.md.draft'); const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const exported = Buffer.concat(chunks); assert.deepEqual(exported, Buffer.from(draftText));
  await page.screenshot({ path: references ? 'test-output/workspace-reference-recovery.png' : 'test-output/workspace-recovery.png', fullPage: true });
  await editor.press('Control+End'); await page.keyboard.insertText('再改');
  const keep = page.getByRole('button', { name: '保留草稿，采用磁盘新基线', exact: true }); assert.equal(await keep.isDisabled(), true, 'late local edit invalidates comparison choice');
  await page.getByRole('button', { name: '刷新比较', exact: true }).click(); await page.waitForFunction(() => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(); return !s.comparing && s.comparison?.editRevision === s.editRevision; });
  const latestDraft = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text);
  await keep.click(); assert.equal(await editor.inputValue(), latestDraft.replace(/\r\n|\r/g, '\n')); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(external), 'baseline adoption must not write');
  await page.getByRole('button', { name: '保存文件', exact: true }).click(); await page.waitForFunction(() => !window.testNative.controller().contents.get('DOC-01').document.getSnapshot().dirty);
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(latestDraft));
  // Discard is separately confirmed; declining it preserves every local byte.
  const replacement = '\ufeff另一个磁盘快照\r\n'; await writeFile(join(root, 'a.md'), replacement);
  await editor.press('Control+End'); await page.keyboard.insertText('待放弃草稿');
  await page.getByRole('button', { name: '比较磁盘', exact: true }).click(); await page.getByRole('region', { name: '文档比较与恢复', exact: true }).waitFor();
  const discard = page.getByRole('button', { name: '放弃草稿，使用磁盘快照', exact: true }); page.once('dialog', dialog => dialog.dismiss()); await discard.click(); assert.equal(await editor.inputValue(), (latestDraft + '待放弃草稿').replace(/\r\n|\r/g, '\n'));
  page.once('dialog', dialog => dialog.accept()); await discard.click(); assert.equal(await editor.inputValue(), replacement.replace(/\r\n|\r/g, '\n')); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(replacement));
  // Actual successful write + dropped response, then another external edit.
  await editor.press('Control+End'); await page.keyboard.insertText('回执将丢失'); dropNextSaveReply = true;
  await page.getByRole('button', { name: '保存文件', exact: true }).click(); await page.waitForFunction(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().uncertain);
  const submitted = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(submitted));
  assert.equal(await page.getByRole('button', { name: '保存文件', exact: true }).isDisabled(), true);
  await writeFile(join(root, 'a.md'), '\ufeff未知结果后的外部修改\r\n'); await editor.press('Control+End'); await page.keyboard.insertText('丢回执后的继续编辑');
  await page.getByRole('button', { name: '核对磁盘结果', exact: true }).click(); await page.getByRole('region', { name: '文档比较与恢复', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().uncertain), true);
  await page.getByRole('button', { name: '保留草稿，采用磁盘新基线', exact: true }).click();
  const recovered = await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.getSnapshot().text); assert.equal(recovered, submitted + '丢回执后的继续编辑');
  await page.getByRole('button', { name: '保存文件', exact: true }).click(); await page.waitForFunction(() => !window.testNative.controller().contents.get('DOC-01').document.getSnapshot().dirty);
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(recovered)); assert.equal(await page.evaluate(() => window.testNative.reference?.input().state.getSnapshot().draft ?? document.querySelector('#fixture-composer').value), baseline.draft);
  // Invalid UTF-16 must not be silently converted into a different download.
  const unexpectedDownloads = [], recordDownload = value => unexpectedDownloads.push(value); page.on('download', recordDownload);
  await page.evaluate(() => window.testNative.controller().contents.get('DOC-01').document.edit(String.fromCharCode(0xd800)));
  await page.getByRole('button', { name: '导出草稿', exact: true }).click(); await page.waitForFunction(() => window.testNative.controller().getSnapshot().notice.includes('无法无损导出'));
  assert.equal(unexpectedDownloads.length, 0); page.off('download', recordDownload);
  await page.evaluate(text => window.testNative.controller().contents.get('DOC-01').document.edit(text), recovered); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(recovered));
  const recovery = { staleRefused: true, exportedBytes: exported.length, staleComparisonRefused: true, explicitAdoptionNoWrite: true, confirmedDiscardNoWrite: true, realLostReplyRecovered: true, malformedUnicodeExportRefused: true, repositoryHTMLNeverExecuted: await page.evaluate(() => window.workbenchInjected === undefined) };
  const nativeReference = references ? await runNativeReferenceScenario({ page, root, session, recovered, composer }) : null;
  const nativeHistory = history ? await (await import('./fixtures/native-history-scenario.mjs')).runNativeHistoryScenario({ page, journal }) : null;
  const layoutRecoveryEvidence = layoutRecovery ? await (await import('./fixtures/native-layout-recovery-scenario.mjs')).runNativeLayoutRecovery({ page, url, projectId: recoveryProjectId, rawOriginal: recoveryOriginal, root }) : null;
  const projectBindingEvidence = projectBinding ? await (await import('./fixtures/native-project-binding-scenario.mjs')).runNativeProjectBinding({ page, root, session: host.sessions.get('A') }) : null;
  const projectShelfEvidence = projectShelf ? await (await import('./fixtures/native-project-shelf-scenario.mjs')).runNativeProjectShelf({ page, root, session: host.sessions.get('A'), handles, metrics, pid }) : null;
  const scopeRacesEvidence = scopeRaces ? await (await import('./fixtures/native-scope-races-scenario.mjs')).runNativeScopeRaces({ page, root, session: host.sessions.get('A'), metrics, host, terminalNegative: process.env.WORKBENCH_SCOPE_TERMINAL_NEGATIVE === '1' || process.env.WORKBENCH_SCOPE_TERMINAL_DURING_ENSURE === '1', duringEnsure: process.env.WORKBENCH_SCOPE_TERMINAL_DURING_ENSURE === '1' }) : null;
  const updateGuardEvidence = updateGuardMode ? await (await import('./fixtures/native-update-guard-scenario.mjs')).runNativeUpdateGuard({ page, metrics }) : null;
  const guardUpdate = async (phase, field) => { const result = await (await import('./fixtures/native-update-guard-scenario.mjs')).assertNativeUpdateBlocked({ page, metrics, phase, field }); (updateGuardEvidence.checkpoints ??= []).push(result); };
  let guardClosePhase = 0;
  const terminalCleanupEvidence = terminalCleanupMode ? await (await import('./fixtures/native-terminal-cleanup-scenario.mjs')).runNativeTerminalCleanup({ page, handles, metrics, fault: terminateFault, originalPid: pid, onUnconfirmed: updateGuardMode ? () => guardUpdate('closing-' + guardClosePhase++, 'unconfirmedCloses') : undefined }) : null;
  const terminalReconnectEvidence = reconnectMode ? await (await import('./fixtures/native-terminal-reconnect-scenario.mjs')).runNativeTerminalReconnect({ page, handles, metrics, root }) : null;
  const serviceRebindEvidence = serviceRebindMode ? await (await import('./fixtures/native-service-rebind-scenario.mjs')).runNativeServiceRebind({ page, root, session, metrics, handles, onSaving: updateGuardMode ? () => guardUpdate('saving', 'saving') : undefined, onUncertain: updateGuardMode ? () => guardUpdate('uncertain', 'uncertain') : undefined }) : null;
  const beforeFinalClose = { close: metrics.close, terminate: metrics.terminate };
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(async () => { await window.testNative.controller().closePanel('TERM-01'); }); await handles[0].done;
  await page.waitForFunction(() => !document.querySelector('.xterm-screen'));
  assert.equal(metrics.close - beforeFinalClose.close, 1); assert.equal(metrics.terminate - beforeFinalClose.terminate, 1); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  if (updateGuardMode) Object.assign(updateGuardEvidence, await (await import('./fixtures/native-update-guard-scenario.mjs')).assertNativeCleanUpdate({ page }));
  await page.evaluate(() => window.testNative.dispose());
  if (history) {
    assert.equal(await page.evaluate(() => window.testNative.nativeRetention.referenceCount), 0);
    assert.equal(journal.metrics.activeFollowers, 0); assert.equal(journal.metrics.prompts, 0);
  }
  assert.deepEqual(errors, []);
  await writeFile(updateGuardMode ? 'test-output/workspace-update-guard-result.json' : serviceRebindMode ? 'test-output/workspace-service-rebind-result.json' : reconnectMode ? 'test-output/workspace-terminal-reconnect-result.json' : terminalCleanupMode ? 'test-output/workspace-terminal-cleanup-result.json' : scopeRaces ? (process.env.WORKBENCH_SCOPE_TERMINAL_DURING_ENSURE === '1' ? 'test-output/workspace-scope-ensure-result.json' : process.env.WORKBENCH_SCOPE_TERMINAL_NEGATIVE === '1' ? 'test-output/workspace-scope-terminal-result.json' : 'test-output/workspace-scope-directory-result.json') : projectShelf ? 'test-output/workspace-project-shelf-result.json' : projectBinding ? 'test-output/workspace-project-binding-result.json' : layoutRecovery ? 'test-output/workspace-layout-recovery-result.json' : history ? 'test-output/workspace-history-result.json' : composer ? 'test-output/workspace-composer-result.json' : references ? 'test-output/workspace-reference-result.json' : 'test-output/workspace-native-browser-result.json', JSON.stringify({ layer: 'Chromium + actual native Sidebar/renderer/stores/atoms + complete packaged plugin + SDK WebSocket mux + real PTY/FS', fixtures: ['outer frame geometry', history ? 'Host journal backend and UI scope/settings adapter' : 'ready Session/working-directory/source adapter', 'locale/shortcuts', 'owner admission'], layoutSwitches: 10, pid, iframeLoads, before, metrics, after, recovery, nativeReference, nativeHistory, layoutRecoveryEvidence, projectBindingEvidence, projectShelfEvidence, scopeRacesEvidence, terminalCleanupEvidence, terminalReconnectEvidence, serviceRebindEvidence, updateGuardEvidence, journal: journal ? { ...journal.metrics } : null, errors, exclusions: ['running production GUI/authentication', history ? 'production Host Session/prompt/authentication; UI scope adapter and mode controls remain explicit fixtures' : composer ? 'real SessionController and durable chat history; transcript is an unsent UserText preview, mode controls are explicit fixture buttons' : references ? 'actual composer DOM and durable chat history' : 'actual conversation/InputActions', 'Windows', 'AppFrame width solver'] }, null, 2));
  complete = true;
});
