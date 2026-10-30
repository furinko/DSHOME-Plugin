// Run the package's declared Node-only regressions without requiring npm.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const key=process.argv[2]??'test:foundations';
if(!['test:foundations','test','test:dual'].includes(key))throw Error('Unsupported regression group');
let failed=false;
for(const command of pkg.scripts[key].split(' && ')) {
 const [program,...args]=command.split(' ');
 if(program!=='node'||args.some(a=>!a))throw Error('Only declared plain Node argv is accepted');
 const result=spawnSync(process.execPath,args,{stdio:'inherit',cwd:new URL('../',import.meta.url)});
 if(result.error){console.error(result.error);failed=true;}else if(result.status!==0)failed=true;
}
process.exitCode=failed?1:0;
