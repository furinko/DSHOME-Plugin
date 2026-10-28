// Actual published client Session Controller over native Gateway streams.
// Host event journal and admission are explicit bounded fixtures; no LLM.
process.env.WORKBENCH_NATIVE_HISTORY = '1';
await import('./workspace-native-browser.mjs');
