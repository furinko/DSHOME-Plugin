import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutEdit } from './layout-edit.mjs';
test('draft is independent until apply; cancel restores committed layout', () => {
  const model = createLayoutEdit(); const first = model.getSnapshot().committed;
  model.begin(); model.update({ axis: 'y', ratio: 0.7, swapped: true });
  assert.deepEqual(model.getSnapshot().committed, first); model.cancel();
  assert.deepEqual(model.getSnapshot().committed, first); assert.equal(model.getSnapshot().draft, null);
  model.begin(); model.update({ axis: 'y', ratio: 0.7, swapped: true }); model.apply();
  assert.deepEqual(model.getSnapshot().committed, { axis: 'y', ratio: 0.7, swapped: true });
});
test('invalid updates cannot mutate a draft or smuggle content into layout', () => {
  const model = createLayoutEdit(); assert.throws(() => model.update({ ratio: 0.4 }));
  model.begin(); const before = model.getSnapshot();
  for (const patch of [{ ratio: NaN }, { ratio: 0.1 }, { axis: 'z' }, { note: 'secret' }, { swapped: 1 }]) {
    assert.throws(() => model.update(patch)); assert.equal(model.getSnapshot(), before);
  }
  assert.throws(() => model.begin()); model.cancel(); assert.throws(() => model.apply());
});
test('different scene models never share draft or commit', () => {
  const a = createLayoutEdit(), b = createLayoutEdit(); a.begin(); a.update({ swapped: true }); a.apply();
  assert.equal(a.getSnapshot().committed.swapped, true); assert.equal(b.getSnapshot().committed.swapped, false);
});
