// Presentation only: the SDK owns identity, creation, stream epochs and input.
export function terminalState(state) {
  const phase = state.phase, info = state.info, canInput = phase === 'connected' && state.writable === true && info?.state === 'running';
  const retry = ['failed', 'disconnected'].includes(phase) ? info ? 'connect' : 'start' : null;
  const phaseLabel = { idle: '尚未启动', loading: '读取终端环境', creating: '启动中', connecting: '连接中', connected: '已连接', disconnected: '连接中断', closing: '关闭中', closed: '已关闭', failed: '操作失败' }[phase] ?? '状态未知';
  const status = info?.state === 'exited' ? `进程已退出${info.exitCode == null ? '' : '（' + info.exitCode + '）'}` : phaseLabel;
  const help = state.issue === 'missingTerminal' && info ? '原终端不可用；不会自动创建替代进程。' : phase === 'disconnected' ? '输入已停用；断线期间的按键不会重放。恢复连接只附着原终端，不会新建进程。' : null;
  return Object.freeze({ canInput, retry, retryLabel: retry === 'start' ? '重试启动' : retry === 'connect' ? '重新连接' : null, status, help });
}
export function retryTerminal(view) {
  // Read NOW, not the render's earlier phase; never allocate for a confirmed ID.
  const action = terminalState(view.state.getSnapshot()).retry;
  if (action === 'start') return view.refresh();
  if (action === 'connect') return view.connect();
  return false;
}
