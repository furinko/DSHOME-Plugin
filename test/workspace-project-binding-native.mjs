// Real native Session/Chat/Sidebar/Input/PTY/FS chain with explicit isolated
// Host policy changes and post-write response-identity fault injection.
process.env.WORKBENCH_NATIVE_PROJECT_BINDING = '1';
await import('./workspace-native-browser.mjs');