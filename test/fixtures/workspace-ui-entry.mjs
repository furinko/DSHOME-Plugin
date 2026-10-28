// Browser integration harness: real React and product components, explicit
// shell/input transport doubles. This is NOT the authenticated production GUI.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Workspace, css } from '../../src/workbench/ui.mjs';
import { createWorkspaceController } from '../../src/workbench/controller.mjs';
const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
const call = (method, args) => window.testGateway(method, args).then(result => {
  if (result.ok) return result.value;
  const error = new Error(result.error.message); error.code = result.error.code; throw error;
});
const transport = { read: path => call('read', { sessionId: 'A', path, expectedProjectId: project.projectId }), save: (path, text, expectedVersion) => call('save', { sessionId: 'A', path, text, expectedVersion, expectedProjectId: project.projectId, expectedAbsolutePath: path }) };
const project = await call('project', { sessionId: 'A' });
const c = createWorkspaceController({ sessionId: 'A', projectId: project.projectId, transport, storage: localStorage, locks: navigator.locks, confirm: message => window.confirm(message) });
const nativeInputDouble = document.querySelector('#fixture-composer');
const inputActions = {
  captureInsertion() { return { start: nativeInputDouble.selectionStart, end: nativeInputDouble.selectionEnd, draftRev: nativeInputDouble.value }; },
  insertText(text, span) { if (nativeInputDouble.value !== span.draftRev) return false; nativeInputDouble.value = nativeInputDouble.value.slice(0, span.start) + text + nativeInputDouble.value.slice(span.end); return true; },
};
const root = createRoot(document.querySelector('#workspace'));
root.render(React.createElement(Workspace, { controller: c, workspaceFiles: { list: () => Promise.resolve({ ok: true, value: { path: '.', entries: [{ name: 'a.md', type: 'file' }], truncated: false } }) }, inputActions, onOriginal: () => { document.querySelector('#workspace').style.visibility = 'hidden'; } }));
window.testController = c;
window.testRemountNegativeControl = () => { root.unmount(); };
