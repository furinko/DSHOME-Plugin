import React from 'react';
import { createSceneStore, parseWebAddress } from './scene-store.mjs';
const h = React.createElement;
const useState = store => React.useSyncExternalStore(store.subscribe, store.getSnapshot);

export function install(ctx) {
  const store = createSceneStore({ workspaces: ctx.workspaces.list, session: ctx.uiSession.current, connection: ctx.connection.generation });
  const style = document.createElement('style'); style.dataset.plugin = 'dshome-dual-shell-p0'; style.textContent = css; document.head.append(style);
  ctx.effect(() => () => { store.dispose(); style.remove(); });
  ctx.reflect.provide('dualShellP0', store);
  return store;
}

export function Frame({ NativeFrame, ...props }) {
  const view = useState(props.dualShell);
  return h('div', { className: 'p0-shell', 'data-p0-shell': true },
    h('header', { className: 'p0-toolbar' },
      h('strong', null, 'DSHOME'),
      h('div', { role: 'group', 'aria-label': '整窗模式' },
        ...[['original', '原版'], ['workbench', '工作台']].map(([mode, title]) => h('button', { key: mode, type: 'button', 'aria-pressed': view.mode === mode, onClick: () => props.dualShell.setMode(mode) }, title))),
      h('span', { className: 'p0-label' }, 'P0 双布局预览 · 便笺未自动保存'),
      view.mode === 'workbench' && h('div', { className: 'p0-narrow-switch', role: 'group', 'aria-label': '窄窗区域' },
        h('button', { onClick: () => props.dualShell.setNarrowPane('workspace'), 'aria-pressed': view.narrowPane === 'workspace' }, '操作区'),
        h('button', { onClick: () => props.dualShell.setNarrowPane('chat'), 'aria-pressed': view.narrowPane === 'chat' }, '聊天'))),
    h(NativeFrame, { ...props, dualView: view }));
}

export function Desktop({ store, active, chatWidth, chatMax }) {
  const view = useState(store), drag = React.useRef(null);
  return h('section', { className: 'p0-desktop', 'aria-label': '主操作区', 'aria-hidden': !active, inert: !active ? '' : undefined },
    h('div', { className: 'p0-scene-area' },
      view.scenes.map(scene => h(Scene, { key: scene.id, scene, store, active: active && view.selected === scene.key })),
      !view.selected && h('p', { role: 'status' }, view.reason)),
    h('div', { className: 'p0-chat-separator', role: 'separator', tabIndex: 0, 'aria-label': '调整右侧聊天宽度', 'aria-orientation': 'vertical', 'aria-valuemin': 320, 'aria-valuemax': chatMax, 'aria-valuenow': chatWidth,
      onPointerDown(e) { if (e.button !== 0) return; drag.current = { x: e.clientX, width: chatWidth }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); },
      onPointerMove(e) { if (drag.current) store.resizeChat(drag.current.width + drag.current.x - e.clientX); },
      onPointerUp() { drag.current = null; }, onPointerCancel() { drag.current = null; }, onLostPointerCapture() { drag.current = null; },
      onKeyDown(e) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); store.resizeChat(Math.min(chatMax, e.key === 'Home' ? 320 : e.key === 'End' ? chatMax : chatWidth + (e.key === 'ArrowLeft' ? 20 : -20))); } },
    }));
}

function Scene({ scene, store, active }) {
  const [error, setError] = React.useState(''), [loaded, setLoaded] = React.useState(false);
  const update = patch => { try { store.update(scene.key, patch); setError(''); } catch (e) { setError(e.message); } };
  return h('div', { className: 'p0-scene', hidden: !active, inert: !active ? '' : undefined, 'data-scene': scene.id, 'data-workspace': scene.workspaceId, 'data-arrangement': scene.arrangement },
    h('header', { className: 'p0-scene-header' }, h('div', null, h('h1', null, scene.title), h('small', null, '同工作区共享现场 · 会话草稿与权限仍独立')),
      h('label', null, '布局 ', h('select', { 'aria-label': '操作区布局', value: scene.arrangement, onChange: e => update({ arrangement: e.target.value }) }, h('option', { value: 'split' }, '左右分栏'), h('option', { value: 'stack' }, '上下分栏')))),
    h('div', { className: 'p0-tools' },
      h('article', { className: 'p0-note' }, h('h2', null, '工作便笺'), h('p', null, '真实可编辑内存草稿；未写入文件，重开应用不恢复。'),
        h('textarea', { 'aria-label': '工作区便笺', value: scene.note, onChange: e => update({ note: e.target.value }), spellCheck: false, placeholder: '这份草稿属于工作区，不随右侧会话切换。' })),
      h('article', { className: 'p0-web' }, h('h2', null, '网页'),
        h('form', { onSubmit: e => { e.preventDefault(); try { const url = parseWebAddress(scene.address, location.origin); setLoaded(false); update({ url }); } catch (failure) { setError(failure.message); } } },
          h('input', { type: 'url', 'aria-label': '网页地址', placeholder: 'https://example.com', value: scene.address, onChange: e => update({ address: e.target.value }) }), h('button', { type: 'submit' }, '打开')),
        h('p', { className: 'p0-web-status', role: 'status' }, scene.url ? loaded ? '载体已发出load事件；不证明站点完整可用或内容可读。' : '正在请求页面；站点可能禁止嵌入。' : '按需打开网页；未授予内容提取或AI操作权限。'),
        // One iframe per scene, with one stable parent. No portal/DOM adoption.
        h('iframe', { 'data-p0-web': scene.id, title: `${scene.title}网页`, src: scene.url || undefined, sandbox: 'allow-scripts allow-forms', referrerPolicy: 'no-referrer', onLoad: () => setLoaded(true) }))),
    error && h('p', { role: 'alert' }, error),
    h('footer', null, 'P0验证：原版⇄工作台／同工作区A⇄B／布局切换不重建网页。文件、终端、开放工具接入待后续实现。'));
}

