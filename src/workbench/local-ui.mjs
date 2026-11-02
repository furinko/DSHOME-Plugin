import React from 'react';
import {listLocalDirectory} from './local-directory.mjs';
const h=React.createElement;
export function LocalDirectory({handle,c,filter='',hidden=false,refresh=0,depth=0}) {
  const [open,setOpen]=React.useState(depth===0),[state,setState]=React.useState(null),[retry,setRetry]=React.useState(0);
  React.useEffect(()=>{if(!open)return;let alive=true;setState(null);listLocalDirectory(handle).then(value=>{if(alive)setState(value);},error=>{if(alive)setState({error});});return()=>{alive=false;};},[handle,open,refresh,retry]);
  return h('div',{role:'treeitem','aria-expanded':open,'aria-level':depth+1},
    h('button',{type:'button',className:'wb-tree-entry',style:{paddingLeft:8+depth*12},onClick:()=>setOpen(!open),'aria-label':(open?'收起本机文件夹 ':'展开本机文件夹 ')+handle.name},(open?'▾ ':'▸ ')+handle.name),
    open&&h('div',{role:'group'},!state?h('p',{role:'status'},'读取目录…'):state.error?h('p',{role:'alert'},state.error.message,h('button',{onClick:()=>setRetry(retry+1)},'重试')):
      h(React.Fragment,null,state.rows.filter(child=>(hidden||!child.name.startsWith('.'))&&(child.kind==='directory'||child.name.toLowerCase().includes(filter.toLowerCase()))).map(child=>child.kind==='directory'?
        depth<31?h(LocalDirectory,{key:child.name,handle:child,c,filter,hidden,refresh,depth:depth+1}):h('p',{key:child.name},'目录层级过深，请单独添加此目录'):
        h('div',{key:child.name,role:'treeitem','aria-level':depth+2},h('button',{type:'button',className:'wb-tree-entry',style:{paddingLeft:20+depth*12},onClick:()=>child.getFile().then(file=>c.openLocalFile(file,child)).catch(e=>c.notify(e.message)),'aria-label':'打开本机文件 '+child.name},child.name))),
      state.truncated&&h('p',{role:'status'},'目录只显示前 1000 项，请添加更小的子目录。'),!state.rows.length&&h('p',null,'空文件夹'))));
}
export function LocalPreview({preview,showing}) {
  const [url,setURL]=React.useState(''),[error,setError]=React.useState(''),[section,setSection]=React.useState(0),[encoding,setEncoding]=React.useState(''),[text,setText]=React.useState('');
  const media=React.useRef(null);
  React.useEffect(()=>{const value=URL.createObjectURL(preview.blob??preview.file);setURL(value);return()=>URL.revokeObjectURL(value);},[preview]);
  React.useEffect(()=>{if(!showing)media.current?.pause();},[showing]);
  React.useEffect(()=>{if(!encoding)return;let alive=true;preview.file.arrayBuffer().then(buffer=>{try{const value=new TextDecoder(encoding,{fatal:true}).decode(buffer);if(value.includes('\0'))throw Error('包含二进制内容，不是这个编码的文本');if(alive){setText(value);setError('');}}catch(e){if(alive)setError(e.message);}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[preview,encoding]);
  const fail=()=>setError('当前客户端无法解码此文件，请使用本机应用打开。');
  const selected=preview.sections?.[section];
  return h('section',{className:'wb-local-preview','aria-label':'本机文件预览'},
    h('header',null,h('strong',null,preview.file.name),h('span',null,'只读预览'),h('a',{href:url,download:preview.file.name},'下载原文件')),
    error&&h('p',{role:'alert'},error),
    preview.kind==='image'&&h('img',{src:url,alt:preview.file.name,onError:fail}),
    preview.kind==='pdf'&&h(React.Fragment,null,h('p',null,'若内置 PDF 查看器不可用，请下载后在本机打开。'),h('object',{data:url,type:'application/pdf','aria-label':'PDF '+preview.file.name},h('p',null,'此客户端不能内嵌 PDF，请下载原文件查看。'))),
    ['audio','video'].includes(preview.kind)&&h(preview.kind,{ref:media,src:url,controls:true,preload:'metadata',onError:fail}),
    preview.kind==='unsupported'&&h('p',null,preview.message),
    preview.kind==='encoding'&&h(React.Fragment,null,h('p',null,'不是 UTF-8 文本。请选择正确编码只读查看；不会转换或覆盖原文件。'),h('select',{'aria-label':'文本预览编码',value:encoding,onChange:e=>setEncoding(e.target.value)},h('option',{value:''},'选择编码'),...['gb18030','utf-16le','utf-16be','big5','windows-1252'].map(value=>h('option',{key:value,value},value))),h('pre',null,text)),
    preview.kind==='office'&&h(React.Fragment,null,h('p',null,'Office 内容预览 · 不还原完整排版，不执行宏或公式'),h('select',{'aria-label':'Office 预览章节',value:section,onChange:e=>setSection(Number(e.target.value))},preview.sections.map((s,i)=>h('option',{key:i,value:i},s.title))),
      selected&&h('div',{className:'wb-office-content'},h('small',null,selected.limit),selected.text!==undefined&&h('pre',null,selected.text||'未找到可预览的文本内容'),selected.rows&&h('table',null,h('tbody',null,selected.rows.map((row,i)=>h('tr',{key:i},row.map(cell=>h('td',{key:cell.address,title:cell.formula?'公式：'+cell.formula:cell.address},h('small',null,cell.address),cell.value)))))))));
}
