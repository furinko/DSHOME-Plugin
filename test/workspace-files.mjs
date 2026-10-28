import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink, rm, realpath } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createWorkbenchFiles } from '../src/workbench/files.mjs';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT required: tests must use real public SDK, never silently skip');
const sdk = createRequire(resolve(sdkRoot, 'package.json'));
const { Context } = await import(pathToFileURL(sdk.resolve('@deepseek-ai/cordis')));
const { SandboxedFileSystem } = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-fs-sandbox')));
const owner = { principal: { kind: 'owner' } };
async function fixture(t, options = {}) {
  const parent = resolve('test-output/files'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'case-'));
  const root = join(directory, 'project'), outside = join(directory, 'outside');
  await mkdir(root); await mkdir(outside); await writeFile(join(root, 'a.md'), '\uFEFF中文\r\nlast\r\n'); await writeFile(join(outside, 'secret.md'), 'private');
  const session = { id: 'session-A', header: { cwd: root }, mode: 'workspace-write' };
  const sessions = new Map([[session.id, session]]);
  const sandboxPolicy = { defaultMode: 'read-only', workspaceRoot: directory, resolve: ({ session: s } = {}) => ({ mode: s?.mode ?? 'read-only', workspaceRoot: s?.header.cwd ?? directory }) };
  const ctx = new Context(); ctx.reflect.provide('sandboxPolicy', sandboxPolicy);
  const fs = new SandboxedFileSystem(ctx, { cwd: root, diffBasisMaxBytes: 1024 * 1024 });
  t.after(async () => {
    await ctx.fiber.dispose();
    const checked = await realpath(directory), parentChecked = await realpath(parent);
    assert.ok(checked.startsWith(parentChecked + sep) && checked.includes(sep + 'case-'));
    await rm(checked, { recursive: true });
  });
  const rawFiles = createWorkbenchFiles({ fs, sessions, sandboxPolicy, ...options }), projectId = pathToFileURL(root).href;
  // Explicit fixture binding, equivalent to the project/read receipt held by a client.
  const files = { project: rawFiles.project, read: (id, path, caller, signal) => rawFiles.read(id, path, caller, signal, projectId), save: (id, path, text, version, caller, signal) => rawFiles.save(id, path, text, version, caller, signal, projectId, resolve(root, path)) };
  return { files, rawFiles, projectId, fs, ctx, session, sessions, root, outside, sandboxPolicy };
}
test('real SDK fs reads exact UTF-8/BOM/CRLF bytes and guarded save lands on disk', async t => {
  const { files, root } = await fixture(t); const file = await files.read('session-A', 'a.md', owner);
  assert.equal(file.text, '\uFEFF中文\r\nlast\r\n'); assert.equal(file.projectId, pathToFileURL(root).href);
  const saved = await files.save('session-A', 'a.md', file.text + 'added\r\n', file.version, owner);
  assert.notEqual(saved.version, file.version); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), file.text + 'added\r\n');
});
test('real backend CAS admits one of two competing saves, refuses stale overwrite', async t => {
  const { files, root } = await fixture(t); const file = await files.read('session-A', 'a.md', owner);
  const results = await Promise.allSettled(['first', 'second'].map(text => files.save('session-A', 'a.md', text, file.version, owner)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'FS_STALE_VERSION');
  assert.ok(['first', 'second'].includes(await readFile(join(root, 'a.md'), 'utf8')));
});
test('caller is authenticated owner, not a submitted session id or an absent invocation', async t => {
  const { files } = await fixture(t);
  for (const caller of [undefined, {}, { principal: { kind: 'grant' } }, { principal: { kind: 'remote' } }]) await assert.rejects(files.read('session-A', 'a.md', caller), { code: 'workbench/owner-required' });
  await assert.rejects(files.read('missing', 'a.md', owner), { code: 'workbench/session-unavailable' });
});
test('read-only session overrides writable deployment assumptions and preserves disk', async t => {
  const { files, session, root } = await fixture(t); const file = await files.read('session-A', 'a.md', owner); session.mode = 'read-only';
  await assert.rejects(files.save('session-A', 'a.md', 'bad', file.version, owner), { code: 'workbench/read-only' }); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), file.text);
});
test('workspace containment is enforced even in full-access mode', async t => {
  const { files, session, outside } = await fixture(t); session.mode = 'danger-full-access';
  await assert.rejects(files.read('session-A', join(outside, 'secret.md'), owner), { code: 'workbench/outside-workspace' });
  await assert.rejects(files.read('session-A', '../outside/secret.md', owner), { code: 'workbench/outside-workspace' });
});
test('final symlinks and escaped ancestor links are rejected; internal canonical aliases are safe', async t => {
  const { files, root, outside } = await fixture(t);
  await symlink(join(root, 'a.md'), join(root, 'alias.md')); await symlink(outside, join(root, 'escape'), 'dir'); await symlink(root, join(root, 'inside'), 'dir');
  await assert.rejects(files.read('session-A', 'alias.md', owner), { code: 'workbench/not-regular-file' });
  await assert.rejects(files.read('session-A', 'escape/secret.md', owner), { code: 'workbench/outside-workspace' });
  const file = await files.read('session-A', 'inside/a.md', owner); assert.equal(file.absolutePath, join(root, 'a.md'));
});
test('unpaired UTF-16 save is refused instead of silently replacing bytes with U+FFFD', async t => {
  const { files, root } = await fixture(t), file = await files.read('session-A', 'a.md', owner);
  for (const text of ['\ud800', 'x\udfffy']) await assert.rejects(files.save('session-A', 'a.md', text, file.version, owner), { code: 'workbench/invalid-text' });
  assert.deepEqual(await readFile(join(root, 'a.md')), Buffer.from(file.text));
  assert.equal((await files.read('session-A', 'a.md', owner)).version, file.version);
});
test('size caps, invalid UTF-8 and binary NUL reject rather than loading partial editor text', async t => {
  const { files, root } = await fixture(t, { maxBytes: 30 });
  await writeFile(join(root, 'large'), 'x'.repeat(31)); await writeFile(join(root, 'binary'), Buffer.from([1, 0, 2])); await writeFile(join(root, 'invalid'), Buffer.from([0xff]));
  await assert.rejects(files.read('session-A', 'large', owner), { code: 'workbench/too-large' });
  for (const file of ['binary', 'invalid']) await assert.rejects(files.read('session-A', file, owner), { code: 'workbench/not-text' });
});
test('workspace change during read rejects the old result', async t => {
  const { fs, sessions, sandboxPolicy, session, outside, root } = await fixture(t);
  const read = fs.readBytes.bind(fs); fs.readBytes = async (...args) => { const bytes = await read(...args); session.header.cwd = outside; return bytes; };
  const files = createWorkbenchFiles({ fs, sessions, sandboxPolicy });
  await assert.rejects(files.read('session-A', 'a.md', owner, undefined, pathToFileURL(root).href), { code: 'workbench/workspace-changed' });
});
test('external edit during read is detected by real backend version observations', async t => {
  const { fs, sessions, sandboxPolicy, root } = await fixture(t);
  const read = fs.readBytes.bind(fs); fs.readBytes = async (...args) => { const bytes = await read(...args); await writeFile(join(root, 'a.md'), 'changed during read'); return bytes; };
  const files = createWorkbenchFiles({ fs, sessions, sandboxPolicy });
  await assert.rejects(files.read('session-A', 'a.md', owner, undefined, pathToFileURL(root).href), { code: 'workbench/read-conflict' });
});
test('no create or unconditional write endpoint exists', async t => {
  const { files, rawFiles } = await fixture(t); assert.equal(rawFiles.create, undefined);
  await assert.rejects(files.save('session-A', 'a.md', 'text', null, owner), { code: 'workbench/version-required' });
  await assert.rejects(files.save('session-A', 'new.md', 'text', 'v', owner), { code: 'workbench/not-regular-file' });
});
test('an old document cannot save after cwd expands to a parent that still contains the same file', async t => {
  const { files, session, root } = await fixture(t), file = await files.read('session-A', 'a.md', owner);
  session.header.cwd = resolve(root, '..');
  await assert.rejects(files.save('session-A', file.absolutePath, 'must-not-land', file.version, owner, undefined, file.projectId, file.absolutePath), { code: 'workbench/workspace-changed' });
  assert.equal(await readFile(join(root, 'a.md'), 'utf8'), file.text);
});

