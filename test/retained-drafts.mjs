import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedDraftBundle} from '../src/workbench/retained-drafts.mjs';
test('retained export reads only local snapshots, excludes process and web replay data',()=>{
 const contents=new Map([['doc',{id:'doc',document:{getSnapshot:()=>({path:'a.md',text:'unsaved 🐋',dirty:true,uncertain:true,phase:'error',version:'not-exported'})}}],['note',{id:'note',kind:'note',noteText:'note'}],['custom',{id:'custom',kind:'custom-tool',moduleState:{text:'local'}}],['web',{id:'web',kind:'web',url:'https://private.invalid/form'}],['term',{id:'term',kind:'terminal',ownerSessionId:'owner',contentId:'process-secret',started:true}]]);
 const json=retainedDraftBundle({workspaceId:'W',controller:{projectId:'P',contents,model:{serialize:()=>({projectId:'P',panels:{}})}}}),bundle=JSON.parse(json);
 assert.equal(bundle.contents.length,3);assert.equal(bundle.contents[0].text,'unsaved 🐋');assert.equal(bundle.contents[0].uncertain,true);for(const excluded of ['private.invalid','process-secret','not-exported'])assert.equal(json.includes(excluded),false);assert.equal(bundle.format,'dshome-retained-drafts-v1');
});
