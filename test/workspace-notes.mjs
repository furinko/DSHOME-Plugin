import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceController} from '../src/workbench/controller.mjs';
import {workspaceReloadState} from '../src/workbench/reload-state.mjs';
function setup(options={}) {const map=new Map();let serial=0;return createWorkspaceController({sessionId:'A',projectId:'notes-test',storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},uuid:()=>String(++serial),confirm:()=>false,...options});}
test('notes are independent instances retained through layout transactions and excluded from serialization',()=>{
 const c=setup();const a=c.model.addPanel('note'),b=c.model.addPanel('note');c.editNote(a,'private-note-A');c.editNote(b,'note B');const item=c.content(a);
 c.model.beginEdit();c.model.cancelEdit();c.model.selectPreset('development');assert.equal(c.content(a),item);assert.equal(item.noteText,'private-note-A');assert.equal(c.content(b).noteText,'note B');assert.equal(c.exportLayout().includes('private-note-A'),false);
 assert.equal(c.hasUnsaved(),true);const state=workspaceReloadState({shelves:[{getSnapshot:()=>({projects:[{controller:c}]})}]});assert.equal(state.dirty,2);assert.equal(state.allowed,false);c.releaseResources();
});
test('nonempty note close and workspace close require confirmation; empty notes do not',async()=>{
 const c=setup(),id=c.model.addPanel('note');c.editNote(id,'keep');assert.equal(await c.closePanel(id),false);assert.equal(c.closeWorkspace(),false);assert.equal(c.content(id).noteText,'keep');c.editNote(id,'');assert.equal(c.hasUnsaved(),false);assert.equal(await c.closePanel(id),true);assert.equal(c.closeWorkspace(),true);
});
test('notes enforce type and size without partially changing content',()=>{
 const c=setup(),id=c.model.addPanel('note');c.editNote(id,'original');for(const bad of [null,{},'x'.repeat(262145)])assert.throws(()=>c.editNote(id,bad));assert.throws(()=>c.editNote('DOC-01','no'));assert.equal(c.content(id).noteText,'original');c.releaseResources();
});
