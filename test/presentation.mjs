import test from 'node:test';
import assert from 'node:assert/strict';
import { fileName, panelCaption, friendlyError } from '../src/workbench/presentation.mjs';
const documentItem = (path, version = 'v1') => ({ document: { getSnapshot: () => ({ path, version }) } });
test('document captions use committed host identity, preserve custom names and support Unicode paths', () => {
  assert.equal(fileName('C:\\项目\\说明 😀.md'), '说明 😀.md');
  assert.equal(fileName('/workspace/src/app.ts'), 'app.ts');
  assert.equal(fileName(''), '未命名文档');
  const panel = { kind: 'document', title: '文档' };
  assert.equal(panelCaption(panel, documentItem('/项目/a.md')), 'a.md');
  assert.equal(panelCaption(panel, documentItem('/项目/b.md')), 'b.md');
  assert.equal(panelCaption(panel, documentItem('loading.md', null)), '文档');
  assert.equal(panelCaption(panel, {}), '文档');
  assert.equal(panelCaption({ ...panel, title: '交付说明' }, documentItem('/项目/a.md')), '交付说明');
});
test('web captions use parsed host and malformed input keeps the panel label', () => {
  const panel = { kind: 'web', title: '网页' };
  assert.equal(panelCaption(panel, { url: 'https://docs.example.com/private?q=1' }), 'docs.example.com');
  assert.equal(panelCaption(panel, { url: 'invalid' }), '网页');
  assert.equal(panelCaption({ ...panel, title: '参考资料' }, { url: 'https://example.com' }), '参考资料');
});
test('known file failures explain retained drafts and unknown provider diagnostics remain available', () => {
  assert.match(friendlyError({ code: 'FS_STALE_VERSION', message: 'stale' }), /草稿已保留.*比较磁盘/);
  assert.match(friendlyError({ code: 'WORKBENCH_SERVICE_CHANGED' }), /核对磁盘结果/);
  assert.equal(friendlyError(new Error('provider-specific detail')), 'provider-specific detail');
  assert.equal(friendlyError('plain failure'), 'plain failure');
  for (const code of ['__proto__', 'toString', 'valueOf']) assert.equal(friendlyError({ code, message: 'provider diagnostic' }), 'provider diagnostic');
});
