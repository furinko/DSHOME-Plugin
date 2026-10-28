/* Ready Session DATA + source-adapter fixture. InputActions, Lexical draft
 * ownership, revision guards, UserText registry/factory and node dispatch are
 * installed by the actual published ui-conversation apply, never substituted.
 * This does not claim real SessionController, composer DOM, or chat history. */
export function nativeReferenceSession(ctx, store, retain, nativeOwner) {
  const constant = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
  const sessionState = store.createSnapshotStore({ sessionId: 'A', pendingSubmissions: [], running: false, subagent: null, removed: false, openState: 'open', openError: null,
    hasMore: false, loadingOlder: false, promptError: null, blank: false, lastAgentError: null, promptAttempted: false, awaitingFirstTurn: false });
  const eventSource = constant({ revision: 0, entries: [], hasMore: false, change: { kind: 'replace' } });
  const faces = new Map(); const session = { sessionId: 'A', getSnapshot: sessionState.getSnapshot, subscribe: sessionState.subscribe,
    projections: { faceOf(key) { if (!faces.has(key)) faces.set(key, constant(undefined)); return faces.get(key); } } };
  const owner = nativeOwner ?? { sessionId: 'A', session, ctx, eventSource };
  const binding = { key: 'A', ctx: owner.ctx, hooks: { session: owner.session }, keyedHooks: { projection: key => owner.session.projections.faceOf(key) }, props: { sessionId: 'A' } }, source = constant(binding);
  const adapter = { current: source, bindingSource: () => source, renderArea: (_binding, props) => props.children };
  const uiSession = { adapter, provide(descriptor) {
    const contribution = descriptor.resolve(owner);
    Object.assign(binding.hooks, contribution.hooks); Object.assign(binding.keyedHooks, contribution.keyedHooks); Object.assign(binding.props, contribution.props);
    return () => {};
  } };
  const sessions = { retain, binding: id => id === 'A' ? owner : undefined, scope: id => id === 'A' ? ctx : undefined, sessionOf: scope => scope === ctx ? session : undefined,
    list: constant({ byId: { A: { id: 'A', cwd: '/' } }, order: ['A'], selectedId: 'A' }) };
  return { binding, source, adapter, uiSession, sessions: nativeOwner ? ctx.get('sessions') : sessions, owner, input: () => ctx.get('conversation').input.for(owner.ctx), actions: () => binding.props.inputActions };
}
