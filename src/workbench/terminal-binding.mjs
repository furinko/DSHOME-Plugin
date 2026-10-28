import { WorkbenchFileError } from './files.mjs';
const refuse = (code, message) => { throw new WorkbenchFileError(code, message); };
const readonly = { set: () => false, defineProperty: () => false, deleteProperty: () => false };
const forwarded = (target, key) => { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; };
/* Per-call capability facades over the ACTUAL Gateway-resolved Agent/context/
 * subprocess provider. No fabricated Session, replacement global service,
 * private import, alternate PTY, sandbox escalation, or runtime mutation.
 * The real SDK still owns identities, limits, allocation, holds and I/O. */
export async function createBoundTerminal({ agent, request, expectedProjectId, caller, signal, fs, sessions, files, controller }) {
  const live = () => { signal?.throwIfAborted(); if (!agent || sessions.get(agent.id) !== agent.session) refuse('session-unavailable', '终端会话已变化'); };
  live();
  const project = await files.project(agent.id, caller, signal); // authenticated owner + real policy
  if (project.projectId !== expectedProjectId) refuse('workspace-changed', 'Host 工作区已变化，未启动原项目的新终端');
  const runtime = agent.ctx.get('subprocess');
  if (!runtime?.spawnTerminal || !controller?.create) refuse('terminal-unavailable', '真实终端执行服务不可用');
  async function pinnedPath(cwd, control = signal) {
    live(); control?.throwIfAborted();
    const target = await fs.resolve(cwd, { signal: control });
    if (fs.fileUrl(target) !== expectedProjectId) refuse('workspace-changed', '终端实际启动目录与绑定项目不同，未交给进程后端');
    if ((await fs.stat(target, control))?.type !== 'directory') refuse('workspace-unavailable', '终端项目目录不可用');
    live(); control?.throwIfAborted(); return fs.processPath(target);
  }
  const subprocess = new Proxy(runtime, { ...readonly, get(target, key) {
    if (key === 'spawnTerminal') return async spec => {
      // Check the SDK's final workingDirectory.ensure result, including queued
      // ensure/recovery, AT the actual public spawn boundary. Pin its canonical
      // path so a mutable Session cwd cannot silently become this process cwd.
      const cwd = await pinnedPath(spec.cwd, spec.signal ?? signal);
      return target.spawnTerminal({ ...spec, cwd });
    };
    return forwarded(target, key);
  } });
  const context = new Proxy(agent.ctx, { ...readonly, get(target, key) {
    if (key === 'subprocess') return subprocess;
    if (key === 'get') return (name, ...args) => name === 'subprocess' ? subprocess : target.get(name, ...args);
    return forwarded(target, key);
  } });
  const execution = new Proxy(agent, { ...readonly, get(target, key) { return key === 'ctx' ? context : forwarded(target, key); } });
  const info = await controller.create(execution, request, signal);
  // SDK create is idempotent: an existing foreign-project id may return without
  // reaching spawn. Reject its receipt; NEVER kill that preexisting terminal.
  await pinnedPath(info.cwd);
  return info;
}
