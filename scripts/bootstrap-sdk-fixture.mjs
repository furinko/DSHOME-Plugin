import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(resolve(root,'.dev-sdk'),{recursive:true});
for(const file of ['package.json','pnpm-lock.yaml'])await copyFile(resolve(root,'test/sdk-fixture',file),resolve(root,'.dev-sdk',file));
console.log('Prepared the isolated public SDK fixture manifests.');
console.log('Next: pnpm --dir .dev-sdk install --ignore-scripts --frozen-lockfile --config.auto-install-peers=false');
