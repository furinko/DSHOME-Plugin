# 文件树与拖动交互整理 · 2026-11-02

独立候选 `feat/files-docking-20261102`，基于 `afb8afe`。未部署、推送或升级 DSH。生产 checkout、profile、Mind 与私人数据未改动。

## 本轮行为

- 左侧文件浏览器增加本机文件分组：选择入口、已打开文件、筛选、点击回到同一文档，以及无写入句柄时的“副本”标记。顶栏不再另放本机入口。关闭文档后列表同步移除；这是本次现场的文件列表，不宣称全盘目录浏览或跨重启恢复。
- 工作台捕获文件 dragenter/dragover/dragleave/drop，防止冒泡到原生文档级附件监听。跨入工作台时用 dragend 通知清除已有附件提示；操作区外仍交给原生附件。布局编辑时不接收文件。目录用 entry/handle 双检查拒绝，多个文件逐个报告错误。
- 模块标题与标签改为 pointer 手势，8px 内仍是点击；拖动时捕获指针、显示跟随名称与区域预览，松开才提交布局，Esc/失焦/取消/模式变化终止。标题操作按钮不触发拖动。自身单标签面板不提示无效分屏，紧凑或最大化状态不启用直接停靠。保留布局编辑作为替代操作。
- 拖动不改变内容 DOM 的父节点和 key，文档草稿、网页和终端继续沿用原生命周期。布局 revision 变化拒绝过期落点。没有变更存储键、权限模型或依赖声明。
- 收紧工作台标题高度，让内容区域占据更多空间。

## 参考与适配

用户指定 [淋雨家工作台](https://github.com/mashanglinyu/luanyujia-workbench)。阅读其 `11-最小可运行壳/index.html` 与 `12-源码照搬/外壳/renderer/{renderer.js,renderers.js,styles.css}`：借鉴文件→预览联动、紧凑面板标题、指针阈值、拖完抑制点击和落点反馈。未复制其实现或引入依赖。其独立 Electron 桥、全盘读写、场景会话机制不适用于直接替换本插件的 Host 权限与共享会话，因此未迁移。

## 验证与限制

证据在 `audits/files-docking-20261102`：

- `browser-03.log`：真实 SDK/Chrome 整窗回归通过。新增小距离不移动、Esc 不提交、停靠后编辑器实例/草稿保持、本机列表、实际 SDK 附件监听代码的区域分流检查。SDK intake 使用计数夹具，不进行真实上传。
- selector 10/10、selftest 67/67、DOM 114/114、dual 19/19；内容键入口、exports、Host 与布局客户端注册解析通过。
- 基础 289 项：285 通过、4 项 Windows symlink EPERM 失败、0 跳过。此前 287 项基础增加的两项 controller 测试计入本轮总数。local-file 2/2 通过。
- `browser-01.log` 保留测试夹具提取 SDK 监听代码时遗漏 droppedDirectories 的原始失败；补齐原始 SDK 辅助函数后通过。`foundations.log` 保留沙箱 esbuild 限制，`foundations-02.log` 保留缺少 DSH_SDK_ROOT 的配置失败，`foundations-03.log` 是正确环境下的结果。
- 最后取消清理修复后重新构建，并运行 `toolbar-final.log` 专项与 `registry-final.log`。截图来自隔离夹具，非生产 GUI。

没有独立复核或实际桌面验收。Windows 资源管理器拖入、Electron 系统选择器与跨 iframe 拖入仍需实际 GUI 检查；历史 PTY 清理失败不因本轮通过而宣称普遍解决。本机文件仍仅支持有界 UTF-8 文本，句柄不持久化；原文件保存受浏览器能力/许可限制，不提供跨进程原子 CAS 保证。

部署仍需单次明确授权，离线核对、备份、回退引用和快进；本次没有启动或停止实际 DSH。
