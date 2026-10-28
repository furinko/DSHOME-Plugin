// Actual published Conversation.content and InputBar/Lexical DOM. Session
// data/adapter and the UserText preview are still explicit fixtures.
process.env.WORKBENCH_NATIVE_COMPOSER = '1';
await import('./workspace-native-browser.mjs');
