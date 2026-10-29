// Drag data is only a one-use local editor gesture, never imported layout data.
export const LAYOUT_DRAG_TYPE = 'application/x-dshome-layout-panel';
export function dropEdge(x, y, width, height) {
  if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) throw Error('Invalid docking position');
  const u = x / width, v = y / height;
  if (u >= .25 && u <= .75 && v >= .25 && v <= .75) return 'tab';
  const distance = [u, 1-u, v, 1-v], minimum = Math.min(...distance);
  return ['left','right','top','bottom'][distance.indexOf(minimum)];
}
export function createLayoutDrag(model, nonce = () => crypto.randomUUID()) {
  let gesture;
  return Object.freeze({
    begin(panelId) {
      const state = model.getSnapshot();
      if (!state.editing?.panels[panelId]) throw Error('Drag requires a live layout draft panel');
      gesture = { token: nonce(), panelId, draft: state.editing };
      return gesture.token;
    },
    drop(token, targetPaneId, edge) {
      const active = gesture; gesture = undefined;
      if (!active || token !== active.token || model.getSnapshot().editing !== active.draft) throw Error('Layout drag expired or belongs to another editor');
      model.dock(active.panelId, targetPaneId, edge);
      return active.panelId;
    },
    cancel() { gesture = undefined; },
  });
}
