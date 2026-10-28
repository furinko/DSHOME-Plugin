/* Authoritative browser layout records live in IndexedDB transactions.
 * localStorage is ONLY a read-only legacy import; Web Locks alone cannot make
 * independently cached localStorage views a transactional compare-and-swap. */
export async function createBrowserLayoutStorage({ projectId, legacyStorage, locks = globalThis.navigator?.locks, indexedDB = globalThis.indexedDB, keyRange = globalThis.IDBKeyRange } = {}) {
  if (typeof projectId !== 'string' || !projectId || projectId.length > 4096) throw Error('Explicit layout project identity required');
  const key = 'dshome.workspace.v1:' + encodeURIComponent(projectId), backupPrefix = key + ':recovery:';
  const transactions = new Set();
  let db, cache = new Map(), active = null, changes = null, closed = false, unavailable = null;
  const allowed = name => name === key || typeof name === 'string' && name.startsWith(backupPrefix) && /^[A-Za-z0-9_-]{1,96}$/.test(name.slice(backupPrefix.length));
  const storage = {
    getItem(name) { if (!allowed(name)) throw Error('Layout storage outside project'); if (closed) throw Error('Layout database closed'); if (unavailable && !active) throw unavailable; return (active ?? cache).get(name) ?? null; },
    setItem(name, value) { if (!active || !changes || !allowed(name) || typeof value !== 'string') throw Error('Layout writes require an owned transaction'); active.set(name, value); changes.set(name, value); },
    async refresh() { try { await transaction('readonly', () => {}); unavailable = null; } catch (error) { unavailable = error; throw error; } },
    abortPendingWrites() { for (const tx of transactions) if (tx.mode === 'readwrite') { try { tx.abort(); } catch {} } },
    dispose() { closed = true; for (const tx of transactions) { try { tx.abort(); } catch {} } db?.close(); },
  };
  function transaction(mode, callback) {
    if (closed || !db) return Promise.reject(Error('Layout database unavailable'));
    return new Promise((resolve, reject) => {
      let result, error, next = new Map(), importedBackup;
      const tx = db.transaction('records', mode), records = tx.objectStore('records'); transactions.add(tx);
      const abort = reason => { error = reason; try { tx.abort(); } catch {} };
      tx.onabort = () => { transactions.delete(tx); reject(error ?? tx.error ?? Error('Layout transaction aborted')); };
      tx.onerror = () => { error ??= tx.error; };
      tx.oncomplete = () => { transactions.delete(tx); cache = next; unavailable = null; resolve(result); };
      const primary = records.get(key);
      primary.onerror = () => abort(primary.error);
      primary.onsuccess = () => {
        try {
          if (primary.result !== undefined) next.set(key, primary.result);
          else {
            const legacy = legacyStorage?.getItem(key) ?? null;
            if (legacy !== null) {
              next.set(key, legacy);
              // Import only this legacy record's referenced backup, never scan
              // another project's keys or silently rewrite the legacy source.
              try {
                const revision = JSON.parse(legacy.replace(/^\uFEFF/, '')).storageRevision;
                const epoch = typeof revision === 'string' ? /^r:([A-Za-z0-9_-]{1,96}):/.exec(revision)?.[1] : null;
                if (epoch) { const name = backupPrefix + epoch, raw = legacyStorage.getItem(name); if (raw !== null) { next.set(name, raw); importedBackup = [name, raw]; } }
              } catch { /* A corrupt legacy original is preserved, not reset. */ }
            }
          }
          const request = records.openCursor(keyRange.bound(backupPrefix, backupPrefix + '\uffff'));
          request.onerror = () => abort(request.error);
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) { if (allowed(cursor.key)) next.set(cursor.key, cursor.value); cursor.continue(); return; }
            try {
              active = next; changes = mode === 'readwrite' ? new Map() : null;
              result = callback(); if (result?.then) throw Error('Layout transaction callback must be synchronous');
              if (changes?.size) {
                if (changes.has(key) && importedBackup && !changes.has(importedBackup[0])) records.put(importedBackup[1], importedBackup[0]);
                for (const [name, raw] of changes) records.put(raw, name);
              }
            } catch (reason) { abort(reason); }
            finally { active = null; changes = null; }
          };
        } catch (reason) { abort(reason); }
      };
    });
  }
  try {
    if (!indexedDB || !keyRange) throw Error('IndexedDB is unavailable; unsafe localStorage fallback is disabled');
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dshome-workspace-layouts', 1); let abandoned = false;
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records'); };
      request.onerror = () => reject(request.error); request.onblocked = () => { abandoned = true; reject(Error('Layout database upgrade blocked')); };
      request.onsuccess = () => { if (abandoned) request.result.close(); else resolve(request.result); };
    });
    db.onversionchange = () => { unavailable = Error('Layout database version changed; reopen the workspace'); storage.dispose(); };
    await storage.refresh();
  } catch (error) { unavailable = error; db?.close(); db = null; }
  // The caller awaits the transaction's completion, not just its synchronous
  // callback/put requests. An abort/quota error can never become a save receipt.
  const coordinated = typeof locks?.request === 'function' ? {
    request(name, options, callback) { if (name !== key) return Promise.reject(Error('Wrong layout lock')); return locks.request(name, options, () => transaction('readwrite', callback)); },
  } : undefined;
  return { storage, locks: coordinated };
}
