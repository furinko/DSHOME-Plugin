// Real exported Host SDK methods with an isolated Loader and temporary old package.
// No live service, browser, installed plugin or private registry cache is modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const anchor=process.env.DSH_SDK_ROOT?path.join(path.resolve(process.env.DSH_SDK_ROOT),'package.json'):import.meta.url;
const requireSdk=createRequire(anchor);
let registryModule,bootModule;
try {
  registryModule=await import(pathToFileURL(requireSdk.resolve('@deepseek-ai/dsh-client-modules')).href);
  bootModule=await import(pathToFileURL(requireSdk.resolve('@deepseek-ai/dsh-app-boot')).href);
} catch(error) {
  throw new Error('Host SDK unavailable. Set DSH_SDK_ROOT to a compatible DSH checkout/install root (verified with DSH 0.2.1-rc.2). No test was skipped.',{cause:error});
}
const {ClientModuleRegistry,bootInjections}=registryModule;
const {loadOverlayPatches,composeEntries}=bootModule;
const id='dshome-plugin',manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const client=fs.readFileSync(path.join(root,'lib/client.js'));
const clientSha=crypto.createHash('sha256').update(client).update(fs.readFileSync(path.join(root,'lib/index.js'))).update(fs.readFileSync(path.join(root,'layout/lib/client.js'))).digest('hex');
assert.equal(manifest.exports['./workbench-entry'],'./lib/entry-workbench-'+clientSha.slice(0,12)+'.js');
const warnings=[];
const patches=loadOverlayPatches('dsh',path.join(root,'cordis.patch.yml'));
const rows=composeEntries([[{insert:[{id:'ui-brand-official',name:'@deepseek-ai/dsh-client-ui-brand-official'},{id:'ui-layout',name:'@deepseek-ai/dsh-client-ui-layout'}]}],patches],message=>warnings.push(String(message)));
const row=rows.find(entry=>entry.id===id);
assert(row);assert.equal(row.name,pathToFileURL(path.join(root,manifest.exports['./workbench-entry'])).href);
assert.equal(rows.find(entry=>entry.id==='ui-brand-official').disabled,true);assert.deepEqual(warnings,[]);
assert.equal(rows.find(entry=>entry.id==='ui-layout').disabled,true);
const layoutRow=rows.find(entry=>entry.id==='dshome-dual-layout');
const layoutManifest=JSON.parse(fs.readFileSync(path.join(root,'layout/package.json'),'utf8'));
assert.equal(layoutManifest.name,'@deepseek-ai/dsh-client-ui-layout');
assert.equal(layoutRow.name,pathToFileURL(path.join(root,'layout',layoutManifest.exports['./shell-entry'])).href);
assert.notEqual(layoutRow.disabled,true);
const host=await import(row.name);
assert.equal(host.name,id);assert.throws(()=>host.apply(),TypeError);assert.equal(host.default.apply,host.apply);assert.equal(host.default.name,id);
const tempParent=fs.realpathSync(os.tmpdir());
const temp=fs.realpathSync(fs.mkdtempSync(path.join(tempParent,'dshome-registry-')));
try {
  const oldRoot=path.join(temp,'old-package');fs.mkdirSync(path.join(oldRoot,'lib'),{recursive:true});
  fs.writeFileSync(path.join(oldRoot,'package.json'),JSON.stringify({name:id,type:'module',exports:{'.':'./lib/index.js','./client':'./lib/client.js'},dsh:{client:manifest.dsh.client}}));
  fs.writeFileSync(path.join(oldRoot,'lib/index.js'),"export const name='dshome-plugin'; export function apply() {}\n");
  // Deliberately minimal older fixture: its lack of Workbench is a test input,
  // not a claim to reproduce every feature of a historical production bundle.
  fs.writeFileSync(path.join(oldRoot,'lib/client.js'),"window.__ModuleLoader__.load({id:'dshome-plugin',factory:()=>({name:'dshome-plugin',apply(){}})});\n");
  const registry=Object.create(ClientModuleRegistry.prototype);
  for(const key of ['table','sources','pkgMeta','responses','batchResponses','previousBatchResponses'])registry[key]=new Map();
  registry.release={version:'isolated-test',commit:'not-a-live-context'};registry.readSourceMap=()=>undefined;
  let mountedName=id,resolvedRoot=oldRoot,resolveCount=0;
  const baseUrl=pathToFileURL(path.join(temp,'profile','cordis.yml')).href;
  Object.defineProperty(registry,'ctx',{value:{
    loader:{entries:()=>[{options:{name:mountedName},fiber:{},disabled:false,parent:{tree:{ctx:{baseUrl}}}}],
      internal:{version:'v2',resolveSync:(base,request)=>{resolveCount++;return{url:request.specifier.startsWith('file:')?request.specifier:pathToFileURL(path.join(resolvedRoot,'lib/index.js')).href};}}},
    logger:{warn:console.warn,error:console.error}
  }});
  const fail=error=>{throw error;};
  assert.equal(registry.processOne(id,fail),true);
  const before=registry.compose(),beforePath=registry.clientPath(id),beforeRow=before.entries.find(entry=>entry.id===id);
  assert.equal(beforePath,path.join(oldRoot,'lib/client.js'));
  const beforeCode=await (await registry.fetchBundle(new Request('http://isolated.test/'+beforeRow.url))).text();
  assert(!/var WORKBENCH_PLUGIN\s*=/.test(beforeCode));
  resolvedRoot=root;assert.equal(registry.processOne(id,fail),false);assert.equal(resolveCount,1);assert.equal(registry.clientPath(id),beforePath);
  assert.equal(registry.compose().entries[0].rev,beforeRow.rev);
  // Simulate one dirty-name remove/add batch; this is not an online Loader test.
  mountedName=row.name;assert.equal(registry.processOne(id,fail),true);assert.equal(registry.processOne(row.name,fail),true);
  const after=registry.compose();assert.equal(resolveCount,2);assert.equal(registry.clientPath(id),path.join(root,'lib/client.js'));assert.equal(after.entries.length,1);
  const afterRow=after.entries[0];assert.equal(afterRow.id,id);assert.notEqual(afterRow.rev,beforeRow.rev);
  const response=await registry.fetchBundle(new Request('http://isolated.test/'+afterRow.url));assert.equal(response.status,200);
  const afterCode=await response.text();assert(/var WORKBENCH_PLUGIN\s*=/.test(afterCode));assert(afterCode.includes(client.toString('utf8')));
  const boot=bootInjections(after).find(entry=>entry.kind==='global'&&entry.name==='__DSH_BOOT__');assert.equal(boot.value.entries[0].url,afterRow.url);new Function(afterCode);
  mountedName=layoutRow.name;
  assert.equal(registry.processOne(layoutRow.name,fail),true);
  assert.equal(registry.clientPath('@deepseek-ai/dsh-client-ui-layout'),path.join(root,'layout/lib/client.js'));
  const combined=registry.compose();
  const layoutClient=combined.entries.find(entry=>entry.id==='@deepseek-ai/dsh-client-ui-layout');assert(layoutClient);
  const layoutCode=await(await registry.fetchBundle(new Request('http://isolated.test/'+layoutClient.url))).text();
  // Actual SDK prepareSource strips bundle-local debug trailers before serving.
  const sourceLayout=fs.readFileSync(path.join(root,'layout/lib/client.js'),'utf8');
  const executableLayout=sourceLayout.replace(/^\/\/# source(?:Mapping)?URL=.*(?:\r?\n|$)/gm,'').trimEnd();
  assert(executableLayout.length>30000);assert(layoutCode.includes(executableLayout));new Function(layoutCode);
  console.log(JSON.stringify({kind:'real-host-sdk-with-isolated-loader-and-temporary-old-fixture',pass:true,sameNameUpgradeReproducesStalePath:true,packageRelativeEntryOwnedAndImported:true,clientModuleIdUnchanged:true,responseStatus:response.status,responseContainsCompleteWorkbench:true,clientSha256:clientSha,liveServiceModified:false,authenticatedGuiVerified:false},null,2));
} finally {
  // Verify the owned absolute temporary root before removing only that root.
  assert.equal(path.dirname(temp),tempParent);assert(path.basename(temp).startsWith('dshome-registry-'));assert.equal(fs.realpathSync(temp),temp);
  fs.rmSync(temp,{recursive:true,force:true});
}
