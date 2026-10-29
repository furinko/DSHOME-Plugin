# DSHOME 整窗工作台开发交接 · 2026-10-29

## 交付性质与当前要求

本次按用户「写个交接文档，然后连项目带交接文档提交推送到远端，不要建分支」保存当前开发成果。**这是进行中的开发交接，不是全部功能完成、独立验收通过或已装载声明。** 本次停止扩展开发；下一位接手者从下面的剩余清单继续。

- 开发目录：`C:/Users/kuro/.dsh/repos/DSHOME-workbench-next`，已有本地分支 `feat/workbench-next`，开发基线 `7b502cc`。
- 本机运行目录：`C:/Users/kuro/.dsh/repos/DSHOME-Plugin`，交接前只读核对为干净 `main` / `7b502cc`。不在这里编辑、拉取、构建或切换。
- GitHub：`https://github.com/furinko/DSHOME-Plugin.git`。推送前远端已有 main=`be204e518b867aef6a298303b14758dc164d34f9`；它是开发 HEAD 的祖先。本次目标为既有 `main`，非强制推送，不新建分支。
- 开发目录的 `origin` 实际指向本机运行目录，**不是 GitHub**。发布应显式使用上述 HTTPS URL，不对本机 origin 执行 push main。
- 未装载、未重启、未更改 profile 或私人资料。后续装载仍需用户明确同意。GitHub 更新不证明本机 renderer 更新。
- 包版本/描述仍为早期 `0.3.0-dual.0-dev` / P0 描述，README 与早期装载说明也不是本轮完整功能声明；正式发布前统一更新。

## 本轮已接入的实际代码路径

1. [整窗入口](<../p0/extension.mjs>)通过 `dshomeDesktop` 服务渲染真实工作台，保留上游 AppFrame 与唯一 React root、真实原版模式及右侧原生聊天。旧 P0 Scene/便笺代码还在，但已不作为新整窗工作台的渲染路径。
2. [desktop-runtime](<../src/workbench/desktop-runtime.mjs>)按原生 workspace scene 保留 entry；同工作区 A/B 会话共享操作内容，C 所属另一工作区隔离。原生 header/hero slot 提供 InputSeat，不伪造聊天输入接口。
3. [workspace-authority](<../src/workbench/workspace-authority.mjs>)为每次操作捕获当前会话、工作区及连接代次租约。会话变化、成员关系撤回/歧义、连接中止会使旧租约失效，A→B→A 不复活旧请求。
4. [shared-files](<../src/workbench/shared-files.mjs>)每次文件请求先确认当前宿主 project，再调用真实 read/list/save；校验项目及保存目标回执。UI 旧 session 参数不充当授权。文档保存沿用宿主受控文件服务与版本 CAS。
5. [shared-entry](<../src/workbench/shared-entry.mjs>)接真实 ClientTerminals；每个 entry 隔离实际服务名 `webTerminals`。终端保留创建者会话，切到 B 不借 A 的权能写入。关闭授权先检查，拒绝时不创建假的待关闭任务。
6. [controller](<../src/workbench/controller.mjs>)支持动态当前会话、按原 owner 保留/关闭终端；文档、网页、文件与终端实例不归布局节点所有。
7. [ui](<../src/workbench/ui.mjs>)复用四类实际工具、预设、布局事务、版本化存储/恢复、关闭保护；[layout-drag](<../src/workbench/layout-drag.mjs>)增加编辑预览中的四边分割/中心标签合并。拖放 token 单次且绑定当前草稿。
8. 文档选区显式插入原生输入草稿，不提交消息、不替换整份草稿。回跳检查会话、工作区、根目录、内容 hash 与引用接口代次；明确关闭的工作台可凭有效引用重新装配。
9. 整窗 entry 纳入配置更新 preflight；未保存内容、网页/终端、布局编辑等增加 beforeunload 提醒。明确关闭操作现场后可释放资源并重新打开。**HMR/强制卸载不保证现场保留。**

## 已修复的联调问题

- 第二工作区创建 ClientTerminals 时，隔离错了服务名，造成 `webTerminals has been registered`；改为隔离真实服务名。
- 关闭现场后异步释放期间仍渲染已关闭 controller，导致原生 root error boundary 清空页面；先同步移除 entry，再等待释放，并计入 retiring/busy。
- 同一插件 reentrant apply 时没有注销 `dshomeDesktop` 服务；保存并执行 provide 的 disposer，真实 SDK 连续替换测试通过。
- 根目录预检拒绝发生在写入之前，却被标为保存结果未知；`WORKBENCH_PROJECT_CHANGED` 现在按确定拒绝处理。写后回执不匹配仍不能冒充确定未写。
- 成功回执缺少对象结果时，改为明确 INVALID_RECEIPT，避免 TypeError 或错误采纳。

## 验证与证据边界

可携带的原始日志及精简浏览器证据见 [evidence/2026-10-29-desktop](<evidence/2026-10-29-desktop/>)。

