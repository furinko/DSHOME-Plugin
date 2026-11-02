// Directory capabilities stay in memory. Listing never reads file bodies.
export async function sameLocalEntry(a,b) {
  if(a===b)return true;
  if(!a || !b || a.snapshot || b.snapshot || !a.isSameEntry)return false;
  return a.isSameEntry(b);
}
export function snapshotFolders(files) {
  if(files.length > 10000) throw Error('一次最多添加 10000 个文件，请选择更小的文件夹。');
  const roots=new Map();
  for(const file of files) {
    const parts=(file.webkitRelativePath || file.name).split('/');
    if(parts.length<2 || parts.some(p=>!p || p==='.' || p==='..')) throw Error('文件夹路径无效');
    let children=roots;
    for(const name of parts.slice(0,-1)) {
      if(!children.has(name)) {const entries=new Map();children.set(name,{name,kind:'directory',snapshot:true,entries,async *values(){yield* entries.values();}});}
      children=children.get(name).entries;
    }
    const name=parts.at(-1); const h={name,kind:'file',snapshot:true,getFile:async()=>file,isSameEntry:async other=>other===h};children.set(name,h);
  }
  return [...roots.values()];
}
export function entryHandle(entry) {
  const h={name:entry.name,kind:entry.isDirectory?'directory':'file',snapshot:true,isSameEntry:async other=>other===h};
  if(entry.isFile) h.getFile=()=>new Promise((resolve,reject)=>entry.file(resolve,reject));
  else h.values=async function*(){const reader=entry.createReader();let batch;do{batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));for(const child of batch)yield entryHandle(child);}while(batch.length);};
  return h;
}
export async function listLocalDirectory(handle) {
  const rows=[];let truncated=false;
  for await(const child of handle.values()) {if(rows.length>=1000){truncated=true;break;}rows.push(child);}
  rows.sort((a,b)=>(a.kind===b.kind?0:a.kind==='directory'?-1:1)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  return {rows,truncated};
}
