import { installApplicationShell } from './application-shell.mjs';
export const inject = ['slots', 'theme', 'shortcuts', 'uiSession'];
export function apply(ctx) {
  const shell = installApplicationShell(ctx);
  ctx.effect(() => () => shell.dispose());
}
