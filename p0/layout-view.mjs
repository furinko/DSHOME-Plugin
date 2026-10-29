import React from 'react';
import { layoutNodes } from './panels.mjs';
const h = React.createElement;
const useStore = model => React.useSyncExternalStore(model.subscribe, model.getSnapshot);
const rectStyle = r => ({ position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, boxSizing: 'border-box' });

export function LayoutControls({ model, guarded }) {
  const state = useStore(model), draft = state.editing;
  const nodes = layoutNodes((draft ?? state).layout.root), splits = nodes.filter(n => n.type === 'split');
  const [selected, select] = React.useState(''), split = splits.find(n => n.id === selected) ?? splits[0];
  const panes = nodes.filter(n => n.type === 'pane' && n.tabs.length);
  const [panelId, setPanel] = React.useState('panel-web');
  const [targetId, setTarget] = React.useState('pane-root');
  const [edge, setEdge] = React.useState('tab');
  const target = panes.find(n => n.id === targetId) ?? panes[0];
  const button = (label, fn, disabled = false) => h('button', { type: 'button', disabled, onClick: () => guarded(fn) }, label);
  return h('div', { className: 'p0-layout-controls', role: 'group', 'aria-label': '操作区布局编辑' },
    !draft ? button('编辑布局', () => model.beginEdit()) : h(React.Fragment, null,
      h('small', null, '草稿不改变现场；应用后生效'),
      splits.length > 0 && h(React.Fragment, null,
        h('select', { 'aria-label': '选择分割', value: split.id, onChange: e => select(e.target.value) }, splits.map(n => h('option', { key: n.id, value: n.id }, n.id))),
        h('label', null, '分割方向', h('select', { 'aria-label': '分割方向', value: split.axis, onChange: e => guarded(() => model.setSplitAxis(split.id, e.target.value)) }, h('option', { value: 'x' }, '左右'), h('option', { value: 'y' }, '上下'))),
        h('label', null, '分割比例', h('input', { type: 'range', 'aria-label': '分割比例', min: 20, max: 80, value: Math.round(split.ratio * 100), onChange: e => guarded(() => model.resize(split.id, Number(e.target.value) / 100)) }))),
      h('select', { 'aria-label': '移动面板', value: panelId, onChange: e => setPanel(e.target.value) }, Object.values(draft.panels).map(p => h('option', { key: p.id, value: p.id }, p.title))),
      h('select', { 'aria-label': '目标分区', value: target?.id ?? '', onChange: e => setTarget(e.target.value) }, panes.map(p => h('option', { key: p.id, value: p.id }, p.tabs.map(id => draft.panels[id].title).join(' / ')))),
      h('select', { 'aria-label': '停靠方式', value: edge, onChange: e => setEdge(e.target.value) }, [['tab','合并标签'],['left','左侧分割'],['right','右侧分割'],['top','上方分割'],['bottom','下方分割']].map(([value,label]) => h('option', { key: value, value }, label))),
      button('移动面板', () => model.dock(panelId, target.id, edge), !target),
      button('交换位置', () => model.swap('panel-note', 'panel-web')),
      button('撤销布局修改', () => model.undo(), !state.canUndo), button('重做布局修改', () => model.redo(), !state.canRedo),
      button('取消', () => model.cancelEdit()), button('应用布局', () => model.applyEdit())));
}

export function LayoutCanvas({ model, guarded, children }) {
  const state = useStore(model), root = React.useRef(null), [room, setRoom] = React.useState({ width: 0, height: 0 });
  React.useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; setRoom(old => old.width === width && old.height === height ? old : { width, height }); });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  const geometry = model.geometry(room.width, room.height), nodes = layoutNodes(state.layout.root);
  const panels = React.Children.toArray(children);
  return h(React.Fragment, null,
    h('div', { className: 'p0-panel-shelf' }, state.layout.collapsed.map(p => h('button', { key: p.panelId, disabled: !!state.editing, onClick: () => guarded(() => model.expand(p.panelId)) }, '展开' + state.panels[p.panelId].title))),
    h('div', { className: 'p0-layout-viewport', ref: root },
      h('div', { className: 'p0-tools p0-layout-canvas', 'data-layout-axis': state.layout.root.axis ?? 'tab', style: { position: 'relative', width: geometry.canvas.width, height: geometry.canvas.height } },
        // Content children ALWAYS remain under this same parent in fixed order.
        // Geometry/visibility only: no portals, DOM reparenting or keyed pane wrappers.
        panels.map(child => {
          const id = child.props['data-panel-id'], r = geometry.rectangles[id];
          return React.cloneElement(child, { hidden: !r?.visible, inert: !r?.visible ? '' : undefined, style: { ...rectStyle(r ?? { x:0,y:0,width:0,height:0 }), top: (r?.y ?? 0) + 38, height: Math.max(0, (r?.height ?? 0) - 38) } });
        }),
        nodes.filter(n => n.type === 'pane' && geometry.paneRects[n.id]).map(pane => h('div', { key: pane.id, className: 'p0-pane-bar', style: { ...rectStyle(geometry.paneRects[pane.id]), height: 38 } },
          h('div', { role: 'tablist', 'aria-label': '面板标签' }, pane.tabs.map(id => h('button', { key: id, role: 'tab', 'aria-selected': pane.active === id, disabled: !!state.editing, onClick: () => guarded(() => model.activate(id)) }, state.panels[id].title))),
          h('button', { 'aria-label': '放大或还原' + state.panels[pane.active].title, disabled: !!state.editing, onClick: () => guarded(() => model.maximize(pane.active)) }, state.layout.maximized ? '还原' : '放大'),
          h('button', { 'aria-label': '收起' + state.panels[pane.active].title, disabled: !!state.editing, onClick: () => guarded(() => model.collapse(pane.active)) }, '收起'))),
        geometry.handles.map(handle => h('div', { key: handle.nodeId, role: 'separator', tabIndex: state.editing ? -1 : 0, 'aria-disabled': !!state.editing, 'aria-label': '调整分割 ' + handle.nodeId, 'aria-orientation': handle.axis === 'x' ? 'vertical' : 'horizontal', 'aria-valuemin': 1, 'aria-valuemax': 99, 'aria-valuenow': Math.round(handle.ratio * 100), className: 'p0-panel-separator', style: rectStyle(handle),
          onKeyDown(e) { if (state.editing || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return; e.preventDefault(); guarded(() => model.resize(handle.nodeId, handle.ratio + (['ArrowLeft','ArrowUp'].includes(e.key) ? -.05 : .05))); },
        })))));
}

export const layoutCSS = `
.p0-layout-viewport{position:relative;flex:1;min-height:260px;min-width:0;overflow:auto}
.p0-tools.p0-layout-canvas{display:block;min-height:0}
.p0-layout-canvas article[hidden]{display:none}
.p0-pane-bar{display:flex;gap:4px;align-items:center;overflow:auto;background:var(--dsw-alias-bg-base)}
.p0-pane-bar [role=tablist]{display:flex;flex:1;gap:4px;min-width:0}
.p0-pane-bar button{white-space:nowrap;padding:3px 8px}
.p0-pane-bar [aria-selected=true]{border-color:#285ad8;color:#285ad8}
.p0-panel-separator{background:color-mix(in srgb,var(--dsw-alias-border-l2) 45%,transparent)}
.p0-panel-separator:focus{outline:2px solid #285ad8}
.p0-panel-shelf:empty{display:none}
`;
