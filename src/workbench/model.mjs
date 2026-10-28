/* Layout is data, never the lifetime owner of documents, iframes or processes.
 * This module has no DOM, file, terminal, network or credential access.
 * A renderer must keep content instances keyed in one stable React parent.
 */
export const FORMAT_VERSION = 1;
const MAX_PANELS = 64, MAX_NODES = 255, MAX_DEPTH = 16;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
export class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.name = 'WorkspaceError'; this.code = code; }
}
const refuse = (code, message) => { throw new WorkspaceError(code, message); };
const own = (object, key) => Object.hasOwn(object, key);
const clone = value => JSON.parse(JSON.stringify(value));
const key = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(value) && !unsafe.has(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fields(value, allowed, code) { if (Object.keys(value).some(name => !allowed.includes(name))) refuse(code, 'Unknown fields in persisted layout schema'); }
const assertKey = (value, field) => { if (!key(value)) refuse('INVALID_KEY', 'Invalid ' + field); return value; };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function pane(id, tabs = []) { return { type: 'pane', id, tabs: [...tabs], active: tabs[0] ?? null }; }
function emptyLayout() { return { root: pane('pane-root'), collapsed: [], maximized: null }; }
function nodes(root) { return root.type === 'pane' ? [root] : [root, ...nodes(root.first), ...nodes(root.second)]; }
function panes(root) { return nodes(root).filter(item => item.type === 'pane'); }
function findPane(layout, id) { return panes(layout.root).find(item => item.id === id); }
function panelPane(layout, id) { return panes(layout.root).find(item => item.tabs.includes(id)); }
function replaceNode(root, id, replacement) {
  if (root.id === id) return replacement;
  if (root.type === 'split') { root.first = replaceNode(root.first, id, replacement); root.second = replaceNode(root.second, id, replacement); }
  return root;
}
function trim(root) {
  if (root.type === 'pane') return root.tabs.length ? root : null;
  const first = trim(root.first), second = trim(root.second);
  if (!first) return second; if (!second) return first;
  root.first = first; root.second = second; return root;
}
function take(layout, id, prune = false) {
  const from = panelPane(layout, id);
  if (from) { const index = from.tabs.indexOf(id); from.tabs.splice(index, 1); if (from.active === id) from.active = from.tabs[Math.min(index, from.tabs.length - 1)] ?? null; }
  layout.collapsed = layout.collapsed.filter(item => item.panelId !== id);
  if (layout.maximized === id) layout.maximized = null;
  if (prune) layout.root = trim(layout.root) ?? pane('pane-root');
}
function checkPanelMap(panels) {
  if (!record(panels) || Object.keys(panels).length > MAX_PANELS) refuse('INVALID_PANELS', 'Too many or invalid panel instances');
  for (const [id, panel] of Object.entries(panels)) {
    assertKey(id, 'panel id');
    if (!record(panel) || panel.id !== id || !key(panel.kind) || typeof panel.title !== 'string' || panel.title.length > 120) refuse('INVALID_PANEL', 'Invalid panel instance');
    // The persisted schema deliberately excludes file bodies, URLs, drafts,
    // terminal launch arguments, process IDs, cookies and provider state.
    if (Object.keys(panel).some(name => !['id', 'kind', 'title'].includes(name))) refuse('INVALID_PANEL', 'Content state must not be stored inside layout records');
  }
}
export function validateLayout(layout, panels) {
  checkPanelMap(panels);
  if (!record(layout) || !Array.isArray(layout.collapsed) || layout.collapsed.length > MAX_PANELS) refuse('INVALID_LAYOUT', 'Invalid layout');
  fields(layout, ['root', 'collapsed', 'maximized'], 'INVALID_LAYOUT');
  const ids = new Set(), seenPanels = new Set(); let count = 0;
  function use(id) {
    if (!own(panels, id) || seenPanels.has(id)) refuse('INVALID_REFERENCE', 'Missing or duplicate panel reference');
    seenPanels.add(id);
  }
  function walk(node, depth) {
    if (!record(node) || depth > MAX_DEPTH || ++count > MAX_NODES || !key(node.id) || ids.has(node.id)) refuse('INVALID_TREE', 'Invalid, duplicate or excessively deep layout node');
    ids.add(node.id);
    fields(node, node.type === 'pane' ? ['type', 'id', 'tabs', 'active'] : ['type', 'id', 'axis', 'ratio', 'first', 'second'], 'INVALID_TREE');
    if (node.type === 'pane') {
      if (!Array.isArray(node.tabs) || node.tabs.length > MAX_PANELS) refuse('INVALID_TABS', 'Invalid pane tabs');
      if (node.tabs.length ? !node.tabs.includes(node.active) : node.active !== null) refuse('INVALID_ACTIVE_TAB', 'Active tab does not belong to pane');
      for (const id of node.tabs) use(id);
    } else if (node.type === 'split') {
      if (!['x', 'y'].includes(node.axis) || !Number.isFinite(node.ratio) || node.ratio < 0.01 || node.ratio > 0.99) refuse('INVALID_SPLIT', 'Invalid split axis or ratio');
      walk(node.first, depth + 1); walk(node.second, depth + 1);
    } else refuse('INVALID_TREE', 'Unknown layout node type');
  }
  walk(layout.root, 0);
  for (const item of layout.collapsed) {
    if (!record(item) || !['left', 'right', 'bottom'].includes(item.edge) || !key(item.paneId) || !Number.isSafeInteger(item.index) || item.index < 0 || item.index > MAX_PANELS) refuse('INVALID_COLLAPSED', 'Invalid collapsed placement');
    fields(item, ['panelId', 'edge', 'paneId', 'index'], 'INVALID_COLLAPSED');
    use(item.panelId);
  }
  if (seenPanels.size !== Object.keys(panels).length) refuse('ORPHAN_PANEL', 'Every instance must be placed or explicitly collapsed');
  if (layout.maximized !== null && (!seenPanels.has(layout.maximized) || layout.collapsed.some(item => item.panelId === layout.maximized))) refuse('INVALID_MAXIMIZED', 'Maximized panel must be visible');
  return true;
}
export function validateProject(project, expectedProjectId) {
  if (!record(project) || project.version !== FORMAT_VERSION) refuse('UNSUPPORTED_VERSION', 'Unsupported workspace format');
  if (typeof expectedProjectId !== 'string' || !expectedProjectId || project.projectId !== expectedProjectId) refuse('WRONG_PROJECT', 'Layout belongs to another project');
  if (!Number.isSafeInteger(project.revision) || project.revision < 0) refuse('INVALID_REVISION', 'Invalid project revision');
  validateLayout(project.layout, project.panels);
  if (!record(project.presets) || Object.keys(project.presets).length > 20) refuse('INVALID_PRESETS', 'Invalid layout presets');
  for (const [name, saved] of Object.entries(project.presets)) { assertKey(name, 'preset id'); validateLayout(saved, project.panels); }
  if (!key(project.selectedPreset) || (project.selectedPreset !== 'custom' && !own(project.presets, project.selectedPreset))) refuse('INVALID_PRESET', 'Invalid selected preset');
  fields(project, ['version', 'projectId', 'revision', 'panels', 'layout', 'presets', 'selectedPreset'], 'INVALID_PROJECT');
  return true;
}
export function createWorkspaceModel({ projectId, initial, onListenerError = () => {} } = {}) {
  if (typeof projectId !== 'string' || !projectId || projectId.length > 4096) refuse('INVALID_PROJECT', 'An explicit host/workspace project identity is required');
  if (initial) validateProject(initial, projectId);
  let committed = initial ? clone(initial) : { version: FORMAT_VERSION, projectId, revision: 0, panels: {}, layout: emptyLayout(), presets: {}, selectedPreset: 'custom' };
  validateProject(committed, projectId);
  let edit = null, history = [], redo = [], sequence = 0, snapshot;
  const listeners = new Set(), registry = new Map();
  function publish() {
    snapshot = freeze({ ...clone(committed), editing: edit === null ? null : clone(edit), canUndo: history.length > 0, canRedo: redo.length > 0 });
    for (const callback of [...listeners]) { try { callback(); } catch (error) { try { onListenerError(error); } catch {} } }
  }
  function uid(prefix, project) {
    const used = new Set([...Object.keys(project.panels), ...nodes(project.layout.root).map(n => n.id)]);
    let id; do { id = prefix + '-' + (++sequence); } while (used.has(id)); return id;
  }
  function nextRevision() { if (committed.revision >= Number.MAX_SAFE_INTEGER) refuse('REVISION_EXHAUSTED', 'Project revision cannot advance safely'); return committed.revision + 1; }
  function working() { return edit ? { panels: clone(edit.panels), layout: clone(edit.layout) } : { panels: clone(committed.panels), layout: clone(committed.layout) }; }
  function update(operation) {
    const next = working(), result = operation(next);
    validateLayout(next.layout, next.panels);
    if (edit) { history.push(clone(edit)); if (history.length > 50) history.shift(); redo = []; edit = next; }
    else {
      // A new instance must also be represented in every saved layout. Preset
      // selection never silently deletes a panel introduced in another preset.
      const presets = clone(committed.presets);
      for (const saved of Object.values(presets)) reconcile(saved, next.panels);
      committed = { ...committed, panels: next.panels, layout: next.layout, presets, revision: nextRevision() };
    }
    publish(); return result;
  }
  function reconcile(layout, allPanels) {
    for (const id of [...panes(layout.root).flatMap(p => p.tabs), ...layout.collapsed.map(p => p.panelId)]) if (!own(allPanels, id)) take(layout, id, false);
    const placed = new Set([...panes(layout.root).flatMap(p => p.tabs), ...layout.collapsed.map(p => p.panelId)]);
    for (const id of Object.keys(allPanels)) if (!placed.has(id)) {
      const first = panes(layout.root)[0];
      layout.collapsed.push({ panelId: id, edge: 'bottom', paneId: first.id, index: first.tabs.length });
    }
    if (layout.maximized && !own(allPanels, layout.maximized)) layout.maximized = null;
  }
  function requirePanel(project, id) { if (!own(project.panels, id)) refuse('PANEL_NOT_FOUND', 'Panel instance does not exist'); }
  function dockInto(project, panelId, targetPaneId, edge = 'tab') {
    requirePanel(project, panelId);
    if (!['tab', 'left', 'right', 'top', 'bottom'].includes(edge)) refuse('INVALID_DROP', 'Unknown docking target');
    let target = findPane(project.layout, targetPaneId);
    if (!target) refuse('PANE_NOT_FOUND', 'Target pane no longer exists');
    const source = panelPane(project.layout, panelId);
    if (source === target && target.tabs.length === 1 && edge !== 'tab') refuse('SELF_SPLIT', 'A sole panel cannot be split against itself');
    take(project.layout, panelId, false);
    target = findPane(project.layout, targetPaneId);
    if (edge === 'tab' || !target.tabs.length) { target.tabs.push(panelId); target.active = panelId; return; }
    const inserted = pane(uid('pane', project), [panelId]);
    const first = ['left', 'top'].includes(edge) ? inserted : target;
    const second = first === inserted ? target : inserted;
    project.layout.root = replaceNode(project.layout.root, target.id, { type: 'split', id: uid('split', project), axis: ['left', 'right'].includes(edge) ? 'x' : 'y', ratio: 0.5, first, second });
    // Old empty leaves are kept if a collapsed instance uses their position.
    // Otherwise they are harmless zero-room targets, not content owners.
  }
  const api = {
    getSnapshot: () => snapshot,
    subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    registerModule(definition) {
      if (!record(definition) || !key(definition.kind) || typeof definition.label !== 'string' || !definition.label.trim() || definition.label.length > 80) refuse('INVALID_MODULE', 'A typed module definition is required');
      if (registry.has(definition.kind)) refuse('DUPLICATE_MODULE', 'Module kind is already registered');
      const copy = freeze({ kind: definition.kind, label: definition.label, minWidth: definition.minWidth ?? 240, minHeight: definition.minHeight ?? 120 });
      if (!Number.isFinite(copy.minWidth) || copy.minWidth < 80 || copy.minWidth > 2000 || !Number.isFinite(copy.minHeight) || copy.minHeight < 44 || copy.minHeight > 2000) refuse('INVALID_MODULE', 'Invalid module minimum size');
      registry.set(copy.kind, copy); publish(); let released = false;
      return () => { if (!released && registry.get(copy.kind) === copy) { released = true; registry.delete(copy.kind); publish(); } };
    },
    modules: () => [...registry.values()],
    addPanel(kind, { id, title, targetPaneId, edge = 'tab' } = {}) {
      if (!registry.has(kind)) refuse('MODULE_UNAVAILABLE', 'Module kind is not registered');
      return update(next => {
        if (Object.keys(next.panels).length >= MAX_PANELS) refuse('PANEL_LIMIT', 'Panel limit reached');
        const panelId = id ?? uid('panel', next); assertKey(panelId, 'panel id');
        if (own(next.panels, panelId)) refuse('DUPLICATE_PANEL', 'Panel instance id already exists');
        const label = title ?? registry.get(kind).label;
        if (typeof label !== 'string' || !label.trim() || label.length > 120) refuse('INVALID_TITLE', 'Invalid panel title');
        next.panels[panelId] = { id: panelId, kind, title: label };
        dockInto(next, panelId, targetPaneId ?? panes(next.layout.root)[0].id, edge); return panelId;
      });
    },
    renamePanel(id, title) { if (typeof title !== 'string' || !title.trim() || title.length > 120) refuse('INVALID_TITLE', 'Invalid panel title'); return update(next => { requirePanel(next, id); next.panels[id].title = title; }); },
    dock(panelId, targetPaneId, edge) { return update(next => dockInto(next, panelId, targetPaneId, edge)); },
    swap(firstId, secondId) {
      if (firstId === secondId) return;
      return update(next => {
        const first = panelPane(next.layout, firstId), second = panelPane(next.layout, secondId);
        if (!first || !second) refuse('PANEL_NOT_VISIBLE', 'Only placed panels can exchange positions');
        const exchange = value => value === firstId ? secondId : value === secondId ? firstId : value;
        for (const p of new Set([first, second])) { p.tabs = p.tabs.map(exchange); p.active = exchange(p.active); }
        if (next.layout.maximized) next.layout.maximized = exchange(next.layout.maximized);
      });
    },
    mergePanes(sourceId, targetId) {
      if (sourceId === targetId) return;
      return update(next => {
        const source = findPane(next.layout, sourceId), target = findPane(next.layout, targetId);
        if (!source || !target) refuse('PANE_NOT_FOUND', 'Pane does not exist');
        target.tabs.push(...source.tabs); target.active = source.active ?? target.active; source.tabs = []; source.active = null;
      });
    },
    activate(panelId) { return update(next => { const p = panelPane(next.layout, panelId); if (!p) refuse('PANEL_NOT_VISIBLE', 'Expand the panel first'); p.active = panelId; }); },
    resize(splitId, ratio) {
      if (!Number.isFinite(ratio)) refuse('INVALID_SPLIT', 'Split ratio must be finite');
      return update(next => { const split = nodes(next.layout.root).find(n => n.id === splitId && n.type === 'split'); if (!split) refuse('SPLIT_NOT_FOUND', 'Split no longer exists'); split.ratio = Math.max(0.01, Math.min(0.99, ratio)); });
    },
    collapse(panelId, edge = 'bottom') {
      if (!['left', 'right', 'bottom'].includes(edge)) refuse('INVALID_COLLAPSED', 'Invalid collapsed edge');
      return update(next => {
        const p = panelPane(next.layout, panelId); if (!p) refuse('PANEL_NOT_VISIBLE', 'Panel is already collapsed or absent');
        const placement = { panelId, edge, paneId: p.id, index: p.tabs.indexOf(panelId) };
        take(next.layout, panelId, false); next.layout.collapsed.push(placement);
      });
    },
    expand(panelId) {
      return update(next => {
        const old = next.layout.collapsed.find(item => item.panelId === panelId); if (!old) refuse('PANEL_NOT_COLLAPSED', 'Panel is not collapsed');
        const target = findPane(next.layout, old.paneId) ?? panes(next.layout.root)[0];
        target.tabs.splice(Math.min(old.index, target.tabs.length), 0, panelId); target.active = panelId;
        next.layout.collapsed = next.layout.collapsed.filter(item => item !== old);
      });
    },
    maximize(panelId) {
      return update(next => {
        if (panelId !== null) { const p = panelPane(next.layout, panelId); if (!p) refuse('PANEL_NOT_VISIBLE', 'Expand the panel first'); p.active = panelId; }
        next.layout.maximized = next.layout.maximized === panelId ? null : panelId;
      });
    },
    // This forgets configuration ONLY. The controller must first obtain the
    // module's close agreement and successfully release its own resource hold.
    forgetPanel(panelId) {
      if (edit) refuse('EDIT_ACTIVE', 'Close content outside layout editing, or collapse it in the draft');
      return update(next => { requirePanel(next, panelId); take(next.layout, panelId, true); delete next.panels[panelId]; });
    },
    beginEdit() { if (edit) refuse('EDIT_ACTIVE', 'Layout is already being edited'); edit = working(); history = []; redo = []; publish(); },
    cancelEdit() { if (!edit) return; edit = null; history = []; redo = []; publish(); },
    applyEdit() {
      if (!edit) refuse('NO_EDIT', 'No layout draft to apply');
      validateLayout(edit.layout, edit.panels);
      const presets = clone(committed.presets); for (const saved of Object.values(presets)) reconcile(saved, edit.panels);
      committed = { ...committed, layout: edit.layout, panels: edit.panels, selectedPreset: 'custom', presets, revision: nextRevision() };
      edit = null; history = []; redo = []; publish();
    },
    undo() { if (!edit || !history.length) return false; redo.push(clone(edit)); edit = history.pop(); publish(); return true; },
    redo() { if (!edit || !redo.length) return false; history.push(clone(edit)); edit = redo.pop(); publish(); return true; },
    savePreset(name) {
      assertKey(name, 'preset id'); if (edit) refuse('EDIT_ACTIVE', 'Apply or cancel the draft before saving a preset');
      if (!own(committed.presets, name) && Object.keys(committed.presets).length >= 20) refuse('PRESET_LIMIT', 'Preset limit reached');
      const layout = clone(committed.layout); layout.maximized = null;
      committed = { ...committed, presets: { ...committed.presets, [name]: layout }, selectedPreset: name, revision: nextRevision() }; publish();
    },
    selectPreset(name) {
      if (edit) refuse('EDIT_ACTIVE', 'Apply or cancel layout editing before switching');
      if (!own(committed.presets, name)) refuse('PRESET_NOT_FOUND', 'Layout preset does not exist');
      const layout = clone(committed.presets[name]); reconcile(layout, committed.panels); layout.maximized = null; validateLayout(layout, committed.panels);
      committed = { ...committed, layout, selectedPreset: name, revision: nextRevision() }; publish();
    },
    adoptLayout(project, expectedRevision) {
      if (edit) refuse('EDIT_ACTIVE', 'Apply or cancel the layout draft first');
      if (committed.revision !== expectedRevision) refuse('LAYOUT_STALE', 'Current layout changed during comparison');
      validateProject(project, projectId);
      const incoming = clone(project), all = { ...incoming.panels };
      for (const [id, panel] of Object.entries(committed.panels)) {
        if (all[id] && all[id].kind !== panel.kind) refuse('PANEL_KIND_CONFLICT', 'A stored panel id has a different live module kind');
        if (!all[id]) all[id] = clone(panel);
      }
      // Missing live instances remain explicitly collapsed, never destroyed.
      incoming.panels = all; reconcile(incoming.layout, all);
      for (const saved of Object.values(incoming.presets)) reconcile(saved, all);
      incoming.revision = nextRevision(); validateProject(incoming, projectId);
      committed = incoming; history = []; redo = []; publish();
    },
    serialize() {
      // An un-applied editor draft and temporary fullscreen state are not a
      // saved layout, and content state can never leak through this envelope.
      const saved = clone(committed); saved.layout.maximized = null;
      validateProject(saved, projectId); return saved;
    },
    geometry(width, height, { gap = 10, draft = false } = {}) {
      const state = draft && edit ? edit : committed;
      return computeGeometry(state.layout, state.panels, registry, width, height, gap);
    },
  };
  publish(); return Object.freeze(api);
}

export function computeGeometry(layout, panels, registry, width, height, gap = 10) {
  validateLayout(layout, panels);
  if (![width, height, gap].every(Number.isFinite) || width < 0 || height < 0 || gap < 0 || gap > 64) refuse('INVALID_ROOM', 'Invalid workspace dimensions');
  const minimums = new Map();
  function minimum(node) {
    let value;
    if (node.type === 'pane') {
      const definitions = node.tabs.map(id => registry.get(panels[id].kind) ?? { minWidth: 240, minHeight: 120 });
      value = { width: Math.max(0, ...definitions.map(d => d.minWidth)), height: Math.max(0, ...definitions.map(d => d.minHeight)), empty: node.tabs.length === 0 };
    } else {
      const a = minimum(node.first), b = minimum(node.second);
      value = a.empty ? b : b.empty ? a : { width: node.axis === 'x' ? a.width + gap + b.width : Math.max(a.width, b.width), height: node.axis === 'y' ? a.height + gap + b.height : Math.max(a.height, b.height), empty: false };
    }
    minimums.set(node.id, value); return value;
  }
  let required = minimum(layout.root);
  if (layout.maximized) {
    const d = registry.get(panels[layout.maximized].kind) ?? { minWidth: 240, minHeight: 120 };
    required = { width: d.minWidth, height: d.minHeight, empty: false };
  }
  const canvas = { width: Math.max(width, required.width), height: Math.max(height, required.height) };
  const rectangles = {}, paneRects = {}, handles = [];
  function place(node, rectangle) {
    if (node.type === 'pane') {
      if (!node.tabs.length) return;
      paneRects[node.id] = rectangle;
      for (const id of node.tabs) rectangles[id] = { ...rectangle, paneId: node.id, visible: id === node.active, available: registry.has(panels[id].kind) };
      return;
    }
    const a = minimums.get(node.first.id), b = minimums.get(node.second.id);
    if (a.empty) { place(node.second, rectangle); return; } if (b.empty) { place(node.first, rectangle); return; }
    const horizontal = node.axis === 'x', total = (horizontal ? rectangle.width : rectangle.height) - gap;
    const startMin = horizontal ? a.width : a.height, endMin = horizontal ? b.width : b.height;
    const firstSize = Math.max(startMin, Math.min(total - endMin, total * node.ratio)), secondSize = total - firstSize;
    const first = { ...rectangle, [horizontal ? 'width' : 'height']: firstSize };
    const second = { ...rectangle, [horizontal ? 'x' : 'y']: (horizontal ? rectangle.x : rectangle.y) + firstSize + gap, [horizontal ? 'width' : 'height']: secondSize };
    handles.push({ nodeId: node.id, axis: node.axis, total, startMin, endMin, ratio: firstSize / total, x: horizontal ? rectangle.x + firstSize : rectangle.x, y: horizontal ? rectangle.y : rectangle.y + firstSize, width: horizontal ? gap : rectangle.width, height: horizontal ? rectangle.height : gap });
    place(node.first, first); place(node.second, second);
  }
  if (layout.maximized) {
    const p = panelPane(layout, layout.maximized);
    rectangles[layout.maximized] = { x: 0, y: 0, ...canvas, paneId: p.id, visible: true, available: registry.has(panels[layout.maximized].kind) };
    paneRects[p.id] = { x: 0, y: 0, ...canvas };
  } else place(layout.root, { x: 0, y: 0, ...canvas });
  return freeze({ fits: width >= required.width && height >= required.height, required: { width: required.width, height: required.height }, canvas, rectangles, paneRects, handles });
}

export { createLayoutPersistence } from './layout-storage.mjs';
