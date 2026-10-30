import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareModuleState,updateModuleContent} from '../src/workbench/module-content.mjs';
import {createModuleRegistry} from '../src/workbench/module-registry.mjs';
import {createWorkspaceController} from '../src/workbench/controller.mjs';
test('module state is bounded detached immutable JSON and rejects invalid data',()=>{
 const original={rows:[{value:'one'}]},copy=prepareModuleState(original);original.rows[0].value='changed';assert.equal(copy.rows[0].value,'one');assert.ok(Object.isFrozen(copy.rows[0]));
 assert.throws(()=>prepareModuleState(undefined));assert.throws(()=>prepareModuleState('x'.repeat(262145)));const cycle={};cycle.self=cycle;assert.throws(()=>prepareModuleState(cycle));
});
test('provider withdrawal keeps state but invalidates old callbacks even after re-registration',async()=>{
 const registry=createModuleRegistry(),c=createWorkspaceController({sessionId:'A',projectId:'module-test',storage:{getItem:()=>null,setItem(){}},confirm:()=>false});
 const detach=registry.attach(c.model),definition={kind:'custom-tool',label:'Tool',render:()=>null},off=registry.register(definition),provider=registry.get('custom-tool');
 const id=c.model.addPanel('custom-tool'),item=c.content(id),set=value=>updateModuleContent({registry,provider,controller:c,item,value});set({draft:'keep'});
 assert.equal(c.hasUnsaved(),true);assert.equal(await c.closePanel(id),false);assert.equal(c.exportLayout().includes('keep'),false);off();assert.equal(item.moduleState.draft,'keep');assert.throws(()=>set('stale'));registry.register(definition);assert.throws(()=>set('still stale'));
 updateModuleContent({registry,provider:registry.get('custom-tool'),controller:c,item,value:null});assert.equal(c.hasUnsaved(),false);assert.equal(await c.closePanel(id),true);assert.throws(()=>set('closed'));detach();c.releaseResources();registry.dispose();
});
