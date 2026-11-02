window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-layout",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
		* LG breakpoint); a manual toggle below it re-expands over the squeezed center
		* (stores.ts narrowExpanded). */
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/** Maximum normal right panel width as a fraction of the frame. */
		const RIGHTBAR_MAX_RATIO = .7;
		/** First-open right panel preference as a fraction of the frame. */
		const RIGHTBAR_DEFAULT_RATIO = .45;
		/**
		* Clamp a panel width into its contract range.
		* @param px - requested width.
		* @param min - range lower bound.
		* @param max - range upper bound.
		* @returns the clamped width.
		*/
		function clampWidth(px, min, max) {
			return Math.min(max, Math.max(min, Math.round(px)));
		}
		/**
		* Solve the three column widths for one viewport frame.
		* @param viewport - available frame width in px.
		* @param sidebar - sidebar width preference in px (0 = closed).
		* @param rightbar - requested right panel width in px (0 = no track).
		* @param collapsedWidth - track width of the closed sidebar; the default keeps
		*   the icon rail, 0 hides the column entirely (macOS desktop).
		* @returns actual widths after shrinking or removing the right track; only
		*   without that track may the center fall below its minimum, down to zero.
		*/
		function computeColumns(viewport, sidebar, rightbar, collapsedWidth = 56) {
			const s = sidebar === 0 ? collapsedWidth : clampWidth(sidebar, 264, 420);
			const available = viewport - s - 400;
			const r = rightbar === 0 || available < 300 ? 0 : Math.min(available, clampWidth(rightbar, 300, viewport * RIGHTBAR_MAX_RATIO));
			return {
				sidebar: s,
				center: Math.max(0, viewport - s - r),
				rightbar: r
			};
		}
		//#endregion
		//#region lib/types/client/DocumentTitle.js
		/** Browser title selection follows the active main panel without subscribing the frame. */
		/**
		* Project the selected durable session title into the browser title and
		* restore the build-selected product title when unmounted.
		* @param props - Selected session title projection.
		* @returns No rendered content.
		*/
		function DocumentTitle({ useSessions, usePanelInfo, productTitle }) {
			const showSessionTitle = usePanelInfo((info) => info.activePanelId === null);
			const title = useSessions((state) => {
				const current = Object.values(state.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
				return !showSessionTitle || current === void 0 ? void 0 : state.byId[current]?.title;
			});
			(0, react.useEffect)(() => {
				document.title = title === void 0 ? productTitle : `${title} — ${productTitle}`;
				return () => {
					document.title = productTitle;
				};
			}, [productTitle, title]);
			return null;
		}
		//#endregion
		//#region \0dsh-css:D:\ci\runners\github\_work\deepseek-harness\deepseek-harness\packages\client\ui-layout\src\client\AppFrame.module.css.mjs
		const css = ".mP3x-q_frame{background:var(--dsw-alias-bg-base);grid-template-rows:minmax(0,1fr) auto;height:100%;display:grid;position:relative;overflow:hidden}.mP3x-q_frame[data-animating]{transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out)}.mP3x-q_frame[data-dragging]{transition:none}[data-windows-titlebar] .mP3x-q_frame{--dsh-windows-content-radius:16px;box-sizing:border-box;padding-top:var(--dsh-windows-titlebar-height);background:var(--dsw-specific-sidebar-fill)}[data-windows-titlebar] .mP3x-q_centerCol{background:var(--dsw-alias-bg-base);border-radius:var(--dsh-windows-content-radius) 0 0 0;corner-shape:round}[data-windows-titlebar] .mP3x-q_frame:before{content:\"\";height:var(--dsh-windows-titlebar-height);background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag;position:absolute;inset:0 0 auto}[data-windows-titlebar] .mP3x-q_sidebarCol{border-right:none}@media (prefers-reduced-motion:reduce){.mP3x-q_frame[data-animating]{transition:none}}.mP3x-q_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3);min-width:0;overflow:hidden}.mP3x-q_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}[data-platform=darwin] .mP3x-q_frame{background:0 0}html[data-platform=darwin]{--dsh-frame-top-clearance:48px}html[data-windows-titlebar]{--dsh-frame-top-clearance:var(--dsh-windows-titlebar-height);--dsh-frame-chrome-top:var(--dsh-windows-titlebar-height)}html[data-platform=darwin],html[data-windows-titlebar]{--dsh-frame-overlay-top:calc(var(--dsh-frame-top-clearance) + 20px)}html[data-platform=darwin][data-fullscreen],html[data-windows-titlebar][data-fullscreen]{--dsh-frame-overlay-top:20px;--dsh-frame-chrome-top:0px}[data-platform=darwin] .mP3x-q_sidebarCol{background:linear-gradient(to bottom, #7a9bf01a, #7a9bf000 35%, #8f89b800 68%, #8f89b817), color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 97%, #7a9bf0) 40%, transparent);border-right:none}[data-platform=darwin] [data-ds-dark-theme] .mP3x-q_sidebarCol{background:linear-gradient(to bottom, #7a9bf014, #7a9bf000 35%, #8f89b800 68%, #8f89b812), color-mix(in srgb, var(--dsw-specific-sidebar-fill) 50%, transparent)}@media (prefers-reduced-transparency:reduce){[data-platform=darwin] .mP3x-q_sidebarCol,[data-platform=darwin] [data-ds-dark-theme] .mP3x-q_sidebarCol{background:color-mix(in srgb, var(--dsw-specific-sidebar-fill) 90%, transparent)}}[data-platform=darwin] .mP3x-q_centerCol{background:var(--dsw-alias-bg-base);border-left:.5px solid var(--dsw-alias-border-l3)}[data-platform=darwin] .mP3x-q_rightbarCol{background:var(--dsw-alias-bg-base)}[data-platform=darwin] [data-sidebar-collapsed] .mP3x-q_centerCol{border-left:none}[data-platform=darwin] .mP3x-q_frame[data-sidebar-collapsed]{--dsh-frame-leading-clearance:160px}[data-platform=darwin][data-fullscreen] .mP3x-q_frame[data-sidebar-collapsed]{--dsh-frame-leading-clearance:84px}[data-platform=darwin][data-fullscreen] .mP3x-q_leadingSeat{left:12px}.mP3x-q_leadingSeat{z-index:15;-webkit-app-region:no-drag;align-items:center;display:flex;position:absolute;top:11px;left:88px}.mP3x-q_handle{cursor:col-resize;z-index:11;touch-action:none;grid-area:1/1/2/-1;width:8px;margin-left:-4px;position:absolute;top:0;bottom:0}.mP3x-q_frame[data-animating] .mP3x-q_handle{transition:left var(--ds-transition-duration-slow) var(--ds-ease-in-out)}.mP3x-q_frame[data-dragging] .mP3x-q_handle,.mP3x-q_frame[data-rightbar-fullscreen],.mP3x-q_frame[data-rightbar-fullscreen] .mP3x-q_handle,.mP3x-q_frame[data-rightbar-instant],.mP3x-q_frame[data-rightbar-instant] .mP3x-q_handle{transition:none}@media (prefers-reduced-motion:reduce){.mP3x-q_frame[data-animating] .mP3x-q_handle{transition:none}}.mP3x-q_rightbarCol{min-width:0;position:relative;overflow:visible}.mP3x-q_bottomRow{background:var(--dsw-alias-bg-base);grid-column:1/-1;min-width:0;min-height:0;overflow:auto}.mP3x-q_overlayLayer{z-index:20;pointer-events:none;position:absolute;inset:0}.mP3x-q_overlayLayer>*{pointer-events:auto}";
		const tagId = "@deepseek-ai/dsh-client-ui-layout/AppFrame.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-layout";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var AppFrame_module_css_default = {
			"bottomRow": "mP3x-q_bottomRow",
			"centerCol": "mP3x-q_centerCol",
			"frame": "mP3x-q_frame",
			"handle": "mP3x-q_handle",
			"leadingSeat": "mP3x-q_leadingSeat",
			"overlayLayer": "mP3x-q_overlayLayer",
			"rightbarCol": "mP3x-q_rightbarCol",
			"sidebarCol": "mP3x-q_sidebarCol"
		};
		//#endregion
		//#region lib/types/client/AppFrame.js
		/**
		* Three-column shell frame, registered into the built-in 'root' slot (the web
		* shell renders only 'root'). Owns the grid tracks (sidebar | center |
		* rightbar), the drag handles (pointer capture + rAF throttle), the column
		* solve (columns.ts), and the child-slot render decisions: the sidebar slot
		* receives live parameters from that solve. The root-scoped main slot selects
		* the Conversation or a global panel. Each column occupant owns its Session
		* binding and reports the geometry it needs.
		*
		* The right column is a track, not a box: its occupant draws its panel anchored
		* to the frame's right edge at the resolved normal width, and the
		* track only decides whether the centre makes room for it. The occupant reports
		* shown/track/fullscreen through `ctx.layout`; fullscreen keeps the reported
		* track but hides the outer resize handle. Everything arrives through the framework
		* shares — zero cordis or framework imports, zero self-made hooks.
		*/
		/** Center column grid item (session-body building block). */
		function CenterColumn(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.centerCol,
				"aria-hidden": props.hiddenByP0 || undefined, inert: props.hiddenByP0 ? "" : undefined,
				children: props.children
			});
		}
		/** Subscribe to the main key without subscribing the column frame to each panel id. */
		function MainPanel({ usePanelInfo, renderSlot }) {
			return renderSlot("main", {}, { entryKey: usePanelInfo((info) => info.activePanelId) ?? "conversation" });
		}
		/**
		* Right column grid item. Zero-width unless the occupant asked for a track; the
		* occupant's panel is positioned against the column's right edge, which never
		* moves, so it can hang over the centre when there is no track.
		*/
		function RightbarColumn(props) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.rightbarCol,
				"data-rightbar-col": true,
				children: props.children
			});
		}
		/**
		* One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
		* `side` keys the hover-reveal CSS to the owning column.
		*/
		function DragHandle(props) {
			const [dragging, setDragging] = (0, react.useState)(false);
			const origin = (0, react.useRef)(0);
			const latest = (0, react.useRef)(0);
			const frame = (0, react.useRef)(null);
			const capture = (0, react.useRef)(null);
			const callbacks = (0, react.useRef)({
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			});
			callbacks.current = {
				onStart: props.onStart,
				onDrag: props.onDrag,
				onEnd: props.onEnd
			};
			const endDrag = (0, react.useCallback)(() => {
				const active = capture.current;
				if (active === null) return;
				capture.current = null;
				if (frame.current !== null) {
					cancelAnimationFrame(frame.current);
					frame.current = null;
				}
				if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id);
				setDragging(false);
				callbacks.current.onEnd();
			}, []);
			(0, react.useEffect)(() => endDrag, [endDrag]);
			const onPointerDown = (0, react.useCallback)((e) => {
				if (e.button !== 0 || capture.current !== null) return;
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				capture.current = {
					element: e.currentTarget,
					id: e.pointerId
				};
				origin.current = e.clientX;
				latest.current = e.clientX;
				callbacks.current.onStart();
				setDragging(true);
			}, []);
			const onPointerMove = (0, react.useCallback)((e) => {
				if (capture.current?.id !== e.pointerId) return;
				latest.current = e.clientX;
				frame.current ??= requestAnimationFrame(() => {
					frame.current = null;
					callbacks.current.onDrag(latest.current - origin.current);
				});
			}, []);
			const onPointerUp = (0, react.useCallback)((e) => {
				if (capture.current?.id !== e.pointerId) return;
				callbacks.current.onDrag(e.clientX - origin.current);
				endDrag();
			}, [endDrag]);
			const onPointerCancel = (0, react.useCallback)((e) => {
				if (capture.current?.id === e.pointerId) endDrag();
			}, [endDrag]);
			return (0, react_jsx_runtime.jsx)("div", {
				className: AppFrame_module_css_default.handle,
				style: { left: props.left },
				"data-side": props.side,
				"data-dragging": dragging || void 0,
				onPointerDown,
				onPointerMove,
				onPointerUp,
				onPointerCancel,
				onLostPointerCapture: onPointerCancel
			});
		}
		/** The three-column frame (see module doc). */
		function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t, dualShell, dualView }) {
			const dualGlobal = usePanelInfo(info => info.activePanelId !== null);
			const dualActive = dualView.mode === "workbench" && !dualGlobal;
			const layoutInfo = useStore((state) => state.layoutInfo);
			const frameRef = (0, react.useRef)(null);
			const viewport = layoutInfo.viewportWidth;
			const dualChatMax = Math.max(320, Math.min(560, Math.floor(viewport * .32)));
			const dualChatWidth = dualView.workspaceFocus ? 0 : Math.min(dualView.chatWidth, dualChatMax);
			(0, react.useLayoutEffect)(() => {
				const el = frameRef.current;
				/* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
				if (el === null) return;
				let raf = null;
				let disposed = false;
				const measure = () => {
					const width = el.getBoundingClientRect().width;
					if (width > 0) actions.setViewportWidth(width);
				};
				measure();
				const observer = new ResizeObserver(() => {
					if (disposed) return;
					raf ??= requestAnimationFrame(() => {
						raf = null;
						measure();
					});
				});
				observer.observe(el);
				return () => {
					disposed = true;
					observer.disconnect();
					if (raf !== null) cancelAnimationFrame(raf);
				};
			}, [actions]);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded : layoutInfo.sidebar === 0;
			const sidebarPreference = sidebarCollapsed ? 0 : layoutInfo.sidebar === 0 ? 280 : layoutInfo.sidebar;
			const rightbarPreference = layoutInfo.rightbar ?? viewport * .45;
			const darwin = document.documentElement.dataset.platform === "darwin";
			const collapsedWidth = darwin || document.documentElement.hasAttribute("data-windows-titlebar") ? 0 : 56;
			const normal = computeColumns(viewport, !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference, rightbarPreference, collapsedWidth);
			const cols = computeColumns(viewport, sidebarPreference, layoutInfo.rightbarTrack ? rightbarPreference : 0, collapsedWidth);
			const colsRef = (0, react.useRef)(cols);
			colsRef.current = cols;
			const rightbarWidth = (0, react.useRef)(normal.rightbar);
			rightbarWidth.current = normal.rightbar;
			const sidebarBase = (0, react.useRef)(0);
			const rightbarBase = (0, react.useRef)(0);
			const [dragging, setDragging] = (0, react.useState)(false);
			const [animating, setAnimating] = (0, react.useState)(0);
			const trackToggle = `${sidebarCollapsed}:${layoutInfo.rightbarTrack}`;
			const previousToggle = (0, react.useRef)(trackToggle);
			const previousViewport = (0, react.useRef)(viewport);
			(0, react.useLayoutEffect)(() => {
				const viewportChanged = previousViewport.current !== viewport;
				previousViewport.current = viewport;
				if (previousToggle.current === trackToggle) return;
				previousToggle.current = trackToggle;
				if (viewportChanged) return;
				setAnimating((token) => token + 1);
			}, [trackToggle, viewport]);
			(0, react.useEffect)(() => {
				if (animating === 0) return;
				const frame = frameRef.current;
				/* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
				if (frame === null) return;
				const settle = () => {
					setAnimating(0);
				};
				const onTransitionEnd = (event) => {
					if (event.target === frame && event.propertyName === "grid-template-columns") settle();
				};
				frame.addEventListener("transitionend", onTransitionEnd);
				const timer = setTimeout(settle, 600);
				return () => {
					frame.removeEventListener("transitionend", onTransitionEnd);
					clearTimeout(timer);
				};
			}, [animating]);
			const onDragEnd = (0, react.useCallback)(() => {
				setDragging(false);
			}, []);
			const onSidebarStart = (0, react.useCallback)(() => {
				sidebarBase.current = colsRef.current.sidebar;
				setDragging(true);
			}, []);
			const onSidebarDrag = (0, react.useCallback)((dx) => {
				actions.setSidebar(sidebarBase.current + dx);
			}, [actions]);
			const onRightbarStart = (0, react.useCallback)(() => {
				rightbarBase.current = rightbarWidth.current;
				setDragging(true);
			}, []);
			const onRightbarDrag = (0, react.useCallback)((dx) => {
				actions.setRightbar(rightbarBase.current - dx);
			}, [actions]);
			const productTitle = "DeepSeek Harness";
			const rightbarMax = cols.rightbar === 0 ? 0 : clampWidth(rightbarPreference, 300, viewport * RIGHTBAR_MAX_RATIO);
			const sidebar = (0, react.useMemo)(() => renderSlot("sidebar", {
				collapsed: dualActive ? false : sidebarCollapsed,
				width: dualActive ? 300 : cols.sidebar
			}), [
				renderSlot,
				sidebarCollapsed,
				cols.sidebar, dualActive
			]);
			const main = (0, react.useMemo)(() => (0, react_jsx_runtime.jsx)(MainPanel, {
				usePanelInfo,
				renderSlot
			}), [usePanelInfo, renderSlot]);
			const overlays = (0, react.useMemo)(() => renderSlot("shell.overlay", {}), [renderSlot]);
			const leading = (0, react.useMemo)(() => renderSlot("shell.leading", {}), [renderSlot]);
			const leadingMounted = darwin && sidebarCollapsed;
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				className: AppFrame_module_css_default.frame + " p0-native",
				"data-dual-tools-visible": String(layoutInfo.rightbarShown), "data-dual-viewport": viewport, "data-dual-mode": dualView.mode,
				"data-dual-global": String(dualGlobal), "data-dual-navigation": String(dualView.navigationOpen), "data-dual-focus": String(dualView.workspaceFocus),
				"data-dual-narrow": dualView.narrowPane,
				style: {
					...document.documentElement.hasAttribute("data-windows-titlebar") ? { "--dsh-windows-sidebar-width": `${cols.sidebar}px` } : {},
					gridTemplateColumns: dualActive ? `52px minmax(0px, 1fr) ${dualChatWidth}px` : `${cols.sidebar}px minmax(${cols.rightbar === 0 ? 0 : 400}px, 1fr) minmax(0px, ${rightbarMax}px)`
				},
				"data-sidebar-collapsed": sidebarCollapsed || void 0,
				"data-rightbar-collapsed": cols.rightbar === 0 || void 0,
				"data-rightbar-fullscreen": layoutInfo.rightbarFullscreen || void 0,
				"data-rightbar-instant": layoutInfo.rightbarInstant || void 0,
				"data-dragging": dragging || void 0,
				"data-animating": animating > 0 || void 0,
				children: [
					dualActive && (0, react_jsx_runtime.jsx)(__p0.Navigation, {store:dualShell,renderSlot}),
					(0, react_jsx_runtime.jsx)(DocumentTitle, {
						productTitle,
						useSessions,
						usePanelInfo
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.sidebarCol,
						"data-whale-navigation": true, "aria-hidden": dualActive && !dualView.navigationOpen || undefined, inert: dualActive && !dualView.navigationOpen ? "" : undefined,
						children: sidebar
					}),
					(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(CenterColumn, { children: main, hiddenByP0: dualActive && (dualView.workspaceFocus || (viewport <= 900 && dualView.narrowPane === "workspace")) }), (0, react_jsx_runtime.jsx)(RightbarColumn, { children: renderSlot("rightbar", {
						width: dualActive ? Math.max(0, Math.min(normal.rightbar, viewport - cols.sidebar - dualChatWidth)) : normal.rightbar,
						viewportWidth: viewport,
						canShow: normal.rightbar > 0
					}) })] }),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.bottomRow,
						"data-shell-bottom": true,
						children: renderSlot("shell.bottom", {})
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.overlayLayer,
						"data-shell-overlay": true,
						children: overlays
					}),
					leadingMounted && (0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.leadingSeat,
						"data-shell-leading": true,
						children: leading
					}),
					!sidebarCollapsed && (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "sidebar",
						left: cols.sidebar,
						onStart: onSidebarStart,
						onDrag: onSidebarDrag,
						onEnd: onDragEnd
					}),
					layoutInfo.rightbarShown && !layoutInfo.rightbarFullscreen && normal.rightbar > 0 && (0, react_jsx_runtime.jsx)(DragHandle, {
						side: "rightbar",
						left: viewport - normal.rightbar,
						onStart: onRightbarStart,
						onDrag: onRightbarDrag,
						onEnd: onDragEnd
					}),
					(0, react_jsx_runtime.jsx)(__p0.Desktop, {store: dualShell, chatWidth: dualChatWidth, chatMax: dualChatMax, active: dualActive && (viewport > 900 || dualView.narrowPane === "workspace")}, "p0-desktop")
				]
			});
		}
		//#endregion
		//#region lib/types/client/stores.js
		/**
		* Root-owned frame measurement, panel preferences, and presentation reports.
		* The registration supplies a fresh store and binds its actions to ctx.layout.
		*/
		/**
		* Create the layout panel store handle. For the sidebar the preference IS the
		* width, so closing it forgets its drag width — reopening restores the contract
		* default. The right panel initializes at 45% of the frame on first opening
		* and keeps that px preference across resizes and close. Drag writes clamp to
		* the current frame's range. Narrow sidebar toggles change only the expansion
		* override; opening the right panel clears that override.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createLayoutStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					panelInfo: { activePanelId: null },
					layoutInfo: {
						sidebar: 280,
						viewportWidth: window.innerWidth,
						narrowExpanded: false,
						rightbar: null,
						rightbarShown: false,
						rightbarTrack: false,
						rightbarFullscreen: false,
						rightbarInstant: false
					}
				}),
				actions: {
					selectPanel: (d, panelId) => {
						d.panelInfo.activePanelId = panelId;
					},
					retainMainPanels: (d, panelIds) => {
						if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) d.panelInfo.activePanelId = null;
					},
					setSidebar: (d, px) => {
						d.layoutInfo.rightbarInstant = false;
						d.layoutInfo.sidebar = clampWidth(px, 264, 420);
					},
					toggleSidebar: (d) => {
						d.layoutInfo.rightbarInstant = false;
						if (d.layoutInfo.viewportWidth < 1024) d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded;
						else d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? 280 : 0;
					},
					setViewportWidth: (d, width) => {
						if (d.layoutInfo.viewportWidth === width) return;
						d.layoutInfo.rightbarInstant = false;
						if (d.layoutInfo.viewportWidth < 1024 !== width < 1024) d.layoutInfo.narrowExpanded = false;
						d.layoutInfo.viewportWidth = width;
					},
					setRightbar: (d, px) => {
						d.layoutInfo.rightbarInstant = false;
						d.layoutInfo.rightbar = clampWidth(px, 300, Math.max(300, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO));
					},
					openRightbar: (d, track, fullscreen) => {
						if (!d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track || d.layoutInfo.rightbarFullscreen !== fullscreen) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen;
						if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < 1024) d.layoutInfo.narrowExpanded = false;
						d.layoutInfo.rightbar ??= Math.max(300, Math.round(d.layoutInfo.viewportWidth * RIGHTBAR_DEFAULT_RATIO));
						d.layoutInfo.rightbarShown = true;
						d.layoutInfo.rightbarTrack = track;
						d.layoutInfo.rightbarFullscreen = fullscreen;
					},
					closeRightbar: (d) => {
						if (d.layoutInfo.rightbarShown) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen;
						d.layoutInfo.rightbarShown = false;
						d.layoutInfo.rightbarTrack = false;
						d.layoutInfo.rightbarFullscreen = false;
					}
				}
			});
		}
		//#endregion
		//#region lib/types/client/service.js
		/** Cross-plugin panel-action face (ctx.layout). */
		var LayoutController = class {
			panels;
			hasMainPanel;
			panelInfo;
			navigation = new AbortController();
			/**
			* @param panels - actions of the instance shared with the root entry.
			* @param hasMainPanel - checks the live main-slot registry for a panel id.
			* @param panelInfo - root store's shared central-panel selection source.
			*/
			constructor(panels, hasMainPanel, panelInfo) {
				this.panels = panels;
				this.hasMainPanel = hasMainPanel;
				this.panelInfo = panelInfo;
			}
			/** Select a global panel or return to the Conversation. */
			selectPanel(panelId) {
				if (panelId !== null && !this.hasMainPanel(panelId)) throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`);
				this.navigation.abort();
				this.panels.selectPanel(panelId);
			}
			/** @returns the new pending navigation's cancellation signal. */
			beginNavigation() {
				this.navigation.abort();
				this.navigation = new AbortController();
				return this.navigation.signal;
			}
			/** Invalidate pending navigations when the layout owner is unloaded. */
			dispose() {
				this.navigation.abort();
			}
			/** Toggle the sidebar panel (closed ⟷ contract default width). */
			toggleSidebar() {
				this.panels.toggleSidebar();
			}
			/** Report the right panel's track and fullscreen presentation. */
			openRightbar(track, fullscreen) {
				this.panels.openRightbar(track, fullscreen);
			}
			/** Report the right panel as hidden: no track, no handle. */
			closeRightbar() {
				this.panels.closeRightbar();
			}
		};
		//#endregion
		//#region lib/types/client/shortcut-locales.js
		/** Layout command labels. */
		const zh = { toggle: "展开／收起左侧栏" };
		/** English labels for the same layout commands. */
		const en = { toggle: "Toggle left sidebar" };
		//#endregion
		//#region lib/types/client/theme-presenter.js
		/** Body attribute selecting the dark base palette in the token stylesheets. */
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/**
		* Root attribute publishing the theme source (`light`, `dark`, or `system`)
		* for host shells that mirror it into the native theme (the Electron preload
		* forwards it to `nativeTheme.themeSource`, so native chrome, renderer
		* `prefers-color-scheme` queries, and Platform login links follow the app
		* palette on every platform). `system` only when the preference is `system`;
		* a fixed preference (including registered theme ids) publishes its resolved
		* scheme.
		*/
		const THEME_SOURCE_ATTRIBUTE = "data-ds-theme-source";
		/** Body variables carrying the user's font sizes in px by role. */
		const FONT_SIZE_VARIABLES = {
			text: "--dsh-content-font-size",
			code: "--dsh-code-font-size",
			terminal: "--dsh-terminal-font-size"
		};
		/** Body variables carrying the user's normalized font lists; absent selects the built-in stack. */
		const FONT_FAMILY_VARIABLES = {
			text: "--dsh-font-family-text",
			code: "--dsh-font-family-code",
			terminal: "--dsh-font-family-terminal"
		};
		/** Applies theme snapshots to the document; one instance per plugin fiber. */
		var ThemePresenter = class {
			/** Token names this presenter wrote in the last apply (its retraction set). */
			appliedTokens = [];
			/** The single metadata node this presenter inserts and removes. */
			themeColorMeta;
			/** Create the presenter-owned metadata node before the first snapshot arrives. */
			constructor() {
				this.themeColorMeta = document.createElement("meta");
				this.themeColorMeta.name = "theme-color";
			}
			/**
			* Project a snapshot onto the document: set root `color-scheme` and the body
			* palette attribute from `active.colorScheme` (never the id — `system` is
			* resolved upstream), publish the font sizes and font lists, then replace the
			* previously applied token variables with `active.tokens`. Browser
			* theme-color metadata follows the computed body background after those
			* writes, so the rendered palette remains the color authority.
			* @param snapshot - resolved theme snapshot from ctx.theme.
			*/
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, snapshot.preference === "system" ? "system" : scheme);
				const body = document.body;
				if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
				else body.removeAttribute(DARK_ATTRIBUTE);
				for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) body.style.setProperty(name, `${snapshot.fontSizes[role]}px`);
				for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) {
					const list = snapshot.fontFamilies[kind];
					if (list === "") body.style.removeProperty(name);
					else body.style.setProperty(name, list);
				}
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta);
			}
			/**
			* Retract root color-scheme, the theme-source attribute, the palette
			* attribute, token variables, the font sizes, font lists, and the owned metadata node.
			*/
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE);
				const body = document.body;
				body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of Object.values(FONT_SIZE_VARIABLES)) body.style.removeProperty(name);
				for (const name of Object.values(FONT_FAMILY_VARIABLES)) body.style.removeProperty(name);
				for (const name of this.appliedTokens) body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		const __p0 = (() => { const module = {exports:{}}; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// extension.mjs
var extension_exports = {};
__export(extension_exports, {
  Controls: () => Controls,
  Desktop: () => Desktop,
  Frame: () => Frame,
  Navigation: () => Navigation,
  SceneActions: () => SceneActions,
  css: () => css,
  install: () => install
});
module.exports = __toCommonJS(extension_exports);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react3 = __toESM(require("react"), 1);

// scene-store.mjs
function createSceneStore({ workspaces, session, connection, maxScenes = 8 }) {
  if (![workspaces, session, connection].every((s) => s?.getSnapshot && s?.subscribe)) throw Error("Authoritative workspace/session/connection sources required");
  let revision = 0, mode = "original", chatWidth = 420, narrowPane = "workspace", navigationOpen = false, workspaceFocus = false, disposed = false;
  let snapshot, selected = null, reason = "", nextId = 0, epochNumber = 0, watchedSignal, desktop = null;
  const watchAbort = (signal) => {
    if (watchedSignal === signal) return;
    watchedSignal?.removeEventListener("abort", sync);
    watchedSignal = signal;
    watchedSignal?.addEventListener("abort", sync, { once: true });
  };
  const epochs = /* @__PURE__ */ new WeakMap(), rotations = /* @__PURE__ */ new Map(), scenes = /* @__PURE__ */ new Map(), listeners = /* @__PURE__ */ new Set();
  const publish = () => {
    snapshot = Object.freeze({ revision: ++revision, mode, chatWidth, narrowPane, navigationOpen, workspaceFocus, selected, reason, desktop, scenes: Object.freeze([...scenes.values()]) });
    for (const listener of [...listeners]) listener();
  };
  function sync() {
    if (disposed) return;
    const generation = connection.getSnapshot(), catalog = workspaces.getSnapshot(), sessionId = session.getSnapshot()?.key;
    watchAbort(generation?.signal);
    let next = null, problem = "", workspace;
    if (!generation || generation.signal?.aborted) problem = "\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF1B\u5DF2\u6709\u73B0\u573A\u4FDD\u7559\uFF0C\u672A\u81EA\u52A8\u6539\u7ED1\u3002";
    else if (catalog.phase !== "ready") problem = "\u6B63\u5728\u786E\u8BA4\u5BBF\u4E3B\u5DE5\u4F5C\u533A\u5173\u7CFB\uFF1B\u4E0D\u4F7F\u7528\u7F13\u5B58\u5173\u7CFB\u6267\u884C\u64CD\u4F5C\u3002";
    else if (!sessionId) problem = "\u8BF7\u9009\u62E9\u672C\u5DE5\u4F5C\u533A\u7684\u4E00\u6761\u771F\u5B9E\u4F1A\u8BDD\u3002";
    else {
      const matches = catalog.items.filter((w) => w.sessionIds.includes(sessionId));
      if (matches.length !== 1) problem = matches.length ? "\u5DE5\u4F5C\u533A\u5F52\u5C5E\u51B2\u7A81\uFF0C\u672A\u5408\u5E76\u73B0\u573A\u3002" : "\u5F53\u524D\u4F1A\u8BDD\u5C1A\u65E0\u786E\u8BA4\u7684\u5DE5\u4F5C\u533A\u5F52\u5C5E\u3002";
      else {
        workspace = matches[0];
        if (!epochs.has(generation)) epochs.set(generation, ++epochNumber);
        const base = JSON.stringify([epochs.get(generation), workspace.workspaceId]);
        next = rotations.has(base) ? JSON.stringify([epochs.get(generation), workspace.workspaceId, rotations.get(base)]) : base;
        if (!scenes.has(next)) {
          if (scenes.size >= maxScenes) {
            problem = "\u4FDD\u7559\u73B0\u573A\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u672A\u9759\u9ED8\u6E05\u9664\u65E7\u5185\u5BB9\u3002";
            next = null;
          } else scenes.set(next, { id: `p0-scene-${++nextId}`, key: next, workspaceId: workspace.workspaceId, title: workspace.title || workspace.workspaceId, note: "", address: "", url: "", arrangement: "split", revision: 0 });
        }
      }
    }
    let titleChanged = false;
    if (next && workspace && scenes.get(next).title !== (workspace.title || workspace.workspaceId)) {
      scenes.get(next).title = workspace.title || workspace.workspaceId;
      titleChanged = true;
    }
    if (snapshot && selected === next && reason === problem && !titleChanged) return;
    selected = next;
    reason = problem;
    publish();
  }
  const offs = [workspaces, session, connection].map((source) => source.subscribe(sync));
  sync();
  const api = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    newScene(key) {
      if (disposed || !selected || key !== selected || !scenes.has(key)) throw Error("\u8BF7\u5728\u5F53\u524D\u5DF2\u786E\u8BA4\u7684\u5DE5\u4F5C\u533A\u65B0\u5EFA\u73B0\u573A");
      if (scenes.size >= maxScenes) throw Error("\u4FDD\u7559\u73B0\u573A\u5DF2\u8FBE\u4E0A\u9650\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5E76\u91CA\u653E\u4E0D\u7528\u7684\u65E7\u73B0\u573A");
      const generation = connection.getSnapshot(), scene = scenes.get(key);
      if (!generation || generation.signal?.aborted) throw Error("\u8FDE\u63A5\u5C1A\u672A\u6062\u590D\uFF0C\u4E0D\u80FD\u65B0\u5EFA\u73B0\u573A");
      const base = JSON.stringify([epochs.get(generation), scene.workspaceId]);
      rotations.set(base, (rotations.get(base) ?? 0) + 1);
      sync();
      return selected;
    },
    forgetScene(key) {
      if (disposed || key === selected) throw Error("\u5F53\u524D\u73B0\u573A\u4E0D\u80FD\u4F5C\u4E3A\u65E7\u73B0\u573A\u91CA\u653E");
      if (!scenes.has(key)) return false;
      if (!desktop?.entries || desktop.entries.has(key) || scenes.get(key).note || scenes.get(key).url) throw Error("\u73B0\u573A\u5185\u5BB9\u5C1A\u672A\u5B89\u5168\u5173\u95ED");
      scenes.delete(key);
      sync();
      publish();
      return true;
    },
    setDesktop(value) {
      if (!disposed && value && desktop !== value) {
        desktop = value;
        publish();
      }
    },
    setMode(next) {
      if (!["original", "workbench"].includes(next)) throw Error("Unknown shell mode");
      if (disposed || next === mode) return;
      mode = next;
      publish();
    },
    setNavigationOpen(value) {
      if (disposed) return;
      navigationOpen = !!value;
      publish();
    },
    setWorkspaceFocus(value) {
      if (disposed) return;
      workspaceFocus = !!value;
      if (workspaceFocus) narrowPane = "workspace";
      publish();
    },
    resizeChat(value) {
      if (!Number.isFinite(value)) throw Error("Invalid width");
      if (disposed) return;
      chatWidth = Math.max(320, Math.min(560, Math.round(value)));
      publish();
    },
    setNarrowPane(next) {
      if (!["workspace", "chat"].includes(next)) throw Error("Unknown pane");
      if (disposed) return;
      narrowPane = next;
      if (next === "chat") workspaceFocus = false;
      publish();
    },
    update(key, patch) {
      if (disposed || key !== selected || !scenes.has(key)) throw Error("Inactive workspace; edit rejected");
      const scene = scenes.get(key);
      for (const field of Object.keys(patch)) if (!["note", "address", "url", "arrangement"].includes(field)) throw Error("Unexpected scene field");
      if (["note", "address", "url"].some((field) => field in patch && (typeof patch[field] !== "string" || patch[field].length > (field === "note" ? 262144 : 8192)))) throw Error("Scene value exceeds limit");
      if ("arrangement" in patch && !["split", "stack"].includes(patch.arrangement)) throw Error("Unknown arrangement");
      Object.assign(scene, patch, { revision: scene.revision + 1 });
      publish();
    },
    dispose() {
      disposed = true;
      watchAbort(void 0);
      for (const off of offs) off();
      listeners.clear();
    }
  };
  return Object.freeze(api);
}

// layout-view.mjs
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var layoutCSS = `
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

// ../src/workbench/icons.mjs
var import_react2 = __toESM(require("react"), 1);
var paths = {
  files: ["M3 7h7l2 2h9v11H3z", "M3 7V4h6l2 3"],
  document: ["M6 3h8l4 4v14H6z", "M14 3v5h4", "M9 12h6M9 16h6"],
  terminal: ["M4 5h16v14H4z", "m8 9 3 3-3 3M13 15h3"],
  web: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"],
  note: ["M4 3h16v12l-6 6H4z", "M14 21v-6h6", "M8 8h8M8 11h5"],
  search: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0", "m15 15 6 6"],
  layout: ["M3 4h18v16H3z", "M8 4v16M8 13h13"],
  plus: ["M12 5v14M5 12h14"],
  save: ["M5 3h13l3 3v15H3V3z", "M7 3v6h10V3M7 21v-7h10v7"],
  more: ["M4 12h1M11 12h1M18 12h1"],
  close: ["m6 6 12 12M6 18 18 6"],
  minimize: ["M5 12h14"],
  maximize: ["M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6"],
  restore: ["M8 3v5H3M16 3v5h5M21 16h-5v5M3 16h5v5"],
  download: ["M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"],
  compare: ["M8 3H3v18h5M16 3h5v18h-5M9 8h6m-3-3 3 3-3 3M15 16H9m3-3-3 3 3 3"],
  quote: ["M5 6h5v6H6c0 3 1 4 3 5M14 6h5v6h-4c0 3 1 4 3 5"],
  refresh: ["M20 7v5h-5M4 17v-5h5", "M5 8a8 8 0 0 1 13-3l2 3M19 16a8 8 0 0 1-13 3l-2-3"],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 5 7 7-7 7"],
  arrow: ["m12 5-7 7m7-7 7 7M12 5v14"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 7v5l3 2"],
  command: ["M8 8H5a3 3 0 1 1 3-3v14a2 2 0 1 1-2-2h13a2 2 0 1 1-2 2V5a2 2 0 1 1 2 2H8v10"],
  external: ["M14 3h7v7m0-7L10 14", "M10 3H3v18h18v-7"],
  connection: ["M8 5h8v5H8zM5 15h14v5H5zM12 10v5"]
};
function Icon({ name, size = 18, className = "" }) {
  return import_react2.default.createElement(
    "svg",
    { className: "wb-icon " + className, width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false },
    (Object.hasOwn(paths, name) ? paths[name] : paths.document).map((d, index) => import_react2.default.createElement("path", { key: index, d }))
  );
}

// extension.mjs
var h2 = import_react3.default.createElement;
var useState = (store) => import_react3.default.useSyncExternalStore(store.subscribe, store.getSnapshot);
function install(ctx) {
  const store = createSceneStore({ workspaces: ctx.workspaces.list, session: ctx.uiSession.current, connection: ctx.connection.generation });
  const style = document.createElement("style");
  style.dataset.plugin = "dshome-dual-shell-p0";
  style.textContent = css;
  document.head.append(style);
  ctx.effect(() => () => {
    store.dispose();
    style.remove();
  });
  ctx.reflect.provide("dualShellP0", store);
  ctx.inject(["dshomeDesktop"], (scope) => {
    store.setDesktop(scope.get("dshomeDesktop"));
  });
  for (const name of ["conversation.session.header.utilities", "conversation.hero.options"]) {
    ctx.slots.inject(name, () => ctx.slots.register({ name, id: "dshome.shell-actions", order: -60 }, () => h2(SceneActions, { store, native: true })));
  }
  return store;
}
function Controls({ store }) {
  const view = useState(store);
  return h2(
    "div",
    { className: "p0-inline-controls" },
    h2(
      "div",
      { className: "p0-mode-switch", role: "group", "aria-label": "\u6574\u7A97\u6A21\u5F0F", title: "\u53EA\u5207\u6362\u5448\u73B0\uFF0C\u4FDD\u7559\u5F53\u524D\u4F1A\u8BDD\u548C\u5DE5\u4F5C\u73B0\u573A" },
      ...[["original", "\u804A\u5929"], ["workbench", "\u5DE5\u4F5C\u53F0"]].map(([mode, title]) => h2("button", { key: mode, type: "button", "aria-pressed": view.mode === mode, onClick: () => store.setMode(mode) }, title))
    )
  );
}
function SceneActions({ store, native = false }) {
  const view = useState(store);
  if (view.mode !== "workbench") return null;
  return h2(
    "div",
    { className: "p0-inline-controls p0-scene-actions" + (native ? " p0-native-controls" : "") },
    h2("button", { className: "p0-narrow-switch", type: "button", "aria-label": view.narrowPane === "chat" ? "\u663E\u793A\u64CD\u4F5C\u533A" : "\u663E\u793A\u53F3\u4FA7\u804A\u5929", onClick: () => store.setNarrowPane(view.narrowPane === "chat" ? "workspace" : "chat") }, view.narrowPane === "chat" ? "\u64CD\u4F5C\u533A" : "\u53F3\u4FA7\u804A\u5929"),
    view.desktop?.RecoveryShelf && h2(view.desktop.RecoveryShelf, { selectedKey: view.selected })
  );
}
function Navigation({ store, renderSlot }) {
  const view = useState(store), root = import_react3.default.useRef(null);
  import_react3.default.useEffect(() => {
    if (!view.navigationOpen) return;
    const close = (e) => {
      if (e.key === "Escape") {
        store.setNavigationOpen(false);
        root.current?.querySelector("[data-nav-trigger]")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [view.navigationOpen]);
  return h2(
    import_react3.default.Fragment,
    null,
    view.navigationOpen && h2("button", { className: "p0-navigation-backdrop", "aria-label": "\u6536\u8D77\u5DE5\u4F5C\u533A\u5BFC\u822A", onClick: () => store.setNavigationOpen(false) }),
    h2(
      "nav",
      { className: "p0-navigation-rail", ref: root, "aria-label": "\u9CB8\u9C7C\u5DE5\u4F5C\u53F0\u5DE5\u5177\u680F" },
      h2("div", { className: "p0-whale-logo", title: "\u9CB8\u9C7C\u5DE5\u4F5C\u53F0", "aria-label": "\u9CB8\u9C7C\u5DE5\u4F5C\u53F0" }, h2(import_dsh_client_ui_primitives.FishLogo, { size: 28 })),
      h2("button", { type: "button", "data-nav-trigger": true, "aria-label": "\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD", "aria-expanded": view.navigationOpen, title: "\u5DE5\u4F5C\u533A\u4E0E\u4F1A\u8BDD", onClick: () => store.setNavigationOpen(!view.navigationOpen) }, h2(Icon, { name: "layout", size: 22 })),
      h2("button", { type: "button", "aria-label": view.workspaceFocus ? "\u6062\u590D\u53F3\u4FA7\u804A\u5929" : "\u4E13\u6CE8\u64CD\u4F5C\u533A", "aria-pressed": view.workspaceFocus, title: view.workspaceFocus ? "\u6062\u590D\u53F3\u4FA7\u804A\u5929" : "\u4E13\u6CE8\u64CD\u4F5C\u533A", onClick: () => store.setWorkspaceFocus(!view.workspaceFocus) }, h2(Icon, { name: view.workspaceFocus ? "restore" : "maximize", size: 21 }))
    )
  );
}
function Frame({ NativeFrame, ...props }) {
  const view = useState(props.dualShell);
  const globalPanel = props.usePanelInfo((info) => info.activePanelId !== null);
  import_react3.default.useEffect(() => {
    if (globalPanel || view.mode !== "workbench") props.dualShell.setNavigationOpen(false);
  }, [globalPanel, view.mode]);
  return h2(
    "div",
    { className: "p0-shell", "data-p0-shell": true, "data-mode": view.mode, "data-pane": view.narrowPane },
    h2(NativeFrame, { ...props, dualView: view }),
    h2("div", { className: "p0-mode-anchor" }, h2(Controls, { store: props.dualShell })),
    view.mode === "workbench" && (!view.selected || !view.desktop) && h2("div", { className: "p0-recovery-anchor" }, h2(SceneActions, { store: props.dualShell }))
  );
}
function Desktop({ store, active, chatWidth, chatMax }) {
  const view = useState(store), drag = import_react3.default.useRef(null);
  return h2(
    "section",
    { className: "p0-desktop", "aria-label": "\u4E3B\u64CD\u4F5C\u533A", "aria-hidden": !active, inert: !active ? "" : void 0 },
    h2(
      "div",
      { className: "p0-scene-area" },
      view.scenes.map((scene) => h2(
        "div",
        { key: scene.id, className: "p0-full-scene", hidden: view.selected !== scene.key, inert: active && view.selected === scene.key ? void 0 : "", "data-scene": scene.id, "data-workspace": scene.workspaceId },
        view.desktop ? h2(view.desktop.Body, { scene, active: active && view.selected === scene.key, shellControls: h2(SceneActions, { store }), onOriginal: () => store.setMode("original") }) : h2("p", { role: "status" }, "\u771F\u5B9E\u5DE5\u4F5C\u533A\u670D\u52A1\u5C1A\u672A\u88C5\u914D\uFF1B\u672A\u663E\u793A\u6A21\u62DF\u6587\u4EF6\u6216\u7EC8\u7AEF\u3002")
      )),
      !view.selected && h2("p", { role: "status" }, view.reason)
    ),
    h2("div", {
      className: "p0-chat-separator",
      role: "separator",
      tabIndex: 0,
      "aria-label": "\u8C03\u6574\u53F3\u4FA7\u804A\u5929\u5BBD\u5EA6",
      "aria-orientation": "vertical",
      "aria-valuemin": 320,
      "aria-valuemax": chatMax,
      "aria-valuenow": chatWidth,
      onPointerDown(e) {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, width: chatWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      },
      onPointerMove(e) {
        if (drag.current) store.resizeChat(drag.current.width + drag.current.x - e.clientX);
      },
      onPointerUp() {
        drag.current = null;
      },
      onPointerCancel() {
        drag.current = null;
      },
      onLostPointerCapture() {
        drag.current = null;
      },
      onKeyDown(e) {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          store.resizeChat(Math.min(chatMax, e.key === "Home" ? 320 : e.key === "End" ? chatMax : chatWidth + (e.key === "ArrowLeft" ? 20 : -20)));
        }
      }
    })
  );
}
var css = layoutCSS + `
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

return module.exports; })();
		function DualFrame(props) { return (0, react_jsx_runtime.jsx)(__p0.Frame, {...props, NativeFrame: AppFrame}); }
		//#region lib/types/client/index.js
		/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
		const inject = [
			"slots",
			"theme",
			"locale",
			"shortcuts", "uiSession", "workspaces", "connection"
		];
		/**
		* Client plugin body: provide ctx.layout, then one register() call — AppFrame
		* into 'root' with its child-slot declarations, the layout store seat,
		* and the shared root instance supplying commands and the panel-info source.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const dualShell = __p0.install(ctx);
			ctx.effect(() => ctx.locale.register("shortcuts.layout", {
				zh,
				en
			}), "layout: command labels");
			const t = ctx.locale.bind("shortcuts.layout");
			ctx.effect(() => {
				const handle = createLayoutStore();
				const instance = handle.create();
				const store = {
					...handle,
					create: () => instance
				};
				const retainMainPanels = () => {
					instance.actions.retainMainPanels(ctx.slots.entries("main").flatMap((entry) => entry.options.key === void 0 ? [] : [entry.options.key]));
				};
				const layout = new LayoutController(instance.actions, (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id), {
					getSnapshot: () => instance.getSnapshot().panelInfo,
					subscribe: (listener) => instance.subscribe(listener)
				});
				const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } });
				const disposeService = ctx.reflect.provide("layout", layout);
				const disposeRegistration = ctx.slots.register({
					name: "root",
					locale: "common",
					children: {
						"sidebar": {
							kind: "single",
							scope: "root"
						},
						"main": {
							kind: "keyed",
							scope: "root"
						},
						"rightbar": {
							kind: "single",
							scope: "root"
						},
						"shell.bottom": {
							kind: "single",
							scope: "root"
						},
						"shell.overlay": {
							kind: "list",
							scope: "root"
						},
						"shell.leading": {
							kind: "single",
							scope: "root"
						}
					},
					store,
					inject: () => ({dualShell})
				}, DualFrame);
				const disposeShortcut = ctx.shortcuts.register({
					id: "sidebar.left.toggle",
					label: () => t("toggle"),
					aliases: ["sidebar", "toggle left sidebar"],
					defaults: {
						"desktop:macos": {
							code: "KeyB",
							modifiers: ["primary"]
						},
						"desktop:windows": {
							code: "KeyB",
							modifiers: ["primary"]
						},
						"desktop:linux": {
							code: "KeyB",
							modifiers: ["primary"]
						},
						"web:macos": {
							code: "KeyB",
							modifiers: ["primary", "alt"]
						},
						"web:windows": {
							code: "KeyB",
							modifiers: ["primary", "alt"]
						}
					},
					regions: ["page", "editable"],
					modals: [],
					resolve: () => ({
						status: "handled",
						run: () => {
							layout.toggleSidebar();
						}
					})
				});
				const disposePanels = ctx.slots.subscribe("main", retainMainPanels);
				retainMainPanels();
				return () => {
					disposeShortcut();
					layout.dispose();
					disposePanels();
					disposeRegistration();
					disposePanelInfo();
					disposeService();
				};
			}, "ui-layout: service + root registration");
			ctx.effect(() => {
				const presenter = new ThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "ui-layout: theme presenter");
		}
		//#endregion
		exports.LayoutController = LayoutController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map