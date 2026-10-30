// In-memory P0 presentation state. No filesystem, terminal or conversation authority.
export function createSceneStore({ workspaces, session, connection, maxScenes = 8 }) {
  if (![workspaces, session, connection].every(s => s?.getSnapshot && s?.subscribe)) throw Error('Authoritative workspace/session/connection sources required');
  let revision = 0, mode = 'original', chatWidth = 420, narrowPane = 'workspace', disposed = false;
  let snapshot, selected = null, reason = '', nextId = 0, epochNumber = 0, watchedSignal, desktop = null;
  const watchAbort = signal => { if (watchedSignal === signal) return; watchedSignal?.removeEventListener('abort', sync); watchedSignal = signal; watchedSignal?.addEventListener('abort', sync, { once: true }); };
  const epochs = new WeakMap(), scenes = new Map(), listeners = new Set();
  const publish = () => {
    snapshot = Object.freeze({ revision: ++revision, mode, chatWidth, narrowPane, selected, reason, desktop, scenes: Object.freeze([...scenes.values()]) });
    for (const listener of [...listeners]) listener();
  };
  function sync() {
    if (disposed) return;
    const generation = connection.getSnapshot(), catalog = workspaces.getSnapshot(), sessionId = session.getSnapshot()?.key;
    watchAbort(generation?.signal);
    let next = null, problem = '', workspace;
    if (!generation || generation.signal?.aborted) problem = '连接不可用；已有现场保留，未自动改绑。';
    else if (catalog.phase !== 'ready') problem = '正在确认宿主工作区关系；不使用缓存关系执行操作。';
    else if (!sessionId) problem = '请选择本工作区的一条真实会话。';
    else {
      const matches = catalog.items.filter(w => w.sessionIds.includes(sessionId));
      if (matches.length !== 1) problem = matches.length ? '工作区归属冲突，未合并现场。' : '当前会话尚无确认的工作区归属。';
      else {
        workspace = matches[0];
        if (!epochs.has(generation)) epochs.set(generation, ++epochNumber);
        next = JSON.stringify([epochs.get(generation), workspace.workspaceId]);
        if (!scenes.has(next)) {
          if (scenes.size >= maxScenes) { problem = '保留现场已达上限，未静默清除旧内容。'; next = null; }
          else scenes.set(next, { id: `p0-scene-${++nextId}`, key: next, workspaceId: workspace.workspaceId, title: workspace.title || workspace.workspaceId, note: '', address: '', url: '', arrangement: 'split', revision: 0 });
        }
      }
    }
    let titleChanged = false;
    if (next && workspace && scenes.get(next).title !== (workspace.title || workspace.workspaceId)) { scenes.get(next).title = workspace.title || workspace.workspaceId; titleChanged = true; }
    if (snapshot && selected === next && reason === problem && !titleChanged) return;
    selected = next; reason = problem; publish();
  }
  const offs = [workspaces, session, connection].map(source => source.subscribe(sync));
  sync();
  const api = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    forgetScene(key) {
      if(disposed || key===selected) throw Error('当前现场不能作为旧现场释放');
      if(!scenes.has(key))return false;
      if(!desktop?.entries || desktop.entries.has(key) || scenes.get(key).note || scenes.get(key).url)throw Error('现场内容尚未安全关闭');
      scenes.delete(key); sync(); publish(); return true;
    },
    setDesktop(value) { if (!disposed && value && desktop !== value) { desktop = value; publish(); } },
    setMode(next) { if (!['original', 'workbench'].includes(next)) throw Error('Unknown shell mode'); if (disposed || next === mode) return; mode = next; publish(); },
    resizeChat(value) { if (!Number.isFinite(value)) throw Error('Invalid width'); if (disposed) return; chatWidth = Math.max(320, Math.min(560, Math.round(value))); publish(); },
    setNarrowPane(next) { if (!['workspace', 'chat'].includes(next)) throw Error('Unknown pane'); if (disposed) return; narrowPane = next; publish(); },
    update(key, patch) {
      if (disposed || key !== selected || !scenes.has(key)) throw Error('Inactive workspace; edit rejected');
      const scene = scenes.get(key);
      for (const field of Object.keys(patch)) if (!['note', 'address', 'url', 'arrangement'].includes(field)) throw Error('Unexpected scene field');
      if (['note', 'address', 'url'].some(field => field in patch && (typeof patch[field] !== 'string' || patch[field].length > (field === 'note' ? 262144 : 8192)))) throw Error('Scene value exceeds limit');
      if ('arrangement' in patch && !['split', 'stack'].includes(patch.arrangement)) throw Error('Unknown arrangement');
      Object.assign(scene, patch, { revision: scene.revision + 1 }); publish();
    },
    dispose() { disposed = true; watchAbort(undefined); for (const off of offs) off(); listeners.clear(); },
  };
  return Object.freeze(api);
}

export function parseWebAddress(value, applicationOrigin) {
  let url;
  try { url = new URL(value.trim()); } catch { throw Error('请输入完整 HTTP(S) 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 8192) throw Error('只接受不含凭据的 HTTP(S) 地址。');
  if (url.origin === applicationOrigin) throw Error('不能嵌入 DSH 应用自身。');
  return url.href;
}