| 检查 | 实际结果 | 限定 |
|---|---|---|
| 构建 | 成功 | 12 个上游 patch 锚点、单 root；不是生产装载 |
| 基础＋新增租约/文件/拖放测试 | 259 项，255 通过、4 失败、0 跳过 | 四项均 Windows 创建 symlink 的 EPERM；失败保留，不能写全绿。该全量运行早于最后的根目录拒绝分类/畸形回执小修，后者有下面的最终针对性复跑 |
| 原生 SDK assembly＋P0 模型组 | 17/17 | 连续 reentrant replacement；不是整窗热更新现场无损承诺 |
| 最终整窗浏览器＋document＋shared-files | 15/15 | 其中 1 项为完整浏览器场景，另 14 项单元测试 |
| 旧 selftest / domtest | 命令成功，详情见日志 | 未重跑所有历史 browser wrapper，不能据此宣称全部遗留原生场景绿 |

[整窗场景](<../p0/full-scenario.mjs>)实际覆盖：原版原生 DOM 对照、独立聊天草稿、真实读写、A/B 共享与 W1/W2 隔离、外部写入版本冲突及显式恢复、宿主根目录变化拒绝旧文件写入、原生草稿引用与回跳/跨会话拒绝、关闭后重新打开引用、真实 Windows CMD PTY 输入输出及关闭、非 owner 禁止输入、网页表单保留/取消关闭、预设/模式切换稳定 DOM、真实拖放合并标签、多网页实例、布局刷新恢复与不重放命令、配置更新阻挡、窄窗焦点、深色主题、旧侧栏共存及 Windows 标题栏 CSS 几何。

真实部分是隔离安装的公开 rc.3 SDK、浏览器、文件服务、Gateway 和实际 OS PTY。工作区目录表、导航、授权答复及会话日志是测试夹具；没有生产测试消息。Windows 拖窗检查是 CSS/命中区域，不是 Electron OS 拖动验收。引用回跳主要经公开 API 驱动，不能冒充所有历史消息节点交互均已回归。独立复核未完成，生产 GUI 未验收。本轮委派曾受 memberFileAccess 范围限制，未绕过创建代理。

## 仍需完成/核对的事项（优先级）

1. **保留旧能力的差距**：旧便笺不在新的四模块整窗路径中；需决定并实现独立便笺模块/迁移或明确产品处理，不能宣称便笺已由文档编辑器等价保留。
2. **开放模块扩展**：模型有模块登记基础，但整窗的外部模块 renderer/能力注册与生命周期公共契约尚未完整交付；代码/表格/自制工具或原生应用不能因有 iframe 就宣称已经接入。不要伪造跨域网页读取或 AI 操作能力。
3. **断线与撤权端到端矩阵**：已有租约单元负例和真实根目录变更拒绝；仍需整窗 browser 下服务撤回/重新提供、连接代次变化、A→B→A 在途保存/创建终端、权限中途撤回、终端关闭失败/重试的完整覆盖。检查旧 scene 保留上限与用户可见恢复入口，避免只留下不可操作的旧现场。
4. **布局恢复异常矩阵**：正常刷新恢复已测；损坏、未知版本、跨标签页 CAS 冲突、备份/配额失败等模型/旧 UI 测试已有，需迁移并跑整窗真实存储路径。不要把所有旧 wrapper 当作已执行。
5. **多实例细节**：多网页与拖放已实测；多文档目标实例、多个终端分别归属 A/B、未知模块恢复、所有分割/交换/收起/放大组合及可访问性继续逐项核验。
6. **发布收尾**：统一版本、README、装载说明、场景名（测试名仍叫 P0）、入口及构建产物清单；已有内容寻址入口可能保留中间版本，先确认引用再清理。核对干净安装/pack/真实 registry，补 Linux 与 Windows 全矩阵和独立复核。
7. 仍需对照批准 SVG 与完整需求逐项验收，不能把当前实现/测试列表当作整个目标已完成。不要自动装载、重启、改变权限或推送新开发成果。

## 接手复跑

在隔离开发目录执行；Node 要满足 package engines。此机器 Bash 默认没有 node/npm，实际用：

```bash
export PATH=/c/Users/kuro/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin:$PATH
export DSH_SDK_ROOT=C:/Users/kuro/.dsh/repos/audits/dshome-v2-deploy-20261028/sdk
node scripts/build.mjs
node --test p0/browser.mjs test/document.mjs test/shared-files.mjs
node --test test/workspace-client-assembly.mjs p0/scene.test.mjs p0/abort.test.mjs p0/layout-edit.test.mjs p0/panels.test.mjs
node test/selftest.mjs
node test/domtest.mjs
```

完整基础命令取 package scripts 的 `test:foundations`，再追加 `test/workspace-authority.mjs test/shared-files.mjs test/layout-drag.mjs`。没有 npm 时直接执行里面的 `node --test ...`，不要把 npm 不存在误判成源码测试失败。Windows symlink EPERM 不通过改全局权限或弱化测试来掩盖。

另一台机器自行安装依赖并按仓库 SDK fixture 说明准备公开 rc.3 SDK/浏览器；本机 `node_modules` 与 `.dev-sdk` 是隔离共享依赖，不随 Git 交付，也不要在这里运行安装脚本改变共享依赖。构建使用冻结的 rc.3 AppFrame，升级 SDK 必须重新核对 patch 锚点。

## 交接约束

开发自动目标当前已暂停，不将完整实现目标标完成。继续开发应先阅读本文件、核对远端/工作树和当前用户授权。发布交接不等于装载授权；不要在本机运行目录执行普通开发操作，不动 Mind 私人区、核心卡、profile、凭据或已运行 GUI。
