// Local review manifest only; never reads live checkouts or shared dependencies.
import {lstat,readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),rows=[];
async function visit(path){const stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Review source must not traverse junction: '+path);if(stat.isDirectory()){for(const name of (await readdir(path)).sort())await visit(resolve(path,name));}else if(stat.isFile()){const bytes=await readFile(path);rows.push({path:relative(root,path).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}
for(const name of ['src','scripts','test','p0','lib','layout','docs','package.json','package-lock.json','cordis.patch.yml','README.md'])await visit(resolve(root,name));
for(const name of ['p0-result.json','active-generation-recovery3-20261030.log','foundations-final-candidate-20261030.log','registry-freeze-20261030.log','dual-current-20261030.log','legacy-current-20261030.log'])await visit(resolve(root,'test-output',name));
rows.sort((a,b)=>a.path.localeCompare(b.path));
const receipt={kind:'local-source-and-selected-evidence-manifest',createdAt:new Date().toISOString(),sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),files:rows,boundaries:['Not a review vote or a deployment','Windows symlink fixtures: four failures, not passes','Dependency junctions excluded; no production data read']};
await writeFile(resolve(root,'test-output/review-manifest-20261030.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({files:rows.length,sha256:receipt.sha256}));
