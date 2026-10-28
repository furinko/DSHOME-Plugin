import React from 'react';
const h = React.createElement;
export function LayoutRecovery({ c, state, download }) {
  const t = state.layoutRecovery; if (!t) return null;
  const model = c.model.getSnapshot(), stale = model.revision !== t.localRevision || !!model.editing, busy = state.savingLayout;
  const available = ['empty', 'ready'].includes(t.observed.kind);
  const act = fn => { try { Promise.resolve(fn()).catch(e => c.notify(e.message)); } catch (e) { c.notify(e.message); } };
  const button = (label, fn, disabled = false) => h('button', { type: 'button', onClick: () => act(fn), disabled }, label);
  return h('section', { className: 'wb-layout-recovery', role: 'region', 'aria-label': '布局存储恢复', style: { padding: 12, border: '1px solid #d7ad56', borderRadius: 8, maxHeight: 330, overflow: 'auto' } },
    h('strong', null, '布局存储比较 · ' + ({ corrupt: '原记录损坏或格式不支持', ready: '有效存储版本', empty: '存储记录不存在', unavailable: '无法读取存储' }[t.observed.kind])),
    h('p', null, '这里只处理布局元数据。文档草稿、网页表单和终端进程不会被写入布局记录；采用存储布局时，缺少位置的现有内容只收起保留。'),
    stale && h('p', { role: 'alert' }, '比较后布局已变化；旧选择已禁用，请重新检查。'),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 } },
      [['当前布局快照', t.localJSON], ['原保存基线', t.baselineRaw], ['目前存储原记录', t.observed.raw]].map(([label, value]) => h('label', { key: label }, label,
        h('textarea', { readOnly: true, 'aria-label': label, value: value === undefined ? '读取失败，未知' : value === null ? '没有记录' : value, style: { width: '100%', height: 130, boxSizing: 'border-box', resize: 'vertical' } })))),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
      button('取消布局恢复', () => c.cancelLayoutRecovery()),
      button('重新检查布局', () => c.inspectLayout(), busy || !!model.editing),
      button('导出原布局记录', () => download('dshome-layout-original.json', c.exportLayoutOriginal()), t.observed.kind === 'unavailable'),
      button('保留当前布局，采用存储基线', () => c.resolveLayoutRecovery('keep-current'), stale || busy || !available),
      button('采用存储布局，不关闭内容', () => c.resolveLayoutRecovery('use-stored'), stale || busy || t.observed.kind !== 'ready'),
      button('备份原件并保存当前布局', () => c.resolveLayoutRecovery('backup-current'), stale || busy || t.observed.kind === 'unavailable')));
}
