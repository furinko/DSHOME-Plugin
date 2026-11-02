import {FishLogo} from '@deepseek-ai/dsh-client-ui-primitives';
import React from 'react';
import { createSceneStore, parseWebAddress } from './scene-store.mjs';
import { createPanelLayout } from './panels.mjs';
import { LayoutControls, LayoutCanvas, layoutCSS } from './layout-view.mjs';
import { Icon } from '../src/workbench/icons.mjs';
const h = React.createElement;
const useState = store => React.useSyncExternalStore(store.subscribe, store.getSnapshot);

export function install(ctx) {
  const store = createSceneStore({ workspaces: ctx.workspaces.list, session: ctx.uiSession.current, connection: ctx.connection.generation });
  const style = document.createElement('style'); style.dataset.plugin = 'dshome-dual-shell-p0'; style.textContent = css; document.head.append(style);
  ctx.effect(() => () => { store.dispose(); style.remove(); });
  ctx.reflect.provide('dualShellP0', store);
  ctx.inject(['dshomeDesktop'], scope => { store.setDesktop(scope.get('dshomeDesktop')); });
  // Only narrow-pane actions use native seats. The mode switch has ONE stable
  // root parent, independent of session, page, mode or responsive pane.
  for (const name of ['conversation.session.header.utilities', 'conversation.hero.options']) {
    ctx.slots.inject(name, () => ctx.slots.register({ name, id: 'dshome.shell-actions', order: -60 }, () => h(SceneActions, { store, native: true })));
  }
  return store;
}

export function Controls({ store }) {
  const view = useState(store);
  return h('div', { className: 'p0-inline-controls' },
    h('div', { className: 'p0-mode-switch', role: 'group', 'aria-label': '整窗模式', title: '只切换呈现，保留当前会话和工作现场' },
      ...[['original', '聊天'], ['workbench', '工作台']].map(([mode, title]) => h('button', { key: mode, type: 'button', 'aria-pressed': view.mode === mode, onClick: () => store.setMode(mode) }, title))));
}

export function SceneActions({ store, native = false }) {
  const view = useState(store);
  if (view.mode !== 'workbench') return null;
  return h('div', { className: 'p0-inline-controls p0-scene-actions' + (native ? ' p0-native-controls' : '') },
    h('button', { className: 'p0-narrow-switch', type: 'button', 'aria-label': view.narrowPane === 'chat' ? '显示操作区' : '显示右侧聊天', onClick: () => store.setNarrowPane(view.narrowPane === 'chat' ? 'workspace' : 'chat') }, view.narrowPane === 'chat' ? '操作区' : '右侧聊天'),
    view.desktop?.RecoveryShelf && h(view.desktop.RecoveryShelf, { selectedKey: view.selected }));
}

