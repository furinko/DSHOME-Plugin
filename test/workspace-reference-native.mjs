// Separate test worker: no change to production or another test's process.
process.env.WORKBENCH_NATIVE_REFERENCE = '1';
await import('./workspace-native-browser.mjs');
