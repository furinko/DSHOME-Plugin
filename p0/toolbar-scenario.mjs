import {setMode,navigate} from './interaction-helpers.mjs';
import { runInteractionScenario } from './interaction-scenario.mjs';
import assert from 'node:assert/strict';

// Actual SDK + root-owned mode control, never the running GUI.
export async function runToolbarScenario({ page, context, url }) {
  const modes = () => page.getByRole('switch',{name:'工作台模式',exact:true});
  const click = title => setMode(page,title);
  const brand = () => page.locator('[data-slot="sidebar.brand.name"] .dshome-glow-name').textContent();
  const geometry = target => target.evaluate(() => {
    const rect = q => { const r=document.querySelector(q).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom }; };
    return { frame:rect('.mP3x-q_frame'),main:rect('.mP3x-q_centerCol'),scroll:document.documentElement.scrollWidth };
  });
  await page.setViewportSize({ width:1366,height:900 }); await click('聊天');
  const baseline = await context.newPage();
  try {
    await baseline.setViewportSize({ width:1366,height:900 }); await baseline.goto(url+'/baseline');
    await baseline.locator('[data-lexical-editor=true]').waitFor();
    await page.waitForFunction(() => document.querySelector('.p0-native').dataset.dualViewport==='1366');
    assert.deepEqual(await geometry(page),await geometry(baseline));
    await baseline.evaluate(() => window.testP0.dispose());
  } finally { await baseline.close(); }
  assert.equal(await page.locator('.p0-toolbar').count(),0);
  assert.equal(await modes().count(),1);
  assert.equal(await brand(),'DSHOME');
  await modes().evaluate(n => { window.fixedModeNode=n;window.fixedChatInput=document.querySelector('[data-lexical-editor=true]'); });
  const control=modes();
  await control.focus(); await control.press('Space'); assert.equal(await control.getAttribute('aria-checked'),'true');
  await control.press('Enter'); assert.equal(await control.getAttribute('aria-checked'),'false');
  await control.press('ArrowRight'); assert.equal(await control.getAttribute('aria-checked'),'true');
  await control.press('ArrowLeft'); assert.equal(await control.getAttribute('aria-checked'),'false');
  assert.equal(await control.evaluate(n=>n===document.activeElement),true);
  const probes=[];
  for (const width of [1920,1366,1040,760,520,390]) {
    await page.setViewportSize({ width,height:900 });
    await page.waitForFunction(w => document.querySelector('.p0-native').dataset.dualViewport===String(w),width);
    let before;
    for (const mode of ['聊天','工作台','聊天','工作台']) {
      await click(mode);
      await page.waitForTimeout(180);
      assert.equal(await page.locator('.p0-workbench-brand').isVisible(),true);
      assert.equal(await page.locator('.p0-workbench-brand').innerText(),'鲸鱼工作台');
      assert.equal(await page.locator('.p0-navigation-rail .p0-whale-logo').count(),0);
      assert.equal(await page.locator('[data-slot="sidebar"] button[class*="_toggle"] [class$="_railMark"]:visible').count(),0);
      if (mode==='聊天') {
        const toggle=page.getByRole('button',{name:/^(Open sidebar|Collapse sidebar|打开侧边栏|收起侧边栏)$/}).filter({visible:true});
        const r=await toggle.boundingBox(); assert.ok(r.x>=0 && r.x+r.width<=width,'native navigation remains on-screen');
        assert.equal(await toggle.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'native navigation hit target is reachable');
      }
      const box=await modes().boundingBox(); before ??= box;
      assert.deepEqual(box,before,'mode position cannot move at '+width);
      assert.ok(box.x>=0 && box.x+box.width<=width);
      assert.equal(await modes().evaluate(n=>n===window.fixedModeNode),true);
      // The native collapsed rail does not mount its brand-name seat.
      if (await page.locator('[data-slot="sidebar.brand.name"] .dshome-glow-name').count()) assert.equal(await brand(),mode==='聊天'?'DSHOME':'鲸鱼工作台');
      const overlaps=await page.locator('[data-slot="conversation.header"] button:visible,.p0-full-scene:not([hidden]) .wb-header button:visible').evaluateAll((nodes,b)=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.x<b.x+b.width&&r.right>b.x&&r.y<b.y+b.height&&r.bottom>b.y;}).map(n=>n.textContent||n.getAttribute('aria-label')),box);
      assert.deepEqual(overlaps,[],'mode switch must not cover native/workspace buttons');
      if (width===390 && mode==='聊天') await page.screenshot({ path:'test-output/brand-narrow-chat.png' });
      if (width===1366 && mode==='聊天') await page.screenshot({ path:'test-output/fixed-mode-chat.png' });
      if (width===1366 && mode==='工作台') await page.screenshot({ path:'test-output/fixed-mode-workbench.png' });
    }
    if (width<=900) {
      await page.getByRole('button',{name:'显示右侧聊天',exact:true}).click();
      assert.deepEqual(await modes().boundingBox(),before);
      await page.getByRole('button',{name:'显示操作区',exact:true}).click();
      assert.deepEqual(await modes().boundingBox(),before);
    }
    if (width===390) await page.screenshot({ path:'test-output/fixed-mode-narrow.png' });
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    probes.push({ width,box:before });
  }
  await page.setViewportSize({ width:1366,height:900 }); const globalBox=await modes().boundingBox();
  await navigate(page,'其他主面板'); await page.getByRole('region',{name:'隔离全局页面'}).waitFor();
  await click('聊天'); await click('工作台');
  assert.deepEqual(await modes().boundingBox(),globalBox);
  assert.equal(await page.getByRole('region',{name:'隔离全局页面'}).isVisible(),true);
  await page.getByRole('button',{name:'回到当前会话',exact:true}).click(); await click('聊天');
  // Native global panels remount the conversation; only mode switching promises
  // stable content DOM. The root mode control itself must survive both.
  assert.equal(await modes().evaluate(n=>n===window.fixedModeNode),true);
  await navigate(page,'会话 B');
  await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='B');
  await click('工作台'); await click('聊天'); assert.deepEqual(await modes().boundingBox(),globalBox);
  assert.equal(await modes().evaluate(n=>n===window.fixedModeNode),true);
  await navigate(page,'会话 A');
  await page.waitForFunction(()=>window.testP0.ctx.get('uiSession').current.getSnapshot()?.key==='A');
  await page.setViewportSize({ width:1920,height:1080 });
  const interaction = await runInteractionScenario(page); return { interaction, noSeparateModeRow:true,originalFrameGeometryExact:true,oneStableModeNode:true,persistentWhaleBrand:true,keyboardSwitch:true,sidebarBrandFollowsMode:true,globalAndBlankSessionReachable:true,narrowPaneDoesNotMoveMode:true,probes };
}
