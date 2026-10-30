// Shared documents use fresh current-session authority for every request.
// Host read/save/list remain the sole filesystem/policy implementation.
function unwrap(result) {
  if (result?.ok === true) {
    if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) throw Object.assign(Error('宿主成功回执缺少结构化结果'), {code:'WORKBENCH_INVALID_RECEIPT'});
    return result.value;
  }
  throw Object.assign(Error(result?.error?.message ?? '宿主没有返回有效回执'), { code: result?.error?.code ?? 'WORKBENCH_INVALID_RECEIPT' });
}
export function createSharedFiles({ authority, workspaceId, projectId, invoke, generation }) {
  if (!authority?.run || !workspaceId || !projectId || typeof invoke !== 'function') throw Error('Explicit workspace, project and authority required');
  async function call(method, args, signal, expectedPath) {
    return authority.run(workspaceId, async lease => {
      if (generation !== undefined && lease.generation !== generation) throw Object.assign(Error('连接代次已变化，旧内容不能自动改绑'), {code:'WORKBENCH_CONNECTION_CHANGED'});
      const project = unwrap(await invoke('project', [lease.sessionId], lease.signal));
      lease.check();
      if (project.projectId !== projectId) throw Object.assign(Error('工作区根目录已变化；旧内容未自动改绑'), { code: 'WORKBENCH_PROJECT_CHANGED' });
      const result = unwrap(await invoke(method, [lease.sessionId, ...args], lease.signal));
      lease.check();
      if (result.projectId !== projectId || expectedPath !== undefined && result.absolutePath !== expectedPath) throw Object.assign(Error('宿主回执与当前项目或文件不匹配'), { code: 'WORKBENCH_SCOPE_RESPONSE' });
      return result;
    }, signal);
  }
  return Object.freeze({
    transport: Object.freeze({
      read: (path, signal) => call('read', [path, projectId], signal),
      save: (path, text, version, signal) => call('save', [path, text, version, projectId, path], signal, path),
    }),
    workspaceFiles: Object.freeze({
      async list(_sessionId, path, signal) {
        // The UI's old session prop is never used as authority.
        return { ok: true, value: await call('list', [path, projectId], signal) };
      },
    }),
  });
}
