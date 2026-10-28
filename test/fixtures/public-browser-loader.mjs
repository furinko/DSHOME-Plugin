// Test-only browser platform boundary for the published Node-capable Loader.
// Do not replace Loader, Entry, registry disposal, entries.reload or HMR logic.
// A browser has no Node internals: classify it below the Node-internals floor,
// and make any attempted node:module fallback loudly observable and fatal.
import { build } from 'esbuild';
export async function publicBrowserLoader(resolver) {
  const result = await build({ entryPoints: [resolver.resolve('@deepseek-ai/cordis-plugin-loader')], bundle: true, write: false,
    format: 'cjs', platform: 'browser', target: 'es2022', external: ['@deepseek-ai/cordis'],
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.CORDIS_SHARED': 'undefined', 'process.versions.node': '"0.0.0-browser-no-node-internals"' },
    plugins: [{ name: 'explicit-no-node-internals', setup(b) {
      b.onResolve({ filter: /^node:module$/ }, () => ({ path: 'node:module', namespace: 'browser-no-node' }));
      b.onLoad({ filter: /.*/, namespace: 'browser-no-node' }, () => ({ contents: 'export function createRequire(){globalThis.__hmrNodeFallbackCalls=(globalThis.__hmrNodeFallbackCalls||0)+1;throw new Error("Node loader fallback forbidden in isolated browser");}', loader: 'js' }));
    } }],
  });
  return 'window.__hmrNodeFallbackCalls=0;window.__ModuleLoader__.load({id:"@deepseek-ai/cordis-plugin-loader",factory:(require)=>{const module={exports:{}};const exports=module.exports;\n' + result.outputFiles[0].text + '\nreturn module.exports;}});';
}
