import assert from 'node:assert/strict';
export async function runNativeHistoryScenario({ page, journal }) {
  const flow = page.locator('[data-slot="conversation.chat.flow"]');
  await flow.getByText('隔离 Host 日志中的既有消息', { exact: true }).waitFor();
  const before = await page.evaluate(() => {
    const f = window.testNative.reference, owner = window.testNative.ctx.get('sessions').binding('A');
    return { exactNativeOwner: f.owner === owner, open: owner.session.getSnapshot().openState, entries: owner.eventSource.getSnapshot().entries.length,
      draft: f.input().state.getSnapshot().draft, ref: window.testNative.controller().contents.get('DOC-01').lastReference };
  });
  assert.equal(before.exactNativeOwner, true); assert.equal(before.open, 'open'); assert.equal(before.entries, 1); assert.equal(journal.metrics.prompts, 0);
  // Controlled Host fixture publication, NOT automatic send or a production
  // prompt. The captured native draft is persisted, then emitted by the real
  // Gateway stream to the actual Session Controller and Chat projector.
  const entry = await journal.appendUser(before.draft);
  const stored = await journal.records(); assert.deepEqual(stored.at(-1), entry); assert.equal(stored.length, 2);
  await page.waitForFunction(() => window.testNative.reference.owner.eventSource.getSnapshot().entries.length === 2);
  const replay = await page.evaluate(async () => {
    const { ctx, sessionAPI } = window.testNative; let entries = [];
    const stream = new sessionAPI.SessionEventStream(ctx.get('remote'), { kind: 'session', sessionId: 'A' }, { publish: change => { if (change.type === 'replace') entries = change.entries; }, failed: error => { throw error; } });
    try { await stream.open({ maxMessages: 500 }); return entries.map(({ event }) => event.data.content[0].text); }
    finally { await stream.dispose(); }
  });
  assert.equal(replay.length, 2); assert.equal(replay.at(-1), before.draft); assert.ok(journal.metrics.follows >= 2);
  const returned = flow.getByRole('button', { name: /^返回原文 a\.md:/ }); await returned.waitFor();
  await page.locator('textarea.wb-editor').press('Control+Home');
  await page.getByRole('button', { name: '原版', exact: true }).first().click(); await returned.click();
  await page.waitForFunction(ref => { const s = window.testNative.controller().contents.get('DOC-01').document.getSnapshot(), editor = document.querySelector('textarea.wb-editor'); return s.selectionStart === ref.start && s.selectionEnd === ref.end && document.activeElement === editor; }, before.ref);
  assert.equal(await page.evaluate(() => window.testNative.reference.input().state.getSnapshot().draft), before.draft);
  assert.equal(await page.evaluate(() => document.querySelector('#fixture-composer [contenteditable=true]') === window.probeNodes.composer), true);
  assert.equal(journal.metrics.prompts, 0);
  await page.screenshot({ path: 'test-output/workspace-history.png', fullPage: true });
  return { realClientSessionsAndSessionEventStream: true, realChatMessageRenderer: true, initialAndLiveEvents: 2, fixtureJournalBytesReadBack: true, returnedFromChatNotUnsentPreview: true, nativeInputNodePreserved: true, noPromptCalls: true,
    reopenedPublicEventStream: true, limitations: ['Host journal/backend, admission, settings and UI scope adapter are explicit fixtures', 'publication is controlled fixture append, not real prompt submission or a model run', 'complete production Session persistence/authentication and AppFrame remain untested'] };
}
