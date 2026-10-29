import { createWorkspaceModel, createLayoutPersistence } from './model.mjs';
import { createDocument } from './document.mjs';
import { createLayoutRecovery } from './layout-recovery.mjs';
export const BUILTINS = Object.freeze([
  { kind: 'files', label: '文件', minWidth: 200, minHeight: 180 },
  { kind: 'document', label: '文档', minWidth: 400, minHeight: 240 },
  { kind: 'terminal', label: '终端', minWidth: 320, minHeight: 140 },
  { kind: 'web', label: '网页', minWidth: 320, minHeight: 160 },
]);
export function createWorkspaceController({ sessionId, getSessionId = () => sessionId, projectId, transport, storage, locks, terminals, terminalCleanup, uuid = () => crypto.randomUUID(), confirm = () => false }) {
  const persistence = createLayoutPersistence({ storage, locks, projectId, uuid });
  const stored = persistence.read();
  const model = createWorkspaceModel({ projectId, initial: stored.kind === 'ready' ? stored.project : undefined });
  const releases = BUILTINS.map(definition => model.registerModule(definition));
  const contents = new Map(), listeners = new Set(); let revision = 0, disposed = false;
  let snapshot = Object.freeze({ revision, notice: stored.kind === 'corrupt' ? '布局记录损坏：已原样保留，本次使用临时布局；导出原记录后再重置。' : stored.kind === 'unavailable' ? '布局存储不可用：不会伪称保存成功。' : '', storage: stored.kind, savingLayout: false, layoutRecovery: null, layoutBackupKey: stored.backupKey ?? null, terminalCleanup: terminalCleanup?.getSnapshot() ?? null });
  function publish(change = {}) { snapshot = Object.freeze({ ...snapshot, ...change, ...(Object.hasOwn(change, 'notice') ? { noticeSource: change.noticeSource ?? null } : {}), revision: ++revision }); for (const fn of [...listeners]) fn(); }
  const offCleanup = terminalCleanup?.subscribe(() => { if (disposed) return; const state = terminalCleanup.getSnapshot(), confirmed = !state.requests.length && !state.overflow && snapshot.noticeSource === 'terminal-close'; publish({ terminalCleanup: state, ...(confirmed ? { notice: '宿主已确认终端关闭；项目和文档草稿仍保留。', noticeSource: 'terminal-close-confirmed' } : {}) }); });
  function live() { if (disposed) throw Error('工作台已关闭'); }
  function paneOf(panelId) { const visit = node => node.type === 'pane' ? node.tabs.includes(panelId) ? node.id : undefined : visit(node.first) ?? visit(node.second); return visit(model.getSnapshot().layout.root); }
  function sync() {
    const state = model.getSnapshot();
    // Only committed instances own content. Editing the layout never starts a
    // process, opens an iframe, reads a file, or destroys a preexisting instance.
    for (const panel of Object.values(state.panels)) if (!contents.has(panel.id)) contents.set(panel.id, { id: panel.id, kind: panel.kind, document: null, url: '', addressInput: '', selection: '', path: '.', expanded: new Set(['.']), contentId: 'dshome-workspace:' + uuid(), started: false });
    publish();
  }
  const off = model.subscribe(sync);
  if (!Object.keys(model.getSnapshot().panels).length) {
    model.addPanel('files', { id: 'FILE-01' });
    model.addPanel('document', { id: 'DOC-01', targetPaneId: paneOf('FILE-01'), edge: 'right' });
    model.addPanel('terminal', { id: 'TERM-01', targetPaneId: paneOf('DOC-01'), edge: 'bottom' });
    model.addPanel('web', { id: 'WEB-01', targetPaneId: paneOf('TERM-01'), edge: 'right' });
    // Match the approved daily composition: a compact file tree, document
    // above terminal/web. The model still clamps every actual minimum size.
    const daily = model.getSnapshot().layout.root;
    model.resize(daily.id, .18);
    model.resize(daily.second.id, .58);
    model.resize(daily.second.second.id, .60);
    model.savePreset('development');
    model.collapse('FILE-01', 'left'); model.collapse('TERM-01', 'bottom'); model.dock('WEB-01', paneOf('DOC-01'), 'right'); model.savePreset('review'); model.selectPreset('development');
  }
  sync();
  function content(id) { live(); const item = contents.get(id); if (!item) throw Error('内容实例不存在'); return item; }
  async function openDocument(path) {
    live();
    if (model.getSnapshot().editing) throw Error('请先应用或取消布局草稿');
    let item = [...contents.values()].find(item => item.document?.getSnapshot().path === path);
    if (!item) item = [...contents.values()].find(item => item.kind === 'document' && !item.document);
    if (!item) { const existing = [...contents.values()].find(item => item.kind === 'document'); const id = model.addPanel('document', { targetPaneId: existing ? paneOf(existing.id) : undefined }); item = content(id); }
    if (!item.document) {
      item.document = createDocument({ path, transport });
      item.offDocument = item.document.subscribe(() => publish());
      item.document.load().catch(error => publish({ notice: error.message }));
    }
    if (model.getSnapshot().layout.collapsed.some(p => p.panelId === item.id)) model.expand(item.id);
    model.activate(item.id); publish(); return item.document;
  }
  function navigate(id, value, ownOrigin) {
    const item = content(id);
    if (item.kind !== 'web') throw Error('不是网页模块');
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin === ownOrigin) throw Error('只允许无凭据的外部 HTTP(S) 网页，不嵌入宿主控制页面');
    item.url = url.href; item.addressInput = url.href; publish();
  }
  function startTerminal(id) {
    const item = content(id); if (item.kind !== 'terminal') throw Error('不是终端模块');
    if (!terminals) throw Error('宿主未提供终端服务');
    if (item.started) return item.view;
    const ownerSessionId = getSessionId();
    if (typeof ownerSessionId !== 'string' || !ownerSessionId) throw Error('终端启动需要当前有效会话');
    item.ownerSessionId = ownerSessionId;
    item.started = true;
    // The manager belongs to an isolated Cordis service scope, not the native
    // sidebar's retainTabs list. Never overwrite the native window's holds.
    const membership = () => [...contents.values()].filter(i => i.kind === 'terminal' && i.started).map(i => ({ sessionId: i.ownerSessionId, tabId: i.id, contentId: i.contentId }));
    terminals.retainTabs(membership());
    try { item.view = terminals.view(item.ownerSessionId, item.id, item.contentId); terminals.retainTabs(membership()); }
    catch (error) { item.started = false; terminals.retainTabs(membership()); throw error; }
    publish(); return item.view;
  }
  function queueTerminalClose(item) {
    terminals.assertCanClose?.(item.ownerSessionId);
    const id = item.view?.id;
    terminalCleanup?.begin(item.ownerSessionId, id, model.getSnapshot().panels[item.id]?.title ?? item.id);
    try { terminals.close(item.ownerSessionId, item.id, item.contentId, id); }
    catch (error) { terminalCleanup?.fail(id, error); throw error; }
  }
  function removeContent(item) {
    item.offDocument?.(); contents.delete(item.id); model.forgetPanel(item.id);
    terminals?.retainTabs([...contents.values()].filter(i => i.started).map(i => ({ sessionId: i.ownerSessionId, tabId: i.id, contentId: i.contentId })));
  }
  async function closePanel(id) {
    const item = content(id);
    if (model.getSnapshot().editing) throw Error('编辑布局时请收起模块；关闭内容请先退出编辑');
    if (item.document && !await item.document.requestClose(s => confirm('关闭文档将丢弃未保存草稿或未知保存结果，确定吗？', s))) return false;
    if (item.kind === 'web' && item.url && !confirm('关闭网页将丢弃其中未提交的表单和页面状态，确定吗？')) return false;
    if (item.started && !confirm('关闭终端将结束此进程，确定吗？')) return false;
    if (item.started) queueTerminalClose(item);
    removeContent(item);
    return true;
  }
  const layoutRecovery = createLayoutRecovery({ persistence, model, initial: stored, publish, isLive: () => !disposed, confirm });
  function hasUnsaved() { return !!terminalCleanup?.hasUnconfirmed() || [...contents.values()].some(item => { const s = item.document?.getSnapshot(); return s && (s.dirty || s.uncertain || s.phase === 'saving'); }); }
  function releaseResources() {
    if (disposed) return; disposed = true; offCleanup?.(); terminalCleanup?.dispose(); terminals?.retainTabs([]); off(); for (const release of releases) release();
    for (const item of contents.values()) item.offDocument?.(); listeners.clear(); persistence.dispose();
  }
  function closeWorkspace() {
    live();
    if (snapshot.savingLayout || [...contents.values()].some(item => { const s = item.document?.getSnapshot(); return s && (['loading', 'saving'].includes(s.phase) || s.comparing); })) return false;
    if (terminalCleanup?.hasUnconfirmed()) { publish({ notice: '终端仍有未确认的关闭任务；请等待宿主回执或重试，项目与草稿仍保留。', noticeSource: 'terminal-close' }); return false; }
    const running = [...contents.values()].filter(item => item.started);
    if (terminalCleanup && running.length) {
      for (const item of running) terminals.assertCanClose?.(item.ownerSessionId);
      if (!confirm('先请求结束此项目的终端；文档草稿仍保留，收到宿主确认后请再关闭项目，确定吗？')) return false;
      for (const item of running) { queueTerminalClose(item); removeContent(item); }
      publish({ notice: '已提交终端关闭请求，尚不代表进程已结束；收到确认后请再关闭项目。', noticeSource: 'terminal-close' }); return false;
    }
    if ((hasUnsaved() || [...contents.values()].some(item => item.started || item.kind === 'web' && item.url)) && !confirm('关闭工作台将丢弃未保存草稿、网页表单和页面状态，并结束其中的终端进程，确定吗？')) return false;
    for (const item of contents.values()) { if (item.started) terminals.close(item.ownerSessionId, item.id, item.contentId, item.view?.id); item.offDocument?.(); }
    releaseResources(); contents.clear(); return true;
  }
  return Object.freeze({ model, contents, get sessionId() { return getSessionId(); }, projectId, content, openDocument, navigate, startTerminal, closePanel, ...layoutRecovery, hasUnsaved, closeWorkspace, releaseResources, retryTerminalClose: id => terminalCleanup?.retry(id),
    getSnapshot: () => snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify: text => publish({ notice: text }), updateContent(id, change) { Object.assign(content(id), change); publish(); },
    exportLayout: () => JSON.stringify(model.serialize(), null, 2), exportStoredLayout: () => storage.getItem(persistence.key),
  });
}
