export async function ensureLayout(scene) { const trigger = scene.getByRole('button', {name:'布局选项',exact:true}); if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click(); }

export async function navigate(page,name) { const item=page.getByRole('button',{name,exact:true}); if(!await item.isVisible()){await page.getByRole('button',{name:'工作区与会话',exact:true}).click();} await item.click(); const close=page.getByRole('button',{name:'收起工作区导航',exact:true});if(await close.isVisible())await close.click(); }

export async function setMode(page,title) { const control=page.getByRole('switch',{name:'工作台模式',exact:true}); const checked=title==='工作台'; if ((await control.getAttribute('aria-checked')==='true')!==checked) await control.click(); }
