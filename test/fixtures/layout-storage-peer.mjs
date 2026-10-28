// A second real browser page using the same public layout persistence module.
import { createLayoutPersistence, createWorkspaceModel } from '../../src/workbench/model.mjs';
import { createBrowserLayoutStorage } from '../../src/workbench/browser-layout-storage.mjs';
window.openLayoutPeer = async projectId => {
  const backend = await createBrowserLayoutStorage({ projectId, legacyStorage: localStorage });
  const persistence = createLayoutPersistence({ ...backend, projectId });
  const before = persistence.read(); if (before.kind !== 'ready') throw Error('Peer needs a readable saved layout');
  const model = createWorkspaceModel({ projectId, initial: before.project }); model.selectPreset('review');
  window.layoutPeer = { persistence, before, model };
};

window.probeLayoutPersistence = async projectId => {
  const backend = await createBrowserLayoutStorage({ projectId, legacyStorage: localStorage });
  try { const p = createLayoutPersistence({ ...backend, projectId }), before = p.read(); let outsideRejected = false;
    try { backend.storage.getItem('dshome.workspace.v1:outside-project'); } catch { outsideRejected = true; }
    return { kind: before.kind, raw: before.raw, backup: before.backupKey ? p.readBackup(before.backupKey) : null, outsideRejected };
  } finally { backend.storage.dispose(); }
};
