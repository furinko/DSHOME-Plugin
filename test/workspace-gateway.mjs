import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { apply } from '../src/host.mjs';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT is required for real Gateway tests');
const sdk = createRequire(resolve(sdkRoot, 'package.json'));
const load = name => import(pathToFileURL(sdk.resolve(name)));
const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { SandboxedFileSystem }] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'), load('@deepseek-ai/dsh-fs-sandbox')]);
async function fixture(t) {
  const parent = resolve('test-output/gateway'); await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, 'case-'));
  await writeFile(join(root, 'a.md'), 'original\n');
  const ctx = new Context();
  const session = { id: 'A', header: { cwd: root } }; const sessions = new Map([['A', session]]);
  const policy = { defaultMode: 'workspace-write', resolve: ({ session: s } = {}) => ({ mode: 'workspace-write', workspaceRoot: s?.header.cwd ?? root }) };
  ctx.reflect.provide('sessions', sessions); ctx.reflect.provide('sandboxPolicy', policy);
  ctx.reflect.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test-grant-denied' }) });
  new SandboxedFileSystem(ctx, { cwd: root, diffBasisMaxBytes: 1024 * 1024 }); new TypertRegistry(ctx);
  const carrier = createGatewayCarrier(ctx);
  const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 });
  apply(ctx);
  const peer = { id: 'owner-test-peer', principal: { kind: 'owner' }, signal: new AbortController().signal };
  const rawCall = (method, args, caller = peer) => carrier.call('/api', 'dshomeWorkspace/' + method, { args }, new AbortController().signal, caller);
  t.after(async () => {
    await ctx.fiber.dispose(); const checked = await realpath(root), allowed = await realpath(parent);
    assert.ok(checked.startsWith(allowed + sep)); await rm(checked, { recursive: true });
  });
  const expectedProjectId = pathToFileURL(root).href;
  const call = (method, args, caller = peer) => rawCall(method, { ...(method !== 'project' ? { expectedProjectId } : {}), ...(method === 'save' ? { expectedAbsolutePath: resolve(root, typeof args.path === 'string' ? args.path : 'a.md') } : {}), ...args }, caller);
  return { ctx, root, call, rawCall, peer, session };
}
test('strict real SDK Gateway dispatch binds owner invocation and saves real files', async t => {
  const { root, call } = await fixture(t);
  const project = await call('project', { sessionId: 'A' }); assert.equal(project.ok, true, JSON.stringify(project)); assert.equal(project.value.workspaceRoot, root);
  const file = await call('read', { sessionId: 'A', path: 'a.md' }); assert.equal(file.ok, true, JSON.stringify(file));
  const saved = await call('save', { sessionId: 'A', path: 'a.md', text: 'saved by real Gateway\n', expectedVersion: file.value.version });
  assert.equal(saved.ok, true, JSON.stringify(saved)); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), 'saved by real Gateway\n');
});
test('actual Gateway rejects ill-formed Unicode without replacing file bytes; valid emoji still saves', async t => {
  const { root, call } = await fixture(t), file = await call('read', { sessionId: 'A', path: 'a.md' });
  const rejected = await call('save', { sessionId: 'A', path: 'a.md', text: '\ud800', expectedVersion: file.value.version });
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'workbench/invalid-text'); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), 'original\n');
  const saved = await call('save', { sessionId: 'A', path: 'a.md', text: '\ufeff中文😀\r\n', expectedVersion: file.value.version }); assert.equal(saved.ok, true); assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from('\ufeff中文😀\r\n'));
});
test('Gateway rejects extra/missing/untyped arguments before business execution', async t => {
  const { rawCall: call } = await fixture(t);
  for (const args of [{ sessionId: 'A', path: 'a.md', extra: true }, { sessionId: 'A' }, { sessionId: 7, path: 'a.md' }]) {
    const result = await call('read', args); assert.equal(result.ok, false); assert.match(result.error.code, /^gateway\//);
  }
});
test('nonowner or disposed Peer cannot read or write via the new namespace', async t => {
  const { call, root } = await fixture(t);
  const grant = { id: 'grant-test-peer', principal: { kind: 'grant', id: 'test' }, signal: new AbortController().signal };
  const denied = await call('read', { sessionId: 'A', path: 'a.md' }, grant); assert.equal(denied.ok, false); assert.equal(denied.error.code, 'remote-access/denied');
  const cancelled = new AbortController(); cancelled.abort();
  const gone = await call('project', { sessionId: 'A' }, { id: 'disposed-owner', principal: { kind: 'owner' }, signal: cancelled.signal });
  assert.equal(gone.ok, false); assert.equal(gone.error.code, 'gateway/peer-disposed'); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), 'original\n');
});
test('refusal codes survive real Gateway result encoding', async t => {
  const { call } = await fixture(t);
  const result = await call('read', { sessionId: 'no-such-session', path: 'a.md' }); assert.equal(result.ok, false); assert.equal(result.error.code, 'workbench/session-unavailable');
});

test('strict Gateway requires explicit project and canonical target assertions', async t => {
  const { rawCall, root } = await fixture(t); const expectedProjectId = pathToFileURL(root).href;
  for (const [method, args] of [['read', { sessionId: 'A', path: 'a.md' }], ['save', { sessionId: 'A', path: 'a.md', text: 'bad', expectedVersion: 'v', expectedProjectId }]]) { const result = await rawCall(method, args); assert.equal(result.ok, false); assert.match(result.error.code, /^gateway\//); }
  assert.equal(await readFile(join(root, 'a.md'), 'utf8'), 'original\n');
});
test('real Gateway refuses a previous project even when the old absolute file remains inside the new root', async t => {
  const { call, session, root } = await fixture(t), file = await call('read', { sessionId: 'A', path: 'a.md' }); session.header.cwd = resolve(root, '..');
  const result = await call('save', { sessionId: 'A', path: file.value.absolutePath, text: 'wrong-project', expectedVersion: file.value.version, expectedProjectId: file.value.projectId, expectedAbsolutePath: file.value.absolutePath });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'workbench/workspace-changed'); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), 'original\n');
});