export function Navigation({store,renderSlot}) {
  const view=useState(store),root=React.useRef(null);
  React.useEffect(()=>{if(!view.navigationOpen)return;const close=e=>{if(e.key==='Escape'){store.setNavigationOpen(false);root.current?.querySelector('[data-nav-trigger]')?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[view.navigationOpen]);
  return h(React.Fragment,null,
    view.navigationOpen&&h('button',{className:'p0-navigation-backdrop','aria-label':'收起工作区导航',onClick:()=>store.setNavigationOpen(false)}),
    h('nav',{className:'p0-navigation-rail',ref:root,'aria-label':'鲸鱼工作台工具栏'},
      h('div',{className:'p0-whale-logo',title:'鲸鱼工作台','aria-label':'鲸鱼工作台'},h(FishLogo,{size:28})),
      h('button',{type:'button','data-nav-trigger':true,'aria-label':'工作区与会话','aria-expanded':view.navigationOpen,title:'工作区与会话',onClick:()=>store.setNavigationOpen(!view.navigationOpen)},h(Icon,{name:'layout',size:22})),
      h('button',{type:'button','aria-label':view.workspaceFocus?'恢复右侧聊天':'专注操作区','aria-pressed':view.workspaceFocus,title:view.workspaceFocus?'恢复右侧聊天':'专注操作区',onClick:()=>store.setWorkspaceFocus(!view.workspaceFocus)},h(Icon,{name:view.workspaceFocus?'restore':'maximize',size:21}))));
}

export function Frame({ NativeFrame, ...props }) {
  const view = useState(props.dualShell);
  const globalPanel=props.usePanelInfo(info=>info.activePanelId!==null);
  React.useEffect(()=>{if(globalPanel||view.mode!=='workbench')props.dualShell.setNavigationOpen(false);},[globalPanel,view.mode]);
  return h('div', { className: 'p0-shell', 'data-p0-shell': true, 'data-mode': view.mode, 'data-pane': view.narrowPane },
    h(NativeFrame, { ...props, dualView: view }),
    h('div', { className: 'p0-mode-anchor' }, h(Controls, { store: props.dualShell })),
    view.mode === 'workbench' && (!view.selected || !view.desktop) && h('div', { className: 'p0-recovery-anchor' }, h(SceneActions, { store: props.dualShell })));
}

export function Desktop({ store, active, chatWidth, chatMax }) {
  const view = useState(store), drag = React.useRef(null);
  return h('section', { className: 'p0-desktop', 'aria-label': '主操作区', 'aria-hidden': !active, inert: !active ? '' : undefined },
    h('div', { className: 'p0-scene-area' },
      view.scenes.map(scene => h('div', { key: scene.id, className: 'p0-full-scene', hidden: view.selected !== scene.key, inert: active && view.selected === scene.key ? undefined : '', 'data-scene': scene.id, 'data-workspace': scene.workspaceId },
        view.desktop ? h(view.desktop.Body, { scene, active: active && view.selected === scene.key, shellControls: h(SceneActions, { store }), onOriginal: () => store.setMode('original') }) : h('p', {role:'status'}, '真实工作区服务尚未装配；未显示模拟文件或终端。'))),
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
  const [layout] = React.useState(() => createPanelLayout(scene.key));
  const layoutState = useState(layout);
  const guarded = fn => { try { if (!active || store.getSnapshot().selected !== scene.key) throw Error('当前工作区不可用'); fn(); setError(''); } catch (e) { setError(e.message); } };
  const update = patch => { try { store.update(scene.key, patch); setError(''); } catch (e) { setError(e.message); } };
  return h('div', { className: 'p0-scene', hidden: !active, inert: !active ? '' : undefined, 'data-scene': scene.id, 'data-workspace': scene.workspaceId, 'data-arrangement': scene.arrangement },
    h('header', { className: 'p0-scene-header' }, h('div', null, h('h1', null, scene.title), h('small', null, '同工作区共享现场 · 会话草稿与权限仍独立')),
      h('small', null, layoutState.editing ? '正在编辑布局草稿' : '布局仅保存在本次工作区现场')),
    h(LayoutControls, { model: layout, guarded }),
    h(LayoutCanvas, { model: layout, guarded },
      h('article', { key: 'panel-note', 'data-panel-id': 'panel-note', className: 'p0-note' }, h('h2', null, '工作便笺'), h('p', null, '真实可编辑内存草稿；未写入文件，重开应用不恢复。'),
        h('textarea', { 'aria-label': '工作区便笺', value: scene.note, onChange: e => update({ note: e.target.value }), spellCheck: false, placeholder: '这份草稿属于工作区，不随右侧会话切换。' })),
      h('article', { key: 'panel-web', 'data-panel-id': 'panel-web', className: 'p0-web' }, h('h2', null, '网页'),
        h('form', { onSubmit: e => { e.preventDefault(); try { const url = parseWebAddress(scene.address, location.origin); setLoaded(false); update({ url }); } catch (failure) { setError(failure.message); } } },
          h('input', { type: 'url', 'aria-label': '网页地址', placeholder: 'https://example.com', value: scene.address, onChange: e => update({ address: e.target.value }) }), h('button', { type: 'submit' }, '打开')),
        h('p', { className: 'p0-web-status', role: 'status' }, scene.url ? loaded ? '载体已发出load事件；不证明站点完整可用或内容可读。' : '正在请求页面；站点可能禁止嵌入。' : '按需打开网页；未授予内容提取或AI操作权限。'),
        // One iframe per scene, with one stable parent. No portal/DOM adoption.
        h('iframe', { 'data-p0-web': scene.id, title: `${scene.title}网页`, src: scene.url || undefined, sandbox: 'allow-scripts allow-forms', referrerPolicy: 'no-referrer', onLoad: () => setLoaded(true) }))),
    error && h('p', { role: 'alert' }, error),
    h('footer', null, 'P0验证：原版⇄工作台／同工作区A⇄B／布局切换不重建网页。文件、终端、开放工具接入待后续实现。'));
}

export const css = layoutCSS + `
.p0-full-scene{height:100%;min-height:0}.p0-full-scene[hidden]{display:none}

.p0-shell{height:100%;position:relative;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:13px var(--dsh-font-family-text,system-ui,sans-serif)}
/* Native AppFrame keeps its ONE titlebar reservation and Electron drag surface. */
.p0-shell [data-slot="sidebar.brand.name"] .dshome-glow-name{white-space:nowrap}
.p0-shell[data-mode=workbench] [data-slot="sidebar.brand.name"] .dshome-brand-version{display:none}
.p0-inline-controls{display:inline-flex;align-items:center;gap:6px;flex:none;min-width:0;-webkit-app-region:no-drag}
.p0-inline-controls button,.p0-desktop button,.p0-desktop select{font:inherit;color:inherit;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);padding:5px 9px;border-radius:6px;cursor:pointer}
.p0-mode-switch{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base)}
.p0-inline-controls .p0-mode-switch button{box-sizing:border-box;width:43px;height:26px;padding:3px 4px;border-color:transparent;background:transparent;font-size:12px;line-height:1.4;white-space:nowrap}
.p0-mode-switch [aria-pressed=true]{background:color-mix(in srgb,var(--dsw-alias-bg-base) 88%,#3f5ce8)!important;font-weight:600}
.p0-inline-controls button:hover{background:color-mix(in srgb,var(--dsw-alias-bg-base) 89%,#3f5ce8)}.p0-inline-controls button:focus-visible{outline:2px solid #647cf4;outline-offset:2px}
.p0-narrow-switch{display:none!important}.p0-shell[data-mode=workbench] .p0-native-controls{display:none}
.p0-mode-anchor{position:absolute;right:12px;top:calc(var(--dsh-frame-chrome-top,0px) + 12px);z-index:20;-webkit-app-region:no-drag}
/* Reserve an in-row seat; never add a new mode row or cover native controls. */
.p0-shell [data-slot="conversation.header"]>header{box-sizing:border-box;padding-right:140px;container-type:inline-size}
.p0-shell [data-slot="conversation.header"] :has(>[data-slot="conversation.session.header.corner"]){right:140px}
@container(max-width:540px){.p0-shell .dshome-wb-switch{padding:1px;gap:1px}.p0-shell .dshome-wb-switch button{font-size:11px;padding:3px 4px;min-height:26px}}
.p0-shell .wb-header{padding-right:124px}
.p0-recovery-anchor{position:absolute;left:16px;top:calc(var(--dsh-frame-chrome-top,0px) + 12px);z-index:19}
.p0-mode-switch{box-sizing:border-box;width:94px;height:32px}
@container(max-width:540px){.p0-shell .wb-header{padding-right:116px}.p0-shell .wb-header-actions{gap:4px}}

.p0-inline-controls .wb-retained-drafts{font-size:11px}.p0-inline-controls .wb-retained-drafts summary{cursor:pointer;white-space:nowrap}.p0-inline-controls .wb-retained-drafts>section{color:var(--dsw-alias-label-primary);max-width:calc(100vw - 40px)}
.wb-header:has(.p0-inline-controls) .wb-heading-mark,.wb-header:has(.p0-inline-controls) .wb-heading strong{display:none}
@container(max-width:850px){.wb-header:has(.p0-inline-controls){gap:7px}.wb-header:has(.p0-inline-controls) .wb-connection{display:none}.wb-header:has(.p0-inline-controls) .wb-project{max-width:120px}}
@container(max-width:540px){.wb-header:has(.p0-inline-controls) .wb-heading{display:none}.wb-header:has(.p0-inline-controls) .wb-header-actions{margin-left:auto}.p0-inline-controls{gap:4px}}

.p0-native[data-dual-mode=original]>.p0-desktop,.p0-native[data-dual-global=true]>.p0-desktop{display:none}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_sidebarCol{grid-column:1;grid-row:1}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_centerCol{grid-column:3;grid-row:1;border-left:1px solid var(--dsw-alias-border-l2)}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_rightbarCol{grid-column:2;grid-row:1;width:0;justify-self:end;z-index:5}
.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-tools-visible=false]>.mP3x-q_rightbarCol{display:none}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_handle{display:none}
.p0-desktop{grid-column:2;grid-row:1;min-width:0;min-height:0;position:relative;background:color-mix(in srgb,var(--dsw-alias-bg-base) 95%,#3277ff)}
.p0-scene-area{height:100%;overflow:auto}.p0-scene{height:100%;box-sizing:border-box;padding:18px;display:flex;flex-direction:column;gap:14px;min-width:360px}.p0-scene[hidden]{display:none}.p0-scene-header{display:flex;align-items:center;justify-content:space-between;gap:8px}.p0-scene h1{font-size:21px;margin:0 0 5px}.p0-scene small,.p0-scene footer{opacity:.65;font-size:12px}.p0-scene h2{font-size:14px;margin:0}.p0-tools{display:grid;grid-template-columns:minmax(180px,.85fr) minmax(220px,1.15fr);gap:12px;flex:1;min-height:200px}.p0-scene[data-arrangement=stack] .p0-tools{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.p0-tools article{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-base)}
.p0-tools p{font-size:12px;opacity:.7;margin:0}.p0-note textarea{flex:1;min-height:70px;width:100%;box-sizing:border-box;resize:none;border:0;outline:1px solid transparent;background:transparent;color:inherit;font:14px/1.65 Consolas,monospace}.p0-note textarea:focus{outline-color:#88aaff}.p0-web form{display:flex;gap:6px}.p0-web button{white-space:nowrap;flex:0 0 auto}.p0-web input{min-width:0;width:100%;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;padding:6px}.p0-web iframe{border:1px solid var(--dsw-alias-border-l2);width:100%;flex:1;min-height:60px;box-sizing:border-box;background:white}.p0-native[data-dual-focus=true] .p0-chat-separator{display:none}.p0-native[data-dual-focus=true][data-dual-mode=workbench]>.mP3x-q_centerCol{visibility:hidden;pointer-events:none}.p0-chat-separator{position:absolute;top:0;bottom:0;right:-3px;width:6px;cursor:col-resize;z-index:8}.p0-chat-separator:focus-visible{outline:2px solid #285ad8}
.p0-layout-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.p0-layout-controls label{display:flex;align-items:center;gap:4px}
.p0-scene[data-arrangement=split] .p0-tools[data-layout-axis=x]{grid-template-columns:minmax(0,calc(var(--p0-ratio) - 6px)) minmax(0,1fr)}
.p0-scene[data-arrangement=split] .p0-tools[data-layout-axis=y]{grid-template-columns:1fr;grid-template-rows:minmax(0,calc(var(--p0-ratio) - 6px)) minmax(0,1fr)}
@media(max-width:1100px){.p0-scene{padding:10px}.p0-tools{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
@media(max-width:540px){.p0-shell .dshome-wb-switch{padding:1px;gap:1px}.p0-shell .dshome-wb-switch button{font-size:11px;padding:3px 4px;min-height:26px}}
@media(max-width:900px){.p0-narrow-switch{display:inline-flex!important}.p0-shell[data-mode=workbench][data-pane=chat] .p0-native-controls{display:inline-flex}.p0-native[data-dual-mode=workbench][data-dual-global=false]{grid-template-columns:52px minmax(0,1fr)!important}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_sidebarCol{visibility:hidden}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_centerCol{grid-column:2}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=workspace]>.mP3x-q_centerCol{visibility:hidden;pointer-events:none}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=chat]>.p0-desktop{visibility:hidden;pointer-events:none}.p0-chat-separator{display:none}}

.p0-navigation-rail{position:absolute;top:var(--dsh-frame-chrome-top,0px);bottom:0;left:0;width:52px;display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:12px;background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l2);z-index:42;box-sizing:border-box}
.p0-whale-logo{height:38px;display:grid;place-items:center}.p0-navigation-rail button{width:36px;height:36px;padding:6px;display:grid;place-items:center;background:transparent;color:inherit;border:0;border-radius:6px;cursor:pointer}.p0-navigation-rail button:hover,.p0-navigation-rail button[aria-expanded=true]{background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,#647cf4)}
.p0-navigation-backdrop{position:absolute;inset:0;z-index:40;background:#0002;border:0;cursor:default}
.p0-native[data-dual-mode=workbench][data-dual-global=false]>[data-whale-navigation]{position:absolute;left:52px;top:var(--dsh-frame-chrome-top,0px);bottom:0;width:min(300px,calc(100vw - 52px));z-index:41;box-shadow:8px 0 30px #0002;visibility:hidden;pointer-events:none}
.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-navigation=true]>[data-whale-navigation]{visibility:visible;pointer-events:auto}
`;
