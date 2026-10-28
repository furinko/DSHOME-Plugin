/* Compile a published pure UI package through its public package entry.
 * CSS is compiled, not replaced with a mock map. Feature SDK classic scripts
 * still come from their published /client entries. No src/private deep import. */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const dev = createRequire(resolve('.dev-sdk/package.json'));
export async function publicBrowserModule(id, resolver = dev) {
  const result = await build({ entryPoints: [resolver.resolve(id)], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022',
    outdir: resolve('test-output/public-browser'), entryNames: 'module', assetNames: 'assets/[name]-[hash]',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'],
    loader: { '.css': 'local-css', '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, define: { 'process.env.NODE_ENV': '"development"' } });
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text;
  return { js: 'window.__ModuleLoader__.load({id:' + JSON.stringify(id) + ',factory:(require)=>{const module={exports:{}};const exports=module.exports;\n' + js + '\nreturn module.exports;}});',
    css: result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n'), files: result.outputFiles };
}
