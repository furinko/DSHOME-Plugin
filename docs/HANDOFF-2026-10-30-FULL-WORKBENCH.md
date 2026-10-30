# DSHOME 整窗工作台交接 · 2026-10-30

## 先读结论

本次按用户“先写交接文档，然后带交接一起提交推送”交接源码，**不是功能全部验收通过，也不是装载许可**。目标远端为 https://github.com/furinko/DSHOME-Plugin.git 的既有 main，不新建分支、不强推。

交接前远端 main 与开发目录 HEAD 均为 `dd9ccda18da1da41c77f5fcbf3d454a895581b5f`。本文件随本轮新增代码一起提交；最终推送哈希以 Git 历史/远端读数为准，不在提交内循环写自己的哈希。

- 开发目录：`C:/Users/kuro/.dsh/repos/DSHOME-workbench-next`，既有本地分支 `feat/workbench-next`。
- **注意 origin 指向本地 `DSHOME-Plugin`，不是 GitHub！不要默认 git push origin。** 本轮明确向上面的 GitHub URL 推送 `HEAD:refs/heads/main`。
- 运行关联目录 `DSHOME-Plugin` 只读核对为干净 `7b502cca7bb02ca2c383c4dde03a677c24d06c33`。本轮不切换、不构建、不写此目录，不改 profile/依赖 junction，不重启、不装载。

## 已实现与本轮增量

沿用真正原版/整窗工作台双模式、原生会话输入、右侧聊天；工作区共享操作现场但执行权限按当前会话核验。

1. 真实目录、文档编辑、版本冲突比较/明确采用基线、未知写入回执核对、显式引用原生对话。多文档独立草稿与保存。
2. 多实例网页、便笺、真实SDK终端；终端所有权不因切会话转移，关闭保护与未确认任务可见。
3. 布局元数据与内容分离：预设、应用/取消/撤销、分隔调整、拖入分割或标签、交换、放大还原、收起展开；保持同一编辑器/iframe/终端和输入实例。布局不存草稿、URL、进程身份，重载不重放命令。
4. 实际IndexedDB损坏备份恢复、事务中止、双页CAS冲突；布局恢复不写文档或清除当前草稿。
5. 可信组件注册、每实例有界JSON状态、提供者撤回/重注册与旧回调拒绝、局部渲染错误导出及恢复。它不是代码沙箱，不授权文件/终端或AI操作，也不代表任意原生应用/表格工具已交付。
6. 连接换代保留旧草稿，新现场不借旧权限；保留现场可导出、确认释放并回收容量。旧活跃终端有独立 close-only 收尾：当前须为原所属会话、Host项目必须匹配、新租约前后核验、成功回执后才移除内容；不恢复旧终端输入。SDK close只接收两个参数，不能承诺撤回已发出的关闭动作。
7. 修复原生侧栏已收起但仍遮挡主操作区的问题；限定工作台模式隐藏，原版不改。

代码入口：`src/workbench/{desktop-runtime,shared-entry,shared-files,workspace-authority,retained-terminal-close,controller,ui,module-registry,module-view}.mjs`；整窗装配接缝为 `p0/build.mjs`、`p0/extension.mjs`。

## 验证读数与不能夸大的部分

- 整窗真实SDK/FS/Gateway WebSocket/PTY浏览器最新 `active-generation-recovery3-20261030.log` 通过。4次PTY创建、4次终止、5次关闭回执（含一次幂等重试）、activeRetains=0。
- 故意模块抛错与丢关闭回执会产生预期浏览器诊断，按精确阶段核验并保留；不是“日志零错误”。工作区目录装配、导航、权限答复与连接代际通知含明确夹具，不是生产GUI/登录授权验收。
- 最新基础测试275项：271通过、**4失败**、0跳过；均在Windows符号链接夹具创建处EPERM，未算通过，相关真实符号链接面在本机未验。
- 双模式基础17/17；旧selector10/10、自检67/67、DOM114/114；当前构建、实际SDK registry与git diff --check通过。
- 旧侧栏服务替换、关闭失败/丢回执、实际断线40行离线输出恢复分别通过。不能拿旧侧栏结果冒充整窗覆盖。
- 独立Linux Bash PTY测试在本Windows固定`/bin/bash`而失败，未跳过洗绿。部分旧浏览器测试已补CMD+Node实际父PID观察。
- 两次真实Host关闭失败仍未解释，其中一次提示`terminal cleanup failed; surviving pid: 0`；后续等待shell就绪输出的运行通过，不能据此断言根因或稳定性已修复。

