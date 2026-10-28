// Actual public ClientModuleSystem + vendored Loader + HMR apply. This small
// graph owns ONLY the product; auxiliary SDK plugins stay owned by the fixture.
// The real EventSource reads an owned HTTP server, never the running GUI.
export async function nativeHmrEntry({ ctx, consume, factories, modules }) {
  const id = 'dshome-plugin', moduleId = '@deepseek-ai/dsh-client-modules';
  const api = consume(moduleId);
  for (const key of factories.keys()) if (key !== id) consume(key);
  const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration); } };
  window.__ModuleLoader__ = target;
  const graph = (rev, enabled = true) => ({ rev: 'explicit-fixture-graph-' + rev, entries: enabled ? [{ id, url: 'product.js?rev=' + encodeURIComponent(rev), rev }] : [], batches: enabled ? [{ phase: 'application', url: 'product.js?rev=' + encodeURIComponent(rev), rev, entries: [id] }] : [] });
  const manifest = api.parseBootManifest(graph('owned-original-1'));
  const system = new api.ClientModuleSystem({ manifest, registrationTarget: target, staticModules: Object.fromEntries(modules), bootstrapModule: { id: moduleId, exports: api } });
  const loader = ctx.get('loader'); loader.internal = system;
  // Publish via the SDK enrollment plugin rather than a fake entries object.
  const enrollment = ctx.plugin(api); await enrollment;
  const observations = []; const off = system.entries.state.subscribe(() => observations.push(system.entries.state.getSnapshot()));
  ctx.effect(() => off);
  await system.entries.start(loader, manifest);
  const settled = system.entries.state.getSnapshot(); if (settled.failures.length) throw Error('Initial actual module reconciliation failed: ' + JSON.stringify(settled));
  const entry = [...loader.entries()].find(entry => entry.options.name === id);
  if (!entry?.fiber) throw Error('Actual Loader did not activate the product');
  const receiver = ctx.plugin(consume('@deepseek-ai/dsh-client-hmr')); await receiver;
  return { get entry() { return [...loader.entries()].find(entry => entry.options.name === id); }, system, graph, observations, receiver, enrollment,
    async dispose() { await receiver.dispose(); await ctx.fiber.dispose(); } };
}
