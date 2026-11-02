# 鲸鱼工作台：紧凑切换入口（2026-11-02）

## 范围与状态

基于本机 DSHOME-Plugin/main `752a2a0`，独立候选目录 DSHOME-whale-toolbar，分支 `feat/whale-toolbar-20261102`。只改候选源码、测试与构建产物；没有修改实际装载目录、profile、安装或私人数据，没有装载、重启或推送。本记录不是生产或独立验收凭据。

- 删除根外壳独占的 52px 模式切换行；原生 AppFrame 保持完整高度，并继续拥有原有 Windows 标题栏占位和拖拽区域。
- 原版入口进入现有 `conversation.session.header.utilities`；空白会话复用已有 Hero options，不另建模式行。
- 整窗入口进入已有工作台标题栏，显示为“原版 / 鲸鱼工作台”；工作台标题和侧栏页签同步改名。保留窄窗聊天/操作区互换与保留现场恢复入口。
- 全局页面没有会话工具栏，使用小型悬浮备用入口，不增加布局行、不改变全局页面选择；暂无确认工作区或工作台服务时同样可回原版。
- 不改 `original` / `workbench` 内部模式、布局存储键或会话/内容/权限模型；不移动 iframe、编辑器、终端或聊天输入 DOM。

## 测试与证据

最终专项命令：`node --test p0/toolbar-browser.mjs`（或 `npm run test:toolbar`）。实际公开 rc.3 SDK + Chrome，工作区记录、导航、授权与会话日志是显式夹具，不是正在使用的 GUI。

- 最终专项：1/1，零跳过；包含原版对照精确几何、零额外模式行、原生/工作台插槽、空白会话、全局页面不导航、根实例保持、1920/1366/1040/760/520/390px、窄窗原有工具无越界，以及 Windows 32/40/48px 标题栏和全屏属性下的拖拽/控件不重叠。没有将 Chromium CSS 检查冒充 Electron OS 命中测试。
- 日志 `toolbar-final-02.log`；结构化结果 `test-output/toolbar-result.json`；预览 `test-output/whale-toolbar.png`、`whale-toolbar-original.png`、`whale-toolbar-narrow.png`、`whale-toolbar-narrow-chat.png` 和 `dual-windows-titlebar.png`。
- 既有 selector 10/10、selftest 67/67、DOM 114/114；dual 模型 19/19。日志 `legacy-regression.log`、`dual-regression.log`。
- 基础回归使用实际 SDK：287 项，283 通过、4 失败、0 跳过。四项均在 Windows 创建测试 symlink 时 EPERM，不计通过，未改变权限或弱化断言。原始日志 `foundations-sdk.log`。首次未配置 SDK 的三项加载失败保留于 `foundations-regression.log`，随后补配置重跑。
- 整窗集成未全绿。attempt-01 因原生 scrollbar 临时 hover class 的对照差异失败；对照仅规范该瞬态类并显式排除新增入口。attempt-02 因保留现场新增多个隐藏挂载点导致旧测试 selector 不唯一；仅改为查找可见恢复入口。attempt-03 已执行文档保存/冲突、网页与聊天/便笺保持、Windows 标题栏、布局与旧现场恢复等步骤，但最后多终端关闭出现 SDK `terminal cleanup failed; surviving pid: 0` 并超时；没有静默重试、替换成功回执或删改该测试。该次属于最终窄窗工具微调前的候选，不能视为最终版本整窗通过。失败日志 `browser-attempt-01/02/03.log` 和最近的 `test-output/native-browser-failure.json` 保留。

## 未验与后续

完整 Windows PTY 关闭回归、独立审查、生产装载/真实窗口命中和 OS IME 未完成。本次 UI 专项通过不等于整个工作台全绿。后续装载仍需本次单独明确同意，装载前保存/导出真实草稿并处理终端，不自动刷新当前页面。
