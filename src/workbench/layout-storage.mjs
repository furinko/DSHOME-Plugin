import { validateProject } from './model.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const frozen = value => { if (value && typeof value === 'object') { for (const v of Object.values(value)) frozen(v); Object.freeze(value); } return value; };
const parts = token => {
  if (Number.isSafeInteger(token) && token >= 1) return { counter: token, epoch: null };
  if (typeof token !== 'string') return null;
  const match = /^r:([A-Za-z0-9_-]{1,96}):([1-9][0-9]{0,15})$/.exec(token);
  const counter = Number(match?.[2]); return match && Number.isSafeInteger(counter) ? { epoch: match[1], counter } : null;
};
export function createLayoutPersistence({ storage, locks, projectId, prefix = 'dshome.workspace.v1:', uuid = () => crypto.randomUUID() } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw Error('Layout storage is not available');
  if (typeof projectId !== 'string' || !projectId || projectId.length > 4096) throw Error('Explicit project identity required');
  const key = prefix + encodeURIComponent(projectId), MAX_TEXT = 256 * 1024;
  function read() {
    let raw; try { raw = storage.getItem(key); } catch { return { kind: 'unavailable', error: 'STORAGE_UNAVAILABLE' }; }
    if (raw === null) return { kind: 'empty', revision: null, raw };
    if (typeof raw !== 'string' || raw.length > MAX_TEXT) return { kind: 'corrupt', error: 'INVALID_STORAGE', preserved: true, raw };
    try {
      const envelope = JSON.parse(raw.replace(/^\uFEFF/, ''));
      if (!envelope || !parts(envelope.storageRevision)) throw Error('Invalid storage revision');
      validateProject(envelope.project, projectId);
      return { kind: 'ready', revision: envelope.storageRevision, project: frozen(envelope.project), raw, backupKey: parts(envelope.storageRevision).epoch ? key + ':recovery:' + parts(envelope.storageRevision).epoch : null };
    } catch (error) { return { kind: 'corrupt', error: error.code ?? 'INVALID_JSON', preserved: true, raw }; }
  }
  const locked = async run => {
    if (typeof locks?.request !== 'function') return { ok: false, error: 'STORAGE_LOCK_UNAVAILABLE' };
    try { return await locks.request(key, { mode: 'exclusive' }, run); }
    catch { return { ok: false, error: 'STORAGE_WRITE_FAILED' }; }
  };
  const capture = project => { validateProject(project, projectId); const result = clone(project); validateProject(result, projectId); return result; };
  const encode = (project, revision) => { const raw = JSON.stringify({ storageRevision: revision, project }); if (raw.length > MAX_TEXT) return null; return raw; };
  return Object.freeze({ key, read, refresh: typeof storage.refresh === 'function' ? () => storage.refresh() : undefined, dispose: () => storage.dispose?.(), cancelPending: () => storage.abortPendingWrites?.(),
    readBackup(backupKey) {
      if (typeof backupKey !== 'string' || !backupKey.startsWith(key + ':recovery:') || !/^[A-Za-z0-9_-]{1,96}$/.test(backupKey.slice((key + ':recovery:').length))) throw Error('Invalid recovery backup key');
      const data = JSON.parse(storage.getItem(backupKey));
      if (!data || data.format !== 'dshome-layout-original-v1' || data.projectId !== projectId || data.key !== key || data.raw !== null && typeof data.raw !== 'string' || Object.keys(data).some(k => !['format','projectId','key','raw'].includes(k))) throw Error('Recovery backup unavailable or changed');
      return JSON.stringify(data, null, 2);
    },
    async save(project, expectedRevision, { expectedRaw, isCurrent = () => true } = {}) {
      const captured = capture(project);
      if (expectedRevision !== null && !parts(expectedRevision)) return { ok: false, error: 'INVALID_REVISION' };
      return locked(() => {
        const before = read();
        if (!isCurrent()) return { ok: false, error: 'LAYOUT_STALE' };
        if (!['empty', 'ready'].includes(before.kind)) return { ok: false, error: before.error, preserved: true };
        if (before.revision !== expectedRevision || expectedRaw !== undefined && before.raw !== expectedRaw) return { ok: false, error: 'LAYOUT_CONFLICT', actualRevision: before.revision };
        const previous = parts(before.revision), counter = (previous?.counter ?? 0) + 1;
        if (!Number.isSafeInteger(counter)) return { ok: false, error: 'REVISION_EXHAUSTED' };
        const revision = previous?.epoch ? `r:${previous.epoch}:${counter}` : counter, raw = encode(captured, revision);
        if (raw === null) return { ok: false, error: 'STORAGE_LIMIT' };
        storage.setItem(key, raw); if (storage.getItem(key) !== raw) return { ok: false, error: 'STORAGE_VERIFY_FAILED' }; return { ok: true, revision, raw };
      });
    },
    async recover(project, expectedRaw, { isCurrent = () => true } = {}) {
      const captured = capture(project);
      if (expectedRaw !== null && typeof expectedRaw !== 'string') return { ok: false, error: 'INVALID_STORAGE' };
      return locked(() => {
        if (!isCurrent()) return { ok: false, error: 'LAYOUT_STALE' };
        if (storage.getItem(key) !== expectedRaw) return { ok: false, error: 'LAYOUT_CONFLICT' };
        const epoch = uuid(); if (typeof epoch !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(epoch)) return { ok: false, error: 'INVALID_REVISION' };
        // A new opaque epoch avoids an ABA reset to numeric revision 1. Older
        // readers reject this token rather than overwrite a recovered layout.
        const revision = `r:${epoch}:1`, raw = encode(captured, revision), backupKey = key + ':recovery:' + epoch;
        if (raw === null) return { ok: false, error: 'STORAGE_LIMIT' };
        if (storage.getItem(backupKey) !== null) return { ok: false, error: 'BACKUP_EXISTS' };
        const backup = JSON.stringify({ format: 'dshome-layout-original-v1', projectId, key, raw: expectedRaw });
        storage.setItem(backupKey, backup);
        if (storage.getItem(backupKey) !== backup) return { ok: false, error: 'BACKUP_VERIFY_FAILED' };
        if (!isCurrent()) return { ok: false, error: 'LAYOUT_STALE', backupKey };
        if (storage.getItem(key) !== expectedRaw) return { ok: false, error: 'LAYOUT_CONFLICT', backupKey };
        storage.setItem(key, raw); if (storage.getItem(key) !== raw) return { ok: false, error: 'STORAGE_VERIFY_FAILED', backupKey }; return { ok: true, revision, raw, backupKey };
      });
    },
  });
}
