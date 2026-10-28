// Transactional presentation-only layout: content remains owned by its scene.
// Deliberately no filesystem, session, network, or AI execution authority.
export function createLayoutEdit(initial = { axis: 'x', ratio: 0.5, swapped: false }) {
  const valid = value => {
    if (!value || !['x', 'y'].includes(value.axis) || !Number.isFinite(value.ratio) || value.ratio < 0.2 || value.ratio > 0.8 || typeof value.swapped !== 'boolean' || Object.keys(value).sort().join(',') !== 'axis,ratio,swapped') throw Error('Invalid layout');
    return Object.freeze({ axis: value.axis, ratio: value.ratio, swapped: value.swapped });
  };
  let committed = valid(initial), draft = null, revision = 0, snapshot;
  const listeners = new Set();
  function publish() { snapshot = Object.freeze({ committed, draft, revision: ++revision }); for (const fn of [...listeners]) fn(); }
  function requireEdit() { if (!draft) throw Error('Layout is not being edited'); }
  publish();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    begin() { if (draft) throw Error('Layout edit already active'); draft = valid(committed); publish(); },
    update(patch) { requireEdit(); if (!patch || Object.keys(patch).some(k => !['axis','ratio','swapped'].includes(k))) throw Error('Unknown layout field'); draft = valid({ ...draft, ...patch }); publish(); },
    cancel() { requireEdit(); draft = null; publish(); },
    apply() { requireEdit(); committed = valid(draft); draft = null; publish(); },
  });
}
