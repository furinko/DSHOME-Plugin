import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneStore } from './scene-store.mjs';
test('aborted connection signal revokes active scene even without a source replacement', () => {
  const constant = value => ({getSnapshot:()=>value,subscribe:()=>()=>{}}), life = new AbortController();
  const store = createSceneStore({connection:constant({id:'epoch',signal:life.signal}),session:constant({key:'A'}),workspaces:constant({phase:'ready',items:[{workspaceId:'W',sessionIds:['A']}]})});
  const key=store.getSnapshot().selected; store.update(key,{note:'keep'});
  life.abort();
  assert.equal(store.getSnapshot().selected,null);
  assert.throws(()=>store.update(key,{note:'late'}),/Inactive/);
  assert.equal(store.getSnapshot().scenes[0].note,'keep');store.dispose();
});
