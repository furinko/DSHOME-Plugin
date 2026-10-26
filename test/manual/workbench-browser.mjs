// Real-browser DOM/CSS fixture for the actual candidate bundle.
// Native services below are explicit contract doubles, NOT authenticated DSH.
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { spawn } from 'node:child_process';
const source=fs.readFileSync(new URL('../../lib/client.js',import.meta.url),'utf8');
const fixture=String.raw`<!doctype html><html><meta charset="utf-8"><title>Workbench candidate isolated fixture</title><style>
*{box-sizing:border-box}body{margin:0;font:13px system-ui;color:#dce6f6;background:#11161e}.host-frame{height:100dvh;display:grid;grid-template-rows:minmax(0,1fr) auto;position:relative;overflow:hidden}.left{min-width:0;background:#192131}main{min-width:0;display:flex;flex-direction:column}.header{min-height:52px;display:flex;align-items:center;justify-content:space-between;padding:8px;gap:4px;border-bottom:1px solid #354058}.content{flex:1;min-height:0;display:flex;flex-direction:column}.messages{flex:1;overflow:auto;padding:20px}.composer{margin:15px;padding:15px;border:1px solid #557095;min-height:80px}.right{min-width:0;background:#182438;overflow:auto}.right.fullscreen{position:fixed;inset:0;z-index:10}.bottom{grid-column:1/-1;height:0}.overlay{position:absolute;inset:0;pointer-events:none;z-index:20}.native-body{padding:25px;line-height:2}
</style><div id="frame" class="host-frame"><aside class="left">DS</aside><main><div class="header"><span>当前会话</span><div id="switch-seat"></div></div><div id="content" class="content" data-conversation-content data-conversation-session="s1"><div id="messages" class="messages">宿主会话 DOM 契约替身，不是生产 DSH</div><div id="composer" class="composer" data-composer-input contenteditable="true" role="textbox">未发送草稿</div></div></main><aside id="right" class="right" data-rightbar-col><div class="native-body"><p>原生面板服务契约替身</p><p id="tab-kind">尚未打开文件</p><button id="native-close">收起原生面板</button></div></aside><div data-side="rightbar" id="native-handle" style="position:absolute;left:60%;top:0;height:100%;width:4px"></div><div class="bottom" data-shell-bottom></div><div id="overlay-seat" class="overlay" data-shell-overlay></div></div>
<script>
window.fixtureErrors=[];window.addEventListener('error',e=>window.fixtureErrors.push(e.message));
window.__dshomePlugin={theme:false,conversation:false,sidebar:false,minimap:false,notify:false,glow:false,workbench:true};
const frame=document.getElementById('frame'),rightEl=document.getElementById('right'),content=document.getElementById('content');
let selected='s1',expanded=false,splitCount=0;const sourceListeners=new Set(),opened=[],registry=new Map(),kinds=new Set(['files','browser','terminal']);
function nativeLayout(){const narrow=window.innerWidth<768;frame.style.gridTemplateColumns='56px minmax(400px, 1fr) '+(expanded&&!narrow?Math.floor(window.innerWidth*.45):0)+'px';if(expanded&&!narrow)frame.removeAttribute('data-rightbar-collapsed');else frame.setAttribute('data-rightbar-collapsed','true');if(expanded&&narrow)frame.setAttribute('data-rightbar-fullscreen','true');else frame.removeAttribute('data-rightbar-fullscreen');rightEl.classList.toggle('fullscreen',expanded&&narrow);rightEl.style.display=expanded?'block':'none';}
const right={mounted:{getSnapshot:()=>selected,subscribe:fn=>{sourceListeners.add(fn);return()=>sourceListeners.delete(fn);}},isExpanded:()=>expanded,toggleExpanded:()=>{expanded=!expanded;nativeLayout();},openTab:kind=>{opened.push(kind);expanded=true;document.getElementById('tab-kind').textContent='已请求原生 '+kind+' 面板（服务替身）';nativeLayout();},split:()=>{splitCount++;return window.innerWidth>=1200?'pane2':undefined;}};
const slots={inject:(name,fn)=>fn(),register:(spec,Component)=>{registry.set(spec.name,{spec,Component});return()=>registry.delete(spec.name);}};
const services={slots,sidebarRight:right,sidebarRightTabs:{get:kind=>kinds.has(kind)?{kind}:undefined}};
const ctx={get:name=>services[name],inject:(deps,fn)=>fn(),effect:fn=>fn()};
const jsx=(type,props,key)=>({type,props,key});const react={useState:i=>[typeof i==='function'?i():i,()=>{}],useEffect(){}};
window.__ModuleLoader__={load:spec=>{window.testPlugin=spec.factory(name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:{});}};
function renderNode(v){if(v===null||v===false||v===undefined)return document.createTextNode('');if(Array.isArray(v)){const f=document.createDocumentFragment();v.forEach(x=>f.append(renderNode(x)));return f;}if(typeof v!=='object')return document.createTextNode(String(v));if(typeof v.type==='function')return renderNode(v.type(v.props||{}));const e=document.createElement(v.type);for(const [k,value] of Object.entries(v.props||{})){if(k==='children')e.append(renderNode(value));else if(k==='className')e.className=value;else if(k.startsWith('on')&&typeof value==='function')e.addEventListener(k.slice(2).toLowerCase(),value);else if(k==='disabled')e.disabled=!!value;else e.setAttribute(k,String(value));}return e;}
function renderOwn(){const a=registry.get('conversation.session.header.utilities'),b=registry.get('shell.overlay');if(a)document.getElementById('switch-seat').replaceChildren(renderNode(a.Component({sessionId:selected})));if(b)document.getElementById('overlay-seat').replaceChildren(renderNode(b.Component({})));}
window.fixture={right,services,kinds,opened,get splitCount(){return splitCount;},renderOwn,nativeLayout,setSession:id=>{selected=id;if(id)content.setAttribute('data-conversation-session',id);sourceListeners.forEach(fn=>fn());}};
window.addEventListener('resize',nativeLayout);document.getElementById('native-close').onclick=()=>right.toggleExpanded();nativeLayout();
</script><script src="/client.js"></script><script>testPlugin.apply(ctx);window.fixture.api=window.__dshomePluginWorkbench;window.fixture.api.subscribe(renderOwn);renderOwn();</script></html>`;
const runner=String.raw`<!doctype html><meta charset="utf-8"><title>Workbench candidate checks</title><p id="status">Running candidate checks…</p><iframe id="f" style="width:1440px;height:900px;border:0" src="/fixture"></iframe><script>
const frame=document.getElementById('f'),checks=[],widths=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,ok){checks.push({name,pass:!!ok});if(!ok)throw Error(name);}
frame.onload=async()=>{const w=frame.contentWindow,d=w.document,f=w.fixture;try{
 const composer=d.getElementById('composer'),messages=d.getElementById('messages');composer.textContent='切换后必须保留的输入';
 check('actual candidate classic script loaded',!!f.api);check('original default and no automatic open',f.api.status().mode==='original'&&f.opened.length===0);
 for(const width of [1440,1000,390]){
  frame.style.width=width+'px';await wait(150);f.api.setMode('original');await wait(60);
  const before=d.querySelector('main').getBoundingClientRect().width;
  const button=Array.from(d.querySelectorAll('.dshome-wb-switch button')).find(b=>b.textContent==='工作台');button.click();await wait(100);
  check('workbench button works at '+width,f.api.status().mode==='workbench');
  check('mode never replaces resident DOM at '+width,d.getElementById('composer')===composer&&d.getElementById('messages')===messages&&composer.textContent==='切换后必须保留的输入');
  const center=d.querySelector('main').getBoundingClientRect().width,right=d.getElementById('right').getBoundingClientRect().width;
  if(width>=1200)check('wide layout reserves work area and readable conversation',center>=399&&center<before&&right>400);
  if(width>=1200)check('misaligned native outer resize handle is hidden only in workbench',w.getComputedStyle(d.getElementById('native-handle')).display==='none');
  if(width<768)check('narrow layout defers to native fullscreen',d.getElementById('right').classList.contains('fullscreen'));
  const ret=Array.from(d.querySelectorAll('.dshome-wb-tools button')).find(b=>b.textContent==='返回原版');check('emergency return is visibly reachable at '+width,ret&&ret.getBoundingClientRect().width>0);ret.click();await wait(60);
  check('return restores original marker and prior collapsed panel at '+width,f.api.status().mode==='original'&&!d.getElementById('frame').hasAttribute('data-dshome-workbench')&&!f.right.isExpanded());
  check('original restores native resize chrome at '+width,w.getComputedStyle(d.getElementById('native-handle')).display!=='none');
  widths.push({width,before,workbenchCenter:center,workbenchRight:right,after:d.querySelector('main').getBoundingClientRect().width});
 }
 check('repeated toggles do not create duplicate file tabs',f.opened.filter(x=>x==='files').length===1);
 f.api.setMode('workbench');await wait(40);const terminal=Array.from(d.querySelectorAll('.dshome-wb-tools button')).find(b=>b.textContent==='终端');terminal.click();check('terminal only opens on explicit user action',f.opened.filter(x=>x==='terminal').length===1);
 f.api.setMode('original');f.kinds.delete('files');check('missing files type fails safely',!f.api.setMode('workbench').ok&&f.api.status().mode==='original');
 f.api.teardown();check('teardown restores native DOM and removes owned stylesheet',!d.getElementById('frame').hasAttribute('data-dshome-workbench')&&d.getElementById('composer')===composer&&!d.querySelector('style[data-plugin="dshome-plugin-workbench"]'));
 document.getElementById('status').textContent='PASS '+checks.length;
 await fetch('/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'actual-candidate-real-browser-DOM-CSS-with-official-service-contract-doubles',ua:navigator.userAgent,checks,widths,notVerified:'No authenticated DSH, real file reading, terminal process or production slot runtime is exercised.'})});
}catch(e){document.getElementById('status').textContent='FAIL '+e.stack;await fetch('/report',{method:'POST',body:JSON.stringify({kind:'actual-candidate-isolated-browser-fixture',error:String(e)+'\n'+e.stack,diagnostic:{href:w.location.href,title:d.title,hasFixture:!!f,hasAPI:!!(f&&f.api),errors:w.fixtureErrors||[],body:d.body&&d.body.textContent.slice(0,500)},checks,widths})});}};
</script>`;
for(const html of [fixture,runner])for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Script(m[1]);
const server=http.createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.url==='/client.js'){res.setHeader('Content-Type','application/javascript');res.end(source);return;}
 if(req.url==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fixture);return;}
 if(req.url==='/'&&req.method==='GET'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(runner);return;}
 if(req.url==='/report'&&req.method==='POST'){let body='';req.on('data',chunk=>{body+=chunk;if(body.length>200000)req.destroy();});req.on('end',()=>{try{const report=JSON.parse(body);report.candidateSha256=createHash('sha256').update(source).digest('hex');report.generatedAt=new Date().toISOString();fs.writeFileSync(new URL('../../browser-report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));res.end('ok');server.close();setTimeout(()=>process.exit(report.error?1:0),200);}catch(e){console.error(e);res.statusCode=400;res.end('invalid report');}});return;}
 res.statusCode=404;res.end('not found');
});
server.listen(0,'127.0.0.1',()=>{
 const url='http://127.0.0.1:'+server.address().port+'/';console.log('ISOLATED_TEST_URL='+url);
 if(process.argv.includes('--open')){
  const child=spawn('gdbus',['call','--session','--dest','org.freedesktop.portal.Desktop','--object-path','/org/freedesktop/portal/desktop','--method','org.freedesktop.portal.OpenURI.OpenURI','',url,'{}'],{env:{...process.env,DBUS_SESSION_BUS_ADDRESS:'unix:path=/run/user/1000/bus'},stdio:'inherit'});
  child.on('error',error=>console.error('Explicit fixture opener failed:',error.message));
 }
});
setTimeout(()=>{console.error('Browser fixture timed out');server.close();process.exit(2);},150000).unref();
