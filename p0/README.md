# P0：同一根外壳中的原版／工作台

本目录是原隔离原型的基础实现；本仓库现按用户“准备并装载这一版”的选择加入正式包封装，见[装载说明](<../docs/DUAL-SHELL-P0-LOAD.md>)。不是完整工作台，源码准备或测试通过不代表已经装载。运行源、配置与私有数据不由本目录的构建测试修改。

## 入口

- [build.mjs](<build.mjs>)：核对安装版公共布局的 SHA256，应用显式组合补丁，生成 [layout-client.js](<dist/layout-client.js>)。
- [extension.mjs](<extension.mjs>)：原版／工作台切换、操作区、原生聊天右置、尺寸调整和窄窗切换。
- [scene-store.mjs](<scene-store.mjs>)：真实 `workspaceId` 归属及连接代际内的共享现场；不以目录路径当工作区身份。
- [browser.mjs](<browser.mjs>)、[scenario.mjs](<scenario.mjs>)：真实 SDK/Chrome 对照和交互回归；自动启动并关闭仅测试用的临时回环服务。
- [上游来源](<vendor/PROVENANCE.json>)与[补丁清单](<dist/build.json>)：可检查的源字节、输出哈希和逐段改动。

所有链接相对于本说明。不要执行历史部署脚本。本候选的根构建已接入双布局封装，以[主构建脚本](<../scripts/build.mjs>)及[当前装载说明](<../docs/DUAL-SHELL-P0-LOAD.md>)为入口。

## 核心选择

不是在旧外壳上增添一个“专注聊天”按钮，也不是用 iframe 再嵌套一份 DSH。只注册一个 root，保留安装版官方 `AppFrame`、`LayoutController`、原始子插槽、主题和原生 `Conversation`。一个额外的 44px 顶栏切换模式；原版分支保留上游列宽计算，工作台分支为“导航｜操作区｜原生聊天”。全局页面仍走原来的 `main` 插槽。

官方布局未公开导出 `AppFrame`，因此原型采用**固定版本的明确组合补丁**：vendor 源字节不变；构建必须命中唯一锚点，否则停止。未修改安装包，也不从浏览器对象中偷取私有 React 组件。将来若上游提供正式组合入口，应替换此兼容层。

操作区在 root 层持续挂载，位于会话作用域外。每个现场有稳定 DOM 父节点；模式、左右／上下分栏及同工作区会话切换不做 DOM 搬家。内容为真实可编辑内存便笺和一个沙箱 iframe，**不是文件编辑器，也不是完整浏览器**。

## 边界

- 工作区关系来自公开 `WorkspaceController.list`；隔离测试的具体工作区、会话日志、导航、授权答案和设置传输是合成夹具。不能把测试截图叫作正在运行的 DSH 界面。
- 当前连接代际对象 + 原生 `workspaceId` 确定现场，不使用路径、origin 或自行猜测的账号 ID。断连／新代际不自动绑定旧现场；保留旧内存数据但不声明跨账号或重连恢复已实现。
- P0 没有文件保存、终端执行、网页内容提取或 AI 操作适配器。没有把 A 会话的执行权限带给 B；真实可写／只读工具组合的验收仍属后续阶段。
- iframe 仅显式打开 HTTP(S) URL，拒绝地址中的凭据及本 DSH origin。`sandbox="allow-scripts allow-forms"`，不授予同源身份、弹窗、顶层导航或宿主桥。页面可能因站点策略拒绝嵌入；load 事件不是可用性证明。
- 便笺不落盘；页面表单由网页自己管理；没有命令重放、自动恢复、旧存储迁移或退出保存承诺。
- 最多保留 8 个现场，达到上限拒绝新现场，不静默淘汰脏内容。完整关闭、插件卸载恢复及资源配额治理未作为 P0 成品实现。
- OS 原生 IME、真实批准弹窗、完整设置页、平台窗口标题栏、Electron webview、登录态和生产插件组合仍需后续真实客户端验收。

## 复现

在候选仓库根目录，使用 Node 22+、现有依赖和与记录一致的公开 rc.3 SDK：

```sh
node scripts/build.mjs
node --test p0/scene.test.mjs p0/abort.test.mjs
DSH_SDK_ROOT=/absolute/path/to/rc3-sdk WORKBENCH_BROWSER=/absolute/path/to/chrome node --test p0/browser.mjs
```

本机 `node_modules` 和 `.dev-sdk` 为指向旧隔离候选依赖的 junction，仅用于读取依赖；本次未安装或更改依赖。浏览器默认使用 Windows 已安装 Chrome，不下载浏览器，不连接 9388，不借用任何生产登录状态，也不调用模型。

测试输出在候选的 `test-output/`；最终结果与失败历史将汇总到独立审计报告。本说明解释实现和复现方式，不自行构成通过票或生产验收。
