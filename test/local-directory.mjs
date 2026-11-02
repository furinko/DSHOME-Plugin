import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotFolders,listLocalDirectory,sameLocalEntry,entryHandle} from '../src/workbench/local-directory.mjs';
import {localFormat,preparePreview} from '../src/workbench/local-preview.mjs';
test('folder snapshots preserve nested paths and do not read bodies when listed',async()=>{
  let reads=0;const file={name:'a.txt',webkitRelativePath:'root/child/a.txt',arrayBuffer(){reads++;throw Error('must not read');}};
  const [root]=snapshotFolders([file]);const first=await listLocalDirectory(root),second=await listLocalDirectory(first.rows[0]);
  assert.equal(reads,0);assert.equal(await second.rows[0].getFile(),file);assert.equal(await sameLocalEntry(second.rows[0],second.rows[0]),true);
  assert.equal(await sameLocalEntry({isSameEntry(){throw Error('native cannot compare snapshot');}},second.rows[0]),false);
  assert.throws(()=>snapshotFolders([{name:'a',webkitRelativePath:'root/../a'}]),/无效/);
});
test('directory listing is bounded, sorted and permission failures remain visible',async()=>{
  let yielded=0;const listing=await listLocalDirectory({async *values(){for(let i=0;i<1002;i++){yielded++;yield {name:String(i),kind:'file'};}}});
  assert.equal(listing.rows.length,1000);assert.equal(listing.truncated,true);assert.equal(yielded,1001);
  await assert.rejects(listLocalDirectory({async *values(){throw Error('permission denied');}}),/permission/);
  let read=0;const handle=entryHandle({name:'dir',isDirectory:true,createReader(){return {readEntries(resolve){read++;resolve(read===1?[{name:'x',isFile:true,file(cb){cb('body');}}]:[]);}};}});
  assert.equal(read,0);const rows=await listLocalDirectory(handle);assert.equal(rows.rows[0].name,'x');assert.equal(await rows.rows[0].getFile(),'body');
});
test('local binary formats never enter the text editor and oversize is explicit',async()=>{
  for(const name of ['x.docx','x.xlsx','x.pptx'])assert.equal(localFormat(name),'office');
  assert.equal(localFormat('x.SVG'),'image');assert.equal(localFormat('x.pdf'),'pdf');assert.equal(localFormat('x.doc'),'unsupported');assert.equal(localFormat('a.ts'),'text');
  await assert.rejects(preparePreview({name:'big.png',size:101*1024*1024}),/100 MB/);
  await assert.rejects(preparePreview(new File(['invalid'],'broken.xlsx')),/Office/);
});
