// Layout owns geometry only, never content or host authority.
import { createWorkspaceModel } from '../src/workbench/model.mjs';
export const layoutNodes = root => root.type === 'pane' ? [root] : [root, ...layoutNodes(root.first), ...layoutNodes(root.second)];
export function createPanelLayout(projectId) {
  const model = createWorkspaceModel({ projectId });
  model.registerModule({ kind: 'note', label: '工作便笺', minWidth: 260, minHeight: 190 });
  model.registerModule({ kind: 'web', label: '网页', minWidth: 300, minHeight: 240 });
  model.addPanel('note', { id: 'panel-note', title: '工作便笺' });
  model.addPanel('web', { id: 'panel-web', title: '网页', targetPaneId: 'pane-root', edge: 'right' });
  return model;
}
