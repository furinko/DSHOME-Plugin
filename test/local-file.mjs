import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalFileTransport} from '../src/workbench/local-file.mjs';
const file = text => new File([text], 'outside.txt');
test('UTF8 BOM and CRLF roundtrip, conflicts, denial and snapshot fallback', async()=>{
  let disk='\ufeff中文\r\n', permission='granted', writes=0;
  const handle={getFile:async()=>file(disk),requestPermission:async()=>permission,createWritable:async()=>{let pending;return {write:async bytes=>{pending=new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes);},close:async()=>{disk=pending;writes++;},abort:async()=>{}};}};
  const t=createLocalFileTransport({file:file(disk),handle,id:'test'}), initial=await t.read();
  assert.equal(initial.text,disk); await t.save('', 'new\r\n',initial.version); assert.equal(disk,'new\r\n');assert.equal(writes,1);
  await assert.rejects(t.save('', 'stale',initial.version),{code:'FS_STALE_VERSION'});assert.equal(disk,'new\r\n');
  permission='denied';await assert.rejects(t.save('', 'denied',(await t.read()).version),{code:'FS_PERMISSION'});
  const snapshot=createLocalFileTransport({file:file('import'),id:'snapshot'});await assert.rejects(snapshot.save('', 'x','x'),{code:'FS_READ_ONLY'});
});
test('binary, invalid UTF8 and oversized content refuse before mutation',async()=>{
  for(const f of [file('a\0b'),new File([new Uint8Array([255])],'bad'),new File([new Uint8Array(2097153)],'big')])await assert.rejects(createLocalFileTransport({file:f,id:'bad'}).read());
});
