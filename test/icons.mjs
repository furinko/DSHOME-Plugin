import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
const compiled = await build({ entryPoints: ['src/workbench/icons.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', alias: { react: resolve('.dev-sdk/node_modules/react') }, define: { 'process.env.NODE_ENV': '"production"' } });
const { Icon } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
test('unavailable imported modules including prototype property names render a safe decorative icon', () => {
  for (const name of ['document', 'terminal', 'unavailable-provider', 'toString', 'valueOf', '__proto__', 'constructor', undefined]) {
    const element = Icon({ name });
    assert.equal(element.type, 'svg'); assert.equal(element.props['aria-hidden'], true);
    assert.ok(element.props.children.length > 0);
    for (const path of element.props.children) { assert.equal(path.type, 'path'); assert.equal(typeof path.props.d, 'string'); }
  }
});
