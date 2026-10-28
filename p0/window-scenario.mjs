import assert from 'node:assert/strict';
export async function runWindowScenario(page) {
  const probes=[];
  await page.setViewportSize({width:1366,height:900});
  for (const height of [32,40,48]) {
    await page.evaluate(height => { const html=document.documentElement;html.dataset.platform='win32';html.setAttribute('data-windows-titlebar','');html.style.setProperty('--dsh-windows-titlebar-height',height+'px'); },height);
    for(const mode of ['原版','工作台']) {
      await page.getByRole('group',{name:'整窗模式'}).getByRole('button',{name:mode,exact:true}).click();
      const geometry=await page.evaluate(() => { const box=q=>{const e=document.querySelector(q);if(!e)throw Error('Missing required native control: '+q);const b=e.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};return{toolbar:box('.p0-toolbar'),toggle:box('.wtg9ga_toggle'),frame:box('.mP3x-q_frame'),main:box('.mP3x-q_centerCol'),windowHeight:innerHeight,padding:getComputedStyle(document.querySelector('.p0-native')).paddingTop};});
      assert.ok(geometry.toolbar.y>=height-1);assert.ok(geometry.toggle.bottom<=geometry.toolbar.y+1,'native titlebar toggle must not overlap mode toolbar');
      assert.ok(geometry.main.y>=geometry.toolbar.bottom-1);assert.ok(geometry.frame.bottom<=geometry.windowHeight+1);assert.equal(geometry.padding,'0px');
      const drag=await page.evaluate(()=>{const shell=document.querySelector('.p0-shell'),s=getComputedStyle(shell,'::before'),t=getComputedStyle(document.querySelector('.p0-toolbar'));return{region:s.getPropertyValue('-webkit-app-region'),content:s.content,display:s.display,height:parseFloat(s.height),top:parseFloat(s.top),toolbarRegion:t.getPropertyValue('-webkit-app-region'),hit:document.elementFromPoint(innerWidth/2,10)?.className};});
      assert.equal(drag.region,'drag','reserved titlebar must retain an Electron drag region');
      assert.notEqual(drag.content,'none');assert.notEqual(drag.display,'none');assert.equal(drag.top,0);assert.equal(drag.height,height);assert.equal(drag.toolbarRegion,'no-drag');assert.equal(drag.hit,'p0-shell');
      probes.push({height,mode,geometry,drag});
    }
  }
  await page.screenshot({path:'test-output/dual-windows-titlebar.png'});
  await page.evaluate(()=>{document.documentElement.setAttribute('data-fullscreen','');document.documentElement.style.setProperty('--dsh-windows-titlebar-height','32px');});
  const full=await page.evaluate(()=>{const b=q=>{const r=document.querySelector(q).getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return{brand:b('.p0-toolbar strong'),toggle:b('.wtg9ga_toggle'),toolbar:b('.p0-toolbar')};});
  assert.ok(full.brand.x>=full.toggle.right);assert.equal(full.toolbar.y,0);probes.push({fullscreen:true,geometry:full});
  await page.evaluate(()=>{const html=document.documentElement;html.removeAttribute('data-windows-titlebar');html.removeAttribute('data-fullscreen');html.removeAttribute('data-platform');html.style.removeProperty('--dsh-windows-titlebar-height');});
  return {probes,boundary:'Actual rc.3 sidebar/frame CSS under explicit Windows attributes; not Electron OS hit-testing or native window-button acceptance.'};
}
