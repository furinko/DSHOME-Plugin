/* Content state belongs to a document, never to a layout leaf or React mount. */
export class DocumentError extends Error {
  constructor(code, message) { super(message); this.name = 'DocumentError'; this.code = code; }
}
const definitive = error => /^(FS_|workbench\/|remote-access\/|gateway\/bad-request)/.test(error?.code ?? '');
export function createDocument({ path, transport, onListenerError = () => {} }) {
  if (typeof path !== 'string' || !path || !transport?.read || !transport?.save) throw new TypeError('Document needs a path and bounded versioned transport');
  const listeners = new Set();
  let state = Object.freeze({ path, phase: 'idle', text: '', baseText: '', version: null, dirty: false,
    editRevision: 0, selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0, error: null, uncertain: false,
    comparing: false, comparison: null, revealRevision: 0 });
  let loading, saving, pending, comparing, comparingAbort, comparisonSequence = 0, disposed = false;
  function patch(change) {
    if (disposed) return;
    state = Object.freeze({ ...state, ...change });
    for (const listener of [...listeners]) { try { listener(); } catch (error) { try { onListenerError(error); } catch {} } }
  }
  function live() { if (disposed) throw new DocumentError('DOCUMENT_CLOSED', '文档已关闭'); }
  function editable() { live(); if (state.version === null) throw new DocumentError('NOT_LOADED', '文档尚未完整读取'); }
  function validFile(file) {
    if (typeof file?.text !== 'string' || typeof file.version !== 'string' || !file.version) throw new DocumentError('INVALID_RESPONSE', '读取未提供完整内容与版本');
    if (state.version !== null && ((file.absolutePath !== undefined && file.absolutePath !== state.path) || (file.projectId !== undefined && state.projectId !== undefined && file.projectId !== state.projectId))) throw new DocumentError('DOCUMENT_SCOPE_CHANGED', '项目或路径已变化，未采用磁盘内容');
    return file;
  }
  function load(signal) {
    live();
    if (loading) return loading;
    if (state.version !== null) return Promise.resolve(state); // No reload silently replaces a draft.
    patch({ phase: 'loading', error: null });
    loading = (async () => {
      // Assign the owner promise before a synchronous transport refusal settles.
      await Promise.resolve();
      try {
        const file = validFile(await transport.read(path, signal)); live();
        patch({ phase: 'ready', path: file.absolutePath ?? path, projectId: file.projectId, text: file.text, baseText: file.text, version: file.version, dirty: false });
        return state;
      } catch (error) { patch({ phase: 'failed', error }); throw error; }
      finally { loading = undefined; }
    })();
    return loading;
  }
  function edit(text) {
    editable(); if (typeof text !== 'string') throw new TypeError('Text must be a string');
    patch({ text, dirty: text !== state.baseText, editRevision: state.editRevision + 1 });
  }
  function view({ selectionStart = state.selectionStart, selectionEnd = state.selectionEnd, scrollTop = state.scrollTop, scrollLeft = state.scrollLeft } = {}) {
    editable();
    if (![selectionStart, selectionEnd, scrollTop, scrollLeft].every(Number.isFinite)) throw new TypeError('Invalid document view');
    const start = Math.max(0, Math.min(state.text.length, Math.trunc(selectionStart)));
    patch({ selectionStart: start, selectionEnd: Math.max(start, Math.min(state.text.length, Math.trunc(selectionEnd))), scrollTop: Math.max(0, scrollTop), scrollLeft: Math.max(0, scrollLeft) });
  }
  function save(signal) {
    editable();
    if (saving) return saving;
    if (comparing) return Promise.reject(new DocumentError('COMPARE_IN_PROGRESS', '请等待磁盘比较读取完成'));
    if (pending) return Promise.reject(new DocumentError('SAVE_UNCERTAIN', '上次保存结果未知，请先核对磁盘'));
    if (!state.dirty) return Promise.resolve({ unchanged: true, version: state.version });
    const captured = { text: state.text, version: state.version, path: state.path, projectId: state.projectId, editRevision: state.editRevision };
    pending = captured; patch({ phase: 'saving', error: null, comparison: null });
    saving = (async () => {
      await Promise.resolve();
      try {
        const result = await transport.save(captured.path, captured.text, captured.version, signal);
        if (typeof result?.version !== 'string' || !result.version) throw new DocumentError('INVALID_RESPONSE', '保存回执缺少版本，结果需核对');
        if (result.absolutePath !== undefined && result.absolutePath !== captured.path || result.projectId !== undefined && captured.projectId !== undefined && result.projectId !== captured.projectId) throw new DocumentError('INVALID_RESPONSE', '保存回执目标与原文档不符；结果未知，请核对原文件');
        pending = undefined;
        patch({ phase: 'ready', version: result.version, baseText: captured.text, dirty: state.text !== captured.text, uncertain: false, error: null });
        return result;
      } catch (error) {
        if (definitive(error)) { pending = undefined; patch({ phase: 'ready', uncertain: false, error }); }
        else patch({ phase: 'ready', uncertain: true, error });
        throw error;
      } finally { saving = undefined; }
    })();
    return saving;
  }
  function compareDisk(signal) {
    editable();
    if (saving) return Promise.reject(new DocumentError('SAVE_IN_PROGRESS', '保存尚未结束'));
    if (comparing) return comparing;
    const lifetime = new AbortController(); comparingAbort = lifetime;
    const readSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    patch({ comparing: true });
    comparing = (async () => {
      await Promise.resolve();
      try {
        readSignal.throwIfAborted();
        const file = await transport.read(state.path, readSignal); readSignal.throwIfAborted(); live(); validFile(file);
        const comparison = Object.freeze({ token: ++comparisonSequence, editRevision: state.editRevision, baseVersion: state.version, disk: Object.freeze({ ...file }) });
        patch({ comparison }); readSignal.throwIfAborted(); return comparison;
      } catch (error) { if (comparingAbort === lifetime && !readSignal.aborted) patch({ error }); throw error; }
      finally { if (comparingAbort === lifetime) { comparing = undefined; comparingAbort = undefined; patch({ comparing: false }); } }
    })();
    return comparing;
  }
  function cancelComparison() {
    live(); comparingAbort?.abort(new DocumentError('COMPARE_CANCELLED', '磁盘比较已取消'));
    comparing = undefined; comparingAbort = undefined; patch({ comparing: false, comparison: null });
  }
  async function reconcile(signal) {
    editable();
    if (saving) throw new DocumentError('SAVE_IN_PROGRESS', '保存尚未结束');
    if (!pending) return { kind: 'known' };
    const captured = pending, comparison = await compareDisk(signal), file = comparison.disk;
    live(); if (pending !== captured) return { kind: 'known' };
    if (file.text === captured.text) {
      pending = undefined;
      patch({ version: file.version, baseText: captured.text, dirty: state.text !== captured.text, uncertain: false, error: null, comparison: null });
      return { kind: 'saved', version: file.version };
    }
    if (file.version === captured.version && file.text === state.baseText) {
      pending = undefined; patch({ uncertain: false, error: null, comparison: null });
      return { kind: 'not-written', version: file.version };
    }
    // The old base, all later edits and the pending unknown write remain intact.
    const error = new DocumentError('DOCUMENT_CONFLICT', '磁盘内容已变化，请比较后处理；草稿仍保留');
    patch({ error }); return { kind: 'conflict', disk: file };
  }
  function resolveComparison(token, mode) {
    editable();
    if (saving || comparing) throw new DocumentError('DOCUMENT_BUSY', '读取或保存尚未结束');
    const comparison = state.comparison;
    if (!comparison || comparison.token !== token || comparison.baseVersion !== state.version || comparison.editRevision !== state.editRevision) throw new DocumentError('COMPARISON_STALE', '比较之后草稿或基线已变化，请刷新比较');
    if (mode !== 'keep-draft' && mode !== 'use-disk') throw new TypeError('Unknown comparison resolution');
    const disk = comparison.disk, text = mode === 'use-disk' ? disk.text : state.text;
    pending = undefined;
    // Explicit local adoption, NEVER a write. A later save still uses the exact
    // observed version, refusing intervening/delayed writes at the Host guard.
    patch({ text, baseText: disk.text, version: disk.version, dirty: text !== disk.text, uncertain: false, error: null, comparison: null,
      editRevision: state.editRevision + 1, ...(mode === 'use-disk' ? { selectionStart: 0, selectionEnd: 0, scrollTop: 0, scrollLeft: 0, revealRevision: state.revealRevision + 1 } : {}) });
    return state;
  }
  function dismissComparison(token) { live(); if (state.comparison?.token === token) cancelComparison(); }
  function reveal({ start, end, expectedEditRevision }) {
    editable();
    if (expectedEditRevision !== state.editRevision) throw new DocumentError('REFERENCE_STALE', '定位期间文档发生编辑，未采用过时选区');
    if (![start, end].every(Number.isSafeInteger) || start < 0 || end <= start || end > state.text.length || !state.text.slice(start, end).isWellFormed()) throw new DocumentError('REFERENCE_RANGE', '引用选区超出文档范围');
    patch({ selectionStart: start, selectionEnd: end, revealFocus: true, revealRevision: state.revealRevision + 1 });
  }
  function acknowledgeReveal(revision) { live(); if (state.revealRevision === revision && state.revealFocus) patch({ revealFocus: false }); }
  function selection() {
    editable();
    const { selectionStart: start, selectionEnd: end, text } = state;
    if (end <= start) return null;
    return Object.freeze({ path: state.path, text: text.slice(start, end), start, end,
      startLine: text.slice(0, start).split(/\r\n|\r|\n/).length, endLine: text.slice(0, end).split(/\r\n|\r|\n/).length,
      version: state.version, editRevision: state.editRevision, dirty: state.dirty });
  }
  async function requestClose(confirm) {
    live();
    if (loading || saving || comparing) return false;
    if (state.dirty || pending) {
      const captured = { editRevision: state.editRevision, version: state.version, pending };
      if (typeof confirm !== 'function' || !await confirm(state)) return false;
      // A delayed confirmation cannot approve discarding edits or a new save
      // which did not exist when the user was asked.
      if (loading || saving || comparing || state.editRevision !== captured.editRevision || state.version !== captured.version || pending !== captured.pending) return false;
    }
    disposed = true; listeners.clear(); return true;
  }
  return Object.freeze({ getSnapshot: () => state, subscribe(listener) { live(); listeners.add(listener); return () => listeners.delete(listener); },
    load, edit, view, save, reconcile, compareDisk, cancelComparison, resolveComparison, dismissComparison, reveal, acknowledgeReveal, selection, requestClose });
}
