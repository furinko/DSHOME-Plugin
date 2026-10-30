// Export only client-held draft data; never re-read files, contact old services,
// revive a process, copy a URL, or import/replay this bundle automatically.
export function retainedDraftBundle(entry) {
  const contents=[];
  for(const item of entry.controller.contents.values()) {
    const doc=item.document?.getSnapshot();
    if(doc)contents.push({id:item.id,kind:'document',path:doc.path,text:doc.text,dirty:!!doc.dirty,uncertain:!!doc.uncertain,phase:doc.phase});
    if(item.kind==='note')contents.push({id:item.id,kind:'note',text:item.noteText??''});
    if(item.moduleState!==undefined&&item.moduleState!==null)contents.push({id:item.id,kind:item.kind,state:item.moduleState});
  }
  return JSON.stringify({format:'dshome-retained-drafts-v1',workspaceId:entry.workspaceId,projectId:entry.controller.projectId,
    warning:'只包含客户端内存草稿和布局。不证明文件已保存、终端已结束或网页表单已导出；不自动导入或执行。',
    layout:entry.controller.model.serialize(),contents},null,2);
}
