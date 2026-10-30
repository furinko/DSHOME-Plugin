import React from 'react';
import { ModuleView } from './module-view.mjs';
import { chromeCSS } from './chrome-css.mjs';
import { createLayoutDrag, dropEdge, LAYOUT_DRAG_TYPE } from './layout-drag.mjs';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import terminalCSS from '@xterm/xterm/css/xterm.css';
import { terminalState, retryTerminal } from './terminal-state.mjs';
import { textareaProjection, applyTextareaEdit } from './textarea.mjs';
import { DocumentRecovery, downloadDraft } from './recovery-ui.mjs';
import { LayoutRecovery } from './layout-recovery-ui.mjs';
import { quoteDocumentSelection } from './reference.mjs';
import { documentMatches, documentPosition } from './editor-tools.mjs';
const h = React.createElement;
const useSource = source => React.useSyncExternalStore(source.subscribe, source.getSnapshot);
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
const errorText = error => error?.message ?? String(error);
export const unwrap = result => { if (result?.ok === true) return result.value; const e = new Error(result?.error?.message ?? '宿主没有返回有效回执'); e.code = result?.error?.code; throw e; };
function useRoom(ref) {
  const [room, setRoom] = React.useState({ width: 1000, height: 660 });
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = () => { const r = ref.current.getBoundingClientRect(); if (r.width && r.height) setRoom(old => old.width === r.width && old.height === r.height ? old : { width: r.width, height: r.height }); };
    const observer = new ResizeObserver(measure); observer.observe(ref.current); measure(); return () => observer.disconnect();
  }, []); return room;
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Workspace({ controller: c, workspaceFiles, inputActions, onOriginal, onCloseWorkspace, referenceReady = true, referenceCurrent = () => true, active = true, servicesAvailable = true, terminalAvailable = () => servicesAvailable, projectTitle = c.projectId, moduleRegistry }) {
  const state = useSource(c), layout = useSource(c.model), ref = React.useRef(null), room = useRoom(ref);
  const [selection, select] = React.useState(null), [menu, setMenu] = React.useState(false), [tools, setTools] = React.useState(false);
  const importRef = React.useRef(null), sectionRef = React.useRef(null);
  const wasEditing = React.useRef(false);
  React.useLayoutEffect(() => {
    if (layout.editing) sectionRef.current?.querySelector('.wb-layout-editor button:not(:disabled)')?.focus();
    else if (wasEditing.current) sectionRef.current?.querySelector('[data-wb-edit-layout]')?.focus();
    wasEditing.current = !!layout.editing;
  }, [!!layout.editing]);
  React.useEffect(() => {
    if (!menu && !tools) return;
    const close = event => { if (!sectionRef.current?.contains(event.target)) { setMenu(false); setTools(false); } };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [menu, tools]);
  const geometry = c.model.geometry(Math.max(0, room.width - 16), Math.max(0, room.height - 12));
  function action(fn) { try { Promise.resolve(fn()).catch(e => c.notify(errorText(e))); } catch (e) { c.notify(errorText(e)); } }
  const serializedPanels = Object.values(layout.panels).sort((a, b) => a.id.localeCompare(b.id));
  return h('section', { ref: sectionRef, className: 'dshome-v2', 'data-workspace-project': c.projectId, 'data-workspace-session': c.sessionId,
    onKeyDown: event => { if (event.nativeEvent.isComposing) return; if (layout.editing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { action(() => c.model.applyEdit()); event.preventDefault(); } if (event.key === 'Escape') { if (menu || tools) { setMenu(false); setTools(false); event.stopPropagation(); } else if (layout.editing) { c.model.cancelEdit(); event.preventDefault(); } } } },
    h('header', { className: 'wb-header', role: 'toolbar', 'aria-label': '工作台工具栏' }, h('strong', null, layout.editing ? '布局编辑' : '操作区'), h('span', { className: 'wb-project', title: projectTitle }, projectTitle),
      layout.editing ? h(React.Fragment, null,
        button('取消', () => c.model.cancelEdit()), button('应用布局', () => action(() => c.model.applyEdit()), { className: 'wb-primary' })) : h(React.Fragment, null,
        h('select', { 'aria-label': '布局预设', value: layout.selectedPreset, onChange: e => action(() => c.model.selectPreset(e.target.value)) },
          h('option', { value: 'custom', disabled: true }, '自定义'), Object.keys(layout.presets).map(name => h('option', { key: name, value: name }, name === 'development' ? '开发' : name === 'review' ? '审阅' : name))),
        button('编辑布局', () => { setMenu(false); setTools(false); c.model.beginEdit(); }, { 'data-wb-edit-layout': true }), button('＋ 添加模块', () => { setMenu(!menu); setTools(false); }, { 'aria-expanded': menu }),
        button(state.savingLayout ? '正在保存…' : '保存布局', () => action(() => c.saveLayout()), { disabled: state.savingLayout, 'aria-label': '保存布局' }), button('恢复', () => action(() => c.inspectLayout()), { disabled: state.savingLayout, 'aria-label': '检查布局存储', title: '检查已保存的布局、处理冲突与恢复备份' }),
        button('更多', () => { setTools(!tools); setMenu(false); }, { 'aria-expanded': tools, 'aria-label': '更多布局操作' }), button('返回原版', onOriginal),
        onCloseWorkspace && button('×', onCloseWorkspace, { 'aria-label': '关闭操作现场', title: '关闭操作现场；有未保存内容时先确认', className: 'wb-icon-button' }))),
    tools && !layout.editing && h('div', { className: 'wb-layout-tools', 'aria-label': '布局文件与预设' },
      button('导入布局文件', () => importRef.current?.click()), button('导出布局', () => download('dshome-layout.json', c.exportLayout())),
      h('form', { onSubmit: event => { event.preventDefault(); const name = new FormData(event.currentTarget).get('preset'); action(() => { if (Object.hasOwn(layout.presets, name) && !window.confirm('覆盖同名布局预设？不会关闭现有内容。')) return; c.model.savePreset(name); c.notify('预设已记录；点击保存布局后可在下次打开时使用。'); }); } },
        h('input', { name: 'preset', 'aria-label': '新布局预设名称', placeholder: '预设名称（英文字母开头）', pattern: '[A-Za-z](?:[A-Za-z0-9_]|-){0,95}', maxLength: 96, required: true }), h('button', { type: 'submit' }, '保存为预设'))),
    h('input', { ref: importRef, type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': '选择布局文件', onChange: event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
      action(async () => { if (file.size > 262144) throw Error('布局文件超过 256 KB'); const text = await file.text(); if (window.confirm('导入此项目的布局？现有内容会保留，未出现在布局中的模块将收起；不会保存文件或执行命令。')) c.importLayout(text); });
    } }),
    menu && !layout.editing && h('nav', { className: 'wb-add', 'aria-label': '添加内容模块' }, c.model.modules().map(definition => button(definition.label, () => action(() => { c.model.addPanel(definition.kind); setMenu(false); }), { key: definition.kind }))),
    h(LayoutRecovery, { c, state, download }),
    state.terminalCleanup && (state.terminalCleanup.requests.length > 0 || state.terminalCleanup.overflow > 0) && h('section', { className: 'wb-terminal-cleanup', 'aria-label': '终端关闭任务', style: { padding: 8, maxHeight: 180, overflow: 'auto' } },
      state.terminalCleanup.requests.map(item => h('div', { key: item.id, 'data-close-terminal': item.id, role: item.phase === 'failed' ? 'alert' : 'status' },
        h('strong', null, item.phase === 'failed' ? '终端关闭失败，进程状态未确认：' : '终端关闭中，等待宿主确认：'), item.title, ' · ', item.id,
        item.message && h('span', null, ' · ' + item.message),
        item.phase === 'failed' && button('重试关闭', () => action(() => c.retryTerminalClose(item.id)), { 'aria-label': '重试关闭 ' + item.id }))),
      state.terminalCleanup.overflow > 0 && h('p', { role: 'alert' }, '另有关闭任务未装配；完成当前任务后重新核对，不会当作已结束。')),
    h('div', { className: 'wb-stage', ref },
      h('div', { className: 'wb-canvas', style: { width: geometry.canvas.width + 8, height: geometry.canvas.height + 8 }, 'aria-hidden': layout.editing ? 'true' : undefined, inert: layout.editing ? '' : undefined },
        // One stable direct parent and one stable key per content instance.
        // Layout edits never nest/reparent an iframe, textarea or xterm under a pane.
        serializedPanels.map(panel => {
          const rect = geometry.rectangles[panel.id], item = c.content(panel.id), collapsed = layout.layout.collapsed.some(x => x.panelId === panel.id);
          const showing = !!rect?.visible && !layout.editing && active;
          const style = { left: rect?.x ?? 0, top: rect?.y ?? 0, width: rect?.width ?? 1, height: rect?.height ?? 1, visibility: showing ? 'visible' : 'hidden', pointerEvents: showing ? 'auto' : 'none' };
          const tabs = serializedPanels.filter(p => geometry.rectangles[p.id]?.paneId === rect?.paneId);
          return h('article', { key: panel.id, className: 'wb-panel', style, 'data-wb-content': panel.id, 'aria-hidden': !showing, inert: !showing ? '' : undefined },
            h('header', { className: 'wb-panel-header' }, h('strong', { title: panel.title + ' · ' + panel.id }, panel.title),
              button('—', () => action(() => c.model.collapse(panel.id)), { 'aria-label': '收起 ' + panel.id, title: '收起 ' + panel.title }),
              button(layout.layout.maximized === panel.id ? '↙' : '↗', () => action(() => c.model.maximize(panel.id)), { 'aria-label': layout.layout.maximized === panel.id ? '还原' : '放大', title: layout.layout.maximized === panel.id ? '还原模块' : '放大模块' }),
              button('×', () => action(() => c.closePanel(panel.id)), { 'aria-label': '关闭 ' + panel.id, title: '关闭 ' + panel.title })),
            h('nav', { className: 'wb-tabs', role: 'tablist', 'aria-label': panel.title + ' 标签' }, tabs.map((p, index) => button(p.title, () => c.model.activate(p.id), { key: p.id, role: 'tab', tabIndex: p.id === panel.id ? 0 : -1, 'aria-selected': p.id === panel.id,
              onKeyDown: event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length; c.model.activate(tabs[next].id); requestAnimationFrame(() => sectionRef.current?.querySelector('[data-wb-content="' + tabs[next].id + '"] [role=tab][aria-selected=true]')?.focus()); } }))),
            h('div', { className: 'wb-panel-body' }, h(Content, { item, c, workspaceFiles, inputActions, referenceReady, referenceCurrent, servicesAvailable, terminalAvailable, moduleRegistry, showing: showing && !collapsed })));
        }),
        geometry.handles.map(handle => h(SplitHandle, { key: handle.nodeId, handle, c }))),
      layout.editing && h(LayoutEditor, { c, room, selected: selection, select }),
      !geometry.fits && !layout.editing && h('span', { className: 'wb-size-hint', role: 'status' }, '空间不足：操作区可滚动，内容最小尺寸与聊天不被挤坏。')),
    !layout.editing && layout.layout.collapsed.length > 0 && h('nav', { className: 'wb-collapsed', 'aria-label': '已收起内容' }, layout.layout.collapsed.map(item => button('展开 ' + layout.panels[item.panelId].title + ' · ' + item.panelId, () => c.model.expand(item.panelId), { key: item.panelId }))),
    h('footer', { className: 'wb-status', role: 'status' }, state.notice || '布局与内容分离 · 切换不关闭文档、网页或终端',
      button('导出布局', () => download('dshome-layout.json', c.exportLayout())),
      state.storage === 'corrupt' && button('导出损坏记录', () => action(() => download('dshome-layout-original.json', c.exportLayoutOriginal()))),
      state.layoutBackupKey && button('导出最近布局备份', () => action(() => download('dshome-layout-backup.json', c.exportLayoutBackup())))));
}
function Content({ item, c, workspaceFiles, inputActions, referenceReady, referenceCurrent, showing, servicesAvailable, terminalAvailable, moduleRegistry }) {
  if (item.kind === 'files') return h(FileTree, { item, c, workspaceFiles });
  if (item.kind === 'document') return item.document ? h(DocumentEditor, { doc: item.document, c, inputActions, referenceReady, referenceCurrent, showing, servicesAvailable }) : h('div', { className: 'wb-empty' }, h('strong', null, '打开一份文档'), h('p', null, '从左侧文件树选择文件，或输入工作区内的路径。修改后使用保存文件，布局保存不会写入正文。'), h(OpenFile, { c }));
  if (item.kind === 'terminal') return h(TerminalPanel, { item, c, showing, servicesAvailable: servicesAvailable && terminalAvailable(item), blockedReason: servicesAvailable === false ? '工作区接口暂停' : item.ownerSessionId && item.ownerSessionId !== c.sessionId ? '属于会话 ' + item.ownerSessionId + '，请返回该会话输入' : '原终端连接已变化，请新建终端' });
  if (item.kind === 'web') return h(WebPanel, { item, c });
  if (item.kind === 'note') return h('div', { style:{height:'100%',display:'flex',flexDirection:'column',minHeight:0} },
    h('p', {className:'wb-empty'}, '便笺仅保存在当前操作现场；布局保存不保存文字，刷新前请导出。'),
    h('textarea', {className:'wb-note', 'aria-label':'便笺内容 '+item.id, value:item.noteText, maxLength:262144, style:{flex:1,minHeight:0,resize:'none',color:'inherit',background:'transparent'}, onChange:e=>c.editNote(item.id,e.target.value)}),
    button('导出便笺',()=>{try {downloadDraft(item.id+'.txt',item.noteText);} catch(error){c.notify(errorText(error));}}));
  return h(ModuleView, {registry:moduleRegistry,item,controller:c,active:showing});
}
function OpenFile({ c }) {
  const [path, setPath] = React.useState('');
  return h('form', { onSubmit: e => { e.preventDefault(); c.openDocument(path).catch(e => c.notify(errorText(e))); } },
    h('input', { 'aria-label': '文档路径', value: path, placeholder: 'docs/example.md', onChange: e => setPath(e.target.value) }), h('button', { type: 'submit', disabled: !path.trim() }, '打开文档'));
}
function FileTree({ item, c, workspaceFiles }) {
  const [filter, setFilter] = React.useState(''), [hidden, showHidden] = React.useState(false), [refresh, setRefresh] = React.useState(0);
  return h('div', { className: 'wb-files' }, h('div', { className: 'wb-file-tools' }, h('input', { 'aria-label': '筛选已列出的文件', placeholder: '筛选已展开的文件', value: filter, onChange: e => setFilter(e.target.value) }),
    filter && button('×', () => setFilter(''), { 'aria-label': '清空文件筛选' }), button('↻', () => setRefresh(refresh + 1), { 'aria-label': '刷新文件树', title: '刷新文件树' }), button('·', () => showHidden(!hidden), { 'aria-label': '显示隐藏文件', title: '显示隐藏文件', 'aria-pressed': hidden })),
    h('div', { role: 'tree', 'aria-label': '工作区文件', className: 'wb-file-tree' }, h(Directory, { path: '.', c, item, workspaceFiles, filter, hidden, refresh, depth: 0 })),
    h('details', { className: 'wb-open-path' }, h('summary', null, '按路径打开文件'), h(OpenFile, { c })));
}
function Directory({ path, c, item, workspaceFiles, filter, hidden, refresh, depth }) {
  const [state, setState] = React.useState({ phase: 'loading' }), [attempt, retry] = React.useState(0);
  const expanded = item.expanded.has(path);
  React.useEffect(() => {
    if (!expanded) return;
    const lifetime = new AbortController(); setState({ phase: 'loading' });
    workspaceFiles.list(c.sessionId, path, lifetime.signal).then(unwrap).then(value => { if (!lifetime.signal.aborted) setState({ phase: 'ready', ...value }); }, error => { if (!lifetime.signal.aborted) setState({ phase: 'failed', error }); });
    return () => lifetime.abort();
  }, [path, expanded, attempt, refresh, c.sessionId, workspaceFiles]);
  if (!expanded) return null;
  if (state.phase === 'loading') return h('p', { role: 'status' }, '读取目录…');
  if (state.phase === 'failed') return h('p', { role: 'alert' }, errorText(state.error), button('重试', () => retry(attempt + 1)));
  const entries = state.entries.filter(entry => (hidden || !entry.name.startsWith('.')) && (!filter || entry.type === 'directory' || entry.name.toLowerCase().includes(filter.toLowerCase())));
  return h('div', { role: 'group', className: 'wb-tree-group' }, !entries.length && h('p', { role: 'status' }, filter ? '没有匹配的文件' : '此目录没有可显示的文件'), entries.map(entry => {
    const child = path === '.' ? entry.name : path + '/' + entry.name;
    return h('div', { key: child, role: 'treeitem', 'aria-level': depth + 1, 'aria-expanded': entry.type === 'directory' ? item.expanded.has(child) : undefined }, button((entry.type === 'directory' ? (item.expanded.has(child) ? '▾ ' : '▸ ') : '▧ ') + entry.name, () => {
      if (entry.type === 'directory') { if (item.expanded.has(child)) item.expanded.delete(child); else item.expanded.add(child); c.updateContent(item.id, {}); }
      else if (entry.type === 'file') c.openDocument(child).catch(e => c.notify(errorText(e)));
    }, { className: 'wb-tree-entry', title: child, disabled: entry.type === 'other', style: { paddingLeft: 8 + depth * 12 }, 'aria-expanded': entry.type === 'directory' ? item.expanded.has(child) : undefined,
      onKeyDown: event => {
        if (!['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault();
        const node = event.currentTarget, list = [...node.closest('.wb-files').querySelectorAll('.wb-tree-entry:not(:disabled)')], index = list.indexOf(node);
        if (event.key === 'ArrowLeft' && entry.type === 'directory' && item.expanded.has(child)) { item.expanded.delete(child); c.updateContent(item.id, {}); return; }
        if (event.key === 'ArrowRight' && entry.type === 'directory' && !item.expanded.has(child)) { item.expanded.add(child); c.updateContent(item.id, {}); return; }
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, index + (['ArrowUp','ArrowLeft'].includes(event.key) ? -1 : 1))); list[target]?.focus();
      } }),
    entry.type === 'directory' && depth < 32 && h(Directory, { path: child, item, c, workspaceFiles, filter, hidden, refresh, depth: depth + 1 }));
  }), state.truncated && h('p', { role: 'status' }, '目录已达到宿主条目上限，未显示的文件可用路径打开。'), button('刷新目录', () => retry(attempt + 1)));
}
function DocumentEditor({ doc, c, inputActions, referenceReady, referenceCurrent, showing, servicesAvailable }) {
  const s = useSource(doc), ref = React.useRef(null), findRef = React.useRef(null), [preview, setPreview] = React.useState(false), [finding, setFinding] = React.useState(false), [query, setQuery] = React.useState(''), [sensitive, setSensitive] = React.useState(false);
  const projection = React.useMemo(() => textareaProjection(s.text), [s.text]), loaded = s.version !== null;
  const matches = React.useMemo(() => documentMatches(projection.text, query, sensitive), [projection.text, query, sensitive]);
  const position = documentPosition(s.text, s.selectionStart);
  const canSave = s.dirty && s.phase !== 'saving' && !s.uncertain && !s.comparing && servicesAvailable !== false;
  const save = () => { if (canSave) doc.save().catch(e => c.notify(errorText(e))); };
  function find(direction) {
    if (!matches.length || !ref.current) return;
    const boundary = projection.toDisplay(direction < 0 ? s.selectionStart : s.selectionEnd);
    const match = direction < 0 ? [...matches].reverse().find(m => m.start < boundary) ?? matches.at(-1) : matches.find(m => m.start >= boundary) ?? matches[0];
    ref.current.focus(); ref.current.setSelectionRange(match.start, match.end); doc.view({ selectionStart: projection.toRaw(match.start), selectionEnd: projection.toRaw(match.end) });
    const row = projection.text.slice(0, match.start).split('\n').length; ref.current.scrollTop = Math.max(0, (row - 3) * (parseFloat(getComputedStyle(ref.current).lineHeight) || 22));
  }
  React.useLayoutEffect(() => {
    if (!ref.current || !showing) return;
    const node = ref.current; node.scrollTop = s.scrollTop; node.scrollLeft = s.scrollLeft;
    node.setSelectionRange(projection.toDisplay(s.selectionStart), projection.toDisplay(s.selectionEnd));
    if (s.revealFocus) {
      node.focus({ preventScroll: true });
      const style = window.getComputedStyle(node), lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 20;
      node.scrollTop = Math.max(0, (projection.text.slice(0, projection.toDisplay(s.selectionStart)).split('\n').length - 1) * lineHeight - node.clientHeight / 3);
      node.scrollLeft = 0; doc.view({ scrollTop: node.scrollTop, scrollLeft: 0 }); doc.acknowledgeReveal(s.revealRevision);
    }
  }, [showing, preview, loaded, s.revealRevision]);
  React.useEffect(() => { if (s.revealFocus) setPreview(false); }, [s.revealRevision]);
  if (s.phase === 'idle' || s.phase === 'loading') return h('p', { role: 'status' }, '完整读取文档…');
  if (s.phase === 'failed') return h('div', { role: 'alert' }, errorText(s.error), button('重试', () => doc.load().catch(e => c.notify(errorText(e)))));
  const retainView = (e, text = s.text) => {
    const p = text === s.text ? projection : textareaProjection(text), node = e.currentTarget;
    doc.view({ selectionStart: p.toRaw(node.selectionStart), selectionEnd: p.toRaw(node.selectionEnd), scrollTop: node.scrollTop, scrollLeft: node.scrollLeft });
  };
  const reference = () => {
    if (!referenceReady) return c.notify('原生引用显示接口尚未装配，未改动对话草稿。');
    const item = [...c.contents.values()].find(item => item.document === doc);
    quoteDocumentSelection({ doc, controller: c, inputActions, isCurrent: () => !!item && referenceCurrent() && c.contents.get(item.id) === item }).then(selected => {
      c.updateContent(item.id, { lastReference: selected }); c.notify('所选文字及返回位置已插入原生对话草稿，尚未发送。');
    }).catch(error => c.notify(errorText(error)));
  };
  return h('section', { className: 'wb-document', onKeyDown: event => {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setPreview(false); setFinding(true); requestAnimationFrame(() => findRef.current?.focus()); }
    if (event.key === 'Escape' && finding) { event.stopPropagation(); setFinding(false); ref.current?.focus(); }
  } },
    h('div', { className: 'wb-document-toolbar' }, h('span', { title: s.path }, s.path.split(/[\\/]/).at(-1)), h('small', null, s.dirty ? '草稿尚未保存' : '已保存'),
      button(preview ? '编辑' : '预览', () => setPreview(!preview)), button('查找', () => { setPreview(false); setFinding(!finding); requestAnimationFrame(() => findRef.current?.focus()); }, { 'aria-expanded': finding, title: 'Ctrl/⌘+F' }),
      button('引用选区到对话', reference, { disabled: !referenceReady || s.selectionStart === s.selectionEnd, onMouseDown: e => e.preventDefault() }),
      button('导出草稿', () => { try { downloadDraft(s.path, s.text); } catch (error) { c.notify(errorText(error)); } }),
      button(s.comparing ? '正在比较…' : '比较磁盘', () => doc.compareDisk().catch(error => c.notify(errorText(error))), { disabled: s.comparing || s.phase === 'saving' || servicesAvailable === false, 'aria-label': '比较磁盘' }),
      s.comparing && button('取消比较', () => doc.cancelComparison()),
      button(s.phase === 'saving' ? '保存中…' : '保存文件', save, { disabled: !canSave, 'aria-label': '保存文件', title: servicesAvailable === false ? '工作区接口暂停，草稿可继续编辑与导出' : 'Ctrl/⌘+S' })),
    finding && h('form', { className: 'wb-find', onSubmit: event => { event.preventDefault(); find(1); }, 'aria-label': '文档查找' },
      h('input', { ref: findRef, 'aria-label': '查找文本', value: query, maxLength: 256, onChange: event => setQuery(event.target.value) }),
      button('Aa', () => setSensitive(!sensitive), { 'aria-label': '区分大小写', 'aria-pressed': sensitive }),
      h('span', { role: 'status' }, query ? matches.length ? matches.length + (matches.length === 10000 ? '+' : '') + ' 处匹配' : '没有匹配' : '输入查找内容'),
      button('↑', () => find(-1), { 'aria-label': '上一个匹配', disabled: !matches.length }), button('↓', () => find(1), { 'aria-label': '下一个匹配', disabled: !matches.length }), button('×', () => { setFinding(false); ref.current?.focus(); }, { 'aria-label': '关闭文档查找' })),
    s.uncertain && h('p', { role: 'alert' }, '上次保存结果未知，草稿保留。', button('核对磁盘结果', () => doc.reconcile().then(result => c.notify(result.kind === 'conflict' ? '磁盘已变化，需要比较处理，未覆盖草稿。' : '已核对：' + result.kind)).catch(e => c.notify(errorText(e))))),
    s.error && h('p', { role: 'alert' }, errorText(s.error)),
    h(DocumentRecovery, { doc, state: s, notify: text => c.notify(text), hideActions: true }),
    // Preview escapes as React text; repository HTML never becomes host markup.
    preview ? h('pre', { className: 'wb-document-preview', tabIndex: 0 }, s.text) : h('textarea', { ref, className: 'wb-editor', 'aria-label': '编辑 ' + s.path, value: projection.text, spellCheck: false,
      onChange: e => { const text = applyTextareaEdit(s.text, e.currentTarget.value); doc.edit(text); retainView(e, text); }, onSelect: e => retainView(e), onKeyUp: e => retainView(e), onPointerUp: e => retainView(e), onScroll: e => retainView(e) }),
    h('small', { className: 'wb-document-position' }, '第 ' + position.line + ' 行，第 ' + position.column + ' 列 · ' + (s.text.includes('\r\n') ? 'CRLF' : 'LF') + ' · Ctrl/⌘+S 保存，Ctrl/⌘+F 查找'));
}
function WebPanel({ item, c }) {
  const [status, setStatus] = React.useState(''), [error, setError] = React.useState('');
  return h('section', { className: 'wb-web' },
    h('form', { onSubmit: e => { e.preventDefault(); try { c.navigate(item.id, item.addressInput.trim(), location.origin); setError(''); setStatus('正在请求网页…'); } catch (e) { setError(errorText(e)); } } },
      h('input', { type: 'url', maxLength: 8192, 'aria-label': '网页地址', value: item.addressInput, placeholder: 'https://…', onChange: e => c.updateContent(item.id, { addressInput: e.target.value }) }), h('button', { type: 'submit', disabled: !item.addressInput.trim() }, '前往'),
      button('↻', () => { if (window.confirm('重新加载会丢失此网页中未提交的表单，确定吗？')) { setStatus('正在重新请求网页…'); c.updateContent(item.id, { webRevision: (item.webRevision ?? 0) + 1 }); } }, { disabled: !item.url, 'aria-label': '重新加载网页', title: '重新加载当前网页' })),
    error && h('p', { role: 'alert', className: 'wb-web-status' }, error),
    item.url ? h('iframe', { key: item.contentId + ':' + (item.webRevision ?? 0), title: '网页 ' + item.id, src: item.url, sandbox: 'allow-scripts allow-forms allow-popups allow-downloads', referrerPolicy: 'no-referrer', 'data-wb-iframe': item.id, onLoad: () => setStatus('载体已响应；若页面不可用，可在浏览器打开。') }) : h('div', { className: 'wb-empty' }, h('strong', null, '在工作台旁浏览网页'), h('p', null, '输入 HTTP(S) 地址即可打开。部分站点不支持嵌入，可使用浏览器打开。')),
    item.url && h('div', { className: 'wb-web-status' }, h('span', { role: 'status' }, status), h('a', { href: item.url, target: '_blank', rel: 'noreferrer noopener' }, '在浏览器打开 ↗')));
}
function TerminalPanel({ item, c, showing, servicesAvailable, blockedReason }) {
  if (!item.started) return h('div', { className: 'wb-empty' }, servicesAvailable === false ? blockedReason : '仅点击后启动真实终端。布局编辑和预设切换不会执行命令。', button('启动终端', () => { try { c.startTerminal(item.id); } catch (e) { c.notify(errorText(e)); } }, { disabled: servicesAvailable === false }));
  return h(TerminalScreen, { view: item.view, showing, servicesAvailable, blockedReason, onError: e => c.notify(errorText(e)) });
}
function TerminalScreen({ view, showing, onError, servicesAvailable = true, blockedReason }) {
  const state = useSource(view.state), ref = React.useRef(null), termRef = React.useRef(null), fitRef = React.useRef(null), rendered = React.useRef(-1), presentation = terminalState(state), writable = servicesAvailable && presentation.canInput, inputAllowed = React.useRef(false); inputAllowed.current = writable;
  React.useEffect(() => {
    const terminal = new Terminal({ disableStdin: true, cursorBlink: true, fontSize: 13, scrollback: 3000, allowProposedApi: false });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(ref.current); termRef.current = terminal; fitRef.current = fit;
    const detach = view.mount();
    const input = terminal.onData(data => { if (inputAllowed.current) { try { view.write(data); } catch (error) { onError(error); } } });
    const fitNow = () => { const rect = ref.current?.getBoundingClientRect(); if (rect?.width > 20 && rect?.height > 20) { fit.fit(); view.resize(terminal.cols, terminal.rows); } };
    const observer = new ResizeObserver(fitNow); observer.observe(ref.current); fitNow();
    return () => { observer.disconnect(); input.dispose(); detach(); terminal.dispose(); termRef.current = null; fitRef.current = null; rendered.current = -1; };
  }, [view]);
  React.useEffect(() => { const terminal = termRef.current; if (!terminal) return; terminal.options.disableStdin = !writable; terminal.textarea?.setAttribute('aria-disabled', String(!writable)); }, [writable]);
  React.useEffect(() => { if (showing && fitRef.current) { fitRef.current.fit(); view.resize(termRef.current.cols, termRef.current.rows); } }, [showing, state.writable]);
  React.useEffect(() => {
    const pending = state.render, terminal = termRef.current;
    if (!pending || !terminal || pending.revision === rendered.current) return;
    rendered.current = pending.revision; const frame = pending.frame;
    if (frame.type === 'snapshot') terminal.reset();
    terminal.write(frame.type === 'snapshot' ? frame.screen : frame.data, () => view.acknowledge(pending.revision));
  }, [state.render]);
  return h('section', { className: 'wb-terminal' }, h('div', { className: 'wb-terminal-status', role: 'status' }, state.title || '终端', ' · ', servicesAvailable ? presentation.status : blockedReason || '工作区接口暂停', state.info?.cwd && ' · ' + state.info.cwd,
    !writable && ' · 只读（不可输入）', presentation.retry && button(presentation.retryLabel, () => { try { Promise.resolve(retryTerminal(view)).catch(onError); } catch (error) { onError(error); } }, { disabled: !servicesAvailable })),
    presentation.help && h('p', { className: 'wb-terminal-help' }, presentation.help),
    state.error && h('p', { role: 'alert' }, state.error), h('div', { className: 'wb-terminal-screen', ref, 'data-wb-terminal': view.id }));
}
function SplitHandle({ handle, c }) {
  const origin = React.useRef(null), horizontal = handle.axis === 'x';
  const drag = e => { if (!origin.current || origin.current.pointerId !== e.pointerId) return; const delta = (horizontal ? e.clientX : e.clientY) - origin.current.coordinate; c.model.resize(handle.nodeId, origin.current.ratio + delta / handle.total); };
  return h('div', { role: 'separator', tabIndex: 0, className: 'wb-split', 'aria-orientation': horizontal ? 'vertical' : 'horizontal', 'aria-label': '调整模块分割', 'aria-valuemin': 1, 'aria-valuemax': 99, 'aria-valuenow': Math.round(handle.ratio * 100),
    style: { left: handle.x, top: handle.y, width: handle.width, height: handle.height, cursor: horizontal ? 'col-resize' : 'row-resize' },
    onPointerDown: e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); origin.current = { pointerId: e.pointerId, coordinate: horizontal ? e.clientX : e.clientY, ratio: handle.ratio }; },
    onPointerMove: drag, onPointerUp: e => { drag(e); origin.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }, onLostPointerCapture: () => { origin.current = null; }, onPointerCancel: () => { origin.current = null; },
    onKeyDown: e => { if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); c.model.resize(handle.nodeId, handle.ratio + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -.02 : .02)); } } });
}
function LayoutEditor({ c, room, selected, select }) {
  const state = useSource(c.model), draft = state.editing;
  const [target, setTarget] = React.useState(''), [edge, setEdge] = React.useState('right');
  const drag = React.useMemo(() => createLayoutDrag(c.model), [c.model]);
  const [dropHint, hint] = React.useState('');
  React.useEffect(() => () => drag.cancel(), [drag]);
  function dragProps(panelId, paneId) {
    return { draggable: true,
      onDragStart(e) { action(() => { e.dataTransfer.setData(LAYOUT_DRAG_TYPE, drag.begin(panelId)); e.dataTransfer.effectAllowed = 'move'; select(panelId); }); },
      onDragEnd() { drag.cancel(); hint(''); },
      onDragOver(e) { if (!paneId || !Array.from(e.dataTransfer.types).includes(LAYOUT_DRAG_TYPE)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = e.currentTarget.getBoundingClientRect(); hint(paneId + ' · ' + dropEdge(e.clientX-r.left, e.clientY-r.top, r.width, r.height)); },
      onDragLeave() { hint(''); },
      onDrop(e) { if (!paneId) return; e.preventDefault(); action(() => { const r = e.currentTarget.getBoundingClientRect(); const id = drag.drop(e.dataTransfer.getData(LAYOUT_DRAG_TYPE), paneId, dropEdge(e.clientX-r.left, e.clientY-r.top, r.width, r.height)); select(id); setTarget(paneId); }); hint(''); },
    };
  }
  const g = c.model.geometry(Math.max(900, room.width), Math.max(600, room.height), { draft: true });
  const panels = Object.values(draft.panels), paneIds = Object.keys(g.paneRects);
  const pane = target && paneIds.includes(target) ? target : paneIds[0];
  function action(fn) { try { fn(); } catch (e) { c.notify(errorText(e)); } }
  const box = selected && draft.panels[selected];
  return h('section', { className: 'wb-layout-editor', 'aria-label': '布局编辑器' },
    h('aside', { className: 'wb-module-library' }, h('h3', null, '模块库'), h('p', null, '添加的是内容模块。应用前不启动终端、不读取文件。'),
      c.model.modules().map(def => button('＋ ' + def.label, () => action(() => { const id = c.model.addPanel(def.kind, { targetPaneId: pane, edge }); select(id); }), { key: def.kind })),
      h('h4', null, '已有实例'), panels.map(panel => button(panel.title + ' · ' + panel.id, () => select(panel.id), { key: panel.id, 'aria-pressed': selected === panel.id, ...dragProps(panel.id) }))),
    h('section', { className: 'wb-layout-draft' }, h('h3', null, '布局草稿'), h('p', null, '拖到分区四边以分割，中央合并标签；也可使用下方控件。内容仍在原容器中。'), h('p', { role: 'status', 'aria-live': 'polite' }, dropHint),
      h('div', { className: 'wb-layout-preview', style: { aspectRatio: g.canvas.width + '/' + g.canvas.height } }, panels.map(panel => {
        const r = g.rectangles[panel.id]; if (!r?.visible) return null;
        return button(panel.title + ' · ' + panel.id, () => { select(panel.id); setTarget(r.paneId); }, { key: panel.id, 'aria-pressed': selected === panel.id, ...dragProps(panel.id, r.paneId), style: { position: 'absolute', left: (r.x / g.canvas.width * 100) + '%', top: (r.y / g.canvas.height * 100) + '%', width: (r.width / g.canvas.width * 100) + '%', height: (r.height / g.canvas.height * 100) + '%' } });
      })),
      h('label', null, '目标分区', h('select', { value: pane ?? '', onChange: e => setTarget(e.target.value) }, paneIds.map(id => h('option', { key: id }, id)))),
      h('label', null, '放置方式', h('select', { value: edge, onChange: e => setEdge(e.target.value) }, [['left','左侧分割'],['right','右侧分割'],['top','上方分割'],['bottom','下方分割'],['tab','合并为标签组']].map(([value,label]) => h('option', { key: value, value }, label)))),
      button('放到目标分区', () => action(() => c.model.dock(selected, pane, edge)), { disabled: !box || !pane }),
      button('收起所选模块', () => action(() => c.model.collapse(selected)), { disabled: !box || draft.layout.collapsed.some(i => i.panelId === selected) }),
      button('展开所选模块', () => action(() => c.model.expand(selected)), { disabled: !draft.layout.collapsed.some(i => i.panelId === selected) }),
      h('label', null, '交换对象', h('select', { 'aria-label': '交换对象', defaultValue: '', onChange: e => { if (e.target.value) action(() => c.model.swap(selected, e.target.value)); e.target.value = ''; }, disabled: !box }, h('option', { value: '' }, '选择另一现有实例交换'), panels.filter(p => p.id !== selected).map(p => h('option', { key: p.id, value: p.id }, p.title + ' · ' + p.id)))),
      button('撤销', () => c.model.undo(), { disabled: !state.canUndo }), button('重做', () => c.model.redo(), { disabled: !state.canRedo })),
    h('aside', { className: 'wb-module-properties' }, h('h3', null, '模块属性'), box ? h(React.Fragment, null,
      h('p', null, box.id), h('label', null, '显示名称', h('input', { value: box.title, maxLength: 120, onChange: e => action(() => c.model.renamePanel(selected, e.target.value)) })),
      h('p', null, '种类：' + box.kind), h('p', null, '内容生命周期：切布局保留，关闭内容单独确认。'), h('p', null, '保存布局不会保存文档草稿或执行终端命令。')) : h('p', null, '选择已有实例或添加新模块。')));
}
export const css = terminalCSS + chromeCSS + `
.dshome-v2{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--wb-backdrop);color:var(--wb-text);font-size:13px;box-sizing:border-box}
.dshome-v2 *{box-sizing:border-box}
.dshome-v2 button,.dshome-v2 input,.dshome-v2 select{font:inherit;color:var(--wb-text);border:1px solid var(--wb-border);background:var(--wb-surface);border-radius:6px;padding:6px 9px}
.dshome-v2 button{cursor:pointer}
.dshome-v2 button:disabled{opacity:.45;cursor:not-allowed}
.dshome-v2 button:focus-visible,.dshome-v2 input:focus-visible,.dshome-v2 textarea:focus-visible,.dshome-v2 select:focus-visible,.wb-split:focus-visible{outline:2px solid var(--wb-accent);outline-offset:-2px}
.dshome-v2 button[aria-pressed=true],.dshome-v2 button[aria-selected=true]{color:var(--wb-accent);background:var(--wb-selected)}
.wb-header{min-height:58px;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--wb-border);flex-wrap:wrap}
.wb-header strong{font-size:18px}
.wb-project{font-size:11px;opacity:.65;flex:1;min-width:20px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.wb-header .wb-primary{background:var(--wb-solid-accent);color:#fff}
.wb-stage{flex:1;min-height:200px;position:relative;overflow:auto;padding:4px}
.wb-canvas{position:relative;min-width:100%;min-height:100%}
.wb-panel{position:absolute;display:flex;flex-direction:column;overflow:hidden;background:var(--wb-surface);border:1px solid var(--wb-border);border-radius:9px}
.wb-panel:focus-within{border-color:#6983ff}
.wb-panel-header{height:38px;flex-shrink:0;display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--wb-border)}
.wb-panel-header strong{flex:1;min-width:2em;white-space:nowrap}
.wb-panel-header small{opacity:.65;font-size:10px}
.wb-panel-header button{font-size:11px;padding:3px 4px;white-space:nowrap}
.wb-panel-body{flex:1;min-height:0;overflow:hidden}
.wb-tabs{display:flex;gap:3px;padding:3px 5px;overflow:auto;flex-shrink:0}
.wb-tabs:has(button:only-child){display:none}
.wb-tabs button{white-space:nowrap;font-size:11px}
.wb-document,.wb-web,.wb-terminal{height:100%;display:flex;flex-direction:column;min-height:0}
.wb-document-toolbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:6px;border-bottom:1px solid var(--wb-border);font-size:11px}
.wb-document-toolbar span{flex:1}
.wb-document-toolbar small{color:var(--wb-warning)}
.wb-document-toolbar button{padding:4px 6px;font-size:11px}
.wb-editor{flex:1;min-height:80px;width:100%;resize:none;border:0;background:transparent;color:inherit;outline:0;padding:14px;line-height:1.6;font-family:var(--dsh-font-family-code,monospace);white-space:pre;tab-size:2}
.wb-document-preview{flex:1;overflow:auto;margin:0;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7}
.wb-document-position{padding:5px 10px;opacity:.6;font-size:10px}
.wb-web form{display:flex;gap:4px;padding:6px}
.wb-web input{flex:1;min-width:0}
.wb-web iframe{flex:1;min-height:80px;width:100%;border:0;background:white}
.wb-web>a{font-size:10px;padding:4px 8px;color:var(--wb-accent)}
.wb-terminal{background:#182536;color:#d6e2f3}
.wb-terminal-status{font-size:11px;padding:5px 8px}
.wb-terminal-screen{flex:1;min-height:0;padding:4px}
.wb-files{height:100%;overflow:auto;padding:8px}
.wb-files>input{width:100%}
.wb-tree-entry{width:100%;border:0!important;text-align:left;overflow-wrap:anywhere}
.wb-tree-group p{padding:4px;opacity:.7}
.wb-empty{padding:16px;line-height:1.8}
.wb-empty button{margin:8px}
.wb-empty form{display:flex;gap:5px;flex-wrap:wrap}
.wb-empty input{max-width:100%;min-width:0}
.wb-split{position:absolute;touch-action:none;z-index:2;border-radius:4px}
.wb-split:hover,.wb-split:focus{background:#9dafed66}
.wb-status{display:flex;align-items:center;gap:8px;min-height:34px;padding:6px 12px;background:var(--wb-backdrop);font-size:11px;flex-wrap:wrap}
.wb-status button{padding:3px 6px;font-size:10px}
.wb-collapsed,.wb-add{display:flex;gap:5px;padding:5px 10px;flex-wrap:wrap}
.wb-size-hint{position:sticky;bottom:0;font-size:10px;background:var(--wb-backdrop);color:var(--wb-warning);padding:3px 7px}
.wb-layout-editor{position:absolute;inset:0;min-width:700px;background:var(--wb-backdrop);display:grid;grid-template-columns:200px minmax(280px,1fr) 230px;gap:10px;padding:12px;overflow:auto;z-index:4}
.wb-layout-editor aside,.wb-layout-draft{border:1px solid var(--wb-border);border-radius:8px;padding:12px;overflow:auto;background:var(--wb-surface)}
.wb-module-library button{width:100%;margin:4px 0;text-align:left}
.wb-layout-editor h3{margin:4px 0 16px}
.wb-layout-editor p{line-height:1.7;font-size:12px;opacity:.8}
.wb-layout-preview{position:relative;margin:16px 0;background:var(--wb-backdrop)}
.wb-layout-preview button{font-size:11px;border-radius:4px;overflow:hidden}
.wb-layout-draft>label,.wb-module-properties label{display:block;margin:12px 0}
.wb-layout-editor select,.wb-module-properties input{max-width:100%;width:100%;margin-top:5px}
.wb-layout-draft>button{margin:4px}
.wb-add{border-bottom:1px solid var(--wb-border)}
.dshome-v2{container-type:inline-size;position:relative;line-height:1.5}
.dshome-v2 :where(button,input,select,textarea){box-sizing:border-box}
.wb-header{gap:6px;padding:9px 12px;min-height:54px;flex-shrink:0;background:var(--wb-surface)}
.wb-header strong{font-size:15px}.wb-header button,.wb-header select{min-height:30px;white-space:nowrap}
.wb-project{font-size:12px;min-width:60px}.wb-panel-header{height:36px;padding:4px 8px;gap:3px}
.wb-panel-header strong{overflow:hidden;text-overflow:ellipsis;font-size:12px}.wb-panel-header button,.wb-icon-button{min-width:27px;min-height:26px;font-size:15px;line-height:1;padding:3px}
.wb-panel-header button:hover{background:var(--wb-selected)}
.wb-layout-tools{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:9px 12px;background:var(--wb-surface);border-bottom:1px solid var(--wb-border)}
.wb-layout-tools form{display:flex;gap:6px;flex-wrap:wrap}.wb-layout-tools input{min-width:180px;flex:1}
.wb-header [aria-expanded=true]{background:var(--wb-selected)}
.wb-find{display:flex;align-items:center;gap:5px;padding:6px 8px;background:var(--wb-backdrop);border-bottom:1px solid var(--wb-border);flex-wrap:wrap}
.wb-find input{flex:1;min-width:100px}.wb-find span{font-size:11px;color:var(--wb-muted)}
.wb-document-recovery{border:1px solid var(--wb-border);background:var(--wb-backdrop);color:var(--wb-text)}
.wb-file-tools{display:flex;align-items:center;gap:3px;position:sticky;top:0;background:var(--wb-surface);padding-bottom:8px;z-index:1}
.wb-file-tools input{min-width:0;flex:1;width:100%}.wb-file-tools button{padding:4px 6px;min-height:28px}
.wb-files{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:8px 7px}
.wb-file-tree{flex:1;min-height:0;overflow:auto}.wb-tree-entry{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;min-height:28px;font-size:12px;padding-top:4px;padding-bottom:4px;border-radius:4px}
.wb-tree-entry:hover{background:var(--wb-selected)}.wb-open-path{border-top:1px solid var(--wb-border);padding-top:7px;margin-top:7px;flex-shrink:0;font-size:11px}
.wb-open-path summary{cursor:pointer}.wb-open-path form{display:flex;flex-wrap:wrap;gap:5px;padding-top:7px}.wb-open-path input{width:100%;min-width:0}
.wb-empty{font-size:12px;padding:18px;max-width:560px}.wb-empty strong{font-size:14px}.wb-empty p{color:var(--wb-muted);margin:8px 0 12px}
.wb-empty button{margin:4px 0}.wb-editor{font-size:13px}.wb-document-position{font-size:10px;color:var(--wb-muted);line-height:1.5;overflow-wrap:anywhere}
.wb-web-status{display:flex;align-items:center;flex-wrap:wrap;gap:5px;padding:5px 8px;margin:0;font-size:10px;color:var(--wb-muted)}
.wb-web-status a{margin-left:auto;color:var(--wb-accent);white-space:nowrap}.wb-connection-notice{padding:10px 12px;font-size:12px;border-bottom:1px solid var(--wb-border);background:var(--wb-backdrop)}
.wb-connection-notice p{margin:0 0 6px}.wb-connection-notice button{margin-right:6px}
.wb-layout-editor{min-width:0;grid-template-columns:160px minmax(260px,1fr) 200px;gap:8px;padding:10px}.wb-layout-editor h3{font-size:14px}
.wb-status{font-size:10px;gap:5px;padding:5px 10px;flex-shrink:0}.wb-status button{min-height:25px}
@container(max-width:820px){.wb-header .wb-project{flex-basis:calc(100% - 100px)}.wb-layout-editor{grid-template-columns:140px minmax(230px,1fr)}.wb-module-properties{grid-column:1/-1;max-height:220px}.wb-layout-editor{overflow:auto;align-content:start}.wb-layout-draft{min-height:350px}}
@container(max-width:500px){.wb-header{padding:8px;gap:4px}.wb-header button,.wb-header select{font-size:11px;padding:5px 7px}.wb-layout-editor{display:flex;flex-direction:column}.wb-layout-editor>aside,.wb-layout-draft{flex-shrink:0}.wb-module-library{max-height:210px}.wb-find{gap:3px}.wb-find input{flex-basis:100%}}

`;
