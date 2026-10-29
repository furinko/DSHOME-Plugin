import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceAuthority } from '../src/workbench/workspace-authority.mjs';
function source(value) { const listeners = new Set(); return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, set(next) { value = next; for (const fn of listeners) fn(); } }; }
function fixture() {
  const abort = new AbortController(), connection = source({ signal: abort.signal });
  const session = source({ key: 'A' }), workspaces = source({ phase: 'ready', items: [{ workspaceId: 'W1', sessionIds: ['A','B'] }, { workspaceId: 'W2', sessionIds: ['C'] }] });
  return { abort, connection, session, workspaces, authority: createWorkspaceAuthority({ connection, session, workspaces }) };
}
test('shared workspace never borrows the previous session lease', () => {
  const f = fixture(), old = f.authority.capture('W1');
  f.session.set({ key: 'B' }); assert.equal(old.signal.aborted,true); assert.throws(old.check);
  assert.equal(f.authority.capture('W1').sessionId,'B');
  f.session.set({ key: 'A' }); assert.throws(old.check); assert.equal(f.authority.capture('W1').sessionId,'A');
  f.authority.dispose();
});
test('membership withdrawal, ambiguity and foreign workspaces fail closed', () => {
  const f = fixture(), old = f.authority.capture('W1');
  assert.throws(() => f.authority.capture('W2'));
  f.workspaces.set({ phase: 'loading', items: [] }); assert.throws(old.check); assert.throws(() => f.authority.capture('W1'));
  f.workspaces.set({ phase: 'ready', items: [{ workspaceId:'W1', sessionIds:['A'] }, { workspaceId:'W2', sessionIds:['A'] }] });
  assert.throws(() => f.authority.capture('W1')); f.authority.dispose();
});
test('abort events revoke immediately without a source snapshot replacement', () => {
  const f = fixture(), old = f.authority.capture('W1'); f.abort.abort();
  assert.equal(old.signal.aborted,true); assert.throws(() => f.authority.capture('W1'));
  f.connection.set({ signal: new AbortController().signal }); assert.throws(old.check);
  assert.equal(f.authority.capture('W1').sessionId,'A'); f.authority.dispose();
});
test('late replies after A/B/A cannot be adopted into shared content', async () => {
  const f = fixture(), pending = Promise.withResolvers();
  const result = f.authority.run('W1', async lease => { assert.equal(lease.sessionId,'A'); return pending.promise; });
  f.session.set({ key: 'B' }); f.session.set({ key: 'A' }); pending.resolve('stale file');
  await assert.rejects(result); f.authority.dispose();
});
test('caller cancellation and disposal reject without invoking new host operations', async () => {
  const f = fixture(), cancel = new AbortController(); cancel.abort(); let calls = 0;
  await assert.rejects(f.authority.run('W1', () => calls++, cancel.signal));
  const old = f.authority.capture('W1'); f.authority.dispose(); assert.equal(old.signal.aborted,true);
  await assert.rejects(f.authority.run('W1', () => calls++)); assert.equal(calls,0);
});
