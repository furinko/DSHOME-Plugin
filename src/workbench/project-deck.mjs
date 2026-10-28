import React from 'react';
import { lifecycleBoundaryText } from './reload-state.mjs';
import { Workspace } from './ui.mjs';
const h = React.createElement;
export function ProjectDeck({ shelf, inputActions, activeWorkspace = true, referenceReady, referenceCurrent, onOriginal, servicesAvailable = true, onRefreshServices, onCloseWorkspace, reloadNotice }) {
  const state = React.useSyncExternalStore(shelf.subscribe, shelf.getSnapshot), [attempt, retry] = React.useState(0);
  React.useEffect(() => { const life = new AbortController(); Promise.resolve().then(() => shelf.ensure(life.signal)).catch(error => shelf.report(error)); return () => life.abort(); }, [shelf, attempt]);
  const act = fn => { try { Promise.resolve(fn()).catch(error => shelf.report(error)); } catch (error) { shelf.report(error); } };
  const select = shelf.selected(), project = select?.project;
  const projectLabel = (project?.workspaceRoot ?? '').split(/[\\/]/).filter(Boolean).at(-1) || '当前项目';
  return h('section', { className: 'wb-project-host', style: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 } },
    h('header', { className: 'wb-project-context' }, h('strong', null, '操作区'), h('span', { title: project?.workspaceRoot }, projectLabel),
    h('details', { className: 'wb-project-settings' }, h('summary', null, '项目设置'),
    h('nav', { className: 'wb-project-toolbar', 'aria-label': '会话项目' },
      h('label', { className: 'wb-project-label' }, '保留项目 ', h('select', { 'aria-label': '保留项目', value: state.selected ?? '', disabled: state.busy || !state.projects.length, onChange: e => act(() => shelf.select(e.target.value)) }, state.projects.map(entry => h('option', { key: entry.project.key, value: entry.project.key }, entry.project.workspaceRoot ?? entry.project.key)))),
      h('button', { type: 'button', disabled: state.busy, onClick: () => act(() => shelf.check()) }, '检查 Host 项目'),
      h('button', { type: 'button', disabled: state.busy, onClick: () => act(() => shelf.openCurrent()) }, '打开 Host 当前项目'),
      h('button', { type: 'button', disabled: state.busy || !project, onClick: () => act(() => shelf.close(project.key)) }, '关闭所选项目'),
      onCloseWorkspace && h('button', { type: 'button', disabled: state.busy, onClick: () => act(onCloseWorkspace) }, '关闭工作空间'),
      onRefreshServices && h('button', { type: 'button', title: '只重新装配客户端接口，不重启宿主、不重建内容或进程', onClick: () => act(onRefreshServices) }, '重新接入文件接口'),
      state.busy && h('span', { role: 'status' }, '核对项目…')),
    h('details', { className: 'wb-lifecycle-help' }, h('summary', null, '更新与退出限制'), h('p', null, lifecycleBoundaryText)))),
    reloadNotice && h('p', { role: 'status' }, reloadNotice),
    !servicesAvailable && h('p', { role: 'status' }, '工作区接口暂停；草稿仍可编辑和导出，不会自动改绑。'),
    state.error && h('div', { role: 'alert', style: { padding: 6 } }, state.error.message, !state.projects.length && h('button', { type: 'button', onClick: () => retry(attempt + 1) }, '重试')),
    state.observed && state.selected && state.observed.key !== state.selected && h('p', { role: 'status', style: { padding: 6, margin: 0 } }, '正在查看保留项目；Host 当前项目已不同。旧草稿和终端未改绑，文件操作仍受原项目保护。'),
    h('div', { className: 'wb-project-deck', style: { position: 'relative', flex: '1 1 auto', minHeight: 0 } }, state.projects.map(entry => {
      const active = activeWorkspace && state.selected === entry.project.key;
      return h('div', { key: entry.project.key, 'data-retained-project': entry.project.key, 'aria-hidden': !active, inert: active ? undefined : '', style: { position: 'absolute', inset: 0, visibility: active ? 'visible' : 'hidden', pointerEvents: active ? 'auto' : 'none' } }, h(Workspace, {
        servicesAvailable, controller: entry.controller, workspaceFiles: entry.workspaceFiles, inputActions, referenceReady, active,
        referenceCurrent: () => active && referenceCurrent(entry.controller), onOriginal,
      }));
    })));
}
