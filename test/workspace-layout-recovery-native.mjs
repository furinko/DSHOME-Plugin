// Full native client Session/Chat/Sidebar/PTY chain plus actual browser
// localStorage and cross-page Web Locks. Not the running production GUI.
process.env.WORKBENCH_NATIVE_LAYOUT_RECOVERY = '1';
await import('./workspace-native-browser.mjs');
