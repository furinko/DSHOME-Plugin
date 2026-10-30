// Read-only, local lifecycle preflight. Never writes, closes, confirms, or
// interprets an iframe's inaccessible contents. Retained projects block even
// when clean: their view memory is not a serialized recoverable document.
export function workspaceReloadState({ shelves = [], retiring = 0 } = {}) {
  const s = { projects: 0, busy: 0, retiring, dirty: 0, uncertain: 0, saving: 0, loading: 0, comparing: 0, terminals: 0, webPages: 0, layoutDrafts: 0, layoutSaves: 0, unconfirmedCloses: 0, inspectionFailed: 0 };
  try {
    for (const shelf of shelves) {
      const state = shelf.getSnapshot(); s.busy += Number(!!state.busy); s.projects += state.projects.length;
      for (const { controller: c } of state.projects) {
        const snapshot = c.getSnapshot(); s.layoutDrafts += Number(!!c.model.getSnapshot().editing); s.layoutSaves += Number(!!snapshot.savingLayout);
        s.unconfirmedCloses += (snapshot.terminalCleanup?.requests.length ?? 0) + (snapshot.terminalCleanup?.overflow ?? 0);
        for (const item of c.contents.values()) {
          s.dirty += Number(!!item.moduleDirty || item.kind === 'note' && !!item.noteText);
          const d = item.document?.getSnapshot(); if (d) { for (const key of ['dirty', 'uncertain', 'comparing']) s[key] += Number(!!d[key]); s.saving += Number(d.phase === 'saving'); s.loading += Number(d.phase === 'loading'); }
          s.terminals += Number(item.kind === 'terminal' && !!item.started); s.webPages += Number(item.kind === 'web' && !!item.url);
        }
      }
    }
  } catch { s.inspectionFailed++; }
  return Object.freeze({ allowed: !s.projects && !s.busy && !s.retiring && !s.inspectionFailed, ...s });
}
export const workspaceLifecycle = Object.freeze({ configUpdate: 'guarded', codeReplacement: 'not-preserved', graphRemoval: 'not-preserved', forcedUnload: 'not-preserved', pageRefresh: 'not-preserved', documentBackup: 'manual-export', liveViewRecovery: false });
export const lifecycleBoundaryText = '配置更新暂缓不等于代码热更新保留。代码热更新（HMR）、插件移除、强制卸载和刷新会释放工作台内容。升级前请保存或导出文档、核对未知保存结果、处理终端关闭任务，再明确关闭保留项目；网页表单和终端内存不能从布局恢复。';
export function reloadBlockedMessage(s) {
  return '工作台更新已暂缓（仅配置更新；拦截时）：保留项目 ' + s.projects + '，草稿 ' + s.dirty + '，保存中 ' + s.saving + '，未知保存 ' + s.uncertain + '，未确认关闭 ' + s.unconfirmedCloses + '。请先保存或导出、核对未知结果、处理终端关闭任务，并明确关闭保留项目后再更新。代码热更新（HMR）、插件图撤项、强制卸载和浏览器刷新不受此配置更新钩子保护。';
}

// Public uid is unique within the Cordis registry behind this event bus.
// Context/service views may return distinct proxies for one Fiber. This is
// local lifecycle matching only, never Host identity/permission evidence.
export function fiberUpdateTarget(owner, target) {
  const chain = [], seen = new Set(); let affectsOwner = false;
  while (owner && Number.isSafeInteger(owner.uid) && owner.uid >= 0 && !seen.has(owner.uid)) {
    seen.add(owner.uid); chain.push(owner.uid);
    if (owner.uid === target?.uid) { affectsOwner = true; break; }
    owner = owner.parent?.fiber;
  }
  return Object.freeze({ affectsOwner, chain: Object.freeze(chain) });
}