本轮随Git保留选定原始合成证据在 `test-output/`，包括最新结果与代表性失败；其余本机历史日志仍留本地，不全部发布。所有证据只来自隔离测试，无用户生产对话/凭据。详见 `ACCEPTANCE-MATRIX-2026-10-30.md` 和各PROGRESS文档；早期文档的“未实现”或测试计数只对应当时阶段。

## 独立复核阻塞

业务任务：`task-从已装载且用户确认布局正常的7b-cyiaj` 已交卷，**未采纳**。
复核任务：`task-对DSHOME整窗候选任务tas-qvnl4` 待决，没有成功创建复核员，也没有复核票。

已经完成正式task_attach，但member_spawn仍被“通用文件工具·不越授”拒绝：候选源码不在部署层 `memberFileAccess.read` 可授上限。主会话danger-full-access与成员可授读域不是同一设置。不得用普通不受管代理绕过、自己给自己出票或把推送当验收。

恢复需部署者给复核员开放必要源码、测试、文档和指定证据的只读上限，不需要写权限；随后恢复**原**复核任务。未声称当前Mind设置页有这个控件，也未为此修改Mind配置或运行代码。

## 接手顺序

1. 确认当前路径、远端、分支及生产关联目录，避免在运行目录直接拉取main触发更新。
2. 读本交接、验收矩阵和 `RETAINED-TERMINAL-RECOVERY-PLAN.md` 的最新实现段。
3. 先补独立复核；重点检查共享权限竞态、跨代close-only回执、服务替换、布局内容身份及损坏恢复。四个symlink测试建议在允许建立符号链接的隔离环境复跑，不放宽产品路径保护。
4. 调查Windows关闭失败的具体Host回执/生命周期；保留失败，禁止循环重试到绿后删除旧证据。
5. 整体完工须重新逐项核对验收标准；需要改代码则形成新的交卷指纹，不沿用旧票。生产装载、重启和推送都仍须各自当前授权。

## 复跑

使用匹配公开SDK `0.2.1-rc.3`，依赖准备方式见已有SDK fixture文档，不修改共享junction。此机Node位于 `C:/Users/kuro/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin`；SDK根为 `C:/Users/kuro/.dsh/repos/audits/dshome-v2-deploy-20261028/sdk`。

设置 `DSH_SDK_ROOT`；浏览器指定已有Chrome的 `WORKBENCH_BROWSER`。在开发目录执行：

```sh
node scripts/build.mjs
node scripts/run-local-regressions.mjs test
node scripts/run-local-regressions.mjs test:dual
node scripts/run-local-regressions.mjs test:foundations
node test/client-registry.mjs
node --test p0/browser.mjs
```

`p0/browser.mjs` 的默认SDK/Chrome路径针对本机，其他设备须显式覆盖环境变量。部分旧测试仍有平台限制。不要用多个同时写同名test-output文件的浏览器包装器并行运行。

## 旧冻结指纹

交接前冻结清单221文件，摘要 `acf1ca087e54f64cbd87cd34a8c024a880a212219e70a05b3ff30a472443cf78`，随后逐文件复验221/221匹配。原始manifest保留为历史证据，不在本次交接时重写成“已审查”。本交接和新增证据发布属于之后的文档增量；独立复核应以最终提交为新快照确认，不能自动沿用旧目录树交卷。
