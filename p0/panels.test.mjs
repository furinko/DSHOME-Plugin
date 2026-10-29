import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelLayout, layoutNodes } from './panels.mjs';

test('tree edits commit atomically and cancellation retains the original geometry', () => {
  const m = createPanelLayout('W1'), original = m.serialize(), root = original.layout.root;
  m.beginEdit(); m.setSplitAxis(root.id, 'y'); m.resize(root.id, .65); m.swap('panel-note','panel-web');
  assert.deepEqual(m.serialize(),original); assert.equal(m.getSnapshot().editing.layout.root.axis,'y');
  m.cancelEdit(); assert.deepEqual(m.serialize(),original);
  m.beginEdit(); m.setSplitAxis(root.id,'y'); m.resize(root.id,.65); m.swap('panel-note','panel-web'); m.applyEdit();
  const geometry = m.geometry(1000,1000);
  assert.ok(geometry.rectangles['panel-web'].y < geometry.rectangles['panel-note'].y);
  assert.equal(m.getSnapshot().layout.root.ratio,.65);
});
test('invalid axis and stale split are atomic; undo redo retains the tree', () => {
  const m = createPanelLayout('W1'); m.beginEdit(); const before = m.getSnapshot();
  assert.throws(() => m.setSplitAxis(before.layout.root.id,'z'),{code:'INVALID_SPLIT'});
  assert.throws(() => m.setSplitAxis('missing','y'),{code:'SPLIT_NOT_FOUND'});
  assert.equal(m.getSnapshot(),before);
  m.setSplitAxis(before.layout.root.id,'y'); m.undo(); assert.equal(m.getSnapshot().editing.layout.root.axis,'x');
  m.redo(); assert.equal(m.getSnapshot().editing.layout.root.axis,'y');
});
test('tab merge split maximize collapse retains panel identities and excludes contents', () => {
  const m = createPanelLayout('W1');
  m.dock('panel-web','pane-root','tab'); m.activate('panel-note');
  assert.equal(m.geometry(1000,800).rectangles['panel-web'].visible,false);
  m.maximize('panel-note'); m.activate('panel-web');
  assert.equal(m.getSnapshot().layout.maximized,'panel-web');
  assert.equal(m.geometry(1000,800).rectangles['panel-web'].visible,true);
  m.maximize('panel-web');
  m.dock('panel-web','pane-root','top'); m.maximize('panel-web');
  assert.equal(m.geometry(1000,800).rectangles['panel-note'],undefined);
  m.maximize('panel-web'); m.collapse('panel-web'); m.expand('panel-web');
  assert.equal(Object.keys(m.getSnapshot().panels).length,2);
  const saved = m.serialize(); assert.equal(saved.layout.maximized,null);
  for (const p of Object.values(saved.panels)) assert.deepEqual(Object.keys(p).sort(),['id','kind','title']);
  assert.ok(layoutNodes(saved.layout.root).length >= 3);
  assert.notDeepEqual(saved,createPanelLayout('W2').serialize());
});
