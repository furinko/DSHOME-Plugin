import React from 'react';
import { Icon } from './icons.mjs';
import { fileName, friendlyError } from './presentation.mjs';
const h = React.createElement;
export function CommandPalette({ controller, openDocument, mode: initialMode, commands, onClose }) {
  const [mode, setMode] = React.useState(initialMode), [query, setQuery] = React.useState(''), [selected, select] = React.useState(0), [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const dialog = React.useRef(null), input = React.useRef(null), restoreFocus = React.useRef(true), request = React.useRef(null), resultId = React.useId();
  React.useLayoutEffect(() => {
    const previous = document.activeElement, node = dialog.current;
    node.showModal(); input.current.focus();
    return () => { request.current?.abort(); node.close(); if (restoreFocus.current && previous?.isConnected && !previous.closest('[inert],[hidden]')) previous.focus({ preventScroll: true }); };
  }, []);
  const documents = [...controller.contents.values()].filter(i => !i.localFile && i.document?.getSnapshot().version != null);
  const recent = documents.map(item => { const state = item.document.getSnapshot(); return { id: item.id, icon: 'document', title: fileName(state.path), detail: state.path, dirty: state.dirty || state.uncertain, uncertain: state.uncertain, run: signal => openDocument(state.path, { signal }) }; });
  const needle = query.trim().toLocaleLowerCase();
  const rows = (mode === 'files' ? recent : commands).filter(row => !needle || (row.title + ' ' + (row.detail ?? '')).toLocaleLowerCase().includes(needle));
  if (mode === 'files' && query.trim() && !recent.some(row => row.detail === query.trim())) rows.push({ id: 'open-path', icon: 'plus', title: '打开路径：' + query.trim(), detail: '相对于当前工作区；仅在确认后读取', run: signal => openDocument(query.trim(), { signal }) });
  const active = Math.min(selected, Math.max(0, rows.length - 1));
  React.useEffect(() => { dialog.current?.querySelector('[role=option][aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [active, query, mode]);
  async function run(row) {
    if (!row || busy) return;
    const life = new AbortController(); request.current = life; setBusy(true); setError('');
    try { await row.run(life.signal); if (life.signal.aborted) return; restoreFocus.current = mode !== 'files'; onClose(); }
    catch (failure) { if (life.signal.aborted) return; setError(friendlyError(failure)); setBusy(false); requestAnimationFrame(() => input.current?.focus()); }
  }
  return h('dialog', { className: 'wb-palette', ref: dialog, 'aria-label': mode === 'files' ? '快速打开文件' : '命令面板', onCancel: event => { event.preventDefault(); onClose(); }, onClick: event => { if (event.target === dialog.current) onClose(); }, onKeyDown: event => {
    if (event.key !== 'Tab') return;
    const stops = [...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node => node.tabIndex >= 0);
    const first = stops[0], last = stops.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last) || !dialog.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
  } },
    h('div', { className: 'wb-palette-surface' },
      h('header', null, h('div', { role: 'group', 'aria-label': '快捷面板模式' }, ...[['files', '打开文件'], ['commands', '命令']].map(([value, title]) => h('button', { key: value, type: 'button', 'aria-pressed': mode === value, disabled: busy, onClick: () => { setMode(value); setQuery(''); select(0); setError(''); input.current.focus(); } }, title))), h('button', { type: 'button', 'aria-label': '关闭快捷面板', onClick: onClose }, h(Icon, { name: 'close' }))),
      h('div', { className: 'wb-palette-query' }, h(Icon, { name: mode === 'files' ? 'search' : 'command' }), h('input', { ref: input, value: query, role: 'combobox', 'aria-label': '快速打开或搜索命令', 'aria-autocomplete': 'list', 'aria-expanded': true, 'aria-controls': resultId, 'aria-activedescendant': rows[active] ? resultId + '-' + active : undefined, placeholder: mode === 'files' ? '输入文件路径，或选择已打开文档…' : '搜索你想执行的操作…', maxLength: 8192, disabled: busy, onChange: event => { setQuery(event.target.value); select(0); setError(''); }, onKeyDown: event => {
        if (event.nativeEvent.isComposing) return;
        if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(1, rows.length)); }
        if (event.key === 'Enter') { event.preventDefault(); run(rows[active]); }
      } })),
      error && h('p', { role: 'alert', className: 'wb-palette-error' }, error),
      h('div', { role: 'listbox', id: resultId, 'aria-label': mode === 'files' ? '已打开文档与路径' : '可用命令', className: 'wb-palette-results' }, rows.length ? rows.map((row, index) => h('button', { key: row.id, id: resultId + '-' + index, type: 'button', role: 'option', 'aria-selected': index === active, tabIndex: -1, disabled: busy, onMouseMove: () => select(index), onClick: () => run(row) }, h(Icon, { name: row.icon ?? 'command' }), h('span', null, h('strong', null, row.title), row.detail && h('small', null, row.detail)), row.dirty && h('span', { className: 'wb-dirty-dot', 'data-uncertain': row.uncertain, 'aria-label': row.uncertain ? '保存结果待核对' : '未保存' }), row.shortcut && h('kbd', null, row.shortcut))) : h('div', { className: 'wb-palette-empty' }, h(Icon, { name: 'search', size: 28 }), h('strong', null, mode === 'files' ? '从一个文件开始' : '没有匹配的命令'), h('p', null, mode === 'files' ? '输入工作区中的完整相对路径，按 Enter 打开。' : '试试“布局”“终端”或“导出”。'))),
      h('footer', null, h('span', null, busy ? '正在处理…' : '↑ ↓ 选择 · Enter 确认'), h('span', null, 'Esc 关闭'))));
}
