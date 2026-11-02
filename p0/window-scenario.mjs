import assert from 'node:assert/strict';
export async function runWindowScenario(page) {
  const probes=[];
  const modes=()=>page.getByRole('group',{name:'整窗模式'});
  const nativeSidebarToggle=page.getByRole('button',{name:/^(Open sidebar|Collapse sidebar|打开侧边栏|收起侧边栏)$/}).filter({visible:true});
  const sidebarToggle=mode=>mode==='工作台'?page.getByRole('button',{name:'工作区与会话',exact:true}):nativeSidebarToggle;
  await page.setViewportSize({width:1366,height:900});
  for (const height of [32,40,48]) {
    await page.evaluate(height => { const html=document.documentElement;html.dataset.platform='win32';html.setAttribute('data-windows-titlebar','');html.style.setProperty('--dsh-windows-titlebar-height',height+'px'); },height);
    for(const mode of ['聊天','工作台']) {
      await modes().getByRole('button',{name:mode,exact:true}).click();
      const geometry=await page.evaluate(() => { const box=q=>{const b=document.querySelector(q).getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};return{frame:box('.mP3x-q_frame'),main:box('.mP3x-q_centerCol'),padding:getComputedStyle(document.querySelector('.p0-native')).paddingTop,rows:document.querySelectorAll('.p0-toolbar').length};});
      geometry.switch=await modes().evaluate(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
      geometry.toggle=await sidebarToggle(mode).evaluate(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};});
      assert.equal(geometry.rows,0);assert.equal(geometry.frame.y,0);assert.equal(geometry.frame.bottom,900);assert.equal(geometry.padding,height+'px');
      assert.equal(geometry.main.y,height,'only native titlebar clearance remains');assert.ok(geometry.switch.y>=height);
      const drag=await page.evaluate(()=>{const s=getComputedStyle(document.querySelector('.p0-native'),'::before'),t=getComputedStyle(document.querySelector('.p0-mode-switch'));return{region:s.getPropertyValue('-webkit-app-region'),content:s.content,display:s.display,height:parseFloat(s.height),top:parseFloat(s.top),switchRegion:t.getPropertyValue('-webkit-app-region'),hit:document.elementFromPoint(innerWidth/2,10)?.className};});
      assert.equal(drag.region,'drag');assert.notEqual(drag.content,'none');assert.notEqual(drag.display,'none');assert.equal(drag.top,0);assert.equal(drag.height,height);assert.equal(drag.switchRegion,'no-drag');assert.ok(drag.hit.includes('p0-native'));
      probes.push({height,mode,geometry,drag});
    }
  }
  await page.screenshot({path:'test-output/dual-windows-titlebar.png'});
  await page.evaluate(()=>document.documentElement.setAttribute('data-fullscreen',''));
  for(const mode of ['聊天','工作台']) {
    await modes().getByRole('button',{name:mode,exact:true}).click();
    const control=await modes().boundingBox(), toggle=await sidebarToggle(mode).boundingBox();
    assert.ok(control.x>=toggle.x+toggle.width || control.y>=toggle.y+toggle.height,'native toggle and mode control must not overlap');
    probes.push({fullscreen:true,mode,control,toggle});
  }
  await page.evaluate(()=>{const html=document.documentElement;html.removeAttribute('data-windows-titlebar');html.removeAttribute('data-fullscreen');html.removeAttribute('data-platform');html.style.removeProperty('--dsh-windows-titlebar-height');});
  return {probes,boundary:'Installed SDK sidebar CSS and bundled layout under explicit Windows attributes; not Electron OS hit-testing or native window-button acceptance.'};
}
