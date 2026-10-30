// Per-instance in-memory exchange, never serialized into the layout.
export function prepareModuleState(value) {
  const text=JSON.stringify(value);
  if(typeof text!=='string'||text.length>262144)throw Error('模块状态须为有界 JSON 数据');
  const result=JSON.parse(text);
  function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
  return freeze(result);
}
export function updateModuleContent({registry,provider,controller,item,value}) {
  if(registry.get(item.kind)!==provider||controller.content(item.id)!==item)throw Error('模块提供者或内容实例已变化');
  const state=prepareModuleState(value);
  controller.updateContent(item.id,{moduleState:state,moduleDirty:state!==null});
}
