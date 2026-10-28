"""One-shot adaptation of the existing isolated SDK fixture, never production code."""
from pathlib import Path
path = Path(__file__).resolve().parent.parent / 'test/workspace-native-browser.mjs'
text = path.read_text(encoding='utf-8')
def replace(old, new):
    global text
    if text.count(old) != 1:
        raise RuntimeError('Missing/nonunique fixture anchor: ' + old[:70])
    text = text.replace(old, new)
replace("const applicationShellMode =", "const dualP0 = process.env.WORKBENCH_DUAL_P0 === '1';\nconst applicationShellMode =")
replace("const nativeShellMode = applicationShellMode", "const nativeShellMode = dualP0 || applicationShellMode")
replace("test(applicationShellMode ?", "test(dualP0 ? 'P0 single-root original/workbench and native-workspace scene preservation' : applicationShellMode ?")
replace("timeout: 90000", "timeout: 120000")
replace("  if (journalB) {", "  const journalC = dualP0 ? await (await import('./fixtures/session-journal-host.mjs')).sessionJournalHost(root, 'C') : null;\n  if (journalC) host.sessions.set('C', { id: 'C', header: { cwd: root } });\n  if (journalB) {")
replace("return journalB ? { items: [...a.items,", "return journalB ? { items: [...a.items, ...(journalC ? (await journalC.service.list()).items : []),")
replace("return (request.address.sessionId === 'B' && journalB ? journalB : journal).service.follow", "return (request.address.sessionId === 'C' && journalC ? journalC : request.address.sessionId === 'B' && journalB ? journalB : journal).service.follow")
replace("  if (applicationShellMode) sdkAssets.push", "  if (dualP0) sdkAssets.push(['workspace-controller', '@deepseek-ai/dsh-api-workspace-controller']);\n  if (applicationShellMode || dualP0) sdkAssets.push")
replace("await readFile('layout/lib/client.js', 'utf8')", "await readFile(dualP0 ? 'p0/dist/layout-client.js' : 'layout/lib/client.js', 'utf8')")
replace("nativeHmr: nativeHmrMode })", "nativeHmr: nativeHmrMode, dualP0 })")
replace("  const childURL = await listen(child)", "  if (dualP0) {\n    assets.set('/ui-layout-base.js', {type:'text/javascript', body: await readFile('p0/vendor/ui-layout.rc3.js','utf8')});\n    const baselineHtml = assets.get('/').body.replace('/ui-layout.js', '/ui-layout-base.js').replace('<div id=\"app\"></div>', '<header style=\"height:44px;box-sizing:border-box;padding:12px;background:#edf2f8\">未改动的安装版原版布局对照 · 隔离数据</header><div id=\"app\" style=\"height:calc(100% - 44px)\"></div>');\n    assets.set('/baseline', {type:'text/html',body:baselineHtml});\n  }\n  const childURL = await listen(child)")
replace("() => window.testNative || window.fixtureBootError", "() => window.testP0 || window.testNative || window.fixtureBootError")
replace("  if (nativeShellMode) {\n", "  if (dualP0) {\n    const evidence = await (await import('../../p0/scenario.mjs')).runScenario({page, context, url, childURL, metrics, errors, browserConsole, iframeLoads:()=>iframeLoads});\n    await page.evaluate(() => window.testP0.dispose());\n    assert.deepEqual(errors, []); assert.equal(metrics.spawn,0);\n    await writeFile('test-output/p0-result.json', JSON.stringify({evidence, metrics, errors, browserConsole, journals: [journal.metrics,journalB.metrics,journalC.metrics]}, null, 2)); complete = true; return;\n  }\n  if (nativeShellMode) {\n")
# The scenario import is relative to test/workspace-native-browser.mjs.
text = text.replace("import('../../p0/scenario.mjs')", "import('../p0/scenario.mjs')")
path.write_text(text,encoding='utf-8')
print('Adapted isolated test harness; no product/live files touched.')
