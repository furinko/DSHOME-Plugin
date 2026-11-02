// Focused, isolated actual-SDK toolbar regression. No live profile is loaded.
process.env.WORKBENCH_TOOLBAR_ONLY = '1';
await import('./browser.mjs');
