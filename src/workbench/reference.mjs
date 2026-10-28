/* References carry location + content identity, never a grant to read a file. */
export const REFERENCE_ID = 'dshome-workbench-reference';
export const REFERENCE_PREFIX = 'dshome-ref://v1/';
const MAX_URI = 32768, MAX_TEXT = 2 * 1024 * 1024;
const fail = message => { throw new Error(message); };
const string = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && value.isWellFormed() && !value.includes('\0');
function checked(value) {
  const keys = ['v', 'sessionId', 'projectId', 'path', 'start', 'end', 'startLine', 'endLine', 'hash', 'dirty'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)) || value.v !== 1 ||
      !string(value.sessionId, 256) || !string(value.projectId, 8192) || !string(value.path, 8192) || !(/^(?:\/|[a-z]:[\\/]|\\\\)/i.test(value.path)) ||
      ![value.start, value.end, value.startLine, value.endLine].every(Number.isSafeInteger) || value.start < 0 || value.end <= value.start || value.end > MAX_TEXT || value.startLine < 1 || value.endLine < value.startLine || value.endLine > MAX_TEXT + 1 ||
      typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash) || typeof value.dirty !== 'boolean') fail('文档引用格式无效或超出范围。');
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}
export function encodeReference(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(checked(value)));
  if (bytes.length > MAX_URI * 0.74) fail('引用位置太长，未生成不完整引用。');
  const uri = REFERENCE_PREFIX + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (uri.length > MAX_URI) fail('引用位置太长，未生成不完整引用。');
  return uri;
}
export function decodeReference(uri) {
  if (typeof uri !== 'string' || uri.length > MAX_URI || !uri.startsWith(REFERENCE_PREFIX)) fail('不是有效的工作台文档引用。');
  const encoded = uri.slice(REFERENCE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) fail('文档引用编码无效。');
  const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const value = checked(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (encodeReference(value) !== uri) fail('文档引用不是完整的规范编码。');
  return value;
}
export async function referenceHash(text) {
  if (typeof text !== 'string' || text.length > MAX_TEXT || !text.isWellFormed()) fail('原文无法生成完整的 UTF-8 摘要。');
  if (!globalThis.crypto?.subtle) fail('当前页面缺少安全摘要接口，未生成不可核对的引用。');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function quoteDocumentSelection({ doc, controller, inputActions, isCurrent = () => true, hash = referenceHash }) {
  const state = doc.getSnapshot(), selected = doc.selection();
  if (!selected) fail('请先选择要引用的文档文字。');
  if (!selected.text.isWellFormed()) fail('选区拆开了 Unicode 字符，请重新选择完整字符。');
  if (!inputActions?.captureInsertion || !inputActions?.insertText) fail('原生会话输入接口不可用，未写入或替换草稿。');
  const span = inputActions.captureInsertion(); // Capture BEFORE any asynchronous work.
  const uri = encodeReference({ v: 1, sessionId: controller.sessionId, projectId: controller.projectId, path: selected.path, start: selected.start, end: selected.end,
    startLine: selected.startLine, endLine: selected.endLine, hash: await hash(state.text), dirty: selected.dirty });
  if (!isCurrent()) fail('会话或引用接口已变化，未改动对话草稿。');
  const text = '\n引用：' + selected.path + ':' + selected.startLine + '–' + selected.endLine + (selected.dirty ? '（未保存草稿）' : '') + '\n' + selected.text.split(/\r\n|\r|\n/).map(line => '> ' + line).join('\n') + '\n↩ ' + uri + '\n';
  if (!inputActions.insertText(text, span)) fail('对话草稿已变化或输入被锁定，未覆盖。请重新引用。');
  return Object.freeze({ ...selected, uri });
}
export async function revealDocumentReference({ uri, controller, isCurrent = () => true, signal, hash = referenceHash, validateScope = async () => {} }) {
  const value = decodeReference(uri);
  if (!isCurrent() || value.sessionId !== controller.sessionId || value.projectId !== controller.projectId) fail('引用属于另一会话或项目，未打开文件。');
  signal?.throwIfAborted();
  // openDocument and load use only the original bounded Host transport. A URI
  // cannot bypass owner/workspace/link/policy checks, even with a forged hash.
  const doc = await controller.openDocument(value.path); await doc.load(signal);
  const state = doc.getSnapshot(), actual = await hash(state.text);
  signal?.throwIfAborted(); if (!isCurrent()) fail('会话或项目已变化，未定位引用。');
  if (actual !== value.hash || value.end > state.text.length) fail('原文或未保存草稿已变化，不能精确定位；未替换任何内容。');
  // Cached documents do not necessarily issue a fresh Host read. Revalidate
  // ownership/project AFTER hashing and before the final synchronous CAS.
  await validateScope();
  signal?.throwIfAborted(); if (!isCurrent()) fail('会话或项目已变化，未定位引用。');
  doc.reveal({ start: value.start, end: value.end, expectedEditRevision: state.editRevision });
  return doc;
}
export const referenceTextRule = Object.freeze({ id: REFERENCE_ID, order: -50,
  match(text, from) {
    // Only the dedicated standalone return marker is recognized. Quoted source
    // lines are prefixed with >, so repository text cannot impersonate it.
    const pattern = /(?:^|\n)↩ (dshome-ref:\/\/v1\/[A-Za-z0-9_-]+)(?=\r?\n|$)/g; pattern.lastIndex = Math.max(0, from - 1);
    for (let match; (match = pattern.exec(text));) {
      const start = match.index + (match[0].startsWith('\n') ? 1 : 0); if (start < from) continue;
      try { const value = decodeReference(match[1]); return { id: REFERENCE_ID, start, end: start + match[0].length - (match[0].startsWith('\n') ? 1 : 0), data: { uri: match[1], path: value.path, startLine: value.startLine, endLine: value.endLine, dirty: value.dirty } }; } catch { /* Malformed/old tokens remain plain original text. */ }
    }
  },
});
