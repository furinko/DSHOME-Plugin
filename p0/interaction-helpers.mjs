export async function ensureLayout(scene) { const trigger = scene.getByRole('button', {name:'布局选项',exact:true}); if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click(); }

export async function navigate(page,name) { const item=page.getByRole('button',{name,exact:true}); if(!await item.isVisible()){await page.getByRole('button',{name:'工作区与会话',exact:true}).click();} await item.click(); const close=page.getByRole('button',{name:'收起工作区导航',exact:true});if(await close.isVisible())await close.click(); }
