process.env.WORKBENCH_APPLICATION_SHELL = '1';
process.env.WORKBENCH_NATIVE_CHROME = '1';
await import('./workspace-native-browser.mjs');
