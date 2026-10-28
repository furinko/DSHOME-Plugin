/* Real public ClientTerminals + Gateway + TerminalController + local node-pty.
 * Session/working-directory and in-process carrier are explicit fixtures.
 * No production GUI is loaded, and no DOM/xterm pixel claim is made here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
import { createWorkspaceController } from '../src/workbench/controller.mjs';
const rootSDK = process.env.DSH_SDK_ROOT;
if (!rootSDK) throw Error('DSH_SDK_ROOT required; PTY tests never substitute a fake terminal');
const sdk = createRequire(resolve(rootSDK, 'package.json')), dev = createRequire(resolve('.dev-sdk/package.json'));
const load = name => import(pathToFileURL(sdk.resolve(name)));
const [cordis, { TypertRegistry }, { TypertGatewayService }, { TerminalController }, { LocalSubprocessRuntime }, { JSDOM }, store] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'), load('@deepseek-ai/dsh-api-terminal-controller'), load('@deepseek-ai/dsh-subprocess-local'),
  import(pathToFileURL(dev.resolve('jsdom'))), import(pathToFileURL(dev.resolve('@deepseek-ai/dsh-client-store'))),
]);
const constant = value => ({ subscribe: () => () => {}, getSnapshot: () => value });
function until(source, predicate, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let off = () => {}; const timer = setTimeout(() => { off(); reject(Error(label + ': ' + JSON.stringify(source.getSnapshot()))); }, timeoutMs);
    const inspect = () => { const value = source.getSnapshot(); if (value.phase === 'failed') { clearTimeout(timer); off(); reject(Error(label + ': ' + value.error)); }
      else if (predicate(value)) { clearTimeout(timer); off(); resolve(value); } };
    off = source.subscribe(inspect); inspect();
  });
}
test('real PTY keeps identity/output and native holds over layout switches; detach retains, explicit close terminates once', { timeout: 45000 }, async t => {
  const parent = resolve('test-output/pty'); await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, 'case-'));
  await writeFile(join(root, '.bashrc'), 'PS1="PTY_TEST> "; HISTFILE=/dev/null\n');
  const host = new cordis.Context(), client = new cordis.Context(), dom = new JSDOM('', { url: 'http://localhost:39998' });
  const originals = new Map();
  for (const [key, value] of Object.entries({ window: dom.window, localStorage: dom.window.localStorage, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let detach, stopFrames; const metrics = { spawn: 0, terminate: 0, rpcClose: 0, completedCloses: 0, activeHolds: 0, frames: 0 }, handles = [], received = [];
  const metricListeners = new Set(), metricSource = { getSnapshot: () => ({ ...metrics }), subscribe: fn => { metricListeners.add(fn); return () => metricListeners.delete(fn); } };
  const metricsChanged = () => { for (const fn of [...metricListeners]) fn(); };
  t.after(async () => {
    stopFrames?.(); detach?.(); await client.fiber.dispose(); await host.fiber.dispose(); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    const checked = await realpath(root), allowed = await realpath(parent); assert.ok(checked.startsWith(allowed + sep)); await rm(checked, { recursive: true });
  });
  new TypertRegistry(host); new TypertRegistry(client);
  const carrier = createGatewayCarrier(host), gateway = new TypertGatewayService(host, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 });
  class ObservedLocalRuntime extends LocalSubprocessRuntime {
    async spawnTerminal(spec) {
      const handle = await super.spawnTerminal({ ...spec, env: { ...spec.env, HOME: root, HISTFILE: '/dev/null' } });
      metrics.spawn++; handles.push(handle);
      return new Proxy(handle, { get(target, key) {
        if (key === 'terminate') return async (...args) => { metrics.terminate++; return target.terminate(...args); };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }
  }
  new ObservedLocalRuntime(host);
  host.reflect.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: root }) });
  host.reflect.provide('workingDirectory', { get: session => session.header.cwd, ensure: async (agent, signal) => { signal.throwIfAborted(); return agent.session.header.cwd; } });
  const session = { id: 'PTY-A', header: { cwd: root } }, agent = { id: session.id, session, ctx: host };
  host.typert.lookups.register('agent', { parameter: 'agent', wire: 'agentId', resource: 'session', hostTypeSymbol: '@deepseek-ai/dsh-agent#Agent', wireTypeSymbol: '@deepseek-ai/dsh-session/types#SessionId', resolve: id => id === agent.id ? agent : undefined });
  new TerminalController(host, { shell: { path: '/bin/bash', name: 'Fixture bash', args: ['-i'] }, shellCandidates: ['/bin/bash'], maxTerminals: 8, maxCols: 200, maxRows: 80, scrollback: 1000, maxBufferedBytes: 2097152, maxInputBytes: 65536, disposeGraceMs: 100, unattendedTimeoutMs: 0, activityPollIntervalMs: 100, cleanupRetryMs: 100 });
  host.typert.register((await load('@deepseek-ai/dsh-api-terminal-controller/typert')).TYPERT);
  const peer = { id: 'owned-pty-fixture-peer', principal: { kind: 'owner' }, interactions: 'answer', signal: new AbortController().signal };
  client.reflect.provide('loader', { await: () => new Promise(() => {}) }); // No global event loop; only this test's explicit stream channels.
  client.reflect.provide('connection', { isLoopback: true, interactions: 'answer', generation: constant({ host: { home: root } }), registerGenerationSource: () => () => {},
    rpc: {
      call: async (_prefix, endpoint, payload, signal) => {
        if (endpoint === 'terminal/close') metrics.rpcClose++;
        const result = await carrier.call('/api', endpoint, payload, signal, peer);
        if (endpoint === 'terminal/close' && result.ok) { metrics.completedCloses++; metricsChanged(); }
        return result;
      },
      open: async function* (_prefix, endpoint, payload, signal, uplink) {
        if (endpoint === 'terminal/retain') { metrics.activeHolds++; metricsChanged(); }
        try { yield* carrier.open(gateway, endpoint, payload, signal, peer, uplink); }
        finally { if (endpoint === 'terminal/retain') { metrics.activeHolds--; metricsChanged(); } }
      },
    } });
  const factories = new Map(), modules = new Map([['@deepseek-ai/cordis', cordis], ['@deepseek-ai/dsh-client-store', store]]);
  window.__ModuleLoader__ = { load: ({ id, factory }) => factories.set(id, factory) };
  const consume = id => { if (!modules.has(id)) { const factory = factories.get(id); if (!factory) throw Error('Missing real SDK factory: ' + id); modules.set(id, factory(consume)); } return modules.get(id); };
  for (const file of ['@deepseek-ai/dsh-api-gateway/lib/client.browser.js', '@deepseek-ai/dsh-api-terminal-controller/lib/client.js']) {
    new Function('window', await readFile(resolve(rootSDK, 'node_modules', file), 'utf8'))(window);
  }
  modules.set('@deepseek-ai/dsh-api-gateway/client', consume('@deepseek-ai/dsh-api-gateway'));
  consume('@deepseek-ai/dsh-api-gateway').apply(client);
  await client.remote.$mount((await load('@deepseek-ai/dsh-api-terminal-controller/remote')).default);
  const { ClientTerminals } = consume('@deepseek-ai/dsh-api-terminal-controller');
  const native = new ClientTerminals(client.isolate('webTerminals'), client.remote.terminal);
  const terminals = new ClientTerminals(client.isolate('webTerminals'), client.remote.terminal);
  const c = createWorkspaceController({ sessionId: agent.id, projectId: root, transport: { read: () => { throw Error('No document read expected'); } }, storage: localStorage, terminals, confirm: () => true });
  assert.equal(metrics.spawn, 0, 'layout construction must not start a process');
  const nativeView = native.view(agent.id, 'native-tab', 'native-content'); native.retainTabs([{ sessionId: agent.id, tabId: 'native-tab', contentId: 'native-content' }]);
  await nativeView.refresh(); await until(nativeView.state, s => !!s.info, 'native terminal allocation');
  const view = c.startTerminal('TERM-01'); detach = view.mount();
  let seen = -1;
  const pump = () => { const s = view.state.getSnapshot(); if (s.render && s.render.revision !== seen) { seen = s.render.revision; received.push(s.render.frame.data ?? s.render.frame.screen ?? ''); metrics.frames++; view.acknowledge(seen); } };
  stopFrames = view.state.subscribe(pump); pump();
  await until(view.state, s => s.phase === 'connected' && s.writable, 'workspace terminal attachment');
  assert.equal(metrics.spawn, 2); assert.equal(metrics.activeHolds, 2, 'native and workspace holds must coexist');
  const pid = handles[1].pid, terminalId = view.id;
  view.write("printf 'WB_%s:%s\\n' PID \"$$\"; for i in 1 2 3 4 5; do printf 'WB_%s:%s\\n' TICK \"$i\"; sleep 0.08; done\n");
  await until(view.state, () => /WB_PID:\d+/.test(received.join('')), 'actual shell PID output');
  assert.match(received.join(''), new RegExp('WB_PID:' + pid));
  const baseline = { spawn: metrics.spawn, terminate: metrics.terminate, close: metrics.rpcClose };
  for (let index = 0; index < 10; index++) { c.model.selectPreset(index % 2 ? 'development' : 'review'); assert.equal(c.content('TERM-01').view, view); }
  await until(view.state, () => received.join('').includes('WB_TICK:5'), 'output after ten layout switches');
  assert.deepEqual({ spawn: metrics.spawn, terminate: metrics.terminate, close: metrics.rpcClose }, baseline);
  assert.equal(view.id, terminalId); assert.equal(metrics.activeHolds, 2); process.kill(pid, 0);
  // Detach the view, not its content membership: the real PTY must remain.
  detach(); detach = undefined;
  assert.equal(metrics.terminate, 0); assert.equal(host.terminalController.list(agent.id).length, 2); process.kill(pid, 0);
  // Negative control: remove only workspace membership and verify a real hold
  // goes away while the unrelated native manager's hold survives.
  terminals.retainTabs([]);
  await until(metricSource, s => s.activeHolds === 1, 'negative missing-hold detector');
  assert.equal(metrics.activeHolds, 1);
  terminals.retainTabs([{ sessionId: agent.id, tabId: 'TERM-01', contentId: c.content('TERM-01').contentId }]);
  await until(metricSource, s => s.activeHolds === 2, 'restored workspace hold');
  await c.closePanel('TERM-01');
  await handles[1].done;
  // Process exit alone precedes SDK bookkeeping. Wait for the real close RPC
  // to complete before asserting its retained inventory, not an arbitrary delay.
  await until(metricSource, s => s.completedCloses === 1, 'workspace close completion');
  assert.equal(metrics.rpcClose, 1); assert.equal(metrics.terminate, 1); assert.equal(host.terminalController.list(agent.id).length, 1);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  assert.equal(nativeView.state.getSnapshot().info.id, nativeView.id); process.kill(handles[0].pid, 0);
  await nativeView.close(); await handles[0].done;
  assert.equal(host.terminalController.list(agent.id).length, 0);
  await writeFile(resolve('test-output/workspace-terminal-result.json'), JSON.stringify({ sdk: '0.2.1-rc.2', layer: 'real node-pty + product controller + actual SDK ClientTerminals/Gateway', layoutSwitches: 10, workspacePid: pid, sameTerminalId: terminalId, ...metrics, transcript: received.join(''), exclusions: ['production GUI/authentication', 'DOM/xterm pixels', 'unattended idle reclamation', 'Windows'] }, null, 2));
});
