import {snapshotFolders,entryHandle} from './local-directory.mjs';
import {LocalDirectory,LocalPreview} from './local-ui.mjs';
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
import { Icon } from './icons.mjs';
import { panelCaption, fileName, friendlyError } from './presentation.mjs';
import { CommandPalette } from './command-palette.mjs';
import { modernCSS } from './modern-css.mjs';
const h = React.createElement;
const useSource = source => React.useSyncExternalStore(source.subscribe, source.getSnapshot);
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
const errorText = friendlyError;
const icon = (name, size = 18) => h(Icon, { name, size });
const labelled = (name, text) => h(React.Fragment, null, icon(name), h('span', { className: 'wb-label' }, text));
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
export function Workspace({ controller: c, workspaceFiles, inputActions, onOriginal, onCloseWorkspace, referenceReady = true, referenceCurrent = () => true, active = true, servicesAvailable = true, terminalAvailable = () => servicesAvailable, projectTitle = c.projectId, moduleRegistry, adaptive = false, shellControls }) {
  const state = useSource(c), layout = useSource(c.model), ref = React.useRef(null), room = useRoom(ref);
  const [selection, select] = React.useState(null), [menu, setMenu] = React.useState(false), [tools, setTools] = React.useState(false), [palette, setPalette] = React.useState(null);
  const folderInput = React.useRef(null), localInput = React.useRef(null), liveDrag = React.useRef(null), suppressClick = React.useRef(false), [dockHint, setDockHint] = React.useState(null), [dragging, setDragging] = React.useState(false), [fileHover, setFileHover] = React.useState(false);
  const importRef = React.useRef(null), sectionRef = React.useRef(null);
  const [focusedPanel, focusPanel] = React.useState('DOC-01');
  React.useLayoutEffect(() => { if (state.focusedPanelId) focusPanel(state.focusedPanelId); }, [state.focusRevision]);
  const wasEditing = React.useRef(false);
  React.useEffect(() => { if (!active) setPalette(null); }, [active]);
  React.useLayoutEffect(() => {
    if (layout.editing) sectionRef.current?.querySelector('.wb-layout-editor button:not(:disabled)')?.focus();
    else if (wasEditing.current) sectionRef.current?.querySelector('[data-wb-layout-trigger]')?.focus();
    wasEditing.current = !!layout.editing;
  }, [!!layout.editing]);
  React.useEffect(() => {
    if (!menu && !tools) return;
    const close = event => { if (!event.target.closest?.('.wb-add,.wb-layout-tools,[aria-label="新建内容"],[data-wb-layout-trigger]')) { setMenu(false); setTools(false); } };
    document.addEventListener('click', close); return () => document.removeEventListener('click', close);
  }, [menu, tools]);
  const splitGeometry = c.model.geometry(Math.max(0, room.width - 12), Math.max(0, room.height - 12), {gap:6});
  function action(fn) { try { Promise.resolve(fn()).catch(e => c.notify(errorText(e))); } catch (e) { c.notify(errorText(e)); } }
  const serializedPanels = Object.values(layout.panels).sort((a, b) => a.id.localeCompare(b.id));
  const compact = adaptive && room.width < 700 && !layout.editing;
  const placed = serializedPanels.filter(p => !layout.layout.collapsed.some(item => item.panelId === p.id));
  const focused = placed.find(p => p.id === focusedPanel) ?? placed.find(p => p.kind === 'document') ?? placed[0];
  // A narrow view changes only rectangles. Every content keeps its original
  // React parent/key, and the saved layout remains unchanged.
  const geometry = compact ? { ...splitGeometry, fits: true, handles: [], canvas: { width: Math.max(0, room.width - 12), height: Math.max(240, room.height - 12) }, rectangles: Object.fromEntries(serializedPanels.map(p => [p.id, { x: 0, y: 0, width: Math.max(0, room.width - 12), height: Math.max(240, room.height - 12), paneId: splitGeometry.rectangles[p.id]?.paneId, visible: p.id === focused?.id }])) } : splitGeometry;
  function showPanel(id) {
    const current = c.model.getSnapshot();
    if (current.layout.maximized && current.layout.maximized !== id) c.model.maximize(current.layout.maximized);
    if (current.layout.collapsed.some(p => p.panelId === id)) c.model.expand(id);
    c.model.activate(id); focusPanel(id);
  }
  async function openDocument(path, options) {
    const doc = await c.openDocument(path, options);
    const item = [...c.contents.values()].find(i => i.document === doc);
    if (item) { showPanel(item.id); requestAnimationFrame(() => sectionRef.current?.querySelector('[data-wb-content="' + item.id + '"] textarea.wb-editor')?.focus({ preventScroll: true })); }
    return doc;
  }
  function showModule(kind) {
    const panel = serializedPanels.find(p => p.kind === kind);
    showPanel(panel ? panel.id : c.model.addPanel(kind));
  }
  function applyLayout() {
    const oldIds = new Set(Object.keys(c.model.getSnapshot().panels));
    c.model.applyEdit();
    const added = Object.values(c.model.getSnapshot().panels).filter(p => !oldIds.has(p.id));
    if (added.length) focusPanel(added.at(-1).id);
  }
  async function pickLocal() {
    if (!window.showOpenFilePicker) return localInput.current?.click();
    try { const handles = await window.showOpenFilePicker({multiple:true}); for (const handle of handles) await c.openLocalFile(await handle.getFile(), handle); }
    catch(e) { if(e.name!=='AbortError') c.notify(errorText(e)); }
  }
  async function pickFolder() {
    if(!window.showDirectoryPicker)return folderInput.current?.click();
    try{await c.addLocalFolder(await window.showDirectoryPicker({mode:'read'}));}catch(e){if(e.name!=='AbortError')c.notify(errorText(e));}
  }
  function cancelDock() { liveDrag.current?.cleanup?.(); liveDrag.current = null; setDockHint(null); setDragging(false); setTimeout(()=>{suppressClick.current=false;},0); }
  React.useEffect(() => { cancelDock(); }, [active, !!layout.editing, compact]);
  React.useEffect(() => () => liveDrag.current?.cleanup?.(), []);
  function startDock(e, id) {
    if (e.button !== 0 || layout.editing || !active || compact || layout.layout.maximized) return;
    if (e.target.closest('button') && e.currentTarget !== e.target.closest('button')) return;
    const handle = e.currentTarget, pointerId = e.pointerId;
    handle.setPointerCapture?.(pointerId);
    const origin = { x:e.clientX, y:e.clientY }, revision = c.model.getSnapshot().revision;
    const sourcePane = geometry.rectangles[id]?.paneId;
    const sourceCount = Object.values(geometry.rectangles).filter(r => r.paneId === sourcePane).length;
    let moved = false, target = null;
    const move = event => {
      if (event.pointerId !== e.pointerId) return;
      if (!moved && Math.hypot(event.clientX-origin.x,event.clientY-origin.y) < 8) return;
      if (!moved) { moved = true; suppressClick.current = true; setDragging(true);  }
      event.preventDefault(); target = null;
      for (const node of sectionRef.current.querySelectorAll('article.wb-panel[aria-hidden="false"]')) {
        const r = node.getBoundingClientRect();
        if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) continue;
        const paneId = node.dataset.wbPane;
        const edge = dropEdge(event.clientX-r.left,event.clientY-r.top,r.width,r.height);
        if (paneId === sourcePane && (sourceCount === 1 || edge === 'tab')) break;
        target = { paneId, edge }; break;
      }
      setDockHint(target);
      setDragging({ x:event.clientX, y:event.clientY, title:panelCaption(layout.panels[id],c.content(id)) });
    };
    const end = event => {
      if(event.pointerId !== e.pointerId) return;
      const destination = target; cancelDock();
      if (moved) { event.preventDefault(); setTimeout(()=>{suppressClick.current=false;},0); }
      if (destination && event.type === 'pointerup') action(() => {
        if(c.model.getSnapshot().revision !== revision) throw Error('布局已变化，请重新拖动');
        c.model.dock(id,destination.paneId,destination.edge);
      });
    };
    const abort = () => { cancelDock(); setTimeout(()=>{suppressClick.current=false;},0); };
    const key = event => { if(event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); abort(); } };
    window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',end); window.addEventListener('pointercancel',end); window.addEventListener('keydown',key,true); window.addEventListener('blur',abort);
    liveDrag.current = { cleanup() { if(handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId); window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end); window.removeEventListener('pointercancel',end); window.removeEventListener('keydown',key,true); window.removeEventListener('blur',abort); } };
  }
  // SDK attachments listen on document in bubble phase. Claim all file events
  // inside this workspace before those listeners; leave chat drops untouched.
  React.useEffect(() => {
    if(!active) return;
    let claimed = false;
    const reset = () => { claimed=false; setFileHover(false); };
    const route = event => {
      if(!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      const root=sectionRef.current;
      if(!root?.contains(event.target)) { reset(); return; }
      event.preventDefault(); event.stopPropagation();
      if(event.type==='dragleave') { if(!root.contains(event.relatedTarget)) reset(); return; }
      if(!claimed) { window.dispatchEvent(new Event('dragend')); claimed=true; }
      setFileHover(event.type!=='drop');
      event.dataTransfer.dropEffect=layout.editing?'none':'copy';
      if(event.type!=='drop') return;
      reset(); if(layout.editing) return;
      const selected=[...event.dataTransfer.items].filter(i=>i.kind==='file').map(i=>({file:i.getAsFile(),entry:i.webkitGetAsEntry?.(),handle:Promise.resolve(i.getAsFileSystemHandle?.()).then(value=>({value}),error=>({error}))}));
      action(async()=>{for(const item of selected){try {const result=await item.handle;if(result.error)throw result.error;const handle=result.value??(item.entry?entryHandle(item.entry):undefined);if(handle?.kind==='directory'){await c.addLocalFolder(handle);continue;}if(item.file)await c.openLocalFile(item.file,handle);}catch(error){c.notify(errorText(error));}}});
    };
    const types=['dragenter','dragover','dragleave','drop'];
    types.forEach(type=>document.addEventListener(type,route,true)); window.addEventListener('dragend',reset);
    return ()=>{types.forEach(type=>document.removeEventListener(type,route,true));window.removeEventListener('dragend',reset);setFileHover(false);};
  }, [active, !!layout.editing, c]);
  const commands = [
    ...c.model.modules().map(def => ({ id: 'show-' + def.kind, icon: def.kind, title: '显示' + def.label + '模块', detail: def.kind === 'terminal' ? '仅打开模块，不启动进程' : '回到已有内容；不存在时添加模块', run: () => showModule(def.kind) })),
    { id: 'edit-layout', icon: 'layout', title: '编辑布局', detail: '重新组合模块、标签与分区', run: () => c.model.beginEdit() },
    { id: 'save-layout', icon: 'save', title: '保存布局', detail: '只保存排布，不保存正文或重放命令', run: () => c.saveLayout() },
    { id: 'recover-layout', icon: 'refresh', title: '检查布局存储', detail: '查看备份与冲突恢复', run: () => c.inspectLayout() },
    { id: 'layout-tools', icon: 'layout', title: '布局导入与预设管理', detail: '导入 / 导出布局、命名预设', run: () => setTools(true) },
    { id: 'export-layout', icon: 'download', title: '导出布局', run: () => download('dshome-layout.json', c.exportLayout()) },
    { id: 'original', icon: 'external', title: '返回聊天', detail: '工作台内容仍保留', run: onOriginal },
  ];
  const documents = [...c.contents.values()].filter(i => i.document), dirty = documents.filter(i => i.document.getSnapshot().dirty || i.document.getSnapshot().uncertain).length;
  return h('section', { ref: sectionRef, onClickCapture:e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();}}, className: 'dshome-v2', 'data-compact': compact, 'data-workspace-project': c.projectId, 'data-workspace-session': c.sessionId,
    onKeyDown: event => {
      if (event.nativeEvent.isComposing || palette) return;
      if ((event.ctrlKey || event.metaKey) && ['p','k'].includes(event.key.toLowerCase()) && !layout.editing) {
        // Preserve shell readline keys. Ctrl/⌘+Shift+P is available from a PTY.
        if (event.target.closest?.('.xterm') && !event.shiftKey) return;
        event.preventDefault(); event.stopPropagation(); setPalette(event.key.toLowerCase() === 'p' && !event.shiftKey ? 'files' : 'commands');
      }
      if (layout.editing && (event.ctrlKey || event.metaKey) && event.key === 'Enter') { action(applyLayout); event.preventDefault(); }
      if (event.key === 'Escape') { if (menu || tools) { setMenu(false); setTools(false); sectionRef.current?.querySelector(tools ? '[data-wb-layout-trigger]' : '[aria-label="新建内容"]')?.focus(); event.preventDefault(); event.stopPropagation(); } else if (layout.editing) { c.model.cancelEdit(); event.preventDefault(); } }
    } },
    h('header', { className: 'wb-header', role: 'toolbar', 'aria-label': '工作台工具栏' },
      shellControls,
      h('div', { className: 'wb-heading' }, h('span', { className: 'wb-heading-mark' }, icon('layout', 21)), h('div', null, h('strong', null, layout.editing ? '布置工作台' : '工作台'), h('span', { className: 'wb-project', title: projectTitle }, projectTitle))),
      h('span', { className: 'wb-connection', 'data-ready': servicesAvailable }, servicesAvailable ? '已连接' : '连接暂停'),
      h('div', { className: 'wb-header-actions' }, layout.editing ? h(React.Fragment, null,
        button('取消', () => c.model.cancelEdit()), button(labelled('check', '应用布局'), () => action(applyLayout), { className: 'wb-primary', 'aria-label': '应用布局' })) : h(React.Fragment, null,
        button(labelled('layout', '布局'), () => { setTools(!tools); setMenu(false); }, { 'data-wb-layout-trigger': true, 'aria-expanded': tools, 'aria-label': '布局选项', title: '调整、保存和恢复布局' }),
        onCloseWorkspace && button(icon('close'), onCloseWorkspace, { 'aria-label': '关闭工作区内容', title: '关闭此工作区内容；未保存内容与终端会先确认', className: 'wb-icon-button' })))),
    !layout.editing && h('div', { className: 'wb-commandbar' },
      h('nav', { className: 'wb-activity-rail', 'aria-label': '工作台工具' }, ...[['files','文件'],['document','文档'],['terminal','终端'],['web','网页'],['note','便笺']].map(([kind, title]) => button(icon(kind, 20), () => action(() => showModule(kind)), { key: kind, disabled: !!layout.editing, 'data-kind': kind, 'aria-label': '显示' + title + '模块', title })), h('span', { className: 'wb-rail-spacer' }), button(icon('command', 19), () => setPalette('commands'), { 'aria-label': '工作台快捷命令', title: '快捷命令 · Ctrl K', disabled: !!layout.editing })),

      button(h(React.Fragment, null, icon('search', 16), h('span', null, '打开文件'), h('kbd', null, 'Ctrl P')), () => setPalette('files'), { className: 'wb-quick-trigger', 'aria-label': '快速打开文件', title: 'Ctrl/⌘+P 打开文件' }),
      button(labelled('plus', '新建'), () => { setMenu(!menu); setTools(false); }, { 'aria-expanded': menu, 'aria-label': '新建内容' }),
      button(labelled('command', '搜索操作'), () => setPalette('commands'), { 'aria-label': '打开命令面板', title: 'Ctrl/⌘+Shift+P 搜索操作' })),
    tools && !layout.editing && h('div', { className: 'wb-layout-tools', 'aria-label': '布局文件与预设' },
      h('select', { 'aria-label': '布局预设', value: layout.selectedPreset, onChange: e => action(() => c.model.selectPreset(e.target.value)) }, h('option', { value: 'custom', disabled: true }, '自定义布局'), Object.keys(layout.presets).map(name => h('option', { key: name, value: name }, name === 'development' ? '开发布局' : name === 'review' ? '审阅布局' : name))),
      button(labelled('layout', '编辑布局'), () => { setMenu(false); setTools(false); c.model.beginEdit(); }, { 'data-wb-edit-layout': true, 'aria-label': '编辑布局' }),
      button(state.savingLayout ? '正在保存…' : '保存布局', () => action(() => c.saveLayout()), { disabled: state.savingLayout }),
      button('恢复布局与备份', () => action(() => c.inspectLayout()), { disabled: state.savingLayout }),
      button('导入布局文件', () => importRef.current?.click()), button('导出布局', () => download('dshome-layout.json', c.exportLayout())),
      h('form', { onSubmit: event => { event.preventDefault(); const name = new FormData(event.currentTarget).get('preset'); action(() => { if (Object.hasOwn(layout.presets, name) && !window.confirm('覆盖同名布局预设？不会关闭现有内容。')) return; c.model.savePreset(name); c.notify('预设已记录；点击保存布局后可在下次打开时使用。'); }); } },
        h('input', { name: 'preset', 'aria-label': '新布局预设名称', placeholder: '预设名称（英文字母开头）', pattern: '[A-Za-z](?:[A-Za-z0-9_]|-){0,95}', maxLength: 96, required: true }), h('button', { type: 'submit' }, '保存为预设'))),
    h('input',{type:'file',webkitdirectory:'',multiple:true,hidden:true,ref:folderInput,'aria-label':'选择本机文件夹',onChange:e=>{const files=[...e.target.files];e.target.value='';action(async()=>{for(const root of snapshotFolders(files))await c.addLocalFolder(root);if(!files.length)c.notify('文件夹选择器未返回文件，空目录需要支持目录句柄的客户端。');});}}),
    h('input', {type:'file',multiple:true,hidden:true,ref:localInput,'aria-label':'选择本机文件',onChange:e=>{const files=[...e.target.files];e.target.value='';action(async()=>{for(const file of files)await c.openLocalFile(file);});}}),
    h('input', { ref: importRef, type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': '选择布局文件', onChange: event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return;
      action(async () => { if (file.size > 262144) throw Error('布局文件超过 256 KB'); const text = await file.text(); if (window.confirm('导入此项目的布局？现有内容会保留，未出现在布局中的模块将收起；不会保存文件或执行命令。')) c.importLayout(text); });
    } }),
    menu && !layout.editing && h('nav', { className: 'wb-add', 'aria-label': '新建内容' }, h('span', null, '选择要打开的内容'), c.model.modules().map(definition => button(labelled(definition.kind, ({ document: '打开文件', files: '文件浏览器', terminal: '新建终端', web: '打开网页', note: '新建便笺' })[definition.kind] ?? definition.label), () => action(() => { if (definition.kind === 'document') setPalette('files'); else showPanel(c.model.addPanel(definition.kind)); setMenu(false); }), { key: definition.kind }))),
    h(LayoutRecovery, { c, state, download }),
    state.terminalCleanup && (state.terminalCleanup.requests.length > 0 || state.terminalCleanup.overflow > 0) && h('section', { className: 'wb-terminal-cleanup', 'aria-label': '终端关闭任务', style: { padding: 8, maxHeight: 180, overflow: 'auto' } },
      state.terminalCleanup.requests.map(item => h('div', { key: item.id, 'data-close-terminal': item.id, role: item.phase === 'failed' ? 'alert' : 'status' },
        h('strong', null, item.phase === 'failed' ? '终端关闭失败，进程状态未确认：' : '终端关闭中，等待宿主确认：'), item.title, ' · ', item.id,
        item.message && h('span', null, ' · ' + item.message),
        item.phase === 'failed' && button('重试关闭', () => action(() => c.retryTerminalClose(item.id)), { 'aria-label': '重试关闭 ' + item.id }))),
      state.terminalCleanup.overflow > 0 && h('p', { role: 'alert' }, '另有关闭任务未装配；完成当前任务后重新核对，不会当作已结束。')),
    compact && h('nav', { className: 'wb-compact-switch', 'aria-label': '窄窗模块' }, h('span', null, '当前模块'), h('select', { 'aria-label': '切换当前模块', value: focused?.id ?? '', onChange: event => showPanel(event.target.value) }, serializedPanels.map(p => h('option', { key: p.id, value: p.id }, panelCaption(p, c.content(p.id)) + (layout.layout.collapsed.some(i => i.panelId === p.id) ? ' · 已收起' : '')))), h('small', null, '加宽操作区可显示多分区')),
    h('div', { className: 'wb-workarea' },
      h('div', { className: 'wb-stage', ref },
      h('div', { className: 'wb-canvas', style: { width: geometry.canvas.width, height: geometry.canvas.height }, 'aria-hidden': layout.editing ? 'true' : undefined, inert: layout.editing ? '' : undefined },
        // One stable direct parent and one stable key per content instance.
        // Layout edits never nest/reparent an iframe, textarea or xterm under a pane.
        serializedPanels.map(panel => {
          const rect = geometry.rectangles[panel.id], item = c.content(panel.id), collapsed = layout.layout.collapsed.some(x => x.panelId === panel.id);
          const showing = !!rect?.visible && !layout.editing && active;
          const style = { left: rect?.x ?? 0, top: rect?.y ?? 0, width: rect?.width ?? 1, height: rect?.height ?? 1, visibility: showing ? 'visible' : 'hidden', pointerEvents: showing ? 'auto' : 'none' };
          const tabs = serializedPanels.filter(p => geometry.rectangles[p.id]?.paneId === rect?.paneId);
          return h('article', { key: panel.id, className: 'wb-panel', style, 'data-wb-content': panel.id, 'data-wb-pane':rect?.paneId, 'aria-hidden': !showing, inert: !showing ? '' : undefined },
            h('header', { className: 'wb-panel-header', 'data-dock-handle':true, onPointerDown:e=>startDock(e,panel.id),title:'按住标题拖动：边缘分屏，中央合并标签；Esc 取消' }, icon(panel.kind, 16), h('strong', { title: panel.title + ' · ' + panel.id }, panel.kind === 'document' ? '文档' : panel.title),
              button(icon('minimize', 15), () => action(() => c.model.collapse(panel.id)), { 'aria-label': '收起 ' + panel.id, title: '收起 ' + panel.title }),
              button(icon(layout.layout.maximized === panel.id ? 'restore' : 'maximize', 15), () => action(() => c.model.maximize(panel.id)), { 'aria-label': layout.layout.maximized === panel.id ? '还原' : '放大', title: layout.layout.maximized === panel.id ? '还原模块' : '放大模块' }),
              button(icon('close', 15), () => action(() => c.closePanel(panel.id)), { 'aria-label': '关闭 ' + panel.id, title: '关闭 ' + panel.title })),
            h('nav', { className: 'wb-tabs', role: 'tablist', 'aria-label': panel.title + ' 标签' }, tabs.map((p, index) => h('span', { key: p.id, className: 'wb-tab-item', role: 'presentation' }, button(h(React.Fragment, null, icon(p.kind, 14), h('span', null, panelCaption(p, c.content(p.id))), (c.content(p.id).document?.getSnapshot().dirty || c.content(p.id).document?.getSnapshot().uncertain) && h('span', { className: 'wb-dirty-dot', 'data-uncertain': c.content(p.id).document?.getSnapshot().uncertain, 'aria-label': c.content(p.id).document?.getSnapshot().uncertain ? '保存结果待核对' : '未保存' })), () => showPanel(p.id), { key: p.id, role: 'tab', 'data-dock-handle':true,onPointerDown:e=>startDock(e,p.id), title: c.content(p.id).document?.getSnapshot().path ?? panelCaption(p, c.content(p.id)), tabIndex: p.id === panel.id ? 0 : -1, 'aria-selected': p.id === panel.id,
              onKeyDown: event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length; showPanel(tabs[next].id); requestAnimationFrame(() => sectionRef.current?.querySelector('[data-wb-content="' + tabs[next].id + '"] [role=tab][aria-selected=true]')?.focus()); } }), button(icon('close', 12), () => action(() => c.closePanel(p.id)), { className: 'wb-tab-close', 'aria-label': '关闭标签 ' + panelCaption(p, c.content(p.id)), title: '关闭 ' + panelCaption(p, c.content(p.id)), tabIndex: p.id === panel.id ? 0 : -1 })))),
            dockHint && dockHint.paneId===rect?.paneId && h('div',{className:'wb-dock-preview','data-edge':dockHint.edge},dockHint.edge==='tab'?'合并为标签':({left:'向左分屏',right:'向右分屏',top:'向上分屏',bottom:'向下分屏'})[dockHint.edge]),
            h('div', { className: 'wb-panel-body' }, h(Content, { item, c, openDocument, pickLocal, pickFolder, showPanel, workspaceFiles, inputActions, referenceReady, referenceCurrent, servicesAvailable, terminalAvailable, moduleRegistry, showing: showing && !collapsed })));
        }),
        geometry.handles.map(handle => h(SplitHandle, { key: handle.nodeId, handle, c }))),
      layout.editing && h(LayoutEditor, { c, room, selected: selection, select }),
      !geometry.fits && !layout.editing && h('span', { className: 'wb-size-hint', role: 'status' }, '操作区可滚动，或放大当前模块以专注处理。'))),
    !layout.editing && layout.layout.collapsed.length > 0 && h('nav', { className: 'wb-collapsed', 'aria-label': '已收起内容' }, layout.layout.collapsed.map(item => button('展开 ' + layout.panels[item.panelId].title + ' · ' + item.panelId, () => showPanel(item.panelId), { key: item.panelId }))),
    dragging && h('div',{className:'wb-drag-glass'},h('div',{className:'wb-drag-label',style:{left:Math.min(dragging.x+14,window.innerWidth-190),top:Math.min(dragging.y+14,window.innerHeight-50)}},dragging.title),h('span',null,dockHint?'松开完成停靠 · Esc 取消':'拖到其他模块，边缘分屏、中央合并 · Esc 取消')),
    fileHover && h('div',{className:'wb-file-drop-hint',role:'status'},layout.editing?'请先完成布局编辑':'松开以打开本机文件 · 不会添加到聊天附件'),
    h('footer', { className: 'wb-status', role: 'status' }, icon(state.notice ? 'connection' : 'check', 14), h('span', { className: 'wb-status-message', title: state.notice }, state.notice || '就绪 · 内容随工作区保留'),
      h('span', { className: 'wb-status-metrics' }, documents.length + ' 份文档' + (dirty ? ' · ' + dirty + ' 份待保存' : '')),
      button(icon('download', 14), () => download('dshome-layout.json', c.exportLayout()), { 'aria-label': '导出布局', title: '导出布局' }),
      state.storage === 'corrupt' && button('导出损坏记录', () => action(() => download('dshome-layout-original.json', c.exportLayoutOriginal()))),
      state.layoutBackupKey && button('导出最近布局备份', () => action(() => download('dshome-layout-backup.json', c.exportLayoutBackup())))),
    palette && active && h(CommandPalette, { key: palette, controller: c, openDocument, mode: palette, commands, onClose: () => { setPalette(null); requestAnimationFrame(() => { if (c.model.getSnapshot().editing) sectionRef.current?.querySelector('.wb-layout-editor button')?.focus(); }); } }));
}

