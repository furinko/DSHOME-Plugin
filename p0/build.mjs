// Version-locked, reviewable composition seam over the INSTALLED public AppFrame.
// The vendor bytes remain untouched. Unknown upstream versions/anchors fail closed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const root = import.meta.dirname;
const source = await readFile(root + '/vendor/ui-layout.rc3.js', 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
const expected = 'eb011a7b5699fac7f3ad0aa15408f46a6cf47f79b8cc15db1f81739e81e70587';
if (sha(source) !== expected) throw Error('Upstream layout changed; review the explicit composition patch');
const extension = await build({ absWorkingDir: root, entryPoints: ['extension.mjs'], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', external: ['react'], legalComments: 'inline' });
let result = source;
const patches = [];
function replace(id, before, after) {
  if (result.split(before).length !== 2) throw Error('Non-unique/missing upstream seam: ' + id);
  result = result.replace(before, after); patches.push({ id, before, after });
}
replace('private-extension-module', '\t\t//#region lib/types/client/index.js', '\t\tconst __p0 = (() => { const module = {exports:{}}; const exports = module.exports;\n' + extension.outputFiles[0].text + '\nreturn module.exports; })();\n\t\tfunction DualFrame(props) { return (0, react_jsx_runtime.jsx)(__p0.Frame, {...props, NativeFrame: AppFrame}); }\n\t\t//#region lib/types/client/index.js');
replace('explicit-services', '"shortcuts"\n\t\t];', '"shortcuts", "uiSession", "workspaces", "connection"\n\t\t];');
replace('single-runtime-owner', 'function apply(ctx) {', 'function apply(ctx) {\n\t\t\tconst dualShell = __p0.install(ctx);');
replace('root-injection', '\t\t\t\t\tstore\n\t\t\t\t}, AppFrame);', '\t\t\t\t\tstore,\n\t\t\t\t\tinject: () => ({dualShell})\n\t\t\t\t}, DualFrame);');
replace('stable-frame-inputs', 'function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t }) {', 'function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t, dualShell, dualView }) {\n\t\t\tconst dualGlobal = usePanelInfo(info => info.activePanelId !== null);\n\t\t\tconst dualActive = dualView.mode === "workbench" && !dualGlobal;');
replace('responsive-chat-width', 'const viewport = layoutInfo.viewportWidth;', 'const viewport = layoutInfo.viewportWidth;\n\t\t\tconst dualChatMax = Math.max(320, Math.min(560, Math.floor(viewport * .32)));\n\t\t\tconst dualChatWidth = Math.min(dualView.chatWidth, dualChatMax);');
replace('frame-semantic-mode', 'className: AppFrame_module_css_default.frame,', 'className: AppFrame_module_css_default.frame + " p0-native",\n\t\t\t\t"data-dual-tools-visible": String(layoutInfo.rightbarShown), "data-dual-viewport": viewport, "data-dual-mode": dualView.mode,\n\t\t\t\t"data-dual-global": String(dualGlobal),\n\t\t\t\t"data-dual-narrow": dualView.narrowPane,');
replace('native-original-geometry-kept', 'gridTemplateColumns: `${cols.sidebar}px minmax(${cols.rightbar === 0 ? 0 : 400}px, 1fr) minmax(0px, ${rightbarMax}px)`', 'gridTemplateColumns: dualActive ? `${cols.sidebar}px minmax(0px, 1fr) ${dualChatWidth}px` : `${cols.sidebar}px minmax(${cols.rightbar === 0 ? 0 : 400}px, 1fr) minmax(0px, ${rightbarMax}px)`');
replace('hidden-chat-accessibility', 'className: AppFrame_module_css_default.centerCol,\n\t\t\t\tchildren: props.children', 'className: AppFrame_module_css_default.centerCol,\n\t\t\t\t"aria-hidden": props.hiddenByP0 || undefined, inert: props.hiddenByP0 ? "" : undefined,\n\t\t\t\tchildren: props.children');
replace('stable-conversation-parent', '(CenterColumn, { children: main })', '(CenterColumn, { children: main, hiddenByP0: dualActive && viewport <= 900 && dualView.narrowPane === "workspace" })');
replace('native-tools-drawer-width', 'width: normal.rightbar,\n\t\t\t\t\t\tviewportWidth: viewport,\n\t\t\t\t\t\tcanShow: normal.rightbar > 0', 'width: dualActive ? Math.max(0, Math.min(normal.rightbar, viewport - cols.sidebar - dualChatWidth)) : normal.rightbar,\n\t\t\t\t\t\tviewportWidth: viewport,\n\t\t\t\t\t\tcanShow: normal.rightbar > 0');
replace('append-stable-desktop', '\t\t\t\t\t\tonDrag: onRightbarDrag,\n\t\t\t\t\t\tonEnd: onDragEnd\n\t\t\t\t\t})', '\t\t\t\t\t\tonDrag: onRightbarDrag,\n\t\t\t\t\t\tonEnd: onDragEnd\n\t\t\t\t\t}),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)(__p0.Desktop, {store: dualShell, chatWidth: dualChatWidth, chatMax: dualChatMax, active: dualActive && (viewport > 900 || dualView.narrowPane === "workspace")}, "p0-desktop")');
new Function(result);
await mkdir(root + '/dist', { recursive: true });
await writeFile(root + '/dist/layout-client.js', result);
await writeFile(root + '/dist/build.json', JSON.stringify({ upstreamSha256: expected, outputSha256: sha(result), extensionSha256: sha(extension.outputFiles[0].text), patches: patches.map(({id,before,after}) => ({id,before,after: id === 'private-extension-module' ? '[bundled extension: see extension.mjs and scene-store.mjs]' : after})), rootRegistrations: (result.match(/name: "root"/g) || []).length }, null, 2) + '\n');
console.log(JSON.stringify({ upstreamSha256: expected, outputSha256: sha(result), patches: patches.length, rootRegistrations: (result.match(/name: "root"/g) || []).length }));
