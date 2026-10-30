import test from 'node:test';
import assert from 'node:assert/strict';
import {createModuleRegistry} from '../src/workbench/module-registry.mjs';
import {createWorkspaceModel} from '../src/workbench/model.mjs';
const definition={kind:'custom-tool',label:'Custom',render:()=>null};
const model=()=>createWorkspaceModel({projectId:'registry-test'});
test('providers attach to existing and future models; removal keeps layout instances',()=>{
 const r=createModuleRegistry(),a=model(),b=model();r.attach(a);const off=r.register(definition);r.attach(b);
 const id=a.addPanel('custom-tool');assert.equal(b.modules().length,1);assert.equal(r.get('custom-tool').capability,'display-only');
 off();assert.equal(a.modules().length,0);assert.equal(a.getSnapshot().panels[id].kind,'custom-tool');assert.equal(r.get('custom-tool'),undefined);
 const next=r.register(definition);off();assert.ok(r.get('custom-tool'));next();r.dispose();
});
test('invalid metadata, builtin collision, duplicate and stale registry cannot register',()=>{
 const r=createModuleRegistry({reserved:['document']});for(const value of [{...definition,kind:'document'},{...definition,kind:'../escape'},{...definition,render:'code'},{...definition,minHeight:0},{...definition,label:''}])assert.throws(()=>r.register(value));
 r.register(definition);assert.throws(()=>r.register(definition));r.dispose();assert.throws(()=>r.register(definition));assert.throws(()=>r.attach(model()));
});
test('partial attach failure rolls back only newly acquired registrations',()=>{
 const r=createModuleRegistry(),a=model(),b=model();r.attach(a);r.attach(b);b.registerModule(definition);
 assert.throws(()=>r.register(definition));assert.equal(a.modules().length,0);assert.equal(b.modules().length,1);assert.equal(r.list().length,0);r.dispose();assert.equal(b.modules().length,1);
});
test('detached model stops receiving updates and release is idempotent',()=>{
 const r=createModuleRegistry(),a=model(),off=r.attach(a);assert.throws(()=>r.attach(a));off();off();r.register(definition);assert.equal(a.modules().length,0);r.dispose();
});
