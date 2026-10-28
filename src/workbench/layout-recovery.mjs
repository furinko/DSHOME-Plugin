/* Layout-only persistence/recovery. Never reads, replaces or closes content. */
const failure = code => Object.assign(Error({ LAYOUT_CONFLICT: '布局存储已被另一窗口修改；未覆盖，请重新检查比较。', LAYOUT_STALE: '比较后当前布局已变化；请重新检查，未采用旧选择。', BACKUP_EXISTS: '原件备份标识已存在；未覆盖，请重新检查。' }[code] ?? '布局操作失败：' + code), { code });
export function createLayoutRecovery({ persistence, model, initial, publish, isLive, confirm }) {
  let baseline = initial, ticket = null, serial = 0, saving, backupKey = initial.backupKey ?? null;
  function current(t) { return isLive() && ticket === t && !model.getSnapshot().editing && model.getSnapshot().revision === t.localRevision; }
  function inspect() {
    const observed = Object.freeze(persistence.read());
    ticket = Object.freeze({ id: ++serial, observed, localRevision: model.getSnapshot().revision, localJSON: JSON.stringify(model.serialize(), null, 2), baselineRaw: baseline.raw });
    publish({ layoutRecovery: ticket, storage: observed.kind }); return ticket;
  }
  function check(t) {
    if (!t || !current(t)) throw failure('LAYOUT_STALE');
    const fresh = persistence.read();
    if (fresh.kind === 'unavailable') throw failure(fresh.error);
    if (fresh.raw !== t.observed.raw) throw failure('LAYOUT_CONFLICT');
  }
  function run(operation) {
    if (saving) return saving;
    // Yield before invoking anything so subscribers cannot launch a second
    // save between setting the public busy flag and owning its promise.
    saving = (async () => {
      await Promise.resolve();
      try { return await operation(); }
      catch (error) { publish({ notice: error.message }); throw error; }
      finally { saving = undefined; publish({ savingLayout: false }); }
    })(); publish({ savingLayout: true }); return saving;
  }
  return Object.freeze({
    inspectLayout() {
      if (!isLive() || saving || model.getSnapshot().editing) throw Error('请先完成保存或应用/取消布局编辑');
      if (!persistence.refresh) return inspect();
      const reading = serial;
      return run(async () => { await persistence.refresh(); if (!isLive() || serial !== reading || model.getSnapshot().editing) throw failure('LAYOUT_STALE'); return inspect(); });
    },
    cancelLayoutRecovery() { ++serial; ticket = null; if (saving) persistence.cancelPending?.(); publish({ layoutRecovery: null }); },
    saveLayout() {
      if (saving) return saving;
      if (!isLive() || model.getSnapshot().editing) return Promise.reject(Error('请先应用布局草稿'));
      if (ticket) return Promise.reject(Error('请先处理或取消布局存储比较'));
      if (!['empty', 'ready'].includes(baseline.kind)) { inspect(); return Promise.reject(Error('原布局记录不可用；请先导出、比较并明确恢复，未覆盖原数据')); }
      const capture = model.serialize(), before = baseline;
      return run(async () => {
        const result = await persistence.save(capture, before.revision, { expectedRaw: before.raw, isCurrent: isLive });
        if (!result.ok) { if (isLive()) { try { await persistence.refresh?.(); } catch {} inspect(); } throw failure(result.error); }
        baseline = { kind: 'ready', revision: result.revision, project: capture, raw: result.raw };
        publish({ storage: 'ready', notice: model.getSnapshot().revision === capture.revision && !model.getSnapshot().editing ? '布局已保存；文档草稿与终端内容未被写入布局记录。' : '较早布局版本已保存；当前布局仍有新修改，请另行保存。' }); return result;
      });
    },
    async resolveLayoutRecovery(choice) {
      if (saving) throw Error('布局操作仍在进行中');
      const t = ticket; await persistence.refresh?.(); check(t);
      if (choice === 'backup-current') {
        return run(async () => {
          if (!await confirm('将原布局记录完整备份，再用当前布局替换。文档草稿、网页和终端不会关闭，确定吗？')) return false;
          check(t);
          const result = await persistence.recover(JSON.parse(t.localJSON), t.observed.raw, { isCurrent: () => current(t) });
          if (!result.ok) throw failure(result.error);
          baseline = { kind: 'ready', revision: result.revision, project: JSON.parse(t.localJSON), raw: result.raw };
          ticket = null; backupKey = result.backupKey; publish({ layoutRecovery: null, storage: 'ready', layoutBackupKey: backupKey, notice: model.getSnapshot().revision === t.localRevision ? '原记录已完整备份并核对；当前布局已保存。文档、网页与终端未重建。' : '比较快照已保存并保留原件备份；当前布局仍有新修改。' }); return result;
        });
      }
      if (!['keep-current', 'use-stored'].includes(choice)) throw Error('未知布局恢复选择');
      if (!['empty', 'ready'].includes(t.observed.kind)) throw Error('记录不可用，不能作为保存基线');
      if (choice === 'use-stored') {
        if (t.observed.kind !== 'ready') throw Error('没有可采用的已存布局');
        model.adoptLayout(t.observed.project, t.localRevision);
      }
      baseline = t.observed; ticket = null; backupKey = baseline.backupKey ?? null;
      publish({ layoutRecovery: null, storage: baseline.kind, layoutBackupKey: backupKey, notice: choice === 'use-stored' ? '已采用所比较的存储布局；缺少位置的现有内容已收起保留，未关闭、未写入存储。' : '当前布局保持不变，已明确采用存储版本为新基线；尚未保存。' }); return true;
    },
    exportLayoutBackup() { if (!backupKey) throw Error('没有可读取的布局备份'); return persistence.readBackup(backupKey); },
    exportLayoutOriginal() {
      const selected = ticket ? ticket.observed : baseline;
      if (selected.kind === 'unavailable') throw Error('无法读取原记录；未伪造空记录导出');
      // JSON escaping preserves even unpaired UTF-16, unlike a raw UTF-8 Blob.
      return JSON.stringify({ format: 'dshome-layout-original-v1', projectId: model.getSnapshot().projectId, key: persistence.key, raw: selected.raw }, null, 2);
    },
  });
}
