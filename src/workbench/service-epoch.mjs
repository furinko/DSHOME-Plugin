// A local lifetime assertion, NOT a permission or a substitute for Host policy.
const unavailable = () => Object.assign(Error('工作区接口暂不可用或服务域已变化；已有草稿未被改绑'), { code: 'workbench/service-unavailable' });
const changed = cause => Object.assign(Error('接口在请求期间已撤回；结果未采用，保存须读回核对'), { code: 'WORKBENCH_SERVICE_CHANGED', cause });
export function createServiceEpoch({ onChange = () => {} } = {}) {
  let current, disposed = false;
  function attach(owner, value) {
    if (disposed) throw unavailable(); current?.life.abort();
    const lease = { owner, value, life: new AbortController() }; current = lease; onChange();
    return () => { lease.life.abort(); if (current === lease) { current = undefined; onChange(); } };
  }
  return Object.freeze({ attach, available: owner => !disposed && !!current && current.owner === owner && !current.life.signal.aborted,
    async call(owner, invoke, signal) {
      const lease = current; if (disposed || !lease || lease.owner !== owner || lease.life.signal.aborted) throw unavailable();
      signal?.throwIfAborted(); const lifetime = signal ? AbortSignal.any([signal, lease.life.signal]) : lease.life.signal;
      try {
        const result = await invoke(lease.value, lifetime);
        if (disposed || current !== lease || lease.life.signal.aborted) throw changed();
        lifetime.throwIfAborted(); return result;
      } catch (error) { if (disposed || current !== lease || lease.life.signal.aborted) throw changed(error); throw error; }
    },
    dispose() { if (disposed) return; disposed = true; current?.life.abort(); current = undefined; onChange(); },
  });
}
