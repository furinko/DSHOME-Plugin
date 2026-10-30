// Explicit close-only recovery. Never rebind the old entry or enable its input.
export function createRetainedTerminalCloser({authority,workspaceId,projectId,services,owner,remote,controller,cleanup,confirm}) {
 const busy=new Set();
 return async panelId=>{
  if(busy.has(panelId))throw Error('该旧终端正在确认关闭，请等待回执');
  const item=controller.contents.get(panelId),view=item?.view,id=view?.id,sessionId=item?.ownerSessionId;
  if(!item?.started||!id||!sessionId)throw Error('旧终端身份缺失或已关闭');
  const lease=authority.capture(workspaceId);
  const check=()=>{lease.check();if(lease.sessionId!==sessionId)throw Error('请返回原所属会话 '+sessionId+' 关闭此终端');if(!services.available(owner))throw Error('原远端服务已不可用，未向其他服务转移关闭请求');if(controller.contents.get(panelId)!==item||item.view!==view||!item.started)throw Error('旧终端内容已变化');if(controller.model.getSnapshot().editing)throw Error('请先结束旧现场的布局编辑');};
  check();if(!confirm('仅结束这个旧现场终端，不恢复输入权限、不释放其他草稿，确定吗？'))return false;
  check();busy.add(panelId);
  try {
   const project=await services.call(owner,(ns,signal)=>ns.project(sessionId,signal),lease.signal);check();
   if(project?.ok!==true||project.value?.projectId!==projectId)throw Error('当前宿主项目与旧终端项目不符，未关闭');
   cleanup.begin(sessionId,id,panelId);
   const result=await cleanup.closeRemote(async()=>{check();const result=await remote.close(sessionId,id);check();return result;},sessionId,id);
   if(result?.ok!==true)throw Error(result?.error?.message??'宿主未确认旧终端关闭');
   check();controller.updateContent(panelId,{started:false});await controller.closePanel(panelId);return true;
  } finally {busy.delete(panelId);}
 };
}
