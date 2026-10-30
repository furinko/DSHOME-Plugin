// Prepare only repository-owned test dependencies. Never installs into DSH.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot || !fs.existsSync(path.join(sdkRoot, 'package.json'))) throw Error('Set DSH_SDK_ROOT to the existing DSH installation/SDK root. The host is never upgraded by this script.');
const sdk = createRequire(path.join(path.resolve(sdkRoot), 'package.json'));
for (const id of ['@deepseek-ai/dsh-api-gateway', '@deepseek-ai/dsh-api-terminal-controller', '@deepseek-ai/dsh-fs-sandbox', '@deepseek-ai/dsh-client-ui-layout']) sdk.resolve(id);
const fixture = path.join(root, '.dev-sdk');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/browser-dependencies.json'), 'utf8'));
if (!fs.existsSync(path.join(fixture, 'package.json'))) {
  if (process.argv.includes('--check')) throw Error('Browser fixture missing. Run node scripts/setup-tests.mjs first.');
  if (fs.existsSync(fixture) && fs.lstatSync(fixture).isSymbolicLink()) throw Error('Refusing to modify a shared fixture link.');
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ private: true, ...expected }, null, 2) + '\n');
  const candidates = [path.join(path.dirname(process.execPath), 'npm'), path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const npm = candidates.find(file => fs.existsSync(file));
  if (!npm) throw Error('npm is unavailable. Run npm install --ignore-scripts in .dev-sdk using your existing npm runtime.');
  const result = spawnSync(process.execPath, [fs.realpathSync(npm), 'install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: fixture, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw Error('Test dependency installation failed; the DSH installation was not changed.');
}
const dev = createRequire(path.join(fixture, 'package.json'));
for (const name of Object.keys(expected.dependencies)) dev.resolve(name);
console.log('SDK and ' + Object.keys(expected.dependencies).length + ' browser-fixture dependencies are ready. Set WORKBENCH_BROWSER to your existing Chrome/Chromium executable.');