test('missing project or canonical target binding fails closed before a write', async t => {
  const { rawFiles, projectId, root } = await fixture(t);
  await assert.rejects(rawFiles.read('session-A', 'a.md', owner), { code: 'workbench/project-required' });
  const file = await rawFiles.read('session-A', 'a.md', owner, undefined, projectId);
  await assert.rejects(rawFiles.save('session-A', file.absolutePath, 'bad', file.version, owner, undefined, projectId), { code: 'workbench/target-required' });
  await assert.rejects(rawFiles.save('session-A', file.absolutePath, 'bad', file.version, owner), { code: 'workbench/project-required' });
  assert.equal(await readFile(join(root, 'a.md'), 'utf8'), file.text);
});
test('a same-byte sibling with its own valid version cannot substitute the original canonical target', async t => {
  const { files, rawFiles, projectId, root } = await fixture(t), a = await files.read('session-A', 'a.md', owner); await writeFile(join(root, 'b.md'), a.text);
  const b = await files.read('session-A', 'b.md', owner);
  await assert.rejects(rawFiles.save('session-A', 'b.md', 'wrong-target', b.version, owner, undefined, projectId, a.absolutePath), { code: 'workbench/target-changed' });
  assert.equal(await readFile(join(root, 'b.md'), 'utf8'), a.text); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), a.text);
});
test('a bound read cannot silently adopt a file after switching to another workspace', async t => {
  const { files, session, outside, root } = await fixture(t); session.header.cwd = outside; await writeFile(join(outside, 'a.md'), 'same name, other project');
  await assert.rejects(files.read('session-A', 'a.md', owner), { code: 'workbench/workspace-changed' }); assert.equal(await readFile(join(root, 'a.md'), 'utf8'), '\ufeff中文\r\nlast\r\n');
});

