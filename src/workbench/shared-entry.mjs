import { createWorkspaceController } from './controller.mjs';
import { createSharedFiles } from './shared-files.mjs';
import { createBrowserLayoutStorage } from './browser-layout-storage.mjs';
import { createTerminalCleanup } from './terminal-cleanup.mjs';
const unwrap = result => { if (result?.ok === true) return result.value; throw Object.assign(Error(result?.error?.message ?? 'Invalid host receipt'), { code: result?.error?.code }); };

// One content controller per confirmed native workspace/project pair. The owner
// is the real Remote/Connection scope, not a tab or the selected Session.
export async function createSharedEntry({ owner, services, authority, workspaceId, hostRequire, signal, origin = location.origin }) {
  const lease = authority.capture(workspaceId, signal);
  const project = unwrap(await services.call(owner, (ns, life) => ns.project(lease.sessionId, life), lease.signal));
  lease.check();
  const remote = owner.scope.get('remote');
  const projectKey = JSON.stringify(['desktop-v1', origin, workspaceId, project.projectId]);
  const layoutStore = await createBrowserLayoutStorage({ projectId: projectKey, legacyStorage: localStorage });
  let fiber, controller, terminals;
  const cleanup = createTerminalCleanup({ retry: id => terminals.retryClose(id) });
  const current = expected => {
    const now = authority.capture(workspaceId);
    if (!services.available(owner)) throw Error('原远端服务暂不可用，现场仍保留');
    if (expected && now.sessionId !== expected) throw Error('此终端属于会话 ' + expected + '；请返回该会话操作，或在当前会话新建终端');
    return now;
  };
  try {
    lease.check();
    const transport = new Proxy(remote.terminal, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (key === 'create') return (sessionId, request, signal) => {
        const active = current(sessionId);
        return services.call(owner, (ns, life) => ns.createTerminal(sessionId, request, project.projectId, life), AbortSignal.any([active.signal, signal].filter(Boolean)));
      };
      if (key === 'close') return (sessionId, terminalId, ...rest) => {
        current(sessionId); return cleanup.closeRemote(value.bind(target), sessionId, terminalId, ...rest);
      };
      // SDK retains/streams belong to the original manager owner; no implicit
      // transfer of process ownership to the newly selected Session.
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const ClientTerminals = hostRequire('@deepseek-ai/dsh-api-terminal-controller').ClientTerminals;
    fiber = owner.scope.plugin(child => { terminals = new ClientTerminals(child.isolate('webTerminals'), transport); });
    await fiber; lease.check(); cleanup.bindFailures(terminals.closeFailures);
    const views = new WeakMap();
    const guardedTerminals = {
      assertCanClose: sessionId => current(sessionId),
      retainTabs: tabs => terminals.retainTabs(tabs),
      close(sessionId, ...args) { current(sessionId); return terminals.close(sessionId, ...args); },
      view(sessionId, ...args) {
        current(sessionId); const view = terminals.view(sessionId, ...args);
        if (!views.has(view)) views.set(view, new Proxy(view, { get(target, key) {
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          if (['write','start','restart','rename'].includes(key)) return (...params) => { current(sessionId); return value.apply(target, params); };
          if (key === 'resize') return (...params) => { try { current(sessionId); } catch { return; } return value.apply(target, params); };
          return value.bind(target);
        } }));
        return views.get(view);
      },
    };
    const files = createSharedFiles({ authority, workspaceId, projectId: project.projectId,
      invoke: (method, args, signal) => services.call(owner, (ns, life) => ns[method](...args, life), signal) });
    controller = createWorkspaceController({ sessionId: lease.sessionId,
      getSessionId: () => { const state = authority.getSnapshot(); return state.workspaceId === workspaceId ? state.sessionId : null; },
      projectId: projectKey, transport: files.transport, ...layoutStore, terminals: guardedTerminals, terminalCleanup: cleanup, confirm: message => window.confirm(message) });
    return { controller, workspaceFiles: files.workspaceFiles, workspaceId, project, owner,
      available: () => services.available(owner) && authority.getSnapshot().workspaceId === workspaceId,
      terminalAvailable: item => { try { current(item.ownerSessionId); return true; } catch { return false; } },
      release: async () => { controller.releaseResources(); await fiber.dispose(); },
    };
  } catch (error) {
    controller?.releaseResources(); if (!controller) { cleanup.dispose(); layoutStore.storage.dispose(); }
    await fiber?.dispose(); throw error;
  }
}
