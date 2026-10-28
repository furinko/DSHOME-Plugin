window.__ModuleLoader__.load({id:'@deepseek-ai/dsh-client-ui-layout',factory:(require)=>{var module={exports:{}};var exports=module.exports;
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

// src/workbench/layout-entry.mjs
var layout_entry_exports = {};
__export(layout_entry_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(layout_entry_exports);

// src/workbench/application-shell.mjs
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var children = {
  sidebar: { kind: "single", scope: "root" },
  main: { kind: "keyed", scope: "root" },
  rightbar: { kind: "single", scope: "root" },
  "shell.bottom": { kind: "single", scope: "root" },
  "shell.overlay": { kind: "list", scope: "root" },
  "shell.leading": { kind: "single", scope: "root" },
  "dshome.application.workspace": { kind: "single", scope: "session-maybe" }
};
function installApplicationShell(ctx, { Body, onSessionChange = () => {
} } = {}) {
  if (ctx.get("layout")) throw Error("DSHOME application shell requires the bundle to disable ui-layout; refusing two root owners");
  let state = Object.freeze({ activePanelId: null, sidebar: true, focus: window.__dshomePlugin?.workbench === false ? "chat" : "workspace", chatWidth: 440, rightbar: null, sessionViews: [], currentSession: void 0, sessionError: "" });
  let panel = Object.freeze({ activePanelId: null }), navigation = new AbortController();
  const listeners = /* @__PURE__ */ new Set(), panelListeners = /* @__PURE__ */ new Set();
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const source = { subscribe, getSnapshot: () => state };
  const change = (patch) => {
    state = Object.freeze({ ...state, ...patch });
    if (panel.activePanelId !== state.activePanelId) {
      panel = Object.freeze({ activePanelId: state.activePanelId });
      for (const fn of [...panelListeners]) fn();
    }
    for (const fn of [...listeners]) fn();
  };
  const panelInfo = { getSnapshot: () => panel, subscribe: (fn) => {
    panelListeners.add(fn);
    return () => panelListeners.delete(fn);
  } };
  const layout = {
    panelInfo,
    selectPanel(id) {
      if (id !== null && !ctx.slots.entries("main").some((e) => e.options.key === id)) throw Error("Unregistered main panel: " + id);
      navigation.abort();
      change({ activePanelId: id });
    },
    beginNavigation() {
      navigation.abort();
      navigation = new AbortController();
      return navigation.signal;
    },
    toggleSidebar() {
      change({ sidebar: !state.sidebar });
    },
    openRightbar(track, fullscreen) {
      change({ rightbar: { track, fullscreen } });
    },
    closeRightbar() {
      if (state.rightbar) change({ rightbar: null });
    }
  };
  const disposers = [], keep = (off) => {
    disposers.push(off);
    return off;
  };
  keep(ctx.reflect.provide("layout", layout));
  keep(ctx.slots.provideRoot({ hooks: { panelInfo } }));
  keep(ctx.slots.subscribe("main", () => {
    if (state.activePanelId !== null && !ctx.slots.entries("main").some((e) => e.options.key === state.activePanelId)) layout.selectPanel(null);
  }));
  const sessionViews = /* @__PURE__ */ new Map();
  function retainCurrent() {
    const id = ctx.uiSession.current.getSnapshot().key;
    if (id && !sessionViews.has(id)) {
      if (sessionViews.size >= 16) {
        change({ currentSession: id, sessionError: "\u5DF2\u4FDD\u7559 16 \u4E2A\u4F1A\u8BDD\u5DE5\u4F5C\u7A7A\u95F4\u3002\u8BF7\u8FD4\u56DE\u65E7\u4F1A\u8BDD\uFF0C\u5728\u9879\u76EE\u8BBE\u7F6E\u4E2D\u5173\u95ED\u4E0D\u518D\u9700\u8981\u7684\u5DE5\u4F5C\u7A7A\u95F4\u540E\u91CD\u8BD5\u3002" });
        return;
      }
      const reference = ctx.get("sessions").retain(id, { source: "dshomeWorkspace" });
      let released = false;
      sessionViews.set(id, { id, reference, release() {
        if (!released) {
          released = true;
          reference.release();
        }
      } });
      reference.ready.catch((error) => change({ sessionError: error.message }));
    }
    change({ currentSession: id, sessionViews: [...sessionViews.values()], sessionError: "" });
  }
  keep(ctx.uiSession.current.subscribe(() => {
    retainCurrent();
    onSessionChange();
  }));
  keep(() => {
    for (const entry of sessionViews.values()) entry.release();
    sessionViews.clear();
  });
  retainCurrent();
  const style = document.createElement("style");
  style.dataset.plugin = "dshome-application-shell";
  style.textContent = applicationShellCSS;
  document.head.appendChild(style);
  keep(() => style.remove());
  const properties = /* @__PURE__ */ new Map(), attrs = /* @__PURE__ */ new Map();
  function attribute(node, key, value) {
    if (!attrs.has(node)) attrs.set(node, /* @__PURE__ */ new Map());
    const old = attrs.get(node);
    if (!old.has(key)) old.set(key, node.getAttribute(key));
    if (value === null) node.removeAttribute(key);
    else node.setAttribute(key, value);
  }
  function property(node, key, value) {
    if (!properties.has(node)) properties.set(node, /* @__PURE__ */ new Map());
    const old = properties.get(node);
    if (!old.has(key)) old.set(key, node.style.getPropertyValue(key));
    if (value) node.style.setProperty(key, value);
    else node.style.removeProperty(key);
  }
  let themeTokens = [];
  const presentTheme = () => {
    const s = ctx.theme.getTheme(), dark = s.active.colorScheme === "dark";
    property(document.documentElement, "color-scheme", s.active.colorScheme);
    attribute(document.documentElement, "data-ds-theme-source", s.preference === "system" ? "system" : s.active.colorScheme);
    attribute(document.body, "data-ds-dark-theme", dark ? "" : null);
    for (const key of themeTokens) property(document.body, key, "");
    themeTokens = Object.keys(s.active.tokens);
    for (const [key, value] of Object.entries(s.active.tokens)) property(document.body, key, value);
    for (const role of ["text", "code", "terminal"]) {
      if (s.fontSizes?.[role]) property(document.body, role === "text" ? "--dsh-content-font-size" : "--dsh-" + role + "-font-size", s.fontSizes[role] + "px");
      property(document.body, "--dsh-font-family-" + role, s.fontFamilies?.[role] ?? "");
    }
  };
  presentTheme();
  keep(ctx.on("theme/change", presentTheme));
  keep(() => {
    for (const [node, values] of properties) for (const [key, value] of values) {
      if (value) node.style.setProperty(key, value);
      else node.style.removeProperty(key);
    }
    for (const [node, values] of attrs) for (const [key, value] of values) {
      if (value === null) node.removeAttribute(key);
      else node.setAttribute(key, value);
    }
  });
  function ResizeChat() {
    const drag = import_react.default.useRef(null);
    return h("div", {
      className: "dshome-app-separator",
      role: "separator",
      tabIndex: 0,
      "aria-label": "\u8C03\u6574\u5BF9\u8BDD\u4E0E\u64CD\u4F5C\u533A\u5BBD\u5EA6",
      "aria-orientation": "vertical",
      "aria-valuemin": 300,
      "aria-valuemax": 640,
      "aria-valuenow": state.chatWidth,
      onPointerDown(e) {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, width: state.chatWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      },
      onPointerMove(e) {
        if (drag.current) change({ chatWidth: Math.max(300, Math.min(640, drag.current.width + e.clientX - drag.current.x)) });
      },
      onPointerUp(e) {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
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
          change({ chatWidth: e.key === "Home" ? 300 : e.key === "End" ? 640 : Math.max(300, Math.min(640, state.chatWidth + (e.key === "ArrowLeft" ? -20 : 20))) });
        }
      }
    });
  }
  function RetainedWorkspace({ entry, active, renderSlot, SessionProvider }) {
    import_react.default.useEffect(() => () => entry.release(), [entry]);
    return h("div", { className: "dshome-app-session-workspace", hidden: !active, inert: active ? void 0 : "", "data-retained-session": entry.id }, h(SessionProvider, { session: entry.reference }, renderSlot("dshome.application.workspace", { activeWorkspace: active })));
  }
  function Application({ renderSlot, SessionProvider }) {
    const view = import_react.default.useSyncExternalStore(source.subscribe, source.getSnapshot);
    const [narrowPane, setNarrowPane] = import_react.default.useState("chat");
    const isGlobal = view.activePanelId !== null;
    return h(
      "div",
      {
        className: "dshome-application",
        "data-application-shell": "dshome",
        "data-focus": view.focus,
        "data-navigation": view.sidebar ? "open" : "closed",
        "data-narrow-pane": narrowPane,
        style: { "--app-chat-width": view.chatWidth + "px", "--dsh-windows-sidebar-width": (view.sidebar ? 180 : 0) + "px" }
      },
      h(
        "header",
        { className: "dshome-app-header" },
        h("button", { type: "button", className: "dshome-app-brand", onClick: () => layout.selectPanel(null), "aria-label": "\u8FD4\u56DE DSHOME \u5DE5\u4F5C\u7A7A\u95F4" }, h("span", { "aria-hidden": true }, "\u25A6"), "DSHOME"),
        h("span", { className: "dshome-app-subtitle" }, "\u5DE5\u4F5C\u7A7A\u95F4 / \u5E03\u5C40\u4E0E\u5185\u5BB9\u5206\u79BB"),
        h(
          "div",
          { className: "dshome-app-actions" },
          h("button", { type: "button", onClick: () => layout.toggleSidebar(), "aria-expanded": view.sidebar }, "\u9879\u76EE\u5BFC\u822A"),
          h("div", { role: "group", "aria-label": "\u754C\u9762\u6A21\u5F0F" }, h("button", { type: "button", "aria-pressed": view.focus === "chat", onClick: () => change({ focus: "chat" }) }, "\u4E13\u6CE8\u5BF9\u8BDD"), h("button", { type: "button", "aria-pressed": view.focus === "workspace", onClick: () => {
            change({ focus: "workspace" });
            layout.selectPanel(null);
          } }, "\u5DE5\u4F5C\u7A7A\u95F4")),
          h("button", { type: "button", className: "dshome-app-mobile-switch", onClick: () => setNarrowPane(narrowPane === "chat" ? "workspace" : "chat") }, narrowPane === "chat" ? "\u67E5\u770B\u64CD\u4F5C\u533A" : "\u67E5\u770B\u5BF9\u8BDD")
        )
      ),
      h(
        "div",
        { className: "dshome-app-body" },
        h("aside", { className: "dshome-app-navigation", "aria-label": "\u9879\u76EE\u4E0E\u5168\u5C40\u5BFC\u822A", hidden: !view.sidebar }, h("h2", null, "\u9879\u76EE"), renderSlot("sidebar", { collapsed: false, width: 180 })),
        h(
          "div",
          { className: "dshome-app-session", hidden: isGlobal },
          h("section", { className: "dshome-app-conversation", "aria-label": "\u72EC\u7ACB\u5BF9\u8BDD\u533A" }, renderSlot("main", {}, { entryKey: "conversation" })),
          h(ResizeChat),
          h(
            "section",
            { className: "dshome-app-workspace", "aria-label": "\u4E3B\u64CD\u4F5C\u533A" },
            view.sessionError && h("p", { role: "alert" }, view.sessionError),
            !view.currentSession && h(SessionProvider, { session: void 0 }, renderSlot("dshome.application.workspace", {})),
            view.currentSession && !sessionViews.has(view.currentSession) && h("div", { className: "dshome-app-welcome" }, h("h2", null, "\u5DE5\u4F5C\u7A7A\u95F4\u5DF2\u5173\u95ED"), h("button", { type: "button", onClick: retainCurrent }, "\u91CD\u65B0\u6253\u5F00\u5DE5\u4F5C\u7A7A\u95F4")),
            view.sessionViews.map((entry) => h(RetainedWorkspace, { key: entry.id, entry, active: entry.id === view.currentSession, renderSlot, SessionProvider }))
          )
        ),
        isGlobal && h("section", { className: "dshome-app-global", "aria-label": "\u5168\u5C40\u9875\u9762" }, h("button", { type: "button", className: "dshome-app-back", onClick: () => layout.selectPanel(null) }, "\u2190 \u8FD4\u56DE\u5DE5\u4F5C\u7A7A\u95F4"), renderSlot("main", {}, { entryKey: view.activePanelId })),
        h("div", { className: "dshome-app-tools", "aria-label": "\u5176\u4ED6\u5DE5\u5177\u9762\u677F", hidden: isGlobal }, renderSlot("rightbar", { width: 480, maxWidth: 480, viewportWidth: window.innerWidth, collapsed: !view.rightbar, narrow: false }))
      ),
      h("footer", { className: "dshome-app-bottom" }, renderSlot("shell.bottom", {})),
      h("div", { className: "dshome-app-overlays" }, renderSlot("shell.overlay", {}))
    );
  }
  keep(ctx.slots.register({ name: "root", children }, Application));
  if (Body) keep(ctx.slots.register({ name: "dshome.application.workspace" }, Body));
  if (ctx.shortcuts?.register) keep(ctx.shortcuts.register({ id: "sidebar.left.toggle", label: () => "\u5C55\u5F00\uFF0F\u6536\u8D77\u9879\u76EE\u5BFC\u822A", defaults: { "desktop:windows": { code: "KeyB", modifiers: ["primary"] }, "desktop:linux": { code: "KeyB", modifiers: ["primary"] }, "desktop:macos": { code: "KeyB", modifiers: ["primary"] } }, regions: ["page", "editable"], modals: [], resolve: () => ({ status: "handled", run: () => layout.toggleSidebar() }) }));
  const shell = {
    setFocus(focus) {
      change({ focus });
    },
    ensureSession: retainCurrent,
    releaseSession(id) {
      sessionViews.delete(id);
      change({ sessionViews: [...sessionViews.values()] });
    },
    source,
    layout,
    dispose() {
      navigation.abort();
      for (const off of disposers.reverse()) off();
      listeners.clear();
      panelListeners.clear();
    }
  };
  keep(ctx.reflect.provide("dshomeApplication", shell));
  return shell;
}
var applicationShellCSS = `
.dshome-application{--app-surface:var(--dsw-alias-bg-base,#fff);--app-text:var(--dsw-alias-label-primary,#162b48);--app-line:var(--dsw-alias-border-l2,#dbe3ef);--app-bg:color-mix(in srgb,var(--app-surface) 94%,#4d6bfe);height:100%;width:100%;min-height:0;min-width:0;display:flex;flex-direction:column;background:var(--app-bg);color:var(--app-text);font-family:var(--dsh-font-family-text,system-ui,sans-serif);position:relative;overflow:hidden}
.dshome-application *{box-sizing:border-box}.dshome-application [hidden]{display:none!important}
.dshome-app-header{display:flex;align-items:center;flex:none;gap:24px;height:64px;padding:0 24px;background:var(--app-surface);border-bottom:1px solid var(--app-line);-webkit-app-region:drag}
.dshome-app-header button{-webkit-app-region:no-drag}.dshome-app-brand{display:flex;align-items:center;gap:12px;font-size:24px!important;font-weight:750!important;border:0!important;padding:0!important;background:transparent!important}.dshome-app-brand span{color:#4d6bfe;font-size:28px}.dshome-app-subtitle{font-size:13px;opacity:.65}.dshome-app-actions{margin-left:auto;display:flex;gap:12px;align-items:center}.dshome-app-actions [role=group]{display:flex;gap:4px}
html[data-windows-titlebar] .dshome-app-header{padding-right:160px}html[data-platform=darwin]:not([data-fullscreen]) .dshome-app-header{padding-left:88px}.dshome-app-welcome{padding:30px}
.dshome-app-header button,.dshome-app-back{font:inherit;font-size:13px;padding:7px 12px;border:1px solid var(--app-line);border-radius:7px;color:inherit;background:var(--app-surface);cursor:pointer}.dshome-app-header button[aria-pressed=true]{color:#3f5ce8;background:color-mix(in srgb,var(--app-surface) 90%,#4d6bfe);border-color:color-mix(in srgb,var(--app-line) 65%,#4d6bfe)}
.dshome-app-body{display:flex;flex:1;min-height:0;min-width:0;padding:16px 16px 16px 0;gap:16px;position:relative}
.dshome-app-navigation{width:180px;flex:none;min-height:0;overflow:hidden;display:flex;flex-direction:column}.dshome-app-navigation>h2{font-size:14px;padding:12px 20px;margin:0;flex:none}.dshome-app-navigation>[data-slot=sidebar]{flex:1;min-height:0}.dshome-app-navigation [data-window-drag]{display:none}
.dshome-app-session{display:grid;grid-template-columns:minmax(300px,var(--app-chat-width)) 8px minmax(420px,1fr);flex:1;min-width:0;min-height:0;gap:0}
.dshome-app-conversation,.dshome-app-workspace{border:1px solid var(--app-line);border-radius:12px;background:var(--app-surface);min-width:0;min-height:0;overflow:hidden;position:relative}
.dshome-app-conversation>[data-slot=main],.dshome-app-conversation>[data-slot=main]>[data-slot-entry],.dshome-app-workspace>[data-slot]{height:100%;min-height:0}
.dshome-app-session-workspace,.dshome-app-session-workspace>[data-slot]{height:100%;min-height:0;min-width:0}
.dshome-app-separator{cursor:col-resize;touch-action:none;position:relative;outline-offset:-2px}.dshome-app-separator:hover:after,.dshome-app-separator:focus-visible:after{content:'';position:absolute;inset:16px 3px;background:#4d6bfe;border-radius:2px}
.dshome-app-global{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;position:relative;background:var(--app-surface);border-radius:12px;overflow:hidden}.dshome-app-global>[data-slot=main]{flex:1;min-height:0}.dshome-app-back{align-self:flex-start;margin:8px 12px;flex:none}
.dshome-app-tools{position:absolute;right:16px;top:16px;bottom:16px;width:0;z-index:12}.dshome-app-tools>[data-slot=rightbar]{height:100%}.dshome-app-overlays{position:absolute;inset:0;z-index:30;pointer-events:none}.dshome-app-overlays>*{pointer-events:auto}.dshome-app-bottom:empty{display:none}.dshome-app-mobile-switch{display:none}
.dshome-application[data-focus=chat] .dshome-app-session{grid-template-columns:minmax(0,1fr)}.dshome-application[data-focus=chat] .dshome-app-workspace,.dshome-application[data-focus=chat] .dshome-app-separator{display:none}.dshome-application[data-focus=chat] .dshome-app-conversation{width:100%}
.dshome-application button:focus-visible,.dshome-app-separator:focus-visible{outline:2px solid #4d6bfe;outline-offset:2px}
@media(max-width:1200px){.dshome-app-navigation{width:160px}.dshome-app-session{grid-template-columns:minmax(300px,340px) 8px minmax(0,1fr)}.dshome-app-subtitle{display:none}}
@media(max-width:900px){.dshome-app-header{height:56px;padding:0 12px;gap:8px}.dshome-app-brand{font-size:18px!important}.dshome-app-body{padding:8px;gap:8px}.dshome-app-navigation{width:160px}.dshome-app-session{display:flex}.dshome-app-conversation,.dshome-app-workspace{width:100%;flex:1}.dshome-app-separator{display:none}.dshome-app-mobile-switch{display:inline-block}.dshome-app-actions{gap:6px}.dshome-application[data-narrow-pane=chat] .dshome-app-workspace,.dshome-application[data-narrow-pane=workspace] .dshome-app-conversation{display:none}}
@media(max-width:620px){.dshome-app-navigation{position:absolute;inset:8px auto 8px 8px;width:240px;background:var(--app-surface);border:1px solid var(--app-line);border-radius:10px;z-index:20}.dshome-app-actions [role=group]{display:none}}
`;

// src/workbench/layout-entry.mjs
var inject = ["slots", "theme", "shortcuts", "uiSession"];
function apply(ctx) {
  const shell = installApplicationShell(ctx);
  ctx.effect(() => () => shell.dispose());
}

return module.exports;}});