test('bound directory listing is metadata only and works under read-only policy', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'folder')); await symlink(f.outside, join(f.root, 'link')); f.session.mode = 'read-only';
  f.fs.readBytes = async () => { throw Error('directory listing must not read content'); };
  const result = await f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId);
  assert.equal(result.projectId, f.projectId); assert.equal(result.absolutePath, f.root); assert.equal(result.truncated, false);
  assert.equal(result.entries[0].name, 'folder'); assert.equal(result.entries.find(e => e.name === 'link').type, 'other'); assert.deepEqual(Object.keys(result.entries.find(e => e.name === 'a.md')).sort(), ['name','type']);
});
test('directory missing binding or nonowner never reaches listDir', async t => { const f = await fixture(t); let calls = 0; f.fs.listDir = async () => { calls++; return []; }; await assert.rejects(f.rawFiles.list(f.session.id, '.', owner), { code: 'workbench/project-required' }); await assert.rejects(f.rawFiles.list(f.session.id, '.', { principal: { kind: 'guest' } }, undefined, f.projectId), { code: 'workbench/owner-required' }); assert.equal(calls, 0); });
test('directory outside root, file and final symlink refuse before listing', async t => {
  const f = await fixture(t); await symlink(f.outside, join(f.root, 'link')); let calls = 0; f.fs.listDir = async () => { calls++; return []; };
  for (const path of [f.outside, '..']) await assert.rejects(f.rawFiles.list(f.session.id, path, owner, undefined, f.projectId), { code: 'workbench/outside-workspace' });
  for (const path of ['a.md', 'link']) await assert.rejects(f.rawFiles.list(f.session.id, path, owner, undefined, f.projectId), { code: 'workbench/not-directory' }); assert.equal(calls, 0);
});
test('directory I/O remains pinned to original target across Session A-B-A', async t => {
  const f = await fixture(t); await writeFile(join(f.outside, 'ONLY-B.txt'), 'B'); const original = f.fs.listDir.bind(f.fs); let seen;
  f.fs.listDir = async (target, signal) => { seen = f.fs.processPath(target); f.session.header.cwd = f.outside; try { return await original(target, signal); } finally { f.session.header.cwd = f.root; } };
  const result = await f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId); assert.equal(seen, f.root); assert.ok(result.entries.some(e => e.name === 'a.md')); assert.ok(!result.entries.some(e => e.name === 'ONLY-B.txt'));
});
test('directory result is refused if the Session remains in another project', async t => { const f = await fixture(t), original = f.fs.listDir.bind(f.fs); f.fs.listDir = async (...args) => { const result = await original(...args); f.session.header.cwd = f.outside; return result; }; await assert.rejects(f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId), { code: 'workbench/workspace-changed' }); });
test('directory re-resolution rejects a changed public target identity', async t => {
  const f = await fixture(t); await mkdir(join(f.root, 'other')); const resolveTarget = f.fs.resolve.bind(f.fs), other = await resolveTarget(join(f.root, 'other')); let directoryResolves = 0;
  f.fs.resolve = (path, options) => path === '.' && ++directoryResolves > 1 ? Promise.resolve(other) : resolveTarget(path, options);
  await assert.rejects(f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId), { code: 'workbench/target-changed' });
});
test('directory response caps entry count and encoded metadata bytes (controlled provider metadata)', async t => {
  const f = await fixture(t), lstat = f.fs.lstat.bind(f.fs); f.fs.lstat = (path, options, signal) => path === '.' ? lstat(path, options, signal) : Promise.resolve({ type: 'file' }); f.fs.listDir = async () => Array.from({ length: 2001 }, (_, i) => ({ name: 'file-' + i, type: 'file' }));
  const count = await f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId); assert.equal(count.entries.length, 2000); assert.equal(count.truncated, true);
  f.fs.listDir = async () => Array.from({ length: 1000 }, (_, i) => ({ name: String(i) + '\u0001'.repeat(4000), type: 'file' })); const bytes = await f.rawFiles.list(f.session.id, '.', owner, undefined, f.projectId); assert.equal(bytes.truncated, true); assert.ok(Buffer.byteLength(JSON.stringify(bytes.entries)) <= 256 * 1024); assert.ok(bytes.entries.length > 0);
});
test('directory cancellation after metadata read never produces a success receipt', async t => { const f = await fixture(t), control = new AbortController(), original = f.fs.listDir.bind(f.fs); f.fs.listDir = async (...args) => { const value = await original(...args); control.abort(); return value; }; await assert.rejects(f.rawFiles.list(f.session.id, '.', owner, control.signal, f.projectId), { name: 'AbortError' }); });
