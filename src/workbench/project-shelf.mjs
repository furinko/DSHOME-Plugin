/* A Session may retain several project controllers; selecting never rebinds
 * their transports, moves their DOM, closes content or writes a layout. */
const fail = message => { throw Error(message); };
export function createProjectShelf({ probe, create, release = () => {}, isLive = () => true, onChange = () => {}, limit = 8 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 32) throw Error('Invalid retained project limit');
  const entries = new Map(), listeners = new Set(); let disposed = false, generation = 0, operation;
  let state = Object.freeze({ revision: 0, selected: null, observed: null, projects: Object.freeze([]), busy: false, error: null });
  const live = () => { if (disposed || !isLive()) fail('项目接口已变化；保留内容未被改绑'); };
  function publish(change = {}) { state = Object.freeze({ ...state, ...change, projects: Object.freeze([...entries.values()]), revision: state.revision + 1 }); onChange(state); for (const fn of [...listeners]) { try { fn(); } catch {} } }
  function checked(project) { if (!project || typeof project.key !== 'string' || !project.key || project.key.length > 4096) fail('Host 未提供有效项目身份'); return Object.freeze({ ...project }); }
  async function observe(signal) { live(); signal?.throwIfAborted(); const project = checked(await probe(signal)); live(); signal?.throwIfAborted(); return project; }
  function run(kind, fn) {
    if (operation) { if (operation.kind === kind) return operation.promise; return Promise.reject(Error('项目操作尚未完成，请稍后重试')); }
    const owner = { kind, generation: ++generation }; operation = owner;
    owner.promise = (async () => { await Promise.resolve(); try { return await fn(owner); } catch (error) { if (!disposed) publish({ error }); throw error; } finally { if (operation === owner) { operation = null; if (!disposed) publish({ busy: false }); } } })();
    publish({ busy: true, error: null }); return owner.promise;
  }
  const api = {
    report(error) { if (!disposed) publish({ error }); },
    getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    selected: () => entries.get(state.selected), get: key => entries.get(key),
    ensure(signal) { live(); return state.selected ? Promise.resolve(entries.get(state.selected)) : api.openCurrent(signal); },
    check(signal) { return run('check', async () => { const project = await observe(signal); publish({ observed: project }); return project; }); },
    openCurrent(signal) { return run('open', async owner => {
      const project = await observe(signal); publish({ observed: project });
      if (entries.has(project.key)) { publish({ selected: project.key }); return entries.get(project.key); }
      if (entries.size >= limit) fail('保留项目已达上限；请先明确关闭不再需要的项目，不会自动丢弃旧内容');
      let candidate;
      try {
        candidate = await create(project, signal); live(); signal?.throwIfAborted();
        const after = await observe(signal);
        if (owner.generation !== generation || after.key !== project.key) fail('加载期间 Host 工作区已变化，未采用旧项目初始化');
        if ([...entries.values()].some(e => e.controller === candidate?.controller)) fail('controller 已归属另一个保留项目，拒绝改绑');
        if (!candidate?.controller || candidate.controller.projectId !== project.key) fail('项目 controller 身份不匹配');
        const entry = Object.freeze({ ...candidate, project }); entries.set(project.key, entry); candidate = null;
        publish({ observed: after, selected: project.key }); return entry;
      } finally { if (candidate && ![...entries.values()].some(e => e.controller === candidate.controller)) { candidate.controller?.closeWorkspace(); await release(candidate); } }
    }); },
    select(key) { live(); if (operation) fail('项目操作尚未完成'); if (!entries.has(key)) fail('保留项目不存在'); publish({ selected: key, error: null }); return entries.get(key); },
    async close(key) {
      live(); if (operation) fail('项目操作尚未完成'); const entry = entries.get(key); if (!entry) return false;
      if (!entry.controller.closeWorkspace()) return false;
      entries.delete(key); const selected = state.selected === key ? entries.keys().next().value ?? null : state.selected;
      publish({ selected }); await release(entry); return true;
    },
    // SidebarRightCloseHandler is SYNCHRONOUS. Rejection/confirmation must
    // happen before the native store is allowed to remove the tab.
    closeAllNow() {
      live(); if (operation) fail('项目操作尚未完成'); const all = [...entries.values()];
      if (all.length > 1 && all.some(e => e.controller.hasUnsaved() || [...e.controller.contents.values()].some(i => i.started || ['loading','saving'].includes(i.document?.getSnapshot().phase) || i.document?.getSnapshot().comparing) || e.controller.getSnapshot().savingLayout)) fail('还有多个项目的草稿、终端或在途操作；请先逐个明确关闭，未丢弃任何项目');
      for (const entry of all) if (!entry.controller.closeWorkspace()) fail('工作台仍有未保存内容或在途操作，已取消关闭');
      entries.clear(); publish({ selected: null });
      return Promise.all(all.map(entry => Promise.resolve().then(() => release(entry))));
    },
    async closeAll() { await api.closeAllNow(); },
    hasUnsaved: () => [...entries.values()].some(e => e.controller.hasUnsaved()),
    async dispose() {
      if (disposed) return; disposed = true; ++generation;
      for (const entry of entries.values()) { entry.controller.releaseResources?.(); await release(entry); }
      entries.clear(); listeners.clear();
    },
  }; return Object.freeze(api);
}
