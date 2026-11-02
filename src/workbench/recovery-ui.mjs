import React from 'react';
const h = React.createElement;
const button = (label, onClick, props = {}) => h('button', { type: 'button', onClick, ...props }, label);
export function downloadDraft(path, text) {
  // No EOL/BOM conversion, no JSON wrapping, no write back to the source file.
  if (!text.isWellFormed()) throw new Error('草稿含未配对的 Unicode 代理字符，无法无损导出为 UTF-8；请修正后再导出。');
  const name = (path.split(/[\\/]/).at(-1) || 'document').replace(/[<>:"|?*\x00-\x1f]/g, '_') + '.draft';
  const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function TextPane({ title, text }) {
  const endings = React.useMemo(() => { let crlf = 0, lf = 0, cr = 0; for (let index = 0; index < text.length; index++) { if (text[index] === '\r') { if (text[index + 1] === '\n') { crlf++; index++; } else cr++; } else if (text[index] === '\n') lf++; } return 'BOM ' + (text.startsWith('\ufeff') ? '有' : '无') + ' · CRLF ' + crlf + ' / LF ' + lf + ' / CR ' + cr; }, [text]);
  return h('section', { style: { minWidth: 0, display: 'flex', flexDirection: 'column' }, 'aria-label': title }, h('strong', null, title), h('small', null, endings),
    h('pre', { tabIndex: 0, style: { flex: 1, overflow: 'auto', margin: 0, padding: 6, border: '1px solid #d7e2f1', whiteSpace: 'pre', fontSize: 12 }, 'aria-label': title + '全文' }, text));
}
export function DocumentRecovery({ doc, state: s, notify, hideActions = false }) {
  const run = fn => { try { Promise.resolve(fn()).catch(error => notify(error.message)); } catch (error) { notify(error.message); } };
  const comparison = s.comparison, stale = comparison && (comparison.editRevision !== s.editRevision || comparison.baseVersion !== s.version);
  return h(React.Fragment, null,
    !hideActions && h('div', { className: 'wb-recovery-actions', style: { padding: '3px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' } },
      button(s.comparing ? '正在比较磁盘…' : '比较磁盘', () => run(() => doc.compareDisk()), { disabled: s.comparing || s.phase === 'saving' }),
      s.comparing && button('取消比较', () => doc.cancelComparison()),
      button('导出草稿', () => run(() => downloadDraft(s.path, s.text)))),
    comparison && h('section', { className: 'wb-document-recovery', role: 'region', 'aria-label': '文档比较与恢复', style: { padding: 8, flex: '0 1 320px', minHeight: 180, maxHeight: '65%', display: 'flex', flexDirection: 'column', gap: 5, overflow: 'auto' } },
      h('strong', null, '文档比较与恢复'),
      h('small', null, '先选择要保留的内容，再点击保存写入文件。这里的选择不会立即覆盖磁盘；尚未确认的保存仍需核对。'),
      stale && h('p', { role: 'alert' }, '比较之后草稿已变化，请刷新比较再决定。'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(180px,1fr))', gap: 6, flex: 1, minHeight: 80, overflow: 'auto' } },
        h(TextPane, { title: '上次读取的内容', text: s.baseText }), h(TextPane, { title: '磁盘上的内容', text: comparison.disk.text }), h(TextPane, { title: '当前草稿', text: s.text })),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        button('保留我的修改', () => run(() => doc.resolveComparison(comparison.token, 'keep-draft')), { disabled: !!stale || s.comparing }),
        button('使用磁盘版本', () => { if (window.confirm('这将放弃当前未保存草稿，改用刚才显示的磁盘上的内容；不会写盘。确定吗？')) run(() => doc.resolveComparison(comparison.token, 'use-disk')); }, { disabled: !!stale || s.comparing }),
        button('刷新比较', () => run(() => doc.compareDisk()), { disabled: s.comparing || s.phase === 'saving' }),
        button('关闭比较', () => doc.dismissComparison(comparison.token)))));
}