function Content({ item, c, openDocument, pickLocal, pickFolder, showPanel, workspaceFiles, inputActions, referenceReady, referenceCurrent, showing, servicesAvailable, terminalAvailable, moduleRegistry }) {
  if (item.kind === 'files') return h(FileTree, { item, c, openDocument, pickLocal, pickFolder, showPanel, workspaceFiles });
  if (item.preview) return h(LocalPreview,{preview:item.preview,showing});
  if (item.kind === 'document') return item.document ? h(DocumentEditor, { doc: item.document, localFile: item.localFile, c, inputActions, referenceReady: referenceReady && !item.localFile, referenceCurrent, showing, servicesAvailable: item.localFile ? item.localWritable : servicesAvailable }) : h('div', { className: 'wb-empty' }, h('span', { className: 'wb-empty-mark' }, icon('document', 25)), h('strong', null, '从一个文件开始'), h('p', null, '从左侧文件树选择文件，或输入工作区内的路径。修改后使用保存文件，布局保存不会写入正文。'), h(OpenFile, { c, openDocument }));
  if (item.kind === 'terminal') return h(TerminalPanel, { item, c, showing, servicesAvailable: servicesAvailable && terminalAvailable(item), blockedReason: servicesAvailable === false ? '工作区接口暂停' : item.ownerSessionId && item.ownerSessionId !== c.sessionId ? '属于会话 ' + item.ownerSessionId + '，请返回该会话输入' : '原终端连接已变化，请新建终端' });
  if (item.kind === 'web') return h(WebPanel, { item, c });
  if (item.kind === 'note') return h('section', { className: 'wb-note-body' },
    h('p', { className: 'wb-note-guide' }, '记录灵感、待办和摘录。便笺留在本次现场，刷新前记得导出。'),
    h('textarea', { className: 'wb-note', 'aria-label': '便笺内容 ' + item.id, value: item.noteText, placeholder: '让想法先落在这里…', maxLength: 262144, onChange: e => c.editNote(item.id, e.target.value) }),
    button(labelled('download', '导出便笺'), () => { try { downloadDraft(item.id + '.txt', item.noteText); } catch (error) { c.notify(errorText(error)); } }, { 'aria-label': '导出便笺' }));
  return h(ModuleView, {registry:moduleRegistry,item,controller:c,active:showing});
}
function OpenFile({ c, openDocument }) {
  const [path, setPath] = React.useState('');
  return h('form', { onSubmit: e => { e.preventDefault(); openDocument(path).catch(e => c.notify(errorText(e))); } },
    h('input', { 'aria-label': '文档路径', value: path, placeholder: 'docs/example.md', onChange: e => setPath(e.target.value) }), h('button', { type: 'submit', disabled: !path.trim() }, '打开文档'));
}
function FileTree({ item, c, openDocument, pickLocal, pickFolder, showPanel, workspaceFiles }) {
  const [filter, setFilter] = React.useState(''), [hidden, showHidden] = React.useState(false), [refresh, setRefresh] = React.useState(0);
  return h('div', { className: 'wb-files' }, h('div', { className: 'wb-file-tools' }, h('input', { 'aria-label': '筛选已列出的文件', placeholder: '筛选已展开的文件', value: filter, onChange: e => setFilter(e.target.value) }),
    filter && button(icon('close', 15), () => setFilter(''), { 'aria-label': '清空文件筛选' }), button(icon('refresh', 15), () => setRefresh(refresh + 1), { 'aria-label': '刷新文件树', title: '刷新文件树' }), button(icon('eye', 15), () => showHidden(!hidden), { 'aria-label': '显示隐藏文件', title: '显示隐藏文件', 'aria-pressed': hidden })),
    h('details', {open:true,className:'wb-file-root'}, h('summary',null,'本机文件'),
      button(labelled('plus','添加本机文件'),pickLocal,{'aria-label':'打开本机文件',title:'选择文本、图片、PDF、Office 或音视频文件'}),
      button(labelled('files','添加本机文件夹'),pickFolder,{'aria-label':'添加本机文件夹'}),
      h('div',{role:'tree','aria-label':'本机文件夹'},[...c.localRoots.values()].map(root=>h('div',{key:root.id},h(LocalDirectory,{handle:root.handle,c,filter,hidden,refresh}),button('移除',()=>c.removeLocalFolder(root.id),{'aria-label':'移除本机文件夹 '+root.handle.name,title:'仅从列表移除，已打开文件保留'}),root.handle.snapshot&&h('small',null,'只读来源 · 不会自动同步目录新增文件')))),
      h('div',{role:'tree','aria-label':'本机文件'}, [...c.contents.values()].filter(i=>i.localFile && (i.localName??i.document?.getSnapshot().path??'').toLowerCase().includes(filter.toLowerCase())).map(i=>h('div',{key:i.id,role:'treeitem'},button(h(React.Fragment,null,icon('document',15),h('span',null,i.localName??i.document?.getSnapshot().path),h('small',null,i.preview?'预览':i.localWritable?'':'副本')),()=>showPanel(i.id),{className:'wb-tree-entry','aria-label':'打开本机文件 '+(i.localName??i.document?.getSnapshot().path),'aria-current':c.getSnapshot().focusedPanelId===i.id?true:undefined})))),
      ![...c.contents.values()].some(i=>i.localFile)&&h('p',null,'选择或拖入的文件会显示在这里。')),
    h('strong',{className:'wb-file-root-label'},'工作区文件'),
    h('div', { role: 'tree', 'aria-label': '工作区文件', className: 'wb-file-tree' }, h(Directory, { path: '.', c, item, openDocument, workspaceFiles, filter, hidden, refresh, depth: 0 })),
    h('details', { className: 'wb-open-path' }, h('summary', null, '按路径打开文件'), h(OpenFile, { c, openDocument })));
}
function Directory({ path, c, item, openDocument, workspaceFiles, filter, hidden, refresh, depth }) {
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
    return h('div', { key: child, role: 'treeitem', 'aria-level': depth + 1, 'aria-expanded': entry.type === 'directory' ? item.expanded.has(child) : undefined }, button(h(React.Fragment, null, icon(entry.type === 'directory' ? 'files' : 'document', 15), h('span', null, entry.name)), () => {
      if (entry.type === 'directory') { if (item.expanded.has(child)) item.expanded.delete(child); else item.expanded.add(child); c.updateContent(item.id, {}); }
      else if (entry.type === 'file') { c.updateContent(item.id, { selection: child }); openDocument(child).catch(e => c.notify(errorText(e))); }
    }, { className: 'wb-tree-entry', title: child, 'aria-label': entry.type === 'file' ? '打开文件 ' + entry.name : (item.expanded.has(child) ? '收起文件夹 ' : '展开文件夹 ') + entry.name, 'aria-current': item.selection === child ? true : undefined, disabled: entry.type === 'other', style: { paddingLeft: 8 + depth * 12 }, 'aria-expanded': entry.type === 'directory' ? item.expanded.has(child) : undefined,
      onKeyDown: event => {
        if (!['ArrowDown','ArrowUp','Home','End','ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault();
        const node = event.currentTarget, list = [...node.closest('.wb-files').querySelectorAll('.wb-tree-entry:not(:disabled)')], index = list.indexOf(node);
        if (event.key === 'ArrowLeft' && entry.type === 'directory' && item.expanded.has(child)) { item.expanded.delete(child); c.updateContent(item.id, {}); return; }
        if (event.key === 'ArrowRight' && entry.type === 'directory' && !item.expanded.has(child)) { item.expanded.add(child); c.updateContent(item.id, {}); return; }
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : Math.max(0, Math.min(list.length - 1, index + (['ArrowUp','ArrowLeft'].includes(event.key) ? -1 : 1))); list[target]?.focus();
      } }),
    entry.type === 'directory' && depth < 32 && h(Directory, { path: child, item, c, openDocument, workspaceFiles, filter, hidden, refresh, depth: depth + 1 }));
  }), state.truncated && h('p', { role: 'status' }, '目录已达到宿主条目上限，未显示的文件可用路径打开。'), button('刷新目录', () => retry(attempt + 1)));
}
function DocumentEditor({ doc, localFile = false, c, inputActions, referenceReady, referenceCurrent, showing, servicesAvailable }) {
  const s = useSource(doc), ref = React.useRef(null), gutterRef = React.useRef(null), gutterRange = React.useRef(''), lineCount = React.useRef(1), findRef = React.useRef(null), [preview, setPreview] = React.useState(false), [finding, setFinding] = React.useState(false), [query, setQuery] = React.useState(''), [sensitive, setSensitive] = React.useState(false);
  const projection = React.useMemo(() => textareaProjection(s.text), [s.text]), loaded = s.version !== null;
  const matches = React.useMemo(() => documentMatches(projection.text, query, sensitive), [projection.text, query, sensitive]);
  lineCount.current = React.useMemo(() => projection.text.split('\n').length, [projection.text]);
  const syncGutter = React.useCallback(node => {
    const gutter = gutterRef.current; if (!gutter || !node) return;
    const first = Math.max(1, Math.floor((node.scrollTop - 18) / 24) + 1), count = Math.max(0, Math.min(Math.ceil(node.clientHeight / 24) + 3, lineCount.current - first + 1));
    const range = first + ':' + count;
    if (range !== gutterRange.current) { gutter.textContent = Array.from({ length: count }, (_, i) => first + i).join('\n'); gutterRange.current = range; }
    gutter.style.transform = 'translateY(' + (18 + (first - 1) * 24 - node.scrollTop) + 'px)';
  }, []);
  React.useLayoutEffect(() => { gutterRange.current = ''; syncGutter(ref.current); }, [projection.text, showing, preview, loaded]);
  React.useEffect(() => { const node = ref.current; if (!node) return; const observer = new ResizeObserver(() => syncGutter(node)); observer.observe(node); syncGutter(node); return () => observer.disconnect(); }, [preview, loaded]);

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
    const node = ref.current; node.scrollTop = s.scrollTop; node.scrollLeft = s.scrollLeft; syncGutter(node);
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
    h('div', { className: 'wb-document-toolbar' }, localFile && h('span', {className:'wb-local-source'}, servicesAvailable ? '本机文件' : '本机副本 · 请导出保存'), h('span', { title: s.path }, s.path.split(/[\\/]/).slice(-3).join(' / ')), h('small', { 'data-dirty': s.dirty, 'data-uncertain': s.uncertain }, s.uncertain ? '保存待核对' : s.dirty ? '待保存' : '已保存'),
      button(icon(preview ? 'document' : 'eye', 16), () => setPreview(!preview), { 'aria-label': preview ? '编辑' : '预览', title: preview ? '返回编辑' : '阅读预览' }),
      button(icon('search', 16), () => { setPreview(false); setFinding(!finding); requestAnimationFrame(() => findRef.current?.focus()); }, { 'aria-label': '查找', 'aria-expanded': finding, title: '查找 · Ctrl/⌘+F' }),
      button(labelled('quote', '引用'), reference, { 'aria-label': '引用选区到对话', title: '引用所选文字到对话草稿', disabled: !referenceReady || s.selectionStart === s.selectionEnd, onMouseDown: e => e.preventDefault() }),
      button(icon('download', 16), () => { try { downloadDraft(s.path, s.text); } catch (error) { c.notify(errorText(error)); } }, { 'aria-label': '导出草稿', title: '导出当前草稿' }),
      button(icon('compare', 16), () => doc.compareDisk().catch(error => c.notify(errorText(error))), { disabled: s.comparing || s.phase === 'saving' || servicesAvailable === false, 'aria-label': '比较磁盘', title: s.comparing ? '正在比较磁盘…' : '与磁盘版本比较' }),
      s.comparing && button('取消比较', () => doc.cancelComparison()),
      button(labelled('save', s.phase === 'saving' ? '保存中' : '保存'), save, { className: 'wb-primary', disabled: !canSave, 'aria-label': '保存文件', title: servicesAvailable === false ? (localFile ? '没有原文件写入句柄，请导出草稿' : '工作区接口暂停，草稿可继续编辑与导出') : '保存文件 · Ctrl/⌘+S' })),
    finding && h('form', { className: 'wb-find', onSubmit: event => { event.preventDefault(); find(1); }, 'aria-label': '文档查找' },
      h('input', { ref: findRef, 'aria-label': '查找文本', value: query, maxLength: 256, onChange: event => setQuery(event.target.value) }),
      button('Aa', () => setSensitive(!sensitive), { 'aria-label': '区分大小写', 'aria-pressed': sensitive }),
      h('span', { role: 'status' }, query ? matches.length ? matches.length + (matches.length === 10000 ? '+' : '') + ' 处匹配' : '没有匹配' : '输入查找内容'),
      button('↑', () => find(-1), { 'aria-label': '上一个匹配', disabled: !matches.length }), button('↓', () => find(1), { 'aria-label': '下一个匹配', disabled: !matches.length }), button('×', () => { setFinding(false); ref.current?.focus(); }, { 'aria-label': '关闭文档查找' })),
    s.uncertain && h('p', { role: 'alert' }, '上次保存结果未知，草稿保留。', button('核对磁盘结果', () => doc.reconcile().then(result => c.notify(result.kind === 'conflict' ? '磁盘已变化，需要比较处理，未覆盖草稿。' : '已核对：' + result.kind)).catch(e => c.notify(errorText(e))))),
    s.error && h('p', { role: 'alert' }, errorText(s.error)),
    h(DocumentRecovery, { doc, state: s, notify: text => c.notify(text), hideActions: true }),
    // Preview escapes as React text; repository HTML never becomes host markup.
    preview ? h('pre', { className: 'wb-document-preview', tabIndex: 0 }, s.text) : h('div', { className: 'wb-code-frame' }, h('div', { className: 'wb-line-gutter', 'aria-hidden': true, style: { width: Math.max(47, String(lineCount.current).length * 8 + 16) } }, h('pre', { className: 'wb-line-numbers', ref: gutterRef })), h('textarea', { ref, wrap: 'off', className: 'wb-editor', 'aria-label': '编辑 ' + s.path, value: projection.text, spellCheck: false,
      onChange: e => { const text = applyTextareaEdit(s.text, e.currentTarget.value); doc.edit(text); retainView(e, text); }, onSelect: e => retainView(e), onKeyUp: e => retainView(e), onPointerUp: e => retainView(e), onScroll: e => { syncGutter(e.currentTarget); retainView(e); } })),
    h('small', { className: 'wb-document-position' }, '第 ' + position.line + ' 行，第 ' + position.column + ' 列 · ' + (s.text.includes('\r\n') ? 'CRLF' : 'LF') + ' · Ctrl/⌘+S 保存，Ctrl/⌘+F 查找'));
}
function WebPanel({ item, c }) {
  const [status, setStatus] = React.useState(''), [error, setError] = React.useState('');
  return h('section', { className: 'wb-web' },
    h('form', { onSubmit: e => { e.preventDefault(); try { c.navigate(item.id, item.addressInput.trim(), location.origin); setError(''); setStatus('正在请求网页…'); } catch (e) { setError(errorText(e)); } } },
      h('input', { type: 'url', maxLength: 8192, 'aria-label': '网页地址', value: item.addressInput, placeholder: 'https://…', onChange: e => c.updateContent(item.id, { addressInput: e.target.value }) }), h('button', { type: 'submit', disabled: !item.addressInput.trim() }, '前往'),
      button(icon('refresh', 16), () => { if (window.confirm('重新加载会丢失此网页中未提交的表单，确定吗？')) { setStatus('正在重新请求网页…'); c.updateContent(item.id, { webRevision: (item.webRevision ?? 0) + 1 }); } }, { disabled: !item.url, 'aria-label': '重新加载网页', title: '重新加载当前网页' })),
    error && h('p', { role: 'alert', className: 'wb-web-status' }, error),
    item.url ? h('iframe', { key: item.contentId + ':' + (item.webRevision ?? 0), title: '网页 ' + item.id, src: item.url, sandbox: 'allow-scripts allow-forms allow-popups allow-downloads', referrerPolicy: 'no-referrer', 'data-wb-iframe': item.id, onLoad: () => setStatus('载体已响应；若页面不可用，可在浏览器打开。') }) : h('div', { className: 'wb-empty' }, h('span', { className: 'wb-empty-mark' }, icon('web', 25)), h('strong', null, '让参考资料待在手边'), h('p', null, '输入 HTTP(S) 地址即可打开。部分站点不支持嵌入，可使用浏览器打开。')),
    item.url && h('div', { className: 'wb-web-status' }, h('span', { role: 'status' }, status), h('a', { href: item.url, target: '_blank', rel: 'noreferrer noopener' }, '在浏览器打开 ↗')));
}
function TerminalPanel({ item, c, showing, servicesAvailable, blockedReason }) {
  if (!item.started) return h('div', { className: 'wb-empty' }, h('span', { className: 'wb-empty-mark' }, icon('terminal', 25)), h('strong', null, '需要时，再打开终端'), h('p', null, servicesAvailable === false ? blockedReason : '只在你点击后启动。切换布局时，命令和进程会留在原处。'), button(labelled('terminal', '启动终端'), () => { try { c.startTerminal(item.id); } catch (e) { c.notify(errorText(e)); } }, { 'aria-label': '启动终端', disabled: servicesAvailable === false }));
  return h(TerminalScreen, { view: item.view, showing, servicesAvailable, blockedReason, onError: e => c.notify(errorText(e)) });
}
function TerminalScreen({ view, showing, onError, servicesAvailable = true, blockedReason }) {
  const state = useSource(view.state), ref = React.useRef(null), termRef = React.useRef(null), fitRef = React.useRef(null), rendered = React.useRef(-1), presentation = terminalState(state), writable = servicesAvailable && presentation.canInput, inputAllowed = React.useRef(false); inputAllowed.current = writable;
  React.useEffect(() => {
    const terminal = new Terminal({ disableStdin: true, cursorBlink: true, fontSize: 13, scrollback: 3000, allowProposedApi: false, theme: { background: '#151a23', foreground: '#dce6f4', cursor: '#85b7ff', selectionBackground: '#5277b855' } });
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
      h('label', null, '目标分区', h('select', { value: pane ?? '', onChange: e => setTarget(e.target.value) }, paneIds.map((id, index) => h('option', { key: id, value: id }, '分区 ' + (index + 1))))),
      h('label', null, '放置方式', h('select', { value: edge, onChange: e => setEdge(e.target.value) }, [['left','左侧分割'],['right','右侧分割'],['top','上方分割'],['bottom','下方分割'],['tab','合并为标签组']].map(([value,label]) => h('option', { key: value, value }, label)))),
      button('放到目标分区', () => action(() => c.model.dock(selected, pane, edge)), { disabled: !box || !pane }),
      button('收起所选模块', () => action(() => c.model.collapse(selected)), { disabled: !box || draft.layout.collapsed.some(i => i.panelId === selected) }),
      button('展开所选模块', () => action(() => c.model.expand(selected)), { disabled: !draft.layout.collapsed.some(i => i.panelId === selected) }),
      h('label', null, '交换对象', h('select', { 'aria-label': '交换对象', defaultValue: '', onChange: e => { if (e.target.value) action(() => c.model.swap(selected, e.target.value)); e.target.value = ''; }, disabled: !box }, h('option', { value: '' }, '选择另一现有实例交换'), panels.filter(p => p.id !== selected).map(p => h('option', { key: p.id, value: p.id }, p.title + ' · ' + p.id)))),
      button('撤销', () => c.model.undo(), { disabled: !state.canUndo }), button('重做', () => c.model.redo(), { disabled: !state.canRedo })),
    h('aside', { className: 'wb-module-properties' }, h('h3', null, '模块属性'), box ? h(React.Fragment, null,
      h('label', null, '显示名称', h('input', { value: box.title, maxLength: 120, onChange: e => action(() => c.model.renamePanel(selected, e.target.value)) })),
      h('p', null, '模块类型：' + (c.model.modules().find(def => def.kind === box.kind)?.label ?? box.kind)), h('p', null, '内容生命周期：切布局保留，关闭内容单独确认。'), h('p', null, '保存布局不会保存文档草稿或执行终端命令。')) : h('p', null, '选择已有实例或添加新模块。')));
}
export const css = terminalCSS + chromeCSS + modernCSS;
