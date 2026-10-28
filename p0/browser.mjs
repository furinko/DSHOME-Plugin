import { resolve } from 'node:path';
process.env.DSH_SDK_ROOT ??= resolve('../audits/dshome-v2-deploy-20261028/sdk');
process.env.WORKBENCH_DUAL_P0 = '1';
process.env.WORKBENCH_NATIVE_CHROME = '1';
process.env.WORKBENCH_BROWSER ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await import('../test/workspace-native-browser.mjs');
