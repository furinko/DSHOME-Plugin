import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutDrag, dropEdge } from '../src/workbench/layout-drag.mjs';
import { createWorkspaceModel } from '../src/workbench/model.mjs';
function fixture() { const m=createWorkspaceModel({projectId:'P'}); m.registerModule({kind:'web',label:'Web'}); m.addPanel('web',{id:'A'}); m.addPanel('web',{id:'B',targetPaneId:'pane-root',edge:'right'}); return m; }
test('five explicit docking regions and invalid coordinates',()=>{
  for (const [x,y,edge] of [[50,50,'tab'],[1,50,'left'],[99,50,'right'],[50,1,'top'],[50,99,'bottom']]) assert.equal(dropEdge(x,y,100,100),edge);
  for (const args of [[NaN,0,1,1],[-1,0,1,1],[0,0,0,1],[2,0,1,1]]) assert.throws(()=>dropEdge(...args));
});
test('drag edits only draft and token can be used once',()=>{
  const m=fixture(), drag=createLayoutDrag(m,()=> 'token'); assert.throws(()=>drag.begin('A'));
  const saved=m.serialize(); m.beginEdit(); const token=drag.begin('B'); drag.drop(token,'pane-root','tab');
  assert.deepEqual(m.serialize(),saved); assert.equal(m.getSnapshot().editing.layout.root.first.tabs.length,2);
  assert.throws(()=>drag.drop(token,'pane-root','left')); m.cancelEdit(); assert.deepEqual(m.serialize(),saved);
});
test('foreign editor stale draft cancellation and replay are rejected atomically',()=>{
  const m=fixture(), drag=createLayoutDrag(m,()=> 'one'); m.beginEdit(); let token=drag.begin('B');
  assert.throws(()=>drag.drop('foreign','pane-root','tab')); assert.throws(()=>drag.drop(token,'pane-root','tab'));
  token=drag.begin('B'); m.swap('A','B'); const state=m.getSnapshot(); assert.throws(()=>drag.drop(token,'pane-root','tab')); assert.equal(m.getSnapshot(),state);
  token=drag.begin('B'); m.cancelEdit(); m.beginEdit(); assert.throws(()=>drag.drop(token,'pane-root','tab'));
  token=drag.begin('B'); drag.cancel(); assert.throws(()=>drag.drop(token,'pane-root','tab'));
});
