import React from 'react';
import { REFERENCE_ID, referenceTextRule } from './reference.mjs';
const h = React.createElement;
export function installReferenceBridge(ctx, { returnReference, onAvailability }) {
  function ReferenceNode({ node, raw, interactive, sessionId }) {
    const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
    const lifetime = React.useMemo(() => new AbortController(), [node.data.uri]);
    React.useEffect(() => () => lifetime.abort(), [lifetime]);
    if (!interactive) return h('span', null, raw);
    const data = node.data;
    async function open() {
      setBusy(true); setError('');
      try { await returnReference(data.uri, { sessionId, signal: lifetime.signal }); }
      catch (failure) { if (!lifetime.signal.aborted) setError(failure.message); }
      finally { if (!lifetime.signal.aborted) setBusy(false); }
    }
    return h('span', { className: 'dshome-document-reference' },
      h('button', { type: 'button', disabled: busy, onClick: open, title: data.path },
        (busy ? '正在定位… ' : '返回原文 ') + data.path.split(/[\\/]/).at(-1) + ':' + data.startLine + '–' + data.endLine + (data.dirty ? '（草稿）' : '')),
      error && h('span', { role: 'alert' }, error));
  }
  return ctx.inject(['uiConversation'], scope => {
    scope.effect(function* () {
      yield scope.uiConversation.userText.register(referenceTextRule);
      yield scope.slots.inject('conversation.user.text.node', function* () {
        yield scope.slots.register({ name: 'conversation.user.text.node', key: REFERENCE_ID }, ReferenceNode);
        onAvailability(true); yield () => onAvailability(false);
      });
    }, 'dshome: native user-text rule');
  });
}
