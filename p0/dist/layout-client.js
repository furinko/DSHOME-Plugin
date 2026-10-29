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
			const dualChatWidth = Math.min(dualView.chatWidth, dualChatMax);
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
				collapsed: sidebarCollapsed,
				width: cols.sidebar
			}), [
				renderSlot,
				sidebarCollapsed,
				cols.sidebar
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
				"data-dual-viewport": viewport, "data-dual-mode": dualView.mode,
				"data-dual-global": String(dualGlobal),
				"data-dual-narrow": dualView.narrowPane,
				style: {
					...document.documentElement.hasAttribute("data-windows-titlebar") ? { "--dsh-windows-sidebar-width": `${cols.sidebar}px` } : {},
					gridTemplateColumns: dualActive ? `${cols.sidebar}px minmax(0px, 1fr) ${dualChatWidth}px` : `${cols.sidebar}px minmax(${cols.rightbar === 0 ? 0 : 400}px, 1fr) minmax(0px, ${rightbarMax}px)`
				},
				"data-sidebar-collapsed": sidebarCollapsed || void 0,
				"data-rightbar-collapsed": cols.rightbar === 0 || void 0,
				"data-rightbar-fullscreen": layoutInfo.rightbarFullscreen || void 0,
				"data-rightbar-instant": layoutInfo.rightbarInstant || void 0,
				"data-dragging": dragging || void 0,
				"data-animating": animating > 0 || void 0,
				children: [
					(0, react_jsx_runtime.jsx)(DocumentTitle, {
						productTitle,
						useSessions,
						usePanelInfo
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: AppFrame_module_css_default.sidebarCol,
						children: sidebar
					}),
					(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(CenterColumn, { children: main, hiddenByP0: dualActive && viewport <= 900 && dualView.narrowPane === "workspace" }), (0, react_jsx_runtime.jsx)(RightbarColumn, { children: renderSlot("rightbar", {
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
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
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
  Desktop: () => Desktop,
  Frame: () => Frame,
  css: () => css,
  install: () => install
});
module.exports = __toCommonJS(extension_exports);
var import_react2 = __toESM(require("react"), 1);

// scene-store.mjs
function createSceneStore({ workspaces, session, connection, maxScenes = 8 }) {
  if (![workspaces, session, connection].every((s) => s?.getSnapshot && s?.subscribe)) throw Error("Authoritative workspace/session/connection sources required");
  let revision = 0, mode = "original", chatWidth = 420, narrowPane = "workspace", disposed = false;
  let snapshot, selected = null, reason = "", nextId = 0, epochNumber = 0, watchedSignal;
  const watchAbort = (signal) => {
    if (watchedSignal === signal) return;
    watchedSignal?.removeEventListener("abort", sync);
    watchedSignal = signal;
    watchedSignal?.addEventListener("abort", sync, { once: true });
  };
  const epochs = /* @__PURE__ */ new WeakMap(), scenes = /* @__PURE__ */ new Map(), listeners = /* @__PURE__ */ new Set();
  const publish = () => {
    snapshot = Object.freeze({ revision: ++revision, mode, chatWidth, narrowPane, selected, reason, scenes: Object.freeze([...scenes.values()]) });
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
        next = JSON.stringify([epochs.get(generation), workspace.workspaceId]);
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
    setMode(next) {
      if (!["original", "workbench"].includes(next)) throw Error("Unknown shell mode");
      if (disposed || next === mode) return;
      mode = next;
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
      publish();
    },
    update(key2, patch) {
      if (disposed || key2 !== selected || !scenes.has(key2)) throw Error("Inactive workspace; edit rejected");
      const scene = scenes.get(key2);
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
function parseWebAddress(value, applicationOrigin) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error("\u8BF7\u8F93\u5165\u5B8C\u6574 HTTP(S) \u5730\u5740\u3002");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 8192) throw Error("\u53EA\u63A5\u53D7\u4E0D\u542B\u51ED\u636E\u7684 HTTP(S) \u5730\u5740\u3002");
  if (url.origin === applicationOrigin) throw Error("\u4E0D\u80FD\u5D4C\u5165 DSH \u5E94\u7528\u81EA\u8EAB\u3002");
  return url.href;
}

// ../src/workbench/model.mjs
var FORMAT_VERSION = 1;
var MAX_PANELS = 64;
var MAX_NODES = 255;
var MAX_DEPTH = 16;
var unsafe = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
var WorkspaceError = class extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
};
var refuse = (code, message) => {
  throw new WorkspaceError(code, message);
};
var own = (object, key2) => Object.hasOwn(object, key2);
var clone = (value) => JSON.parse(JSON.stringify(value));
var key = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(value) && !unsafe.has(value);
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function fields(value, allowed, code) {
  if (Object.keys(value).some((name) => !allowed.includes(name))) refuse(code, "Unknown fields in persisted layout schema");
}
var assertKey = (value, field) => {
  if (!key(value)) refuse("INVALID_KEY", "Invalid " + field);
  return value;
};
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function pane(id, tabs = []) {
  return { type: "pane", id, tabs: [...tabs], active: tabs[0] ?? null };
}
function emptyLayout() {
  return { root: pane("pane-root"), collapsed: [], maximized: null };
}
function nodes(root) {
  return root.type === "pane" ? [root] : [root, ...nodes(root.first), ...nodes(root.second)];
}
function panes(root) {
  return nodes(root).filter((item) => item.type === "pane");
}
function findPane(layout, id) {
  return panes(layout.root).find((item) => item.id === id);
}
function panelPane(layout, id) {
  return panes(layout.root).find((item) => item.tabs.includes(id));
}
function replaceNode(root, id, replacement) {
  if (root.id === id) return replacement;
  if (root.type === "split") {
    root.first = replaceNode(root.first, id, replacement);
    root.second = replaceNode(root.second, id, replacement);
  }
  return root;
}
function trim(root) {
  if (root.type === "pane") return root.tabs.length ? root : null;
  const first = trim(root.first), second = trim(root.second);
  if (!first) return second;
  if (!second) return first;
  root.first = first;
  root.second = second;
  return root;
}
function take(layout, id, prune = false) {
  const from = panelPane(layout, id);
  if (from) {
    const index = from.tabs.indexOf(id);
    from.tabs.splice(index, 1);
    if (from.active === id) from.active = from.tabs[Math.min(index, from.tabs.length - 1)] ?? null;
  }
  layout.collapsed = layout.collapsed.filter((item) => item.panelId !== id);
  if (layout.maximized === id) layout.maximized = null;
  if (prune) layout.root = trim(layout.root) ?? pane("pane-root");
}
function checkPanelMap(panels) {
  if (!record(panels) || Object.keys(panels).length > MAX_PANELS) refuse("INVALID_PANELS", "Too many or invalid panel instances");
  for (const [id, panel] of Object.entries(panels)) {
    assertKey(id, "panel id");
    if (!record(panel) || panel.id !== id || !key(panel.kind) || typeof panel.title !== "string" || panel.title.length > 120) refuse("INVALID_PANEL", "Invalid panel instance");
    if (Object.keys(panel).some((name) => !["id", "kind", "title"].includes(name))) refuse("INVALID_PANEL", "Content state must not be stored inside layout records");
  }
}
function validateLayout(layout, panels) {
  checkPanelMap(panels);
  if (!record(layout) || !Array.isArray(layout.collapsed) || layout.collapsed.length > MAX_PANELS) refuse("INVALID_LAYOUT", "Invalid layout");
  fields(layout, ["root", "collapsed", "maximized"], "INVALID_LAYOUT");
  const ids = /* @__PURE__ */ new Set(), seenPanels = /* @__PURE__ */ new Set();
  let count = 0;
  function use(id) {
    if (!own(panels, id) || seenPanels.has(id)) refuse("INVALID_REFERENCE", "Missing or duplicate panel reference");
    seenPanels.add(id);
  }
  function walk(node, depth) {
    if (!record(node) || depth > MAX_DEPTH || ++count > MAX_NODES || !key(node.id) || ids.has(node.id)) refuse("INVALID_TREE", "Invalid, duplicate or excessively deep layout node");
    ids.add(node.id);
    fields(node, node.type === "pane" ? ["type", "id", "tabs", "active"] : ["type", "id", "axis", "ratio", "first", "second"], "INVALID_TREE");
    if (node.type === "pane") {
      if (!Array.isArray(node.tabs) || node.tabs.length > MAX_PANELS) refuse("INVALID_TABS", "Invalid pane tabs");
      if (node.tabs.length ? !node.tabs.includes(node.active) : node.active !== null) refuse("INVALID_ACTIVE_TAB", "Active tab does not belong to pane");
      for (const id of node.tabs) use(id);
    } else if (node.type === "split") {
      if (!["x", "y"].includes(node.axis) || !Number.isFinite(node.ratio) || node.ratio < 0.01 || node.ratio > 0.99) refuse("INVALID_SPLIT", "Invalid split axis or ratio");
      walk(node.first, depth + 1);
      walk(node.second, depth + 1);
    } else refuse("INVALID_TREE", "Unknown layout node type");
  }
  walk(layout.root, 0);
  for (const item of layout.collapsed) {
    if (!record(item) || !["left", "right", "bottom"].includes(item.edge) || !key(item.paneId) || !Number.isSafeInteger(item.index) || item.index < 0 || item.index > MAX_PANELS) refuse("INVALID_COLLAPSED", "Invalid collapsed placement");
    fields(item, ["panelId", "edge", "paneId", "index"], "INVALID_COLLAPSED");
    use(item.panelId);
  }
  if (seenPanels.size !== Object.keys(panels).length) refuse("ORPHAN_PANEL", "Every instance must be placed or explicitly collapsed");
  if (layout.maximized !== null && (!seenPanels.has(layout.maximized) || layout.collapsed.some((item) => item.panelId === layout.maximized))) refuse("INVALID_MAXIMIZED", "Maximized panel must be visible");
  return true;
}
function validateProject(project, expectedProjectId) {
  if (!record(project) || project.version !== FORMAT_VERSION) refuse("UNSUPPORTED_VERSION", "Unsupported workspace format");
  if (typeof expectedProjectId !== "string" || !expectedProjectId || project.projectId !== expectedProjectId) refuse("WRONG_PROJECT", "Layout belongs to another project");
  if (!Number.isSafeInteger(project.revision) || project.revision < 0) refuse("INVALID_REVISION", "Invalid project revision");
  validateLayout(project.layout, project.panels);
  if (!record(project.presets) || Object.keys(project.presets).length > 20) refuse("INVALID_PRESETS", "Invalid layout presets");
  for (const [name, saved] of Object.entries(project.presets)) {
    assertKey(name, "preset id");
    validateLayout(saved, project.panels);
  }
  if (!key(project.selectedPreset) || project.selectedPreset !== "custom" && !own(project.presets, project.selectedPreset)) refuse("INVALID_PRESET", "Invalid selected preset");
  fields(project, ["version", "projectId", "revision", "panels", "layout", "presets", "selectedPreset"], "INVALID_PROJECT");
  return true;
}
function createWorkspaceModel({ projectId, initial, onListenerError = () => {
} } = {}) {
  if (typeof projectId !== "string" || !projectId || projectId.length > 4096) refuse("INVALID_PROJECT", "An explicit host/workspace project identity is required");
  if (initial) validateProject(initial, projectId);
  let committed = initial ? clone(initial) : { version: FORMAT_VERSION, projectId, revision: 0, panels: {}, layout: emptyLayout(), presets: {}, selectedPreset: "custom" };
  validateProject(committed, projectId);
  let edit = null, history = [], redo = [], sequence = 0, snapshot;
  const listeners = /* @__PURE__ */ new Set(), registry = /* @__PURE__ */ new Map();
  function publish() {
    snapshot = freeze({ ...clone(committed), editing: edit === null ? null : clone(edit), canUndo: history.length > 0, canRedo: redo.length > 0 });
    for (const callback of [...listeners]) {
      try {
        callback();
      } catch (error) {
        try {
          onListenerError(error);
        } catch {
        }
      }
    }
  }
  function uid(prefix, project) {
    const used = /* @__PURE__ */ new Set([...Object.keys(project.panels), ...nodes(project.layout.root).map((n) => n.id)]);
    let id;
    do {
      id = prefix + "-" + ++sequence;
    } while (used.has(id));
    return id;
  }
  function nextRevision() {
    if (committed.revision >= Number.MAX_SAFE_INTEGER) refuse("REVISION_EXHAUSTED", "Project revision cannot advance safely");
    return committed.revision + 1;
  }
  function working() {
    return edit ? { panels: clone(edit.panels), layout: clone(edit.layout) } : { panels: clone(committed.panels), layout: clone(committed.layout) };
  }
  function update(operation) {
    const next = working(), result = operation(next);
    validateLayout(next.layout, next.panels);
    if (edit) {
      history.push(clone(edit));
      if (history.length > 50) history.shift();
      redo = [];
      edit = next;
    } else {
      const presets = clone(committed.presets);
      for (const saved of Object.values(presets)) reconcile(saved, next.panels);
      committed = { ...committed, panels: next.panels, layout: next.layout, presets, revision: nextRevision() };
    }
    publish();
    return result;
  }
  function reconcile(layout, allPanels) {
    for (const id of [...panes(layout.root).flatMap((p) => p.tabs), ...layout.collapsed.map((p) => p.panelId)]) if (!own(allPanels, id)) take(layout, id, false);
    const placed = /* @__PURE__ */ new Set([...panes(layout.root).flatMap((p) => p.tabs), ...layout.collapsed.map((p) => p.panelId)]);
    for (const id of Object.keys(allPanels)) if (!placed.has(id)) {
      const first = panes(layout.root)[0];
      layout.collapsed.push({ panelId: id, edge: "bottom", paneId: first.id, index: first.tabs.length });
    }
    if (layout.maximized && !own(allPanels, layout.maximized)) layout.maximized = null;
  }
  function requirePanel(project, id) {
    if (!own(project.panels, id)) refuse("PANEL_NOT_FOUND", "Panel instance does not exist");
  }
  function dockInto(project, panelId, targetPaneId, edge = "tab") {
    requirePanel(project, panelId);
    if (!["tab", "left", "right", "top", "bottom"].includes(edge)) refuse("INVALID_DROP", "Unknown docking target");
    let target = findPane(project.layout, targetPaneId);
    if (!target) refuse("PANE_NOT_FOUND", "Target pane no longer exists");
    const source = panelPane(project.layout, panelId);
    if (source === target && target.tabs.length === 1 && edge !== "tab") refuse("SELF_SPLIT", "A sole panel cannot be split against itself");
    take(project.layout, panelId, false);
    target = findPane(project.layout, targetPaneId);
    if (edge === "tab" || !target.tabs.length) {
      target.tabs.push(panelId);
      target.active = panelId;
      return;
    }
    const inserted = pane(uid("pane", project), [panelId]);
    const first = ["left", "top"].includes(edge) ? inserted : target;
    const second = first === inserted ? target : inserted;
    project.layout.root = replaceNode(project.layout.root, target.id, { type: "split", id: uid("split", project), axis: ["left", "right"].includes(edge) ? "x" : "y", ratio: 0.5, first, second });
  }
  const api = {
    getSnapshot: () => snapshot,
    subscribe: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    registerModule(definition) {
      if (!record(definition) || !key(definition.kind) || typeof definition.label !== "string" || !definition.label.trim() || definition.label.length > 80) refuse("INVALID_MODULE", "A typed module definition is required");
      if (registry.has(definition.kind)) refuse("DUPLICATE_MODULE", "Module kind is already registered");
      const copy = freeze({ kind: definition.kind, label: definition.label, minWidth: definition.minWidth ?? 240, minHeight: definition.minHeight ?? 120 });
      if (!Number.isFinite(copy.minWidth) || copy.minWidth < 80 || copy.minWidth > 2e3 || !Number.isFinite(copy.minHeight) || copy.minHeight < 44 || copy.minHeight > 2e3) refuse("INVALID_MODULE", "Invalid module minimum size");
      registry.set(copy.kind, copy);
      publish();
      let released = false;
      return () => {
        if (!released && registry.get(copy.kind) === copy) {
          released = true;
          registry.delete(copy.kind);
          publish();
        }
      };
    },
    modules: () => [...registry.values()],
    addPanel(kind, { id, title, targetPaneId, edge = "tab" } = {}) {
      if (!registry.has(kind)) refuse("MODULE_UNAVAILABLE", "Module kind is not registered");
      return update((next) => {
        if (Object.keys(next.panels).length >= MAX_PANELS) refuse("PANEL_LIMIT", "Panel limit reached");
        const panelId = id ?? uid("panel", next);
        assertKey(panelId, "panel id");
        if (own(next.panels, panelId)) refuse("DUPLICATE_PANEL", "Panel instance id already exists");
        const label = title ?? registry.get(kind).label;
        if (typeof label !== "string" || !label.trim() || label.length > 120) refuse("INVALID_TITLE", "Invalid panel title");
        next.panels[panelId] = { id: panelId, kind, title: label };
        dockInto(next, panelId, targetPaneId ?? panes(next.layout.root)[0].id, edge);
        return panelId;
      });
    },
    renamePanel(id, title) {
      if (typeof title !== "string" || !title.trim() || title.length > 120) refuse("INVALID_TITLE", "Invalid panel title");
      return update((next) => {
        requirePanel(next, id);
        next.panels[id].title = title;
      });
    },
    dock(panelId, targetPaneId, edge) {
      return update((next) => dockInto(next, panelId, targetPaneId, edge));
    },
    swap(firstId, secondId) {
      if (firstId === secondId) return;
      return update((next) => {
        const first = panelPane(next.layout, firstId), second = panelPane(next.layout, secondId);
        if (!first || !second) refuse("PANEL_NOT_VISIBLE", "Only placed panels can exchange positions");
        const exchange = (value) => value === firstId ? secondId : value === secondId ? firstId : value;
        for (const p of /* @__PURE__ */ new Set([first, second])) {
          p.tabs = p.tabs.map(exchange);
          p.active = exchange(p.active);
        }
        if (next.layout.maximized) next.layout.maximized = exchange(next.layout.maximized);
      });
    },
    mergePanes(sourceId, targetId) {
      if (sourceId === targetId) return;
      return update((next) => {
        const source = findPane(next.layout, sourceId), target = findPane(next.layout, targetId);
        if (!source || !target) refuse("PANE_NOT_FOUND", "Pane does not exist");
        target.tabs.push(...source.tabs);
        target.active = source.active ?? target.active;
        source.tabs = [];
        source.active = null;
      });
    },
    activate(panelId) {
      return update((next) => {
        const p = panelPane(next.layout, panelId);
        if (!p) refuse("PANEL_NOT_VISIBLE", "Expand the panel first");
        p.active = panelId;
        if (next.layout.maximized) next.layout.maximized = panelId;
      });
    },
    setSplitAxis(splitId, axis) {
      if (!["x", "y"].includes(axis)) refuse("INVALID_SPLIT", "Invalid split axis");
      return update((next) => {
        const split = nodes(next.layout.root).find((n) => n.id === splitId && n.type === "split");
        if (!split) refuse("SPLIT_NOT_FOUND", "Split no longer exists");
        split.axis = axis;
      });
    },
    resize(splitId, ratio) {
      if (!Number.isFinite(ratio)) refuse("INVALID_SPLIT", "Split ratio must be finite");
      return update((next) => {
        const split = nodes(next.layout.root).find((n) => n.id === splitId && n.type === "split");
        if (!split) refuse("SPLIT_NOT_FOUND", "Split no longer exists");
        split.ratio = Math.max(0.01, Math.min(0.99, ratio));
      });
    },
    collapse(panelId, edge = "bottom") {
      if (!["left", "right", "bottom"].includes(edge)) refuse("INVALID_COLLAPSED", "Invalid collapsed edge");
      return update((next) => {
        const p = panelPane(next.layout, panelId);
        if (!p) refuse("PANEL_NOT_VISIBLE", "Panel is already collapsed or absent");
        const placement = { panelId, edge, paneId: p.id, index: p.tabs.indexOf(panelId) };
        take(next.layout, panelId, false);
        next.layout.collapsed.push(placement);
      });
    },
    expand(panelId) {
      return update((next) => {
        const old = next.layout.collapsed.find((item) => item.panelId === panelId);
        if (!old) refuse("PANEL_NOT_COLLAPSED", "Panel is not collapsed");
        const target = findPane(next.layout, old.paneId) ?? panes(next.layout.root)[0];
        target.tabs.splice(Math.min(old.index, target.tabs.length), 0, panelId);
        target.active = panelId;
        next.layout.collapsed = next.layout.collapsed.filter((item) => item !== old);
      });
    },
    maximize(panelId) {
      return update((next) => {
        if (panelId !== null) {
          const p = panelPane(next.layout, panelId);
          if (!p) refuse("PANEL_NOT_VISIBLE", "Expand the panel first");
          p.active = panelId;
        }
        next.layout.maximized = next.layout.maximized === panelId ? null : panelId;
      });
    },
    // This forgets configuration ONLY. The controller must first obtain the
    // module's close agreement and successfully release its own resource hold.
    forgetPanel(panelId) {
      if (edit) refuse("EDIT_ACTIVE", "Close content outside layout editing, or collapse it in the draft");
      return update((next) => {
        requirePanel(next, panelId);
        take(next.layout, panelId, true);
        delete next.panels[panelId];
      });
    },
    beginEdit() {
      if (edit) refuse("EDIT_ACTIVE", "Layout is already being edited");
      edit = working();
      history = [];
      redo = [];
      publish();
    },
    cancelEdit() {
      if (!edit) return;
      edit = null;
      history = [];
      redo = [];
      publish();
    },
    applyEdit() {
      if (!edit) refuse("NO_EDIT", "No layout draft to apply");
      validateLayout(edit.layout, edit.panels);
      const presets = clone(committed.presets);
      for (const saved of Object.values(presets)) reconcile(saved, edit.panels);
      committed = { ...committed, layout: edit.layout, panels: edit.panels, selectedPreset: "custom", presets, revision: nextRevision() };
      edit = null;
      history = [];
      redo = [];
      publish();
    },
    undo() {
      if (!edit || !history.length) return false;
      redo.push(clone(edit));
      edit = history.pop();
      publish();
      return true;
    },
    redo() {
      if (!edit || !redo.length) return false;
      history.push(clone(edit));
      edit = redo.pop();
      publish();
      return true;
    },
    savePreset(name) {
      assertKey(name, "preset id");
      if (edit) refuse("EDIT_ACTIVE", "Apply or cancel the draft before saving a preset");
      if (!own(committed.presets, name) && Object.keys(committed.presets).length >= 20) refuse("PRESET_LIMIT", "Preset limit reached");
      const layout = clone(committed.layout);
      layout.maximized = null;
      committed = { ...committed, presets: { ...committed.presets, [name]: layout }, selectedPreset: name, revision: nextRevision() };
      publish();
    },
    selectPreset(name) {
      if (edit) refuse("EDIT_ACTIVE", "Apply or cancel layout editing before switching");
      if (!own(committed.presets, name)) refuse("PRESET_NOT_FOUND", "Layout preset does not exist");
      const layout = clone(committed.presets[name]);
      reconcile(layout, committed.panels);
      layout.maximized = null;
      validateLayout(layout, committed.panels);
      committed = { ...committed, layout, selectedPreset: name, revision: nextRevision() };
      publish();
    },
    adoptLayout(project, expectedRevision) {
      if (edit) refuse("EDIT_ACTIVE", "Apply or cancel the layout draft first");
      if (committed.revision !== expectedRevision) refuse("LAYOUT_STALE", "Current layout changed during comparison");
      validateProject(project, projectId);
      const incoming = clone(project), all = { ...incoming.panels };
      for (const [id, panel] of Object.entries(committed.panels)) {
        if (all[id] && all[id].kind !== panel.kind) refuse("PANEL_KIND_CONFLICT", "A stored panel id has a different live module kind");
        if (!all[id]) all[id] = clone(panel);
      }
      incoming.panels = all;
      reconcile(incoming.layout, all);
      for (const saved of Object.values(incoming.presets)) reconcile(saved, all);
      incoming.revision = nextRevision();
      validateProject(incoming, projectId);
      committed = incoming;
      history = [];
      redo = [];
      publish();
    },
    serialize() {
      const saved = clone(committed);
      saved.layout.maximized = null;
      validateProject(saved, projectId);
      return saved;
    },
    geometry(width, height, { gap = 10, draft = false } = {}) {
      const state = draft && edit ? edit : committed;
      return computeGeometry(state.layout, state.panels, registry, width, height, gap);
    }
  };
  publish();
  return Object.freeze(api);
}
function computeGeometry(layout, panels, registry, width, height, gap = 10) {
  validateLayout(layout, panels);
  if (![width, height, gap].every(Number.isFinite) || width < 0 || height < 0 || gap < 0 || gap > 64) refuse("INVALID_ROOM", "Invalid workspace dimensions");
  const minimums = /* @__PURE__ */ new Map();
  function minimum(node) {
    let value;
    if (node.type === "pane") {
      const definitions = node.tabs.map((id) => registry.get(panels[id].kind) ?? { minWidth: 240, minHeight: 120 });
      value = { width: Math.max(0, ...definitions.map((d) => d.minWidth)), height: Math.max(0, ...definitions.map((d) => d.minHeight)), empty: node.tabs.length === 0 };
    } else {
      const a = minimum(node.first), b = minimum(node.second);
      value = a.empty ? b : b.empty ? a : { width: node.axis === "x" ? a.width + gap + b.width : Math.max(a.width, b.width), height: node.axis === "y" ? a.height + gap + b.height : Math.max(a.height, b.height), empty: false };
    }
    minimums.set(node.id, value);
    return value;
  }
  let required = minimum(layout.root);
  if (layout.maximized) {
    const d = registry.get(panels[layout.maximized].kind) ?? { minWidth: 240, minHeight: 120 };
    required = { width: d.minWidth, height: d.minHeight, empty: false };
  }
  const canvas = { width: Math.max(width, required.width), height: Math.max(height, required.height) };
  const rectangles = {}, paneRects = {}, handles = [];
  function place(node, rectangle) {
    if (node.type === "pane") {
      if (!node.tabs.length) return;
      paneRects[node.id] = rectangle;
      for (const id of node.tabs) rectangles[id] = { ...rectangle, paneId: node.id, visible: id === node.active, available: registry.has(panels[id].kind) };
      return;
    }
    const a = minimums.get(node.first.id), b = minimums.get(node.second.id);
    if (a.empty) {
      place(node.second, rectangle);
      return;
    }
    if (b.empty) {
      place(node.first, rectangle);
      return;
    }
    const horizontal = node.axis === "x", total = (horizontal ? rectangle.width : rectangle.height) - gap;
    const startMin = horizontal ? a.width : a.height, endMin = horizontal ? b.width : b.height;
    const firstSize = Math.max(startMin, Math.min(total - endMin, total * node.ratio)), secondSize = total - firstSize;
    const first = { ...rectangle, [horizontal ? "width" : "height"]: firstSize };
    const second = { ...rectangle, [horizontal ? "x" : "y"]: (horizontal ? rectangle.x : rectangle.y) + firstSize + gap, [horizontal ? "width" : "height"]: secondSize };
    handles.push({ nodeId: node.id, axis: node.axis, total, startMin, endMin, ratio: firstSize / total, x: horizontal ? rectangle.x + firstSize : rectangle.x, y: horizontal ? rectangle.y : rectangle.y + firstSize, width: horizontal ? gap : rectangle.width, height: horizontal ? rectangle.height : gap });
    place(node.first, first);
    place(node.second, second);
  }
  if (layout.maximized) {
    const p = panelPane(layout, layout.maximized);
    rectangles[layout.maximized] = { x: 0, y: 0, ...canvas, paneId: p.id, visible: true, available: registry.has(panels[layout.maximized].kind) };
    paneRects[p.id] = { x: 0, y: 0, ...canvas };
  } else place(layout.root, { x: 0, y: 0, ...canvas });
  return freeze({ fits: width >= required.width && height >= required.height, required: { width: required.width, height: required.height }, canvas, rectangles, paneRects, handles });
}

// panels.mjs
var layoutNodes = (root) => root.type === "pane" ? [root] : [root, ...layoutNodes(root.first), ...layoutNodes(root.second)];
function createPanelLayout(projectId) {
  const model = createWorkspaceModel({ projectId });
  model.registerModule({ kind: "note", label: "\u5DE5\u4F5C\u4FBF\u7B3A", minWidth: 260, minHeight: 190 });
  model.registerModule({ kind: "web", label: "\u7F51\u9875", minWidth: 300, minHeight: 240 });
  model.addPanel("note", { id: "panel-note", title: "\u5DE5\u4F5C\u4FBF\u7B3A" });
  model.addPanel("web", { id: "panel-web", title: "\u7F51\u9875", targetPaneId: "pane-root", edge: "right" });
  return model;
}

// layout-view.mjs
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var useStore = (model) => import_react.default.useSyncExternalStore(model.subscribe, model.getSnapshot);
var rectStyle = (r) => ({ position: "absolute", left: r.x, top: r.y, width: r.width, height: r.height, boxSizing: "border-box" });
function LayoutControls({ model, guarded }) {
  const state = useStore(model), draft = state.editing;
  const nodes2 = layoutNodes((draft ?? state).layout.root), splits = nodes2.filter((n) => n.type === "split");
  const [selected, select] = import_react.default.useState(""), split = splits.find((n) => n.id === selected) ?? splits[0];
  const panes2 = nodes2.filter((n) => n.type === "pane" && n.tabs.length);
  const [panelId, setPanel] = import_react.default.useState("panel-web");
  const [targetId, setTarget] = import_react.default.useState("pane-root");
  const [edge, setEdge] = import_react.default.useState("tab");
  const target = panes2.find((n) => n.id === targetId) ?? panes2[0];
  const button = (label, fn, disabled = false) => h("button", { type: "button", disabled, onClick: () => guarded(fn) }, label);
  return h(
    "div",
    { className: "p0-layout-controls", role: "group", "aria-label": "\u64CD\u4F5C\u533A\u5E03\u5C40\u7F16\u8F91" },
    !draft ? button("\u7F16\u8F91\u5E03\u5C40", () => model.beginEdit()) : h(
      import_react.default.Fragment,
      null,
      h("small", null, "\u8349\u7A3F\u4E0D\u6539\u53D8\u73B0\u573A\uFF1B\u5E94\u7528\u540E\u751F\u6548"),
      splits.length > 0 && h(
        import_react.default.Fragment,
        null,
        h("select", { "aria-label": "\u9009\u62E9\u5206\u5272", value: split.id, onChange: (e) => select(e.target.value) }, splits.map((n) => h("option", { key: n.id, value: n.id }, n.id))),
        h("label", null, "\u5206\u5272\u65B9\u5411", h("select", { "aria-label": "\u5206\u5272\u65B9\u5411", value: split.axis, onChange: (e) => guarded(() => model.setSplitAxis(split.id, e.target.value)) }, h("option", { value: "x" }, "\u5DE6\u53F3"), h("option", { value: "y" }, "\u4E0A\u4E0B"))),
        h("label", null, "\u5206\u5272\u6BD4\u4F8B", h("input", { type: "range", "aria-label": "\u5206\u5272\u6BD4\u4F8B", min: 20, max: 80, value: Math.round(split.ratio * 100), onChange: (e) => guarded(() => model.resize(split.id, Number(e.target.value) / 100)) }))
      ),
      h("select", { "aria-label": "\u79FB\u52A8\u9762\u677F", value: panelId, onChange: (e) => setPanel(e.target.value) }, Object.values(draft.panels).map((p) => h("option", { key: p.id, value: p.id }, p.title))),
      h("select", { "aria-label": "\u76EE\u6807\u5206\u533A", value: target?.id ?? "", onChange: (e) => setTarget(e.target.value) }, panes2.map((p) => h("option", { key: p.id, value: p.id }, p.tabs.map((id) => draft.panels[id].title).join(" / ")))),
      h("select", { "aria-label": "\u505C\u9760\u65B9\u5F0F", value: edge, onChange: (e) => setEdge(e.target.value) }, [["tab", "\u5408\u5E76\u6807\u7B7E"], ["left", "\u5DE6\u4FA7\u5206\u5272"], ["right", "\u53F3\u4FA7\u5206\u5272"], ["top", "\u4E0A\u65B9\u5206\u5272"], ["bottom", "\u4E0B\u65B9\u5206\u5272"]].map(([value, label]) => h("option", { key: value, value }, label))),
      button("\u79FB\u52A8\u9762\u677F", () => model.dock(panelId, target.id, edge), !target),
      button("\u4EA4\u6362\u4F4D\u7F6E", () => model.swap("panel-note", "panel-web")),
      button("\u64A4\u9500\u5E03\u5C40\u4FEE\u6539", () => model.undo(), !state.canUndo),
      button("\u91CD\u505A\u5E03\u5C40\u4FEE\u6539", () => model.redo(), !state.canRedo),
      button("\u53D6\u6D88", () => model.cancelEdit()),
      button("\u5E94\u7528\u5E03\u5C40", () => model.applyEdit())
    )
  );
}
function LayoutCanvas({ model, guarded, children }) {
  const state = useStore(model), root = import_react.default.useRef(null), [room, setRoom] = import_react.default.useState({ width: 0, height: 0 });
  import_react.default.useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setRoom((old) => old.width === width && old.height === height ? old : { width, height });
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const geometry = model.geometry(room.width, room.height), nodes2 = layoutNodes(state.layout.root);
  const panels = import_react.default.Children.toArray(children);
  return h(
    import_react.default.Fragment,
    null,
    h("div", { className: "p0-panel-shelf" }, state.layout.collapsed.map((p) => h("button", { key: p.panelId, disabled: !!state.editing, onClick: () => guarded(() => model.expand(p.panelId)) }, "\u5C55\u5F00" + state.panels[p.panelId].title))),
    h(
      "div",
      { className: "p0-layout-viewport", ref: root },
      h(
        "div",
        { className: "p0-tools p0-layout-canvas", "data-layout-axis": state.layout.root.axis ?? "tab", style: { position: "relative", width: geometry.canvas.width, height: geometry.canvas.height } },
        // Content children ALWAYS remain under this same parent in fixed order.
        // Geometry/visibility only: no portals, DOM reparenting or keyed pane wrappers.
        panels.map((child) => {
          const id = child.props["data-panel-id"], r = geometry.rectangles[id];
          return import_react.default.cloneElement(child, { hidden: !r?.visible, inert: !r?.visible ? "" : void 0, style: { ...rectStyle(r ?? { x: 0, y: 0, width: 0, height: 0 }), top: (r?.y ?? 0) + 38, height: Math.max(0, (r?.height ?? 0) - 38) } });
        }),
        nodes2.filter((n) => n.type === "pane" && geometry.paneRects[n.id]).map((pane2) => h(
          "div",
          { key: pane2.id, className: "p0-pane-bar", style: { ...rectStyle(geometry.paneRects[pane2.id]), height: 38 } },
          h("div", { role: "tablist", "aria-label": "\u9762\u677F\u6807\u7B7E" }, pane2.tabs.map((id) => h("button", { key: id, role: "tab", "aria-selected": pane2.active === id, disabled: !!state.editing, onClick: () => guarded(() => model.activate(id)) }, state.panels[id].title))),
          h("button", { "aria-label": "\u653E\u5927\u6216\u8FD8\u539F" + state.panels[pane2.active].title, disabled: !!state.editing, onClick: () => guarded(() => model.maximize(pane2.active)) }, state.layout.maximized ? "\u8FD8\u539F" : "\u653E\u5927"),
          h("button", { "aria-label": "\u6536\u8D77" + state.panels[pane2.active].title, disabled: !!state.editing, onClick: () => guarded(() => model.collapse(pane2.active)) }, "\u6536\u8D77")
        )),
        geometry.handles.map((handle) => h("div", {
          key: handle.nodeId,
          role: "separator",
          tabIndex: state.editing ? -1 : 0,
          "aria-disabled": !!state.editing,
          "aria-label": "\u8C03\u6574\u5206\u5272 " + handle.nodeId,
          "aria-orientation": handle.axis === "x" ? "vertical" : "horizontal",
          "aria-valuemin": 1,
          "aria-valuemax": 99,
          "aria-valuenow": Math.round(handle.ratio * 100),
          className: "p0-panel-separator",
          style: rectStyle(handle),
          onKeyDown(e) {
            if (state.editing || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
            e.preventDefault();
            guarded(() => model.resize(handle.nodeId, handle.ratio + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -0.05 : 0.05)));
          }
        }))
      )
    )
  );
}
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

// extension.mjs
var h2 = import_react2.default.createElement;
var useState = (store) => import_react2.default.useSyncExternalStore(store.subscribe, store.getSnapshot);
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
  return store;
}
function Frame({ NativeFrame, ...props }) {
  const view = useState(props.dualShell);
  return h2(
    "div",
    { className: "p0-shell", "data-p0-shell": true },
    h2(
      "header",
      { className: "p0-toolbar" },
      h2("strong", null, "DSHOME"),
      h2(
        "div",
        { role: "group", "aria-label": "\u6574\u7A97\u6A21\u5F0F" },
        ...[["original", "\u539F\u7248"], ["workbench", "\u5DE5\u4F5C\u53F0"]].map(([mode, title]) => h2("button", { key: mode, type: "button", "aria-pressed": view.mode === mode, onClick: () => props.dualShell.setMode(mode) }, title))
      ),
      h2("span", { className: "p0-label" }, "P0 \u53CC\u5E03\u5C40\u9884\u89C8 \xB7 \u4FBF\u7B3A\u672A\u81EA\u52A8\u4FDD\u5B58"),
      view.mode === "workbench" && h2(
        "div",
        { className: "p0-narrow-switch", role: "group", "aria-label": "\u7A84\u7A97\u533A\u57DF" },
        h2("button", { onClick: () => props.dualShell.setNarrowPane("workspace"), "aria-pressed": view.narrowPane === "workspace" }, "\u64CD\u4F5C\u533A"),
        h2("button", { onClick: () => props.dualShell.setNarrowPane("chat"), "aria-pressed": view.narrowPane === "chat" }, "\u804A\u5929")
      )
    ),
    h2(NativeFrame, { ...props, dualView: view })
  );
}
function Desktop({ store, active, chatWidth, chatMax }) {
  const view = useState(store), drag = import_react2.default.useRef(null);
  return h2(
    "section",
    { className: "p0-desktop", "aria-label": "\u4E3B\u64CD\u4F5C\u533A", "aria-hidden": !active, inert: !active ? "" : void 0 },
    h2(
      "div",
      { className: "p0-scene-area" },
      view.scenes.map((scene) => h2(Scene, { key: scene.id, scene, store, active: active && view.selected === scene.key })),
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
function Scene({ scene, store, active }) {
  const [error, setError] = import_react2.default.useState(""), [loaded, setLoaded] = import_react2.default.useState(false);
  const [layout] = import_react2.default.useState(() => createPanelLayout(scene.key));
  const layoutState = useState(layout);
  const guarded = (fn) => {
    try {
      if (!active || store.getSnapshot().selected !== scene.key) throw Error("\u5F53\u524D\u5DE5\u4F5C\u533A\u4E0D\u53EF\u7528");
      fn();
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  const update = (patch) => {
    try {
      store.update(scene.key, patch);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return h2(
    "div",
    { className: "p0-scene", hidden: !active, inert: !active ? "" : void 0, "data-scene": scene.id, "data-workspace": scene.workspaceId, "data-arrangement": scene.arrangement },
    h2(
      "header",
      { className: "p0-scene-header" },
      h2("div", null, h2("h1", null, scene.title), h2("small", null, "\u540C\u5DE5\u4F5C\u533A\u5171\u4EAB\u73B0\u573A \xB7 \u4F1A\u8BDD\u8349\u7A3F\u4E0E\u6743\u9650\u4ECD\u72EC\u7ACB")),
      h2("small", null, layoutState.editing ? "\u6B63\u5728\u7F16\u8F91\u5E03\u5C40\u8349\u7A3F" : "\u5E03\u5C40\u4EC5\u4FDD\u5B58\u5728\u672C\u6B21\u5DE5\u4F5C\u533A\u73B0\u573A")
    ),
    h2(LayoutControls, { model: layout, guarded }),
    h2(
      LayoutCanvas,
      { model: layout, guarded },
      h2(
        "article",
        { key: "panel-note", "data-panel-id": "panel-note", className: "p0-note" },
        h2("h2", null, "\u5DE5\u4F5C\u4FBF\u7B3A"),
        h2("p", null, "\u771F\u5B9E\u53EF\u7F16\u8F91\u5185\u5B58\u8349\u7A3F\uFF1B\u672A\u5199\u5165\u6587\u4EF6\uFF0C\u91CD\u5F00\u5E94\u7528\u4E0D\u6062\u590D\u3002"),
        h2("textarea", { "aria-label": "\u5DE5\u4F5C\u533A\u4FBF\u7B3A", value: scene.note, onChange: (e) => update({ note: e.target.value }), spellCheck: false, placeholder: "\u8FD9\u4EFD\u8349\u7A3F\u5C5E\u4E8E\u5DE5\u4F5C\u533A\uFF0C\u4E0D\u968F\u53F3\u4FA7\u4F1A\u8BDD\u5207\u6362\u3002" })
      ),
      h2(
        "article",
        { key: "panel-web", "data-panel-id": "panel-web", className: "p0-web" },
        h2("h2", null, "\u7F51\u9875"),
        h2(
          "form",
          { onSubmit: (e) => {
            e.preventDefault();
            try {
              const url = parseWebAddress(scene.address, location.origin);
              setLoaded(false);
              update({ url });
            } catch (failure) {
              setError(failure.message);
            }
          } },
          h2("input", { type: "url", "aria-label": "\u7F51\u9875\u5730\u5740", placeholder: "https://example.com", value: scene.address, onChange: (e) => update({ address: e.target.value }) }),
          h2("button", { type: "submit" }, "\u6253\u5F00")
        ),
        h2("p", { className: "p0-web-status", role: "status" }, scene.url ? loaded ? "\u8F7D\u4F53\u5DF2\u53D1\u51FAload\u4E8B\u4EF6\uFF1B\u4E0D\u8BC1\u660E\u7AD9\u70B9\u5B8C\u6574\u53EF\u7528\u6216\u5185\u5BB9\u53EF\u8BFB\u3002" : "\u6B63\u5728\u8BF7\u6C42\u9875\u9762\uFF1B\u7AD9\u70B9\u53EF\u80FD\u7981\u6B62\u5D4C\u5165\u3002" : "\u6309\u9700\u6253\u5F00\u7F51\u9875\uFF1B\u672A\u6388\u4E88\u5185\u5BB9\u63D0\u53D6\u6216AI\u64CD\u4F5C\u6743\u9650\u3002"),
        // One iframe per scene, with one stable parent. No portal/DOM adoption.
        h2("iframe", { "data-p0-web": scene.id, title: `${scene.title}\u7F51\u9875`, src: scene.url || void 0, sandbox: "allow-scripts allow-forms", referrerPolicy: "no-referrer", onLoad: () => setLoaded(true) })
      )
    ),
    error && h2("p", { role: "alert" }, error),
    h2("footer", null, "P0\u9A8C\u8BC1\uFF1A\u539F\u7248\u21C4\u5DE5\u4F5C\u53F0\uFF0F\u540C\u5DE5\u4F5C\u533AA\u21C4B\uFF0F\u5E03\u5C40\u5207\u6362\u4E0D\u91CD\u5EFA\u7F51\u9875\u3002\u6587\u4EF6\u3001\u7EC8\u7AEF\u3001\u5F00\u653E\u5DE5\u5177\u63A5\u5165\u5F85\u540E\u7EED\u5B9E\u73B0\u3002")
  );
}
var css = layoutCSS + `
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
.p0-layout-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.p0-layout-controls label{display:flex;align-items:center;gap:4px}
.p0-scene[data-arrangement=split] .p0-tools[data-layout-axis=x]{grid-template-columns:minmax(0,calc(var(--p0-ratio) - 6px)) minmax(0,1fr)}
.p0-scene[data-arrangement=split] .p0-tools[data-layout-axis=y]{grid-template-columns:1fr;grid-template-rows:minmax(0,calc(var(--p0-ratio) - 6px)) minmax(0,1fr)}
@media(max-width:1100px){.p0-label{display:none}.p0-scene{padding:10px}.p0-tools{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}
@media(max-width:900px){.p0-narrow-switch{display:flex!important}.p0-native[data-dual-mode=workbench][data-dual-global=false]{grid-template-columns:0 minmax(0,1fr)!important}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_sidebarCol{visibility:hidden}.p0-native[data-dual-mode=workbench][data-dual-global=false]>.mP3x-q_centerCol{grid-column:2}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=workspace]>.mP3x-q_centerCol{visibility:hidden;pointer-events:none}.p0-native[data-dual-mode=workbench][data-dual-global=false][data-dual-narrow=chat]>.p0-desktop{visibility:hidden;pointer-events:none}.p0-chat-separator{display:none}.p0-toolbar{gap:8px;font-size:12px}}
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