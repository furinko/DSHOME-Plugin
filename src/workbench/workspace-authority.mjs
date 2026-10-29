// A shared content instance is not a reusable session credential.
// Every host operation captures the CURRENT session/workspace/generation lease.
// The host still performs its own identity, canonical-root and policy checks.
export function createWorkspaceAuthority({ workspaces, session, connection }) {
  for (const source of [workspaces, session, connection]) if (!source?.getSnapshot || !source?.subscribe) throw Error('Authoritative sources required');
  let state, revision = 0, disposed = false, generationSignal;
  const listeners = new Set();
  function inspect() {
    const generation = connection.getSnapshot(), catalog = workspaces.getSnapshot(), sessionId = session.getSnapshot()?.key;
    if (!generation || generation.signal?.aborted || catalog?.phase !== 'ready' || !sessionId) return { generation, sessionId, workspaceId: null };
    const matches = catalog.items.filter(w => w.sessionIds.includes(sessionId));
    return { generation, sessionId, workspaceId: matches.length === 1 ? matches[0].workspaceId : null };
  }
  function sync() {
    if (disposed) return;
    const next = inspect();
    if (generationSignal !== next.generation?.signal) {
      generationSignal?.removeEventListener('abort', sync);
      generationSignal = next.generation?.signal;
      generationSignal?.addEventListener('abort', sync, { once: true });
    }
    if (state && next.generation === state.generation && next.sessionId === state.sessionId && next.workspaceId === state.workspaceId) return;
    state?.lifetime.abort();
    state = Object.freeze({ ...next, revision: ++revision, lifetime: new AbortController() });
    for (const listener of [...listeners]) listener();
  }
  const off = [workspaces, session, connection].map(s => s.subscribe(sync));
  sync();
  function capture(workspaceId, signal) {
    sync();
    if (disposed || !workspaceId || state.workspaceId !== workspaceId || state.lifetime.signal.aborted) throw Error('当前会话没有此工作区的有效操作租约');
    const lease = state;
    const combined = signal ? AbortSignal.any([signal, lease.lifetime.signal]) : lease.lifetime.signal;
    const check = () => {
      sync(); combined.throwIfAborted();
      if (disposed || state !== lease) throw Error('会话或工作区已变化；旧操作未继续');
    };
    check();
    return Object.freeze({ sessionId: lease.sessionId, workspaceId, generation: lease.generation, revision: lease.revision, signal: combined, check });
  }
  return Object.freeze({
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    capture,
    async run(workspaceId, invoke, signal) {
      const lease = capture(workspaceId, signal);
      const value = await invoke(lease);
      lease.check(); return value;
    },
    dispose() { if (disposed) return; disposed = true; state?.lifetime.abort(); generationSignal?.removeEventListener('abort', sync); off.forEach(fn => fn()); listeners.clear(); },
  });
}
