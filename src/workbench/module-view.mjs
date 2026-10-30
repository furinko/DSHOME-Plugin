import React from 'react';
import {updateModuleContent} from './module-content.mjs';
import {downloadDraft} from './recovery-ui.mjs';
const h=React.createElement;
class ProviderBoundary extends React.Component {
  state={error:null,provider:null};
  static getDerivedStateFromProps(props,state){return props.provider!==state.provider?{provider:props.provider,error:null}:null;}
  static getDerivedStateFromError(error){return {error};}
  render(){return this.state.error?h('p',{role:'alert'},'模块渲染失败；内容状态仍保留。'+this.state.error.message):this.props.children;}
}
export function ModuleView({registry,item,controller,active}) {
  const provider=registry?.get(item.kind);
  const state=item.moduleState??null;
  return h('div',{style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}},
    h('small',null,'扩展模块 · 本地展示/内存状态；未授予宿主或 AI 操作能力'),
    state!==null&&h('button',{type:'button',onClick:()=>{try{downloadDraft(item.id+'.json',JSON.stringify(state,null,2));}catch(error){controller.notify(error.message);}}},'导出模块状态'),
    provider?h('div',{className:'wb-extension-body',style:{flex:1,minHeight:0,overflow:'auto'}},h(ProviderBoundary,{provider},h(provider.render,{instanceId:item.id,state,active,setState:value=>updateModuleContent({registry,provider,controller,item,value})}))):h('p',{role:'status'},'模块提供者不可用，实例与托管内容状态仍保留。'));
}
