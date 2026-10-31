const defaults = { files: '文件', document: '文档', terminal: '终端', web: '网页', note: '便笺' };
export function fileName(path) { return String(path ?? '').split(/[\\/]/).filter(Boolean).at(-1) || '未命名文档'; }
export function panelCaption(panel, item) {
  if (panel.title !== defaults[panel.kind]) return panel.title;
  if (panel.kind === 'document' && item?.document?.getSnapshot().version != null) return fileName(item.document.getSnapshot().path);
  if (panel.kind === 'web' && item?.url) { try { return new URL(item.url).hostname; } catch {} }
  return panel.title;
}
export function friendlyError(error) {
  const messages = {
    FS_STALE_VERSION: '文件已在外部修改。你的草稿已保留，请先比较磁盘，再决定采用哪个版本。',
    WORKBENCH_PROJECT_CHANGED: '工作区位置已变化。原草稿仍保留，请回到所属工作区后再保存。',
    WORKBENCH_SERVICE_CHANGED: '连接在保存期间发生变化。请先核对磁盘结果，草稿已保留。',
    FS_SANDBOX_DENIED: '当前工作区无权访问这个路径，请检查文件位置和宿主授权。',
  };
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : typeof error?.message === 'string' ? error.message : String(error);
}
