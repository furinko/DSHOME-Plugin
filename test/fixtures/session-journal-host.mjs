/* Explicit Host journal/data fixture, NOT the production Session service.
 * Native ClientSessions + SessionEventStream consume this through the actual
 * published Typert/Gateway schemas and WebSocket carrier. Never calls an LLM. */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function sessionJournalHost(root, sessionId = 'A') {
  if (!['A', 'B', 'C'].includes(sessionId)) throw Error('Unknown isolated journal identity');
  const path = join(root, sessionId === 'A' ? 'fixture-session-history.jsonl' : `fixture-session-${sessionId}-history.jsonl`); await writeFile(path, '');
  const followers = new Set(); let nextSeq = 0, appendTail = Promise.resolve();
  const metrics = { follows: 0, activeFollowers: 0, prompts: 0, appended: 0 };
  const records = async () => (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
  async function* waitFrames(signal, initial) {
    const queue = []; let wake;
    const publish = frame => { queue.push(frame); wake?.(); };
    const abort = () => wake?.(); signal.addEventListener('abort', abort, { once: true }); followers.add(publish); metrics.activeFollowers++;
    try { yield await initial(); while (!signal.aborted) { if (queue.length) yield queue.shift(); else await new Promise(resolve => { wake = resolve; if (signal.aborted || queue.length) resolve(); }); } }
    finally { followers.delete(publish); signal.removeEventListener('abort', abort); metrics.activeFollowers--; }
  }
  const service = {
    async list() { return { items: [{ sessionId, cwd: root, updatedAt: 0, running: false, blank: false, agentAvailable: true, formatStatus: 'current' }] }; },
    async *control(signal) { yield { type: 'baseline', value: { projections: {} } }; await new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); }); },
    async *follow(request, signal) {
      if (request.address.kind !== 'session' || request.address.sessionId !== sessionId) throw Error('fixture session unavailable'); metrics.follows++;
      yield* waitFrames(signal, async () => { const data = await records(); return { type: 'snapshot', header: { version: 1, id: sessionId, createdAt: 0, cwd: root, isSeeded: false }, cursor: data.at(-1)?.event.seq ?? -1, records: data, hasMore: false, projections: { asOfSeq: data.at(-1)?.event.seq ?? -1, values: {} }, assistantStream: { revision: 0 } }; });
    },
    async page() { return { records: await records(), hasMore: false }; },
    async projections() { return { asOfSeq: nextSeq - 1, values: {} }; },
    async prompt() { metrics.prompts++; throw Error('LLM/prompt API intentionally unavailable in isolated journal fixture'); },
  };
  function appendUser(text) {
    const operation = appendTail.then(async () => {
      const entry = { type: 'event', event: { seq: nextSeq, time: nextSeq + 1, type: 'user/message', surfaceOp: 'append', data: { id: 'fixture-user-' + nextSeq, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] } } };
      await appendFile(path, JSON.stringify(entry) + '\n'); nextSeq++; metrics.appended++;
      for (const publish of followers) publish(entry); return entry;
    }); appendTail = operation.catch(() => {}); return operation;
  }
  return { service, appendUser, records, path, metrics };
}