export const css = `
.p0-shell{height:100%;display:grid;grid-template-rows:44px minmax(0,1fr);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:14px Arial,"Microsoft YaHei",sans-serif}
/* The wrapper owns the ONE titlebar reservation; native fixed window controls keep their coordinates. */
html[data-windows-titlebar]:not([data-fullscreen]) .p0-shell{position:relative;padding-top:var(--dsh-windows-titlebar-height,32px);box-sizing:border-box}
/* Moving the native titlebar reservation must also move its Electron drag surface. */
html[data-windows-titlebar]:not([data-fullscreen]) .p0-shell:before{content:"";position:absolute;inset:0 0 auto;height:var(--dsh-windows-titlebar-height,32px);background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag}
html[data-windows-titlebar][data-fullscreen] .p0-toolbar{padding-left:104px}
html[data-windows-titlebar] .p0-native{padding-top:0}
html[data-windows-titlebar] .p0-native:before{display:none}
.p0-toolbar{display:flex;align-items:center;gap:18px;padding:0 14px;border-bottom:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-sidebar-fill);min-width:0;-webkit-app-region:no-drag}
.p0-toolbar button,.p0-desktop button,.p0-desktop select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);padding:5px 12px;border-radius:6px;cursor:pointer}
.p0-toolbar [aria-pressed=true]{background:#285ad8;color:white;border-color:#285ad8}.p0-toolbar [role=group]{display:flex;gap:5px}.p0-label{font-size:12px;opacity:.7;margin-left:auto}.p0-narrow-switch{display:none!important}
.p0-native[data-dual-mode=original]>.p0-desktop,.p0-native[data-dual-global=true]>.p0-desktop{display:none}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_sidebarCol{grid-column:1;grid-row:1}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_centerCol{grid-column:3;grid-row:1;border-left:1px solid var(--dsw-alias-border-l2)}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_rightbarCol{grid-column:2;grid-row:1;width:0;justify-self:end;z-index:5}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_handle{display:none}
.p0-desktop{grid-column:2;grid-row:1;min-width:0;min-height:0;position:relative;background:color-mix(in srgb,var(--dsw-alias-bg-base) 95%,#3277ff)}
.p0-scene-area{height:100%;overflow:auto}.p0-scene{height:100%;box-sizing:border-box;padding:18px;display:flex;flex-direction:column;gap:14px;min-width:360px}.p0-scene[hidden]{display:none}.p0-scene-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.p0-scene h1{font-size:21px;margin:0 0 5px}.p0-scene small,.p0-scene footer{opacity:.65;font-size:12px}.p0-scene h2{font-size:14px;margin:0}.p0-tools{display:grid;grid-template-columns:minmax(180px,.85fr) minmax(220px,1.15fr);gap:12px;flex:1;min-height:200px}.p0-scene[data-arrangement=stack] .p0-tools{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.p0-tools article{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base)}
.p0-tools p{font-size:12px;opacity:.7;margin:0}.p0-note textarea{flex:1;min-height:70px;width:100%;box-sizing:border-box;resize:none;border:0;outline:1px solid transparent;background:transparent;color:inherit;font:14px/1.65 Consolas,monospace}.p0-note textarea:focus{outline-color:#88aaff}.p0-web form{display:flex;gap:6px}.p0-web button{white-space:nowrap;flex:0 0 auto}.p0-web input{min-width:0;width:100%;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:6px}.p0-web iframe{border:1px solid var(--dsw-alias-border-l2);width:100%;flex:1;min-height:60px;box-sizing:border-box;background:white}.p0-chat-separator{position:absolute;top:0;bottom:0;right:-3px;width:6px;cursor:col-resize;z-index:8}.p0-chat-separator:focus-visible{outline:2px solid #285ad8}
@media(max-width:1100px){.p0-label{display:none}.p0-scene{padding:10px}.p0-tools{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
@media(max-width:900px){.p0-narrow-switch{display:flex!important}.p0-native[data-dual-mode=workbench][data-dual-global=false]{grid-template-columns:0 minmax(0,1fr)!important}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_sidebarCol{visibility:hidden}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_centerCol{grid-column:2}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=workspace]>.mP3x-q_centerCol{visibility:hidden;pointer-events:none}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=chat]>.p0-desktop{visibility:hidden;pointer-events:none}.p0-chat-separator{display:none}.p0-toolbar{gap:8px;font-size:12px}}
`;
