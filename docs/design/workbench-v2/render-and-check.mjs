import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,browser='C:/Program Files/Google/Chrome/Application/chrome.exe';
const names=['workbench-v2-01-daily','workbench-v2-02-layout-editor','workbench-v2-03-switch-preserve'];
const results=[];let chatHash;
for(const name of names){
 const file=path.join(root,name+'.svg'),svg=fs.readFileSync(file,'utf8');
 if(/<script|<foreignObject|<image\b|https?:\/\//i.test(svg.replace('http://www.w3.org/2000/svg','')))throw Error('Unexpected script or external asset in SVG');
 const chat=svg.match(/<g id="chat"[\s\S]*?(?=\n<rect x="680")/)?.[0];if(!chat)throw Error('Missing stable chat region');const currentChatHash=createHash('sha256').update(chat).digest('hex');if(chatHash&&chatHash!==currentChatHash)throw Error('Chat/composer changed between states');chatHash=currentChatHash;
 const html=path.join(root,name+'.check.html');
 fs.writeFileSync(html,'<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:"><style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}#check-result{display:none}</style></head><body>'+svg+`<pre id="check-result"></pre><script>
(async()=>{await document.fonts.ready;const errors=[],root=document.querySelector('svg'),items=[...root.querySelectorAll('text')];
for(const el of items){const b=el.getBBox(),holder=el.closest('[data-box]'),box=holder?holder.dataset.box.split(',').map(Number):[0,0,1920,1080];const [x,y,w,h]=box;if(b.x<x-2||b.y<y-2||b.x+b.width>x+w+2||b.y+b.height>y+h+2)errors.push({text:el.textContent,holder:holder?.id,actual:[b.x,b.y,b.width,b.height],box});}
const area=id=>document.getElementById(id).dataset.box;
const value={textCount:items.length,errors,chatBox:area('chat'),composerBox:area('composer'),workspaceBox:area('workspace'),fontFamily:getComputedStyle(items[0]).fontFamily,canvas:[root.width.baseVal.value,root.height.baseVal.value]};document.getElementById('check-result').textContent=JSON.stringify(value);document.body.dataset.checkDone='true';})();
</script></body></html>`);
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-svg-v2-'));
 const png=path.join(root,name+'.png'),dom=path.join(root,name+'.dom.html'),log=path.join(root,name+'.render.log');
 const output=fs.openSync(dom,'w'),err=fs.openSync(log,'w');let run;
 try{run=spawnSync(browser,['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-first-run','--no-default-browser-check','--no-proxy-server','--hide-scrollbars','--force-device-scale-factor=1','--window-size=1920,1080','--virtual-time-budget=1500','--user-data-dir='+profile,'--dump-dom','--screenshot='+png,pathToFileURL(html).href],{stdio:['ignore',output,err],timeout:45000});}finally{fs.closeSync(output);fs.closeSync(err);}
 if(run.status!==0||!fs.existsSync(png))throw Error(name+' render failed: '+run.status+' '+(run.error?.message||''));
 const serialized=fs.readFileSync(dom,'utf8');const raw=serialized.match(/<pre id="check-result">([\s\S]*?)<\/pre>/)?.[1];if(!raw)throw Error('Missing browser geometry report');const report=JSON.parse(raw.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>'));
 const row={name,svgSha256:createHash('sha256').update(svg).digest('hex'),pngBytes:fs.statSync(png).size,profile,chatMarkupSha256:currentChatHash,...report};results.push(row);console.log(JSON.stringify({name,textCount:row.textCount,overflowCount:row.errors.length,pngBytes:row.pngBytes}));
}
const report={at:new Date().toISOString(),kind:'local static SVG rendering and text-region containment; not live GUI or interaction implementation acceptance',results,allContainmentChecksPass:results.every(r=>!r.errors.length),chatAndComposerUnchangedAcrossStates:true};fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2)+'\n');if(!report.allContainmentChecksPass){for(const r of results)for(const e of r.errors)console.log(JSON.stringify({name:r.name,...e}));process.exitCode=1;}
