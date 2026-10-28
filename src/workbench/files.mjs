/* Host filesystem capability only: no node:fs, shell, private endpoints or path-key parsing.
 * The Gateway adapter supplies a verified caller; Session supplies cwd and policy.
 */
export class WorkbenchFileError extends Error {
  constructor(code, message) { super(message); this.name = 'WorkbenchFileError'; this.code = 'workbench/' + code; }
}
const refuse = (code, message) => { throw new WorkbenchFileError(code, message); };
const MAX_BYTES = 2 * 1024 * 1024;
export function createWorkbenchFiles({ fs, sessions, sandboxPolicy, maxBytes = MAX_BYTES }) {
  if (!fs || !sessions || !sandboxPolicy || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('Missing host filesystem capabilities');
  const textBytes = text => new TextEncoder().encode(text).length;
  function owner(caller) {
    if (caller?.principal?.kind !== 'owner') refuse('owner-required', '文件编辑仅对已认证本地使用者开放');
  }
  function session(id) {
    const live = sessions.get(id);
    if (!live || live.id !== id) refuse('session-unavailable', '会话不存在或已结束');
    return live;
  }
  async function scope(id, caller, signal) {
    owner(caller); signal?.throwIfAborted();
    const live = session(id), resolvedPolicy = sandboxPolicy.resolve({ session: live }), policy = resolvedPolicy && Object.freeze({ ...resolvedPolicy });
    if (!policy || !['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode)) refuse('policy-unavailable', '无法确定本次文件策略');
    const root = await fs.resolve(policy.workspaceRoot, { signal });
    const info = await fs.stat(root, signal);
    if (info?.type !== 'directory') refuse('workspace-unavailable', '工作区根目录不可用');
    return { live, root, policy, projectId: fs.fileUrl(root), sessionId: id };
  }
  function pathInput(path) {
    if (typeof path !== 'string' || !path || path.length > 4096 || path.includes('\0')) refuse('bad-path', '文件路径无效');
  }
  async function target(scope, path, signal) {
    pathInput(path);
    const entry = await fs.lstat(path, { cwd: scope.policy.workspaceRoot }, signal);
    if (entry?.type !== 'file') refuse('not-regular-file', '只能编辑已有的普通文件，不跟随末级符号链接');
    const target = await fs.resolve(path, { cwd: scope.policy.workspaceRoot, signal });
    if (!fs.contains(scope.root, target)) refuse('outside-workspace', '文件必须位于当前会话工作区内');
    const info = await fs.stat(target, signal);
    if (info?.type !== 'file') refuse('not-regular-file', '目标已不再是普通文件');
    if (info.size !== undefined && info.size > maxBytes) refuse('too-large', '文件超出编辑大小上限');
    return { target, info };
  }
  async function unchangedScope(before, caller, signal) {
    const after = await scope(before.sessionId, caller, signal);
    if (after.live !== before.live || after.projectId !== before.projectId || after.policy.workspaceRoot !== before.policy.workspaceRoot) refuse('workspace-changed', '会话工作区已经变化，请重新打开文件');
    return after;
  }
  function boundProject(selected, expectedProjectId) {
    if (typeof expectedProjectId !== 'string' || !expectedProjectId || expectedProjectId.length > 4096 || !expectedProjectId.isWellFormed()) refuse('project-required', '文件操作必须绑定打开时的工作区');
    if (expectedProjectId !== selected.projectId) refuse('workspace-changed', '会话工作区已变化；旧文档草稿仍保留，未切换保存目标');
  }
  async function directory(selected, path, signal) {
    pathInput(path);
    const entry = await fs.lstat(path, { cwd: selected.policy.workspaceRoot }, signal);
    if (entry?.type !== 'directory') refuse('not-directory', '只能列出已有目录，不跟随末级符号链接');
    const target = await fs.resolve(path, { cwd: selected.policy.workspaceRoot, signal });
    if (!fs.contains(selected.root, target)) refuse('outside-workspace', '目录必须位于绑定的项目内');
    if ((await fs.stat(target, signal))?.type !== 'directory') refuse('not-directory', '目录目标已变化');
    return target;
  }
  async function list(sessionId, path, caller, signal, expectedProjectId) {
    const selected = await scope(sessionId, caller, signal); boundProject(selected, expectedProjectId);
    const target = await directory(selected, path, signal);
    // Metadata only, through the public filesystem capability. The captured
    // target/root never becomes the later Session cwd, even across A→B→A.
    const children = await fs.listDir(target, signal); signal?.throwIfAborted();
    const ordered = children.filter(entry => typeof entry.name === 'string' && entry.name && entry.name.isWellFormed() && entry.name.length <= 4096 && !entry.name.includes('/') && !entry.name.includes('\0') && !['.','..'].includes(entry.name))
      .map(entry => ({ name: entry.name, type: ['file','directory'].includes(entry.type) ? entry.type : 'other' }))
      .sort((a, b) => (a.type !== 'directory') - (b.type !== 'directory') || a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const entries = []; let bytes = 0;
    for (const entry of ordered) {
      const cost = textBytes(JSON.stringify({ name: entry.name, type: 'directory' })) + 1;
      if (entries.length >= 2000 || bytes + cost > 256 * 1024) break;
      const child = await fs.lstat(entry.name, { cwd: fs.processPath(target) }, signal);
      entries.push({ name: entry.name, type: ['file','directory'].includes(child?.type) ? child.type : 'other' }); bytes += cost;
    }
    entries.sort((a, b) => (a.type !== 'directory') - (b.type !== 'directory') || a.name.localeCompare(b.name, 'en', { numeric: true }));
    const after = await unchangedScope(selected, caller, signal), fresh = await directory(after, path, signal);
    if (fresh.targetKey !== target.targetKey) refuse('target-changed', '列出期间目录目标已变化');
    return { projectId: selected.projectId, absolutePath: fs.processPath(target), entries, truncated: entries.length !== children.length };
  }
  async function read(sessionId, path, caller, signal, expectedProjectId) {
    const selected = await scope(sessionId, caller, signal); boundProject(selected, expectedProjectId);
    const { target: file, info: before } = await target(selected, path, signal);
    // Read bytes once: preserve CRLF, final newline and UTF-8 BOM exactly.
    const bytes = await fs.readBytes(file, signal, maxBytes);
    if (bytes.length > maxBytes) refuse('too-large', '文件超出编辑大小上限');
    let text; try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { refuse('not-text', '文件不是有效 UTF-8 文本'); }
    if (text.includes('\0')) refuse('not-text', '文件包含二进制 NUL 字节');
    const after = await fs.stat(file, signal);
    if (after?.type !== 'file' || after.version !== before.version) refuse('read-conflict', '读取期间文件发生变化，请重试');
    await unchangedScope(selected, caller, signal);
    return { projectId: selected.projectId, absolutePath: fs.processPath(file), text, version: after.version, bytes: bytes.length };
  }
  async function save(sessionId, path, text, expectedVersion, caller, signal, expectedProjectId, expectedAbsolutePath) {
    if (typeof text !== 'string' || !text.isWellFormed() || text.includes('\0') || textBytes(text) > maxBytes) refuse('invalid-text', '保存必须是大小受限的 UTF-8 文本');
    if (typeof expectedVersion !== 'string' || !expectedVersion || expectedVersion.length > 4096) refuse('version-required', '保存必须提供读取时的完整版本');
    const selected = await scope(sessionId, caller, signal); boundProject(selected, expectedProjectId);
    if (typeof expectedAbsolutePath !== 'string' || !expectedAbsolutePath || expectedAbsolutePath.length > 4096 || !expectedAbsolutePath.isWellFormed()) refuse('target-required', '保存必须绑定读取时的完整规范路径');
    if (selected.policy.mode === 'read-only') refuse('read-only', '当前会话为只读；草稿不会丢失');
    const { target: file } = await target(selected, path, signal);
    // Re-resolve immediately before delegating. The backend owns its own lock,
    // version check and sandbox fence; this is not a global external-editor lock.
    const current = await unchangedScope(selected, caller, signal);
    if (current.policy.mode === 'read-only') refuse('read-only', '当前会话已切换到只读');
    const fresh = await target(current, path, signal);
    boundProject(current, expectedProjectId);
    if (fs.processPath(fresh.target) !== expectedAbsolutePath) refuse('target-changed', '保存目标与打开文档的规范路径不一致，未写入');
    if (fresh.target.targetKey !== file.targetKey) refuse('target-changed', '文件链接或目标已变化，请重新打开');
    const outcome = await fs.writeText(fresh.target, text, { kind: 'replaceIfVersion', version: expectedVersion }, signal, current.policy);
    return { projectId: current.projectId, absolutePath: fs.processPath(fresh.target), version: outcome.version };
  }
  async function project(sessionId, caller, signal) {
    const selected = await scope(sessionId, caller, signal);
    return { projectId: selected.projectId, workspaceRoot: fs.processPath(selected.root), writable: selected.policy.mode !== 'read-only', maxBytes };
  }
  return Object.freeze({ read, save, project, list });
}
