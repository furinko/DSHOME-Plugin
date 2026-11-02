import assert from 'node:assert/strict';

// Actual SDK header + product header; fixture navigation/catalog, not live GUI.
export async function runToolbarScenario({ page, context, url }) {
  const modes = () => page.getByRole('group', { name: '整窗模式', exact: true });
  const click = title => modes().getByRole('button', { name: title, exact: true }).click();
  const geometry = target => target.evaluate(() => {
    const rect = q => { const r = document.querySelector(q).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
    return { frame:rect('.mP3x-q_frame'), main:rect('.mP3x-q_centerCol'), scroll:document.documentElement.scrollWidth };
  });
  await page.setViewportSize({ width:1366, height:900 });
  await click('原版');
  const baseline = await context.newPage();
  try {
    await baseline.setViewportSize({ width:1366, height:900 });
    await baseline.goto(url + '/baseline'); await baseline.locator('[data-lexical-editor=true]').waitFor();
    await page.waitForFunction(() => document.querySelector('.p0-native').dataset.dualViewport === '1366');
    assert.deepEqual(await geometry(page), await geometry(baseline), 'Original retains exact native frame geometry, with no mode row');
    await baseline.evaluate(() => window.testP0.dispose());
  } finally { await baseline.close(); }
  assert.equal(await page.locator('.p0-toolbar').count(), 0);
  assert.equal(await modes().count(), 1, 'one reachable native mode seat');
  assert.ok(await modes().evaluate(n => !!n.closest('[data-slot="conversation.session.header.utilities"]')));
  const frame = await page.locator('.p0-native').evaluate(n => { window.toolbarRoot=n; return n.getBoundingClientRect().height; });
  assert.equal(frame, 900);
  await click('鲸鱼工作台');
  await page.locator('.p0-full-scene:not([hidden]) .wb-header').waitFor();
  assert.equal(await modes().count(), 1);
  assert.ok(await modes().evaluate(n => !!n.closest('.wb-header')));
  assert.equal(await modes().getByRole('button', { name:'鲸鱼工作台', exact:true }).getAttribute('aria-pressed'), 'true');
  const probes = [];
  for (const width of [1920, 1366, 1040, 760, 520, 390]) {
    await page.setViewportSize({ width, height:900 });
    await page.waitForFunction(w => document.querySelector('.p0-native').dataset.dualViewport === String(w), width);
    const box = await modes().evaluate(n => { const r=n.getBoundingClientRect(), h=n.closest('.wb-header').getBoundingClientRect(); return { x:r.x,right:r.right,y:r.y,bottom:r.bottom,header:{x:h.x,right:h.right,y:h.y,bottom:h.bottom},scroll:document.documentElement.scrollWidth,width:innerWidth }; });
    assert.ok(box.x >= box.header.x && box.right <= box.header.right + 1, JSON.stringify(box));
    assert.ok(box.y >= box.header.y && box.bottom <= box.header.bottom + 1);
    assert.ok(box.scroll <= width + 1); probes.push(box);
    if (width === 390) await page.screenshot({ path:'test-output/whale-toolbar-narrow.png' });
    if (width <= 900) {
      await page.getByRole('button', { name:'聊天', exact:true }).click();
      if (width === 390) await page.screenshot({ path:'test-output/whale-toolbar-narrow-chat.png' });
      assert.equal(await modes().count(), 1);
      const chatBox = await modes().boundingBox(); assert.ok(chatBox.x >= 0 && chatBox.x + chatBox.width <= width, 'narrow native-header mode control fits viewport');
      const utilities = await page.locator('.mP3x-q_centerCol .dshome-wb-switch button:visible,[data-slot="conversation.session.header.corner"] button:visible').evaluateAll(nodes => nodes.map(n => { const r=n.getBoundingClientRect(); return { text:n.textContent,x:r.x,right:r.right }; }));
      assert.ok(utilities.every(b => b.x >= 0 && b.right <= width + 1), JSON.stringify(utilities));
      await page.getByRole('button', { name:'操作区', exact:true }).click();
    }
  }
  await page.setViewportSize({ width:1366, height:900 });
  await page.getByRole('button', { name:'其他主面板', exact:true }).click();
  await page.getByRole('region', { name:'隔离全局页面' }).waitFor();
  await click('原版'); await click('鲸鱼工作台');
  assert.equal(await page.getByRole('region', { name:'隔离全局页面' }).isVisible(), true, 'mode switching never navigates away from a global page');
  await page.getByRole('button', { name:'回到当前会话', exact:true }).click();
  await page.locator('.p0-full-scene:not([hidden]) .wb-header').waitFor();
  assert.equal(await page.evaluate(() => window.toolbarRoot === document.querySelector('.p0-native')), true);
  await page.screenshot({ path:'test-output/whale-toolbar.png' });
  await click('原版');
  await page.screenshot({ path:'test-output/whale-toolbar-original.png' });
  await page.getByRole('button', { name:'会话 B', exact:true }).click();
  await page.waitForFunction(() => window.testP0.ctx.get('uiSession').current.getSnapshot()?.key === 'B');
  assert.equal(await modes().count(), 1, 'blank-session native Hero seat remains reachable');
  await click('鲸鱼工作台'); await click('原版');
  await page.getByRole('button', { name:'会话 A', exact:true }).click();
  await page.waitForFunction(() => window.testP0.ctx.get('uiSession').current.getSnapshot()?.key === 'A');
  await page.setViewportSize({ width:1920, height:1080 });
  return { originalGeometryExact:true, noSeparateModeRow:true, nativeAndWorkspaceHeaderSeats:true, blankSessionReachable:true, globalPageRetained:true, stableRoot:true, probes };
}
