import { TypertRemoteService, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { createWorkbenchFiles } from './workbench/files.mjs';
import { createBoundTerminal } from './workbench/terminal-binding.mjs';
import { TYPERT } from './workbench/wire.mjs';
export const name = 'dshome-plugin';
export const inject = ['fs', 'sessions', 'sandboxPolicy', 'typert'];
export class WorkbenchFilesService extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'dshomeWorkspace');
    this.files = createWorkbenchFiles({ fs: ctx.fs, sessions: ctx.sessions, sandboxPolicy: ctx.sandboxPolicy });
  }
  caller() { return this.ctx.invocation?.peer; }
  async invoke(method, values, signal, binding = []) {
    try { return await this.files[method](...values, this.caller(), signal, ...binding); }
    catch (error) {
      // Preserve stable refusal codes on the Gateway wire; never expose a host stack.
      if (typeof error?.code === 'string' && /^(FS_|workbench\/)/.test(error.code)) throw new RemoteError(error.code, error.message, {});
      throw error;
    }
  }
  async createTerminal(agent, request, expectedProjectId, signal) {
    try {
      const binding = this.terminalBinding;
      if (!binding) throw new RemoteError('workbench/terminal-unavailable', '真实终端服务不可用', {});
      return await createBoundTerminal({ agent, request, expectedProjectId, caller: this.caller(), signal: AbortSignal.any([signal, binding.signal]), fs: this.ctx.fs, sessions: this.ctx.sessions, files: this.files, controller: binding.controller });
    } catch (error) { if (typeof error?.code === 'string' && /^(FS_|workbench\/)/.test(error.code)) throw new RemoteError(error.code, error.message, {}); throw error; }
  }
  project(sessionId, signal) { return this.invoke('project', [sessionId], signal); }
  list(sessionId, path, expectedProjectId, signal) { return this.invoke('list', [sessionId, path], signal, [expectedProjectId]); }
  read(sessionId, path, expectedProjectId, signal) { return this.invoke('read', [sessionId, path], signal, [expectedProjectId]); }
  save(sessionId, path, text, expectedVersion, expectedProjectId, expectedAbsolutePath, signal) { return this.invoke('save', [sessionId, path, text, expectedVersion], signal, [expectedProjectId, expectedAbsolutePath]); }
}
export function apply(ctx) {
  const service = new WorkbenchFilesService(ctx);
  ctx.inject(['terminalController'], child => {
    const life = new AbortController(), binding = { controller: child.get('terminalController'), signal: life.signal };
    service.terminalBinding = binding;
    child.effect(() => () => { life.abort(); if (service.terminalBinding === binding) service.terminalBinding = null; });
  });
  ctx.typert.register(TYPERT);
}
export default { name, inject, apply };
