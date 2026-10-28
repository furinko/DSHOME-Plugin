// Settings transport/persistence is an explicit fixture; ThemeRuntime, token
// sheets, media-query resolution, events and AppFrame presenter are actual SDK.
export async function nativeThemeSettings({ ctx, consume, store }) {
  const themeState = store.createSnapshotStore({ value: { preference: 'light', fontSize: 14, codeFontSize: 11, terminalFontSize: 13, textFontFamily: '', codeFontFamily: '', terminalFontFamily: '' } });
  const writes = [], themeForm = { ...themeState, async set(field, value) { writes.push({ field, value }); themeState.set({ value: { ...themeState.getSnapshot().value, [field]: value } }); } };
  const settings = store.createSnapshotStore({ value: {} });
  ctx.reflect.provide('configForms', { get: namespace => namespace === 'ui-theme' ? themeForm : settings, developerTools: { enabled: { getSnapshot: () => false, subscribe: () => () => {} } } });
  const theme = ctx.plugin(consume('@deepseek-ai/dsh-client-ui-theme')); await theme;
  return { writes };
}
