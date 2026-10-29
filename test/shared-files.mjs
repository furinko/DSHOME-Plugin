import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedFiles } from '../src/workbench/shared-files.mjs';
function setup() {
  let sessionId='A', current=0, projectId='P', reply, calls=[];
  const authority={async run(workspaceId,fn) { assert.equal(workspaceId,'W'); const captured=current; const lease={sessionId,signal:new AbortController().signal,check(){if(current!==captured) throw Error('stale lease');}}; const result=await fn(lease); lease.check(); return result; }};
  const files=createSharedFiles({authority,workspaceId:'W',projectId:'P',async invoke(method,args) { calls.push({method,args}); if(method==='project') return {ok:true,value:{projectId}}; return reply ?? {ok:true,value:{projectId,absolutePath:'/root/a',text:'file',version:'v1',entries:[]}}; }});
  return {files,calls,setSession(id){sessionId=id;current++;},setProject(id){projectId=id;},setReply(value){reply=value;}};
}
test('shared documents and directory requests use fresh current session not stale UI argument',async()=>{
  const f=setup(); await f.files.transport.read('a'); f.setSession('B');
  await f.files.workspaceFiles.list('A','.'); await f.files.transport.save('/root/a','draft','v1');
  assert.deepEqual(f.calls.map(c=>[c.method,c.args[0]]),[['project','A'],['read','A'],['project','B'],['list','B'],['project','B'],['save','B']]);
  assert.deepEqual(f.calls.at(-1).args,['B','/root/a','draft','v1','P','/root/a']);
});
test('root mismatch rejects before file operation and foreign reply cannot become baseline',async()=>{
  const f=setup(); f.setProject('Q'); await assert.rejects(f.files.transport.read('a'),{code:'WORKBENCH_PROJECT_CHANGED'}); assert.equal(f.calls.length,1);
  f.setProject('P'); f.setReply({ok:true,value:{projectId:'Q'}}); await assert.rejects(f.files.transport.read('a'),{code:'WORKBENCH_SCOPE_RESPONSE'});
  f.setReply({ok:true,value:{projectId:'P',absolutePath:'/other'}}); await assert.rejects(f.files.transport.save('/root/a','x','v1'),{code:'WORKBENCH_SCOPE_RESPONSE'});
});
test('host denials retain their real code and malformed success is not accepted',async()=>{
  const f=setup(); f.setReply({ok:false,error:{code:'FS_ACCESS_DENIED',message:'denied'}}); await assert.rejects(f.files.transport.read('a'),{code:'FS_ACCESS_DENIED'});
  f.setReply({ok:false}); await assert.rejects(f.files.transport.read('a'),{code:'WORKBENCH_INVALID_RECEIPT'});
  for (const value of [undefined,null,[],true,42,'not a record']) {f.setReply({ok:true,value});await assert.rejects(f.files.transport.read('a'),{code:'WORKBENCH_INVALID_RECEIPT'});}
});
