import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { apply } from '../src/host.mjs';
import { createGatewayCarrier } from './fixtures/gateway-carrier.mjs';
const sdkRoot = process.env.DSH_SDK_ROOT;
if (!sdkRoot) throw Error('DSH_SDK_ROOT required; browser tests use real Gateway and FS');
const sdk = createRequire(resolve(sdkRoot, 'package.json'));
const load = name => import(pathToFileURL(sdk.resolve(name)));
const [{ Context }, { TypertRegistry }, { TypertGatewayService }, { SandboxedFileSystem }] = await Promise.all([
  load('@deepseek-ai/cordis'), load('@deepseek-ai/dsh-typert-registry'), load('@deepseek-ai/dsh-api-gateway'), load('@deepseek-ai/dsh-fs-sandbox')]);
const listen = server => new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', () => ok('http://127.0.0.1:' + server.address().port)); });
const close = server => new Promise(resolve => server.close(resolve));
test('real Chromium component integration: stable iframe/draft, actual Gateway disk save and layout edit isolation', { timeout: 90000 }, async t => {
  const parent = resolve('test-output/ui-browser'); await mkdir(parent, { recursive: true }); const root = await mkdtemp(join(parent, 'case-'));
  const original = Array.from({ length: 180 }, (_, i) => 'line ' + (i + 1) + ' · 真实文件内容').join('\r\n') + '\r\n'; await writeFile(join(root, 'a.md'), original);
  const mixed = '\ufefftitle\r\nline😀 two\r\nthird\nlast\r'; await writeFile(join(root, 'mixed.md'), mixed);
  const ctx = new Context(); const session = { id: 'A', header: { cwd: root } };
  ctx.reflect.provide('sessions', new Map([['A', session]]));
  ctx.reflect.provide('sandboxPolicy', { defaultMode: 'workspace-write', resolve: () => ({ mode: 'workspace-write', workspaceRoot: root }) });
  ctx.reflect.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test-grant-denied' }) });
  new SandboxedFileSystem(ctx, { cwd: root, diffBasisMaxBytes: 2 * 1024 * 1024 }); new TypertRegistry(ctx);
  const carrier = createGatewayCarrier(ctx);
  const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30000, streamInboxBytes: 1048576 }); apply(ctx);
  const peer = { id: 'isolated-browser-owner-double', principal: { kind: 'owner' }, signal: new AbortController().signal };
  let iframeLoads = 0;
  const child = createServer((_req, res) => { iframeLoads++; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><title>State probe</title><h1>真实 iframe 状态探针</h1><input aria-label="未提交表单"><script>window.probeNonce=crypto.randomUUID();parent.postMessage({nonce:window.probeNonce},"*")</script>'); });
  const childURL = await listen(child);
  const compiled = await build({ entryPoints: ['test/fixtures/workspace-ui-entry.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', loader: { '.css': 'text' },
    alias: { react: resolve('.dev-sdk/node_modules/react'), 'react-dom': resolve('.dev-sdk/node_modules/react-dom') }, define: { 'process.env.NODE_ENV': '"production"' } });
  const shell = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(compiled.outputFiles[0].text); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>隔离组件集成测试 · 非生产GUI</title><style>html,body{margin:0;height:100%;font-family:Arial}body{display:grid;grid-template-columns:200px 464px minmax(0,1fr);background:#edf2f8;gap:12px;padding:12px;box-sizing:border-box}aside,main{background:white;border-radius:10px;padding:12px}main{display:flex;flex-direction:column}main>p{flex:1}#fixture-composer{height:130px}#workspace{min-width:0;min-height:0;border:1px solid #dbe3ef;border-radius:10px;overflow:hidden}</style><aside>隔离测试项目<br>不连接运行中 DSH</aside><main id="fixture-chat"><h2>聊天与输入替身</h2><p>用于检测几何和节点是否被工作台改变；不是原生聊天验收。</p><textarea id="fixture-composer">原有未发送草稿</textarea></main><div id="workspace"></div><script type="module" src="/test.js"></script>');
  });
  const url = await listen(shell);
  let browser;
  t.after(async () => { await browser?.close(); await Promise.all([close(shell), close(child)]); await ctx.fiber.dispose(); const checked = await realpath(root), allowed = await realpath(parent); assert.ok(checked.startsWith(allowed + sep)); await rm(checked, { recursive: true }); });
  browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('testGateway', (method, args) => carrier.call('/api', 'dshomeWorkspace/' + method, { args }, new AbortController().signal, peer));
  await page.goto(url); await page.waitForFunction(() => !!window.testController);
  await page.getByRole('button', { name: '▧ a.md', exact: true }).click();
  const editor = page.locator('textarea.wb-editor'); await editor.waitFor();
  const draft = original + '尚未保存的修改\r\n'; await editor.fill(draft);
  await editor.evaluate(node => { node.setSelectionRange(7, 21); node.dispatchEvent(new Event('select', { bubbles: true })); node.scrollTop = 260; node.dispatchEvent(new Event('scroll', { bubbles: true })); window.testEditor = node; });
  await page.getByLabel('网页地址', { exact: true }).fill(childURL); await page.getByRole('button', { name: '前往', exact: true }).click();
  const iframe = page.locator('iframe[data-wb-iframe]'); await iframe.waitFor();
  const childFrame = page.frameLocator('iframe[data-wb-iframe]'); await childFrame.getByLabel('未提交表单').fill('未提交内容不能丢');
  const nonce = await childFrame.locator('body').evaluate(() => window.probeNonce);
  const baseline = await page.evaluate(() => { window.testIframe = document.querySelector('iframe[data-wb-iframe]'); window.testChat = document.querySelector('#fixture-chat'); window.testComposer = document.querySelector('#fixture-composer'); return { chat: window.testChat.getBoundingClientRect().toJSON(), composer: window.testComposer.value }; });
  await page.screenshot({ path: 'test-output/workspace-daily-integration.png', fullPage: true });
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('布局预设', { exact: true }).selectOption('review'); await page.getByLabel('布局预设', { exact: true }).selectOption('development');
  }
  await page.getByRole('button', { name: '编辑布局', exact: true }).click(); await page.getByRole('heading', { name: '布局草稿', exact: true }).waitFor();
  await page.screenshot({ path: 'test-output/workspace-editor-integration.png', fullPage: true });
  assert.equal(await page.evaluate(() => window.testChat === document.querySelector('#fixture-chat')), true);
  assert.deepEqual(await page.locator('#fixture-chat').evaluate(n => n.getBoundingClientRect().toJSON()), baseline.chat);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const retained = await page.evaluate(() => ({ sameEditor: window.testEditor === document.querySelector('textarea.wb-editor'), sameIframe: window.testIframe === document.querySelector('iframe[data-wb-iframe]'), sameComposer: window.testComposer === document.querySelector('#fixture-composer'), text: window.testEditor.value, start: window.testEditor.selectionStart, end: window.testEditor.selectionEnd, scroll: window.testEditor.scrollTop, draft: window.testComposer.value }));
  assert.equal(retained.sameEditor, true); assert.equal(retained.sameIframe, true); assert.equal(retained.sameComposer, true); assert.equal(retained.text, draft.replace(/\r\n/g, '\n')); assert.equal(await page.evaluate(() => window.testController.content('DOC-01').document.getSnapshot().text), draft); assert.equal(retained.draft, baseline.composer); assert.equal(retained.start, 7); assert.equal(retained.end, 21); assert.ok(retained.scroll > 0);
  assert.equal(await childFrame.getByLabel('未提交表单').inputValue(), '未提交内容不能丢'); assert.equal(await childFrame.locator('body').evaluate(() => window.probeNonce), nonce); assert.equal(iframeLoads, 1);
  await page.getByRole('button', { name: '保存文件', exact: true }).click(); await page.waitForFunction(() => !window.testController.content('DOC-01').document.getSnapshot().dirty);
  assert.equal(await readFile(join(root, 'a.md'), 'utf8'), draft);
  await page.getByRole('button', { name: '保存布局', exact: true }).click(); await page.waitForFunction(() => window.testController.getSnapshot().storage === 'ready');
  await page.setViewportSize({ width: 1280, height: 800 }); assert.equal(await page.locator('#fixture-composer').inputValue(), baseline.composer);
  assert.equal(await page.evaluate(() => window.testIframe === document.querySelector('iframe[data-wb-iframe]')), true); assert.equal(iframeLoads, 1);
  // The product textarea must preserve source bytes despite Chromium exposing
  // LF-only values/selection offsets. Read and save still use the real Gateway.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(async () => { await window.testController.openDocument('mixed.md'); });
  const mixedEditor = page.getByRole('textbox', { name: '编辑 ' + join(root, 'mixed.md'), exact: true }); await mixedEditor.waitFor();
  assert.equal(await mixedEditor.inputValue(), mixed.replace(/\r\n?/g, '\n'));
  await mixedEditor.focus(); await mixedEditor.press('Control+Home'); await mixedEditor.press('ArrowDown'); await mixedEditor.press('Home'); await mixedEditor.press('Shift+End');
  await page.locator('.wb-document:visible').getByRole('button', { name: '引用选区到对话', exact: true }).click();
  const reference = await page.evaluate(() => [...window.testController.contents.values()].find(item => item.document?.getSnapshot().path.endsWith('mixed.md')).lastReference);
  assert.equal(reference.text, 'line😀 two'); assert.equal(reference.start, mixed.indexOf('line')); assert.equal(reference.end, mixed.indexOf('line') + 'line😀 two'.length);
  assert.equal(reference.startLine, 2); assert.equal(reference.endLine, 2);
  assert.ok((await page.locator('#fixture-composer').inputValue()).includes(baseline.composer));
  await mixedEditor.focus(); await mixedEditor.press('Control+End'); await page.keyboard.insertText('追加\n新行');
  const expectedMixed = mixed + '追加\r\n新行';
  const draftMixed = await page.evaluate(() => [...window.testController.contents.values()].find(item => item.document?.getSnapshot().path.endsWith('mixed.md')).document.getSnapshot().text);
  assert.equal(draftMixed, expectedMixed); assert.notEqual(draftMixed, await mixedEditor.inputValue(), 'negative naive-normalization detector must distinguish source and DOM');
  await page.locator('.wb-document:visible').getByRole('button', { name: '保存文件', exact: true }).click();
  await page.waitForFunction(() => ![...window.testController.contents.values()].find(item => item.document?.getSnapshot().path.endsWith('mixed.md')).document.getSnapshot().dirty);
  assert.deepEqual(await readFile(join(root, 'mixed.md')), Buffer.from(expectedMixed, 'utf8'));
  // Negative control uses the same identity detector: intentionally unmounting
  // the real component must destroy both content nodes. It is not a product pass.
  await page.evaluate(() => window.testRemountNegativeControl());
  assert.equal(await page.evaluate(() => window.testIframe.isConnected), false); assert.equal(await page.evaluate(() => window.testEditor.isConnected), false);
  assert.deepEqual(errors, []);
  await writeFile('test-output/workspace-ui-result.json', JSON.stringify({ scope: 'real Chromium + React product components + real SDK Gateway and FS; shell/input/file-list and owner Peer are explicit test doubles; native slots and PTY NOT covered', viewport: [1920,1080], switches: 10, iframeLoads, draftPreserved: true, formAndNoncePreserved: true, realDiskSave: true, mixedEOLByteExact: true, BOMPreserved: true, rawReferenceOffsetsVerified: true, unmountNegativeControlDetected: true, errors }, null, 2));
});
