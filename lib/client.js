// dshome-plugin — browser client module.
//
// Registers three independent features against one plugin id:
//   · theme        — brand accent tokens + brand slots
//   · conversation — card isolation + think line window
//   · minimap      — VSCode-style turn thumbnail navigation
//
// Every feature is optional and isolated: a failure in one leaves the others
// running, and the worst possible outcome is a missing feature, never a broken
// UI. The module is loaded through the host's module loader, so it must speak
// the loader's factory protocol rather than plain ESM.

import { applyTheme } from './theme.js';
import { applyConversation } from './conversation.js';
import { applyMinimap } from './minimap.js';
import { safe } from './shared.js';

/** Shown as a badge next to the brand name. */
const VERSION = 'v0.1.0';

window.__ModuleLoader__.load({
  id: 'dshome-plugin',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const jsx = require('react/jsx-runtime');
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    // `slots` is required for brand registration; theme tokens and the minimap
    // do not depend on it.
    const inject = ['slots'];

    /**
     * Options are read off a single global so behaviour can be adjusted at
     * runtime without a rebuild.
     */
    const options = Object.assign(
      { theme: true, conversation: true, minimap: true, hideOfficialRail: true },
      window.__dshomePlugin || {},
    );

    function apply(ctx) {
      if (options.theme) {
        safe(
          () => applyTheme(ctx, { jsx, primitives, version: VERSION }),
          'dshome-plugin: theme failed',
        );
      }
      if (options.conversation) {
        safe(() => applyConversation(), 'dshome-plugin: conversation failed');
      }
      if (options.minimap) {
        safe(
          () => applyMinimap({ hideOfficialRail: options.hideOfficialRail }),
          'dshome-plugin: minimap failed',
        );
      }
    }

    module.exports = { name: 'dshome-plugin', inject, apply };
    // The loader materialises the factory's *return value* as the plugin body,
    // so it must be returned explicitly.
    return module.exports;
  },
});
