// Bounded, local OOXML content preview. No macros, formulas, external links or HTML execute.
const MAX=16*1024*1024;
export async function zipParts(file) {
  if(file.size>32*1024*1024) throw Error('Office 内容预览限 32 MB。');
  const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50 && i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0) throw Error('不是有效的 Office 文件，或文件已加密。');
  const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
  if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||count>4096||offset+size>end)throw Error('不支持分卷、ZIP64 或过大的 Office 结构。');
  let p=offset,total=0;const entries=new Map(),cache=new Map();
  for(let n=0;n<count;n++) {
    if(p+46>end||v.getUint32(p,true)!==0x02014b50)throw Error('Office 压缩目录损坏');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),packed=v.getUint32(p+20,true),unpacked=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),start=v.getUint32(p+42,true);
    if(p+46+nl+extra+comment>end)throw Error('Office 压缩目录越界');
    const name=new TextDecoder().decode(bytes.subarray(p+46,p+46+nl));
    if(entries.has(name))throw Error('Office 包含重复内容路径');
    entries.set(name,{flags,method,packed,unpacked,start});p+=46+nl+extra+comment;
  }
  return async name=>{
    if(cache.has(name))return cache.get(name);
    const e=entries.get(name);if(!e)throw Error('Office 缺少内容：'+name);
    if(e.flags&1 || ![0,8].includes(e.method)||e.unpacked>MAX||total+e.unpacked>32*1024*1024)throw Error('Office 内容加密、压缩格式不支持或超出安全预览大小。');
    if(e.start+30>offset||v.getUint32(e.start,true)!==0x04034b50)throw Error('Office 文件头损坏');
    const start=e.start+30+v.getUint16(e.start+26,true)+v.getUint16(e.start+28,true);
    if(start+e.packed>offset)throw Error('Office 内容越界');
    const raw=bytes.slice(start,start+e.packed);let result=raw;
    if(e.method===8){
      const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks=[];let length=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>e.unpacked||length>MAX)throw Error('Office 解压内容超过限制');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
      result=new Uint8Array(length);let at=0;for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}
    }
    if(result.length!==e.unpacked)throw Error('Office 内容长度不匹配');total+=result.length;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(result);
    if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('不支持带实体声明的 Office XML');
    const xml=new DOMParser().parseFromString(text,'application/xml');
    if(xml.getElementsByTagName('parsererror').length)throw Error('Office XML 损坏');cache.set(name,xml);return xml;
  };
}
const nodes=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
const text=node=>nodes(node,'t').map(t=>t.textContent).join('');
function relationship(xml,id,base){const rel=nodes(xml,'Relationship').find(r=>r.getAttribute('Id')===id);if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('不预览外部 Office 链接');const path=rel.getAttribute('Target');if(!path||path.includes('\\')||path.includes(':'))throw Error('Office 内容路径无效');const parts=(path.startsWith('/')?path.slice(1):base+'/'+path).split('/'),out=[];for(const part of parts){if(part==='..'){if(!out.length)throw Error('Office 路径越界');out.pop();}else if(part&&part!=='.')out.push(part);}return out.join('/');}
const relId=node=>[...node.attributes].find(a=>a.localName==='id'&&a.prefix)?.value;
export async function officePreview(file){
  const read=await zipParts(file),ext=file.name.split('.').at(-1).toLowerCase();
  if(ext==='docx'){const xml=await read('word/document.xml');return [{title:'Word 正文',text:nodes(xml,'p').slice(0,10000).map(text).join('\n'),limit:'最多 10000 段；表格按段落展示，图片、页眉页脚和排版未还原。'}];}
  if(ext==='pptx'){
    const doc=await read('ppt/presentation.xml'),rels=await read('ppt/_rels/presentation.xml.rels'),slides=nodes(doc,'sldId'),sections=[];
    for(const [i,slide] of slides.slice(0,200).entries()){const xml=await read(relationship(rels,relId(slide),'ppt'));sections.push({title:'幻灯片 '+(i+1),text:nodes(xml,'p').map(text).join('\n'),limit:'文本内容预览；图形、图片、动画和版式未还原。'});}
    if(slides.length>200)sections.push({title:'达到预览上限',text:'仅预览前 200 张幻灯片。'});return sections;
  }
  const doc=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
  const sharedRel=nodes(rels,'Relationship').find(r=>r.getAttribute('Type')?.endsWith('/sharedStrings'));
  const shared=sharedRel?nodes(await read(relationship(rels,sharedRel.getAttribute('Id'),'xl')),'si').map(text):[];
  const sheets=nodes(doc,'sheet'),sections=[];
  for(const sheet of sheets.slice(0,30)){
    const xml=await read(relationship(rels,relId(sheet),'xl')),rows=[];
    for(const row of nodes(xml,'row').slice(0,500)){
      const cells=[];
      for(const cell of nodes(row,'c').slice(0,100)){const type=cell.getAttribute('t'),value=nodes(cell,'v')[0]?.textContent ?? '',formula=nodes(cell,'f')[0]?.textContent;
        cells.push({address:cell.getAttribute('r')||'',value:type==='s'?shared[Number(value)]??'':type==='inlineStr'?text(cell):type==='b'?(value==='1'?'TRUE':'FALSE'):value|| (formula?'='+formula:''),formula});}
      rows.push(cells);
    }
    sections.push({title:sheet.getAttribute('name')||'工作表',rows,limit:'每表最多 500 行 × 100 个已存储单元格；显示原始值/缓存结果，不重算公式，日期可能显示序列值，图表与样式未还原。'});
  }
  if(sheets.length>30)sections.push({title:'达到预览上限',text:'仅预览前 30 张工作表。'});return sections;
}
