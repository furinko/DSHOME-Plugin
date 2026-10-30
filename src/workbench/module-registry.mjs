// Trusted in-process renderers only. Registration grants no Host, filesystem,
// terminal, chat insertion or model-execution authority.
export function createModuleRegistry({reserved=[],onChange=()=>{}}={}) {
  const providers=new Map(), models=new Map(), blocked=new Set(reserved); let disposed=false;
  function live(){if(disposed)throw Error('模块注册表已关闭');}
  function register(value) {
    live();
    if (!value || typeof value.kind!=='string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.kind) || typeof value.label!=='string' || !value.label.trim() || value.label.length>80 || typeof value.render!=='function') throw Error('无效模块定义');
    if(blocked.has(value.kind)||providers.has(value.kind))throw Error('模块类型已注册或为内置类型');
    const definition=Object.freeze({kind:value.kind,label:value.label,minWidth:value.minWidth??240,minHeight:value.minHeight??120});
    if(!Number.isFinite(definition.minWidth)||definition.minWidth<80||definition.minWidth>2000||!Number.isFinite(definition.minHeight)||definition.minHeight<44||definition.minHeight>2000)throw Error('无效模块最小尺寸');
    const provider=Object.freeze({...definition,render:value.render,capability:'display-only'}), attached=[];
    try {for(const [model,releases] of models){const off=model.registerModule(definition);releases.set(value.kind,off);attached.push(releases);}}
    catch(error){for(const releases of attached){releases.get(value.kind)();releases.delete(value.kind);}throw error;}
    providers.set(value.kind,provider);onChange();let closed=false;
    return ()=>{if(closed)return;closed=true;if(providers.get(value.kind)!==provider)return;providers.delete(value.kind);for(const releases of models.values()){releases.get(value.kind)?.();releases.delete(value.kind);}onChange();};
  }
  function attach(model) {
    live();if(models.has(model))throw Error('模型已连接');const releases=new Map();
    try {for(const p of providers.values())releases.set(p.kind,model.registerModule(p));}catch(error){for(const off of releases.values())off();throw error;}
    models.set(model,releases);let closed=false;return ()=>{if(closed)return;closed=true;models.delete(model);for(const off of releases.values())off();releases.clear();};
  }
  return Object.freeze({register,attach,get:kind=>providers.get(kind),list:()=>[...providers.values()],dispose(){if(disposed)return;disposed=true;providers.clear();for(const releases of models.values())for(const off of releases.values())off();models.clear();onChange();}});
}
