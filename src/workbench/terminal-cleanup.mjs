/* Observe only our public SDK close calls and closeFailures store. No private
 * queues/storage reads; never infer process death from tab removal or detach. */
const text = value => String(value?.message ?? value ?? '').slice(0, 1200);
export function createTerminalCleanup({ retry = () => {}, limit = 256 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) throw Error('Invalid cleanup task limit');
  const acknowledged = new Set();
  const records = new Map(), listeners = new Set(); let offFailures, failures, disposed = false, overflow = 0, confirmed = 0;
  let state = Object.freeze({ revision: 0, requests: Object.freeze([]), confirmed, overflow });
  function publish() { state = Object.freeze({ revision: state.revision + 1, requests: Object.freeze([...records.values()].map(r => Object.freeze({ ...r }))), confirmed, overflow }); if (!disposed) for (const fn of [...listeners]) { try { fn(); } catch {} } }
  function record(id, sessionId, title) {
    if (typeof id !== 'string' || !id) throw Error('终端关闭身份缺失');
    let item = records.get(id); if (!item) { if (records.size >= limit) throw Error('关闭任务已达上限；请先解决未确认任务，不会丢弃已有任务'); item = { id, sessionId, title: title || id, phase: 'queued', message: '' }; records.set(id, item); }
    if (sessionId !== undefined && item.sessionId !== undefined && sessionId !== item.sessionId) throw Error('终端关闭会话不匹配');
    item.sessionId ??= sessionId; if (title) item.title = text(title); return item;
  }
  function syncFailures() {
    const value = failures?.getSnapshot() ?? []; overflow = 0;
    for (const failure of value) {
      if (acknowledged.has(failure.id)) continue;
      if (!records.has(failure.id) && records.size >= limit) { overflow++; continue; }
      const item = record(failure.id, undefined, failure.title);
      // A previous SDK failure may still be published just as a retry starts.
      if (item.phase !== 'pending') Object.assign(item, { phase: 'failed', message: text(failure.message) });
    }
    publish();
  }
  return Object.freeze({
    getSnapshot: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    begin(sessionId, id, title) { if (disposed) throw Error('终端清理接口已释放'); const item = record(id, sessionId, title); if (item.phase !== 'pending') Object.assign(item, { phase: 'queued', message: '' }); publish(); },
    fail(id, error) { const item = records.get(id); if (item) { Object.assign(item, { phase: 'failed', message: text(error) }); publish(); } },
    async closeRemote(invoke, sessionId, id, signal) {
      const item = record(id, sessionId); Object.assign(item, { phase: 'pending', message: '' }); publish();
      try {
        const result = await (signal === undefined ? invoke(sessionId, id) : invoke(sessionId, id, signal));
        if (result?.ok === true) { records.delete(id); acknowledged.add(id); if (acknowledged.size > limit * 2) acknowledged.delete(acknowledged.values().next().value); confirmed++; syncFailures(); }
        else { Object.assign(item, { phase: 'failed', message: text(result?.error ?? '宿主未确认关闭') }); publish(); }
        return result;
      } catch (error) { Object.assign(item, { phase: 'failed', message: text(error) }); publish(); throw error; }
    },
    bindFailures(store) { offFailures?.(); failures = store; offFailures = store?.subscribe(syncFailures); syncFailures(); },
    retry(id) {
      if (disposed) throw Error('终端清理接口已释放'); const item = records.get(id);
      if (!item || item.phase !== 'failed') return false;
      // SDK retryClose is void and may ignore a still-finishing attempt. Keep
      // failure visible until a REAL new close call starts, never fake pending.
      retry(id); return true;
    },
    hasUnconfirmed: () => records.size > 0 || overflow > 0,
    dispose() { if (disposed) return; disposed = true; offFailures?.(); listeners.clear(); },
  });
}
