export async function ensureLayout(scene) { const trigger = scene.getByRole('button', {name:'布局选项',exact:true}); if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click(); }
