// Pure lifecycle unit doubles; real React/SDK/PTY coverage is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectShelf } from '../src/workbench/project-shelf.mjs';
function setup(options = {}) {
  let host = { key: 'A', projectId: 'host-A', workspaceRoot: '/A' }, alive = true;
  const records = [], released = [], probes = [];
  const make = project => { const r = { key: project.key, closes: 0, releases: 0, dirty: false, accepted: true, marker: {} }; r.controller = { projectId: project.key, contents: new Map(), hasUnsaved: () => r.dirty, getSnapshot: () => ({}), closeWorkspace: () => { if (!r.accepted) return false; r.closes++; return true; }, releaseResources: () => { r.releases++; } }; records.push(r); return { controller: r.controller, r }; };
  const shelf = createProjectShelf({ probe: async () => { probes.push(host.key); return host; }, create: async project => make(project), isLive: () => alive,
    release: entry => { released.push(entry); }, ...options });
  return { shelf, records, released, probes, make, setHost(key) { host = { key, projectId: 'host-' + key, workspaceRoot: '/' + key }; }, stop() { alive = false; } };
}
test('initial ensure double-checks Host and owns exactly one controller', async () => { const f = setup(), e = await f.shelf.ensure(); assert.equal(e.controller.projectId, 'A'); assert.equal(f.records.length, 1); assert.equal(f.probes.length, 2); assert.equal((await f.shelf.ensure()).controller, e.controller); });
test('checking a changed Host never creates or silently selects another project', async () => { const f = setup(), a = await f.shelf.ensure(); f.setHost('B'); await f.shelf.check(); assert.equal(f.shelf.selected(), a); assert.equal(f.records.length, 1); assert.equal(f.shelf.getSnapshot().observed.key, 'B'); });
test('explicit open retains both controllers; selecting and revisiting never closes or recreates', async () => {
  const f = setup(), a = await f.shelf.ensure(); a.r.dirty = true; f.setHost('B'); const b = await f.shelf.openCurrent(), marker = a.r.marker; assert.notEqual(a.controller, b.controller); assert.equal(a.r.closes, 0);
  f.shelf.select('A'); assert.equal(f.shelf.selected().controller, a.controller); assert.equal(a.r.dirty, true); assert.equal(a.r.marker, marker);
  f.setHost('A'); assert.equal(await f.shelf.openCurrent(), a); assert.equal(f.records.length, 2); assert.equal(b.r.closes, 0);
});
test('Host changes while constructing a candidate never replace the previously selected project', async () => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers(); let f;
  f = setup({ create: async p => { const e = f.make(p); if (p.key === 'B') { entered.resolve(); await gate.promise; } return e; } }); const a = await f.shelf.ensure();
  f.setHost('B'); const opening = f.shelf.openCurrent(); await entered.promise; f.setHost('C'); gate.resolve(); await assert.rejects(opening, /Host 工作区已变化/);
  assert.equal(f.shelf.selected(), a); assert.equal(f.records[0].closes, 0); assert.equal(f.records[1].closes, 1); assert.equal(f.released.length, 1);
});
test('cancellation while constructing a candidate releases only the new candidate', async () => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers(); let f;
  f = setup({ create: async p => { const e = f.make(p); entered.resolve(); await gate.promise; return e; } }); const abort = new AbortController(), opening = f.shelf.openCurrent(abort.signal);
  await entered.promise; abort.abort(); gate.resolve(); await assert.rejects(opening); assert.equal(f.shelf.getSnapshot().projects.length, 0); assert.equal(f.records[0].closes, 1);
});
test('disposal while constructing prevents a late adoption and releases the owned candidate', async () => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers(); let f;
  f = setup({ create: async p => { const e = f.make(p); entered.resolve(); await gate.promise; return e; } }); const opening = f.shelf.openCurrent(); await entered.promise; await f.shelf.dispose(); gate.resolve(); await assert.rejects(opening); assert.equal(f.records[0].closes, 1); assert.equal(f.released.length, 1);
});
test('a failed probe leaves previous project and draft untouched', async () => { let reject = false; const f = setup({ probe: async () => { if (reject) throw Error('offline'); return { key: 'A' }; } }); const a = await f.shelf.ensure(); a.r.dirty = true; reject = true; await assert.rejects(f.shelf.openCurrent(), /offline/); assert.equal(f.shelf.selected(), a); assert.equal(a.r.closes, 0); });
test('capacity never evicts an old dirty controller', async () => { const f = setup({ limit: 1 }), a = await f.shelf.ensure(); a.r.dirty = true; f.setHost('B'); await assert.rejects(f.shelf.openCurrent(), /上限/); assert.equal(f.records.length, 1); assert.equal(a.r.closes, 0); });
test('duplicate in-flight opens share one owner and one candidate', async () => { const f = setup(), one = f.shelf.openCurrent(), two = f.shelf.openCurrent(); assert.equal(one, two); await one; assert.equal(f.records.length, 1); });
test('unknown selection and malformed Host identity allocate nothing', async () => { const f = setup({ probe: async () => ({ key: '' }) }); assert.throws(() => f.shelf.select('missing')); await assert.rejects(f.shelf.openCurrent()); assert.equal(f.records.length, 0); assert.throws(() => setup({ limit: 0 })); });
test('declining a project close preserves that project and all others', async () => { const f = setup(), a = await f.shelf.ensure(); f.setHost('B'); const b = await f.shelf.openCurrent(); a.r.accepted = false; assert.equal(await f.shelf.close('A'), false); assert.equal(f.shelf.get('A'), a); assert.equal(f.shelf.get('B'), b); assert.equal(f.released.length, 0); });
test('explicitly closing one project releases only it and returns to a retained project', async () => { const f = setup(), a = await f.shelf.ensure(); f.setHost('B'); const b = await f.shelf.openCurrent(); assert.equal(await f.shelf.close('B'), true); assert.equal(f.shelf.selected(), a); assert.equal(b.r.closes, 1); assert.equal(a.r.closes, 0); assert.equal(f.released.length, 1); });
for (const busy of ['dirty', 'terminal', 'saving', 'comparing']) test('bulk close preflights every project before touching any: ' + busy, async () => {
  const f = setup(), a = await f.shelf.ensure(); f.setHost('B'); const b = await f.shelf.openCurrent(); if (busy === 'dirty') b.r.dirty = true; else b.controller.contents.set('x', busy === 'terminal' ? { started: true } : { document: { getSnapshot: () => busy === 'comparing' ? { comparing: true } : { phase: 'saving' } } });
  await assert.rejects(f.shelf.closeAll(), /多个项目/); assert.equal(a.r.closes, 0); assert.equal(b.r.closes, 0); assert.equal(f.released.length, 0);
});
test('clean bulk close commits all controllers before awaiting any asynchronous release', async () => { const gate = Promise.withResolvers(); const f = setup({ release: () => gate.promise }); const a = await f.shelf.ensure(); f.setHost('B'); const b = await f.shelf.openCurrent(); const closing = f.shelf.closeAll(); await Promise.resolve(); assert.equal(a.r.closes, 1); assert.equal(b.r.closes, 1); assert.equal(f.shelf.getSnapshot().projects.length, 0); gate.resolve(); await closing; });
test('unload releases resources without issuing process/draft close actions', async () => { const f = setup(), a = await f.shelf.ensure(); a.r.dirty = true; await f.shelf.dispose(); assert.equal(a.r.closes, 0); assert.equal(a.r.releases, 1); assert.equal(f.released.length, 1); });
test('a buggy factory returning an already-owned controller never closes or rebinds it', async () => { let f, a; f = setup({ create: async p => a ?? f.make(p) }); a = await f.shelf.ensure(); f.setHost('B'); await assert.rejects(f.shelf.openCurrent(), /归属/); assert.equal(f.shelf.selected(), a); assert.equal(a.r.closes, 0); assert.equal(f.released.length, 0); });
test('project snapshots are frozen while controller identities remain stable', async () => { const f = setup(), a = await f.shelf.ensure(), s = f.shelf.getSnapshot(); assert.ok(Object.isFrozen(s)); assert.ok(Object.isFrozen(s.projects)); assert.ok(Object.isFrozen(a.project)); assert.throws(() => s.projects.push(a)); });

test('native close guard rejects synchronously, not as an ignored Promise', async () => { const f = setup(), a = await f.shelf.ensure(); a.r.accepted = false; assert.throws(() => f.shelf.closeAllNow(), /未保存/); assert.equal(f.shelf.selected(), a); assert.equal(a.r.closes, 0); });
