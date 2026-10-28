# 工作台 V2 开发接续（进行中，不是交付版）

## 当前授权和位置

- 用户已明确恢复开发，并要求“不妥协”“高质量交付”。A1–A8 保留，不能因本记录缩减。
- 隔离工作树：`/home/kuro/DSHOME-workbench-v2`；分支 `feat/workbench-v2-integration-20261026`；基线 `e4ca7cd`。
- 原始源码仓库 main 已合并到 e4ca7cd；运行 profile 仍是 `0.2.0-workbench.2`，没有装载、重启、发布或推送。
- 包的当前版本标为 `0.3.0-workspace.0-dev`，表示开发中，不能部署为完成品。
- 宿主 SDK：本机公开安装包 `0.2.1-rc.2`，不是完整 DSH 源码 checkout。Node `24.22.0`。

## 当前实现概要（未获独立产品复核；逐轮证据在下方）

1. `src/workbench/files.mjs`：仅通过注入的宿主 FS 访问已有普通文件，真实 Session 解析工作区及 sandbox policy；只接受已认证 owner caller。读取完整 UTF-8 字节，保留 BOM/CRLF/尾换行，读取前后校验版本，大小上限 2MiB；读写必须绑定打开时 projectId，保存另绑定完整规范路径并要求后端 `replaceIfVersion`，拒绝末级符号链接、越界、只读与缺少版本。没有 Node fs/shell 写旁路、任意路径或无条件覆盖端点。
2. `src/host.mjs` + `src/workbench/wire.mjs`：新 `dshomeWorkspace/project/read/save` 严格 Typert/Gateway 接线，业务拒绝码保留；不另开未经认证的写 HTTP 接口。
3. `src/workbench/document.mjs`：独立于布局的文本、已保存基线、版本、选区和滚动状态；保存期间继续编辑不误清 dirty；传输异常保留未知结果并先读回核对，外部冲突不自动覆盖；关闭需确认。
4. `src/workbench/controller.mjs`：四模块内容实例、布局和项目存储分离；布局草稿不分配实际内容/PTY；布局保存不包含正文、URL 或终端身份；第八轮已补损坏原件导出/备份、明确恢复与冲突比较，生产浏览器使用 IndexedDB 事务保存元数据。
5. `src/workbench/ui.mjs`：真实 React 四模块内容宿主、文件打开、编辑保存、网页 iframe、终端渲染接线和布局编辑操作。全部内容实例平铺于同一父节点，以稳定 key 只改几何及显隐；没有 DOM 搬迁或聊天复制。
6. `src/workbench/client.mjs`：注册独立原生 `dshome-workspace` 标签，`keepMounted:true`，不抢占现有原生内容槽。已用公开 `ClientTerminals` 构造器在 Cordis 隔离服务作用域建立自己的 retention，不覆盖原生侧栏列表；真实 PTY / native Sidebar、原生输入及客户端历史链已分层实测。**完整外壳、生产 Host Session/认证/实际 prompt 和整体 A1–A8 仍未验收。**
7. `scripts/build.mjs`：保留 `src/legacy-client.js` 为旧功能的可重建来源，将新模块打包进一个 classic script；宿主输出 ESM，入口以宿主与客户端内容散列更新。生成物只在本隔离工作树。

## 首次开发验证（历史；最新结果看末节）

```sh
DSH_SDK_ROOT=/home/kuro/deepseek-harness npm run test:foundations
DSH_SDK_ROOT=/home/kuro/deepseek-harness npm run test:workspace-ui
npm run build
git diff --check
```

- 基础验证：66 项通过（31 布局模型、11 文档模型、10 真实 SDK FS、4 真实 SDK Gateway、10 controller）。controller 的终端、存储锁仍是显式替身，不是 PTY/Web Locks 实验。
- 真实 Gateway 和 FS 测试：确有临时文件读写、并发旧版本拒写、符号链接边界、只读、认证身份及严格参数校验。Gateway 的 owner Peer 由测试夹具显式建立，不是实际浏览器登录认证测试。
- Chromium `141.0.7390.37` + React 产品组件集成：开发/审阅来回切换 10 次，iframe 只加载一次、未提交表单和内存 nonce 保留，文档编辑器 DOM/草稿/选区/滚动保留，保存经真实 Gateway 后临时文件实际变化。刻意 unmount 的负对照可检测到 iframe/editor 被销毁。
- 组件测试中的壳、聊天输入、目录列表和 caller Peer 是明确的测试替身；**不覆盖原生 slots 装配、真实聊天与 IME、生产认证、PTY**。不得称为“真实 DSH GUI 全部验收”。
- 原始日志位于 `test-output/`：`foundations-r3.tap`、`ui-browser-r2.tap`、`workspace-ui-result.json`；组件截图为 `workspace-daily-integration.png` 和 `workspace-editor-integration.png`。目录已忽略，后续需选取必要证据进入正式交付。
- 初轮 SDK FS fixture teardown 使用了不存在的 `ctx.dispose()`，10 项被判失败；已改为公开 `ctx.fiber.dispose()` 后重跑通过。旧失败日志保留，不抹掉。
- 最后一次 `git diff --check` 报生成代码的四行空白行尾，已在生成器修正并重建，现通过。
- 旧 `npm test` 目前 **63/67**，且 `&&` 导致 domtest 没运行：原有两项通知源码断言仍失败，新增的 xterm 枚举/打包变量被粗正则误当哈希 CSS 选择器，以及旧空宿主测试仍执行 `apply()` 无 ctx。不能说“回归全绿”；后续应将语法误报改为真正的 CSS 选择器审查，空宿主断言替换为真实 Gateway 激活测试，不能屏蔽真实行为问题。

## 2026-10-27 客户端装配推进

- 新增 `test/workspace-client-assembly.mjs`，执行完整 classic 客户端产物，通过实际 SDK `SlotRegistry`、renderer、Client Gateway projection、Host Gateway、WorkspaceFiles 和 FS 装配。原生外壳声明、Session binding、导航/type registry、owner peer/carrier 是显式 fixture；旧视觉功能关闭，未使用的 primitives 是空夹具；jsdom 不提供 Canvas/真实几何。本项不冒充真实原生 sidebar controller、生产 GUI、认证或 PTY 验收。
- 查出并修正 `src/workbench/client.mjs` 的两层接线错误：`typert.remotes.register` 只注册反射描述，不创建可调用 namespace，已改为实际 `remote.$mount`；生成 namespace 是独立 Cordis 依赖，必须在挂载后通过嵌套 inject 声明 `remote.dshomeWorkspace`、`remote.workspaceFiles`、`remote.terminal`、`connection`。初次装配失败 `cannot get property "remote.dshomeWorkspace" without inject` 保留在 `client-assembly-r5.tap`。
- 修正清理：`ctx.inject` 返回 Fiber，不是函数；清理按函数/Fiber 分型并等待，终端子服务归属同一依赖 fiber，卸载不主动发送进程 close。此处尚无 PTY 实证，不作保活承诺。
- 装配测试的反射-only 负对照确实不能得到 namespace；修正后实际 project RPC、稳定 Session body 的渲染、注册释放、卸载后 namespace 消失通过。`client-assembly-r6.tap`、加强卸载断言后的 `client-assembly-r7.tap` 均为 1/1，通过无 console/page 错误；早期 fixture 缺依赖、缺 area renderer 的失败日志保留。
- 回归重跑：`foundations-r4.tap` 为 66/66；`ui-browser-r3.tap` 为 1/1；构建与 `git diff --check` 通过。旧 `npm test` 的四项问题仍未处理，不能宣称全回归绿。
- 新命令：`DSH_SDK_ROOT=/home/kuro/deepseek-harness npm run test:workspace-client`。当前测试另依赖隔离 `.dev-sdk` 中的公开 npm 包（test runtime 0.2.1-rc.2 的 jsdom/react/slots/store，zustand 5.0.8、immer 10.1.3）；正式 A8 交付前还须将这组测试依赖整理为可复现 bootstrap/锁定清单，不使用运行 profile 的私有实现或改动已装载插件。
- 接下来需验证原生 sidebar controller/type inventory 与真实 PTY；补同一运行域连续复入/HMR 的初始化/异步清理竞态、依赖掉线重连和每条 close/dispose 次数。当前只证明一次装配/卸载，不推及这些场景。

## 2026-10-27 第二轮：真实 PTY 与无损编辑

- 装配测试增加同一运行域连续 5 次替换实例：真实 SDK 接口、槽位和样式始终各一份，释放旧 Fiber 不会撤掉新实例；最后 namespace/注册均消失。`client-reload-r1.tap`、重建后的 `client-reload-r2.tap` 通过。仅证明此复入场景，依赖掉线重连尚未验。
- 新增公开 carrier 夹具 `test/fixtures/gateway-carrier.mjs`，让真实 Gateway 通过公开 `connection.rpc.intercept` 注册自己的 handler；流经公开 `wireStream.open`。已替换先前三处测试直接调用 TypeScript 私有 `invokeRpc` 的做法，不复制结果编码器。`public-carrier-r1.tap` 的 4 项 Gateway + 1 项装配通过。
- `test/workspace-terminal.mjs` 实测 Linux 真正 node-pty、SDK LocalSubprocessRuntime / TerminalController / ClientTerminals / Gateway 和产品 controller，不是假进程：原生与工作台两个隔离 manager 同时持有真实终端；10 次布局切换的 spawn/close/terminate 增量均为 0，同一 PID 和终端身份，后台输出 1–5 连续；view detach 不结束进程；移除工作台 membership 可检测到只少一个真实 hold，原生 hold 不受影响；恢复后显式关闭工作台只发一次 close/terminate，PID 确已退出，原生仍在。最后也关闭本测试自己的原生终端，宿主夹具卸载并验证临时目录后清理。
- PTY 首轮断言过早：进程 done 早于 SDK close RPC 完成后的 inventory 删除；保留 `terminal-r1.tap` 失败，改为等真实 RPC 完成事件而非任意延时，`terminal-r2.tap`、`terminal-r3.tap` 均 1/1 通过。结果及真实 shell 转录在 `workspace-terminal-result.json`。Session/working-directory/owner/carrier 为显式夹具；不覆盖生产 GUI、浏览器 xterm 像素、无人持有的闲置回收或 Windows。
- 新增 `src/workbench/textarea.mjs`：将 textarea 的 LF-only 显示及 UTF-16 选区与原始文本分离，二分映射 CRLF 偏移；只转换本次新插入的换行，保留未改区域的 BOM、混合 CRLF/LF/CR 及末尾换行。UI 已实际接入；文档行号识别独立 CR。11 项新增 projection 测试与旧 11 项文档测试通过。
- Chromium 扩展集成：主文档改为 CRLF，10 次布局切换保留 DOM/草稿/显示选区/滚动，源文本及真实保存仍保持 CRLF；另外打开 BOM + 混合换行 + emoji 文档，用真实键盘选区引用检查原文偏移，再输入多行，保存后磁盘 Buffer 逐字节相等。`ui-browser-r4.tap`、加强主文档 CRLF 场景后的 `ui-browser-r5.tap` 均通过。原生 InputActions 仍是明确替身，不可据此认定 A7 原生返回链完成。
- 最新构建、基础 77/77、装配/5次复入 1/1、真实 PTY 1/1、浏览器扩展 1/1 和 diff 检查均通过；旧 `npm test` 四项问题仍未修。新增命令 `npm run test:workspace-terminal`。现阶段仍为开发版，未交卷、未独立复核、未部署。

## 2026-10-27 第三轮：原生侧栏与浏览器 PTY 同链

- 新增 `test/workspace-native-sidebar.mjs`，实际加载公开 SDK Sidebar 的 controller/type registry、Session scoped store、dockkit、SlotRegistry/renderer 和真实 UI primitives，再装配完整 classic 插件。原生 `rightbar.session` 所有者与其 `sidebar.right.pane.tab` 声明保持同一对象，没有测试替身接管这两个席位。真实 `openTab` 打开独立工作台类型，原版/工作台切换不重建内容；真实 native close 经产品脏文档 guard 被拒，确认后才删除页面。卸载只撤销本插件类型，原生席位仍在，Session view reference 释放平衡。`native-sidebar-r3.tap`、通过公开导出解析重跑的 `native-sidebar-r4.tap` 均 1/1。
- 新增 `test/workspace-native-browser.mjs` 与 `test/fixtures/native-workspace-entry.mjs`：Chromium 中使用真实原生 Sidebar/dockkit/renderer/stores/atoms、完整产品产物、SDK 自己注册的 WebSocket mux、真实 TerminalController/LocalSubprocessRuntime/node-pty 和受控 FS。不是合成终端画面，也不自造流结果编码。`public-browser-module.mjs` 通过公开 package entry 编译实际 CSS modules；`sdk-client-source.mjs` 按公开 `./client` 的 browser/default 条件读取并核对 SDK 0.2.1-rc.2，不猜内部 lib 路径或导入 src。
- 真键盘输入 shell 命令，屏幕显示真实 PID 与连续 `WB_TICK:1..5`；10 次开发/审阅切换 + 一次原版返回后，同一 xterm/editor/iframe/chat/composer DOM、同一终端 ID/PID、同一网页 nonce/未提交表单，网页只请求一次；切换时 spawn/close/terminate 均无增量。显式关闭仅一次 close/terminate，PID ESRCH，最终 hold=0。
- 加强版包含 180 行 CRLF/BOM 文档：真键盘选区 display 3–9，源选区 3–10；scrollTop=350 经上述切换保持。编辑不隐式写盘；经原生装配中的真实工作台“保存文件”按钮和 Gateway/FS 后，磁盘 Buffer 与原文+BOM/CRLF+新草稿逐字节相等。
- `native-browser-r5.tap` 基线 1/1；`native-browser-r7.tap` 加强选区/滚动/无隐式保存/字节精确保存后 1/1，结果 `workspace-native-browser-result.json`，实测图 `workspace-native-browser.png` 已实际看图。browser pageerror 与 slot entry error 均为空。临时 HTTP/iframe 服务、浏览器、Peer fiber、自己创建的 PTY 与经过 realpath 边界检查的临时目录均在测试内收尾。
- 保留失败：native jsdom 前两轮缺 MutationObserver/global 和 shortcut catalog 误用 Map，按公开数据契约修复；浏览器首轮 iframe 未声明 UTF-8，随后实际 WebSocket 提前关闭因 owner Peer 夹具缺少 `ctx` 生命周期，按 SDK 的 bindPeer 行为用真正隔离 Cordis Peer fiber 补齐，没有更改 SDK 或绕过 mux；r6 是等待保存时误读 `doc` 而非实际 `document` 字段，r7 修正观察点后通过，未删保存断言。
- 这层仍明确使用外层 frame/geometry、ready Session/working-directory、locale/shortcut 与 owner admission 夹具。**不等于生产 GUI、真实 conversation/InputActions、AppFrame 宽度求解或 Windows 已验**。切换保留的 chat/composer 是明示夹具，A7 与原生输入接线仍待完成。
- 新命令：`DSH_SDK_ROOT=/home/kuro/deepseek-harness npm run test:workspace-native`、`npm run test:workspace-native-browser`（同样需要 DSH_SDK_ROOT）。本轮回归 `foundations-r6.tap` 77/77，`client-round3.tap` 复入回归通过。隔离 `.dev-sdk` 又补了公开 primitives 的运行依赖及 dockkit，未运行安装脚本；可复现依赖清单/bootstrap 仍是 A8 待办。旧四项回归失败、独立复核及全部剩余范围未取消。未部署、未交卷。

## 2026-10-27 第四轮：文档比较、草稿导出与失败恢复

- 文档模型新增 `compareDisk / cancelComparison / resolveComparison / dismissComparison`：比较经原受控 transport 读取完整磁盘版本，不改变草稿或旧基线；取消会传递 AbortSignal，忽略迟到回执；读取去重、读取期间拒绝写入/关闭。比较按 token、草稿修订和基线版本防陈旧采用，只有明确选择才采用磁盘新基线或放弃草稿；采用本身不写盘，后续保存仍交给 Host CAS。项目/绝对路径改变或缺版本的比较结果拒绝采用。
- 新增文档内的三栏比较（旧保存基线／磁盘快照／当前草稿），显示 BOM 和三种换行计数，所有文本经 React 转义；有刷新、关闭、保留草稿采用基线、单独确认后使用磁盘快照，以及原样下载草稿。没有假装自动合并；用户可以比较后继续编辑，再刷新比较决定。快照明确不证明旧在途写入已停止。
- 未知保存核对遇到外部修改时自动呈现比较，但保持 pending/草稿；只有明确采用后才解除该 pending。同步 transport 抛错不会把 load/save/compare 的所有权永久卡住；关闭确认期间的新编辑、新保存使旧确认失效。文件 Host 保存拒绝未配对 UTF-16，避免编码器偷偷替换成 U+FFFD；下载也拒绝这种无法无损编码的文本并显示原因。
- 新增 15 项文档恢复单元测试与真实 SDK FS/Gateway 的 2 项 Unicode 边界测试，已纳入基础命令。基础从 77 增至 **94/94**，无跳过；`foundations-r8.tap` 通过。完整客户端复入、native Sidebar、旧组件浏览器 EOL/选区与真实 PTY 回归均在第四轮通过。
- Chromium 真实 native 组件/Gateway/FS 链实际执行：外部编辑后保存被 FS_STALE_VERSION 拒绝；三栏全文与真实文件/草稿一致，仓库 `<script>` 没执行；下载的 BOM/CRLF 草稿与模型 Buffer 相等；比较后的新编辑禁用旧决定，刷新后可明确采用，采用不写盘，单独保存才落盘；放弃草稿可取消也可确认，均无隐式写盘。再由真实 Host 成功写入、代理故意丢掉成功回执并返回 502，验证结果未知禁重试、后续外部修改与继续编辑、核对冲突、明确采用后再次 guarded save，字节一致。
- `native-recovery-r1.tap` 保留失败：通过销毁 HTTP socket 注入回执丢失时，实际观察到 FS_STALE_VERSION 而非期望的 unknown，等待超时；没有据此声称核对成功。改成真实写入后返回明确 502 的代理故障注入，避免将网络层可能的重试与所测文档核对混在一起；`native-recovery-r2.tap` 1/1 通过。未独立证明第一次 socket 行为的具体重试来源，不把推断写成事实。
- 结果包含恢复断言、PTY 单次关闭、iframe 一次加载、五种 DOM 身份保持及空 pageerror/slot error；比较截图 `workspace-recovery.png` 已实际看图。该层的外层 frame、Session 数据、owner admission 及聊天/输入仍为明示夹具，不是生产 GUI、原生 InputActions 或 AppFrame 宽度验收。没有部署或改运行态，也尚未交卷/独立复核。
- A7 只读调查：公开 InputActions 的 captureInsertion/insertText 是修订守卫插入面；native conversation 的 apply 经 uiSession.provide 提供该面，公开 `IConversation.input` 是 SessionInputResolver。不要深层导入 package-private 的 SessionInputShell/InputHub。公开 UiConversation 的 userText 扩展和 Sidebar 两阶段类型注册、openResource/useTabInfo 可以作为下一步返回引用接线的候选；本轮未实现、未验证这一完整方案，不能称原生引用已完成。

- 最终加固后再次构建及整组回归通过：`foundations-r9.tap` **94/94**；`native-recovery-r3.tap` **1/1**（另含未配对 Unicode 的下载拒绝、无 pageerror、无下载）；`client-round4b.tap`、`native-sidebar-round4b.tap`、`ui-round4b.tap`、`terminal-round4b.tap` 各 **1/1**；`git diff --check` 通过。当前生成入口为 `lib/entry-workbench-83821aceea0c.js`。全部结果仍是分层开发证据，不是 A1–A8 的整体验收票。

## 下一步优先级与已知缺口

1. **第一优先**：第七轮已接原生输入、真实客户端 SessionController/Chat 引用链；第八轮已接布局备份/明确恢复和真实跨页面事务冲突。第十一轮又补 Host 目录绑定与真实 spawn 边界的终端 cwd 校验；接下来补终端清理失败/重连/idle、别名去重与 dirty HMR，再补终端错误生命周期和原生 tab/依赖撤回；外层 AppFrame 与生产 Host Session 仍不可当成已验。
2. **终端后续**：Linux 真实 ClientTerminals / Host controller / node-pty 的身份、输出、持有、detach、显式关闭及去持有负对照已通过，Chromium native 组件装配与真键盘输入/模式切换同链通过；补持续大输出、会话/cwd/依赖重连、关闭失败可见恢复、卸载恢复及 idle 回收，Windows 仍未知。
3. **文档后续**：已实现 LF-only textarea 与原文坐标映射，Chromium 中 BOM、混合换行、源选区偏移、CRLF 草稿切布局和逐字节保存已通过；继续补 IME/输入法、undo/redo、引用返回定位、光标方向和更长文档性能，不拿本轮覆盖替代这些剩余项。
4. **内容恢复/错误处理**：文档已具备磁盘/基线/草稿比较、未知结果冲突的明确采用与原样导出，包含真实浏览器恢复验证；第八轮已补布局原件无损导出、事务备份/恢复、冲突比较、明确采用基线与不关闭内容的布局采用；仍需服务撤回/切 cwd/dirty HMR 的内容归属与恢复，不能认定整体生命周期完成。
5. **A7 返回定位**：第七轮已验证真实 ClientSessions / Session / SessionEventStream、原生 Chat 消息中的返回按钮、事件流重新读取和实际引用释放；Host 日志端、UI scope adapter、设置/授权/外层几何仍是夹具，生产 Host Session、真实 prompt、完整 native 会话壳及会话切换未验，不能称 A7/整体验收完成。继续补原生 tab 可见性/焦点与依赖撤回。
6. **A1/A2 扩展**：统一模块接口的第三方注册和卸载行为、多文档/别名去重、跨会话同项目/工作区 cwd 改变的隔离和生命周期仍需补验。当前 controller 有基础模块 registry，但 UI/插件公开 API 还不完整。
7. **布局/外壳**：当前工作台在原生右栏内，外层宽度由宿主真实轨道/手柄求解；默认比例与设计方向还需在真实 SDK 壳中验证，不能改外层 grid 假装解决。独立组件 fixture 不证明生产窄屏/全屏不会遮住聊天。
8. **预览与安全**：当前文档预览是 escaped text，不执行仓库 HTML。尚需完整可用的文档渲染/选择与引用、加载错误/跨域限制的可见提示、IME/键盘无障碍、焦点与字体缩放。
9. **A8**：完成旧功能真实行为回归、打包测试更新、跨平台适用说明、独立复核后才交付。README 旧基础预览说明尚未改写为最终 V2 文档；勿按旧说明部署开发包。

## 组织留痕与边界

- 活动目标 `goal-92c92979486ee79a9859f0f0`；实现任务 `task-实现-DSHOME-工作台-V2-c98d8`，Lead 已绑定并执行中。
- 会话持续目标 `goal-d0808c47-ed17-4f43-999b-c050a934a834` 保持 active，不标完成。
- 咨询成员创建曾因未授 memberFileAccess 读根被拒，operation_query 无创建回执，咨询节点已正式终止。调查由 Lead 直接执行，未改走普通 subagent 绕过；也没有实际专家复核，不能虚构。
- 后续独立复核应按正式复核对象、task_attach 读根和受控实验许可办理；如果仍有授权缺口再依据具体回执说明，不能自审。

## 2026-10-27 第五轮：可校验引用与真实原生输入模型

- 新增 `reference.mjs`：规范、有界的 `dshome-ref://v1/` 地址，含会话/项目/绝对路径、原始 UTF-16 范围、草稿标记和完整原文 SHA-256。摘要不是访问授权。WebCrypto 不可用、格式错误或选区拆开 Unicode 时明确失败，不生成不完整引用。保留原生输入的 capture/insert CAS，不调用整稿替换或发送。
- 新增 `reference-client.mjs`：只用公开 `uiConversation.userText` 规则、原生 `conversation.user.text.node` keyed 扩展。只认独立返回标记，引用片段中的标记仍为普通文本；非 interactive 场景保留原文，不自动读取。通过现有原生工作台 kind 打开，不为每条引用创建另一份工作台内容 DOM。
- `returnReference` 先核对当前会话、重新读取真实 Host project，再经原 controller/受控 transport 打开。内容摘要不符就拒绝精确定位，绝不搜索近似行或替换草稿。`document.reveal` 用 editRevision 再做选区 CAS；一次性焦点/滚动请求在自身 textarea 中消费，保留 BOM/混合换行源坐标。
- `test/reference.mjs` 16 项覆盖规范编码、真实 SHA 向量、跨会话/项目、取消、晚到摘要、后续输入编辑、范围及 Unicode、Host 拒读传播、变更后的原文拒绝和只读返回。`foundations-r11.tap` 为 **110/110**，无失败/跳过。
- 新隔离组合确实运行 SDK `ui-conversation.apply`，由它经公开 `uiSession.provide` 生成 InputActions、Lexical 输入模型及原生 UserText factory/node。没有导入私有 InputHub/Shell，也没有用替身 InputActions 冒充这一层。测试的 Session 数据/适配器、owner admission、外层几何仍是明确夹具；左侧 textarea **只是输入状态只读镜像**，UserText 是**未发送预览**，不是原生输入栏 DOM 或真实聊天历史。
- Chromium 真键盘选中 180 行未保存草稿中的第 80 条，引用保持旧原生草稿；真实原生旧 span 被 CAS 拒绝。从原版模式点击原生 UserText 的返回按钮，仍是同一文档、textarea、iframe、xterm、InputActions，只有一个文档实例，原范围 **983–993** 正确且聚焦/滚动可见。后续编辑不丢、旧引用拒绝，跨会话/项目与 Host policy 工作区变化拒绝；文档磁盘字节未变。
- `build-reference-r3.log` 成功；`native-reference-r5.tap` 与最终元数据措辞精确化后的 `native-reference-r6.tap` 通过。`native-round5.tap`、`client-round5b.tap`（包含连续替换）、`native-sidebar-round5.tap`、`ui-round5b.tap`、`terminal-round5.tap` 各 1/1；全链退出 0，diff 检查通过。图 `test-output/workspace-reference.png` 已实际查看，结果 `workspace-reference-result.json` 标明排除项。生成截图/JSON 是可复跑的当前产物，不应把旧轮次校验和当成以后重跑后仍不变。
- 保留负记录：r2 错把前一场景已明确放弃的长文件当成仍存在；r3 发现程序 setSelectionRange 没走 React onSelect；r4 的固定 policy 根没有随 fixture cwd 变化。分别补独立新草稿、改用真实键盘、让 policy fixture 从当前 session 解析 workspaceRoot，未放宽原断言。另修正 Slot 注入回调的生命周期写法：使用 declaration-owned generator，不假定它传 Cordis Context。
- 下一步优先真实 SessionController / 输入栏 DOM / 会话历史组合、异步摘要期间项目变化复验与原生 tab 可见性；再继续布局损坏/冲突恢复、模块/别名/cwd/dirty HMR、终端关闭失败/依赖重连/idle、预览/IME/撤销/无障碍，以及旧回归、可复现 SDK 引导和正式独立复核。原 `npm test` 的四项问题尚未解决，不能称全部测试通过。
- **未整体验收、未交卷、未提交/推送/发布/部署；运行 DSH、Mind 代码及已装载插件保持不变。**

## 2026-10-27 第六轮：定位后置复验与原生输入栏 DOM

- 修复一个真实竞态：缓存文档不一定重新读 Host，单次导航前的 project 查询不足以覆盖异步摘要。`returnReference` 抽出同一 `validateScope`，导航前和摘要后均重新读真实 Host project；`revealDocumentReference` 在后置验证返回后再次检查取消/当前接口，最后才同步执行 editRevision CAS。新增三个单元用例：后置工作区拒绝、复验等待中的源编辑、复验中的取消/服务替换。reference 共 19 项，基础 `foundations-r13.tap` **113/113**，无失败/跳过。
- 保留真实旧新版对照：新测试在第二次 project 请求前改变 Host session 的 policy 工作区，走实际 Host FS scope，不伪造查询响应。旧包 `reference-scope-old.tap` 因 `unexpected success` 失败；新包 `reference-scope-new-r1/r2/r3.tap` 拒绝定位、确实进行了两次 project 查询且 revealRevision 不变。没有为了过测降低条件。
- 新增 `test/workspace-composer-native.mjs` / npm 同名脚本。在独立模式中声明 native main 注册锚点，让实际 conversation 插件拥有自己的子槽；通过公开 `renderFactorySlot('conversation.content', {variant:'embedded',phase:'active',hero:false}, {slots:{views:…}})` 使用原生 content、InputBar 和 Lexical DOM。没有导入私有组件、覆盖现有声明或搬运 DOM。测试根增加公开标准 sources 和 projection keyed source；Session 数据及 adapter 仍明确是夹具。
- Chromium 确认真实 `data-lexical-editor=true` 的 contenteditable，实际键入“原生输入栏实际键入”后同时核对 DOM 与 SDK draft；切 10 次布局及原版模式后比较**该真实编辑节点**身份。引用后另核对 URI/所选文字确实进入原生输入 DOM；返回引用后原生输入节点仍不变，目标源范围 983–993 聚焦/滚动可见。原生旧输入 span CAS、旧文档引用拒绝、文件原字节及单次 PTY 关闭等既有场景继续通过。
- 此模式只挂原生共享 content/InputBar：上方切模式按钮是明确的**测试入口**，views 使用未发送的原生 UserText **预览**，不是完整 native main/Header，也不是真实持久聊天历史。普通 reference/原生侧栏场景仍验证产品真实入口。会话数据/适配器、owner admission、外层几何/locale/shortcuts 保持夹具，不把本轮当生产 GUI、AppFrame、真实 SessionController 或 Windows 验收。
- `build-round6-r2.log`、`native-composer-r3.tap`、`reference-scope-new-r2.tap`、`native-round6.tap`、`client-round6.tap`、`sidebar-round6.tap`、`ui-round6.tap`、`terminal-round6.tap` 全链退出 0。最终补强截图屏障后的 `native-composer-r4.tap` 与 `reference-scope-new-r3.tap` 再过，diff 检查通过。`workspace-composer-result.json` 标记覆盖/排除项；`workspace-composer.png` 已实际查看，最终画面按钮空闲、源第 80 条被选中。
- 保留测试修正：composer-r1 缺显式 fixture“原版”按钮而超时，补齐测试控制未改产品；第一次最终截图仍处于“正在定位”，因为等待旧 alert 消失只证明请求开始。现要求新 revealRevision、真实目标选区/焦点与按钮恢复空闲后才截图，不以无错误当成功。构建改写 package 元数据触发文件版本保护，已重新读取后基于当前版本修改，未绕过。
- 下一步继续真实 SessionController / native 聊天历史 / 实际会话壳，原生 tab 可见性与依赖撤回，再补布局/内容恢复及终端生命周期、模块扩展、IME/撤销/无障碍、旧四项回归和可复现引导，最后正式独立复核。整体目标保持进行中；不提交、推送、发布、部署，不改运行中 DSH/Mind 代码或已装载插件。

## 2026-10-27 第七轮：真实客户端会话与 Chat 日志引用链

- 新增 `test/workspace-session-native.mjs` / `test:workspace-session-native`。公开 session-controller `apply` 真正创建 ClientSessions、Session、agent scope、projections 与 SessionEventStream；等真实 catalog 收到 A 后 retain，再把其真实 `SessionBinding` 交给测试 UI adapter。没有构造私有类，也不再将手工 Session snapshot 当成该模式的控制器。用引用相等断言核对 adapter owner 就是 `ctx.sessions.binding('A')`。
- 新增 `session-journal-host.mjs`：明确的 **Host 日志/数据夹具**，写隔离目录 JSONL；以公开 TypertRemoteService 绑定 `sessionController` 服务和 `session` namespace，显式签名匹配发布的 Typert。走实际 Gateway 校验与 WebSocket，支持 catalog/control/follow/page/projections；prompt 是计数后拒绝的保护口，不调用任何模型。这不是生产 Host Session 存储、身份认证或 prompt 提交验证。
- 安装真实 ui-chat 的公开 `apply`，让 Conversation.content 使用默认 ConversationSessionView / Chat，保留独立且明示的未发送预览作前一分层场景。`native-history-scenario.mjs` 首先确认 native chat.flow 内的既有日志消息，然后把原生输入 draft 由测试端明确追加到 Host 夹具；逐条读回文件、经原生事件流看到第二条消息、从**实际 Chat 消息内**（不是预览）点击返回。原选区 983–993 与焦点恢复，原生输入 draft/节点不重建，prompt 计数始终 0。
- 额外通过公开 SessionEventStream 构造一个独立读取并关闭，重新从 Host JSONL 取回两条事件及原引用；不拿原前端缓存冒充重新读取。最终跟随数 2、activeFollowers 0、prompt 0、appended 2；根退出后真实 `retainInfo('A').referenceCount` 为 0。仍没有执行模型或真实 prompt，也没有把 tempfile 写入认作生产会话崩溃持久性验收。
- `build-round7.log` 与全链退出 0：`foundations-r14.tap` **113/113** 无失败/跳过；`native-session-r11.tap`、`composer-round7.tap`、`reference-round7.tap`、`native-round7.tap`、`client-round7.tap`、`sidebar-round7.tap`、`ui-round7.tap`、`terminal-round7.tap` 各 1/1。结果 `workspace-history-result.json` 带每层覆盖及排除项，截图 `workspace-history.png` 已查看：实际原生消息含返回按钮，右侧原文第 80 条选中。当前完整壳、AppFrame 宽度、生产登录、Host Session/prompt、Windows 及独立复核仍未验。
- 负记录全部保留：r1 在 native catalog 尚未到达时 retain 未知 A；r2 普通对象没有 typertRemote binding；r3/r4 服务 key/namespace 不一致（r4 没有诊断增量，不应作为验证收益）；修正为正式 RemoteService + `namespace:'session'`，未手工伪造 binding。r5 重复提供 fileUpload，被 Cordis 拒绝，改为只注册一次。r6/r7 发现 Chat peer 未在 SDK 根及其包解析域安装；r8 安装 peer 的依赖重算移除了未直列 Registry。另有批处理 Python 不存在，后续改用本机 Node，失败执行不作为新代码已测试的证据。
- 只在隔离 `.dev-sdk` 安装并钉住 SDK 声明的 `@tanstack/react-virtual@3.14.10`，补直接 `@deepseek-ai/dsh-typert-registry@0.2.1-rc.2`、`@deepseek-ai/cordis@4.0.5`、`zod@4.4.3`；均 `--ignore-scripts`，未修改运行 SDK。完整可复现 SDK 引导/锁和更干净的测试依赖布局仍须 A8 收尾，不能只凭本机通过认作可复现交付。
- 下一步转回产品剩余行为：布局损坏/冲突恢复、模块/别名/项目切换与 dirty HMR、终端关闭失败/依赖重连/idle，以及原生 tab 可见性和会话壳；随后预览、IME/撤销/无障碍、旧功能四项失败及可复现打包，最后正式独立复核。A1–A8 不缩减；目标、实现任务继续中，无交卷/采纳/提交推送发布部署，运行 DSH/Mind 代码及已装载插件未动。


## 2026-10-27 第八轮：布局原件恢复与跨页面事务冲突

- 从模型抽出 layout-storage，新增 layout-recovery 协调器和操作区内的三栏恢复 UI：当前布局快照／原保存基线／目前存储原记录。可取消、重新检查、原件导出、保留当前并明确采用存储基线、采用所比较布局、确认后备份原件并保存当前；采用和比较本身不写布局，不关闭文档/网页/终端。模型 adoptLayout 合并现有实例，缺少位置的实例明确收起；同 id 不同 kind、外项目、超限或陈旧修订原子拒绝，不静默删内容。
- 原件导出/备份用带 format/project/key/raw 的 JSON envelope，JSON 转义保留 BOM、损坏 JSON 及未配对 UTF-16；不是把任意原始字符串塞进 UTF-8 Blob 后偷偷替换字符。备份标识不覆盖、原件核对后才允许替换；恢复生成新的不透明 epoch，避免把存储版本退回数字 1 的 ABA。单独保存也核对完整原记录和预期版本；较旧快照保存成功但当前布局/编辑草稿已变化时明确仍有修改。
- 初次纯 localStorage + Web Locks 双页面场景 r2 出现双方均报告成功；只加返回回执观察的 r3 又通过，**没有据此认定问题消失或独立认证缓存/调度根因**。保留负记录，未改成接受双成功。产品现使用 browser-layout-storage：在同一个 IndexedDB readwrite 事务中读取当前权威记录、比对并提交原件备份和布局；只在 transaction complete 后交成功回执，abort/quota 不当成功。Web Locks 继续协调窗口，但不再单靠 localStorage 缓存声称事务。旧 localStorage 仅只读导入，原件不清除、不覆盖；IndexedDB 不可用时布局持久化明确不可用，内容仍可用，不退回不安全保存。
- 真实浏览器新 wrapper test:workspace-layout-recovery-native 包含前轮完整客户端 Session/Chat、native Sidebar、输入和实际 FS/PTY 链。明确 legacy 损坏种子；实际下载字节解码后还原原件；先拒绝确认，再在真实 IDB put 后触发 transaction.abort，另一实际 DB 只读事务确认主记录和备份均未提交；取消该显式故障注入后再恢复成功。第二页面使用同一真实生产存储模块；实际持有 Web Lock，观察 peer 请求先排队、main 后排队才释放，peer 成功、main LAYOUT_CONFLICT，不能两者成功。
- 比较中的本地布局变化禁用旧选择；peer 再提交后，采用前重新读取权威 DB 并拒绝旧快照。重新检查后可保留当前只换基线，或采用存储布局且不写存储；额外现有网页实例收起保留。核对同一文档/textarea/iframe/xterm/实际原生输入节点与终端 view，原草稿/源选区/输入 draft 和实际磁盘 Buffer 均不丢。另开后端连接取回已保存图和原件备份，邻接项目 key 与越域 get 被隔离；不是仅核对先前前端缓存。
- 增加 24 项单元用例，含原件/备份失败、备份撞号、恢复 CAS、恢复后 epoch 递增、缺锁、原记录复用版本但 raw 已变、采用不写、遗漏实例保留、模块种类冲突、确认等待中编辑/存储改变、取消/关闭等待锁、无 IDB 禁 fallback、迟到保存、比较等待中的取消/开始编辑。基础最终 foundations-round8-final.tap **137/137**，无失败/跳过。异步布局初始化再核对 activeScope/disposed/signal 和缓存，撤销不再采用旧 controller；异步重新检查用代际防取消后重新打开比较。更完整服务撤回/dirty HMR 仍须后续正负验证，不能据这两项 guard 推定完成。
- build-round8 与全分层链退出 0：foundations-round8 初为 135/135；事务完整场景 native-layout-recovery-r5/r6/r7 通过，初始化 guard 后 r8、比较取消 guard 后最终 r9 仍通过；history/composer/reference/native/client/sidebar/ui/terminal-round8 各 1/1，client/sidebar-round8-final 再通过。最终构建 build-round8-race-final.log 与 diff 检查通过。workspace-layout-recovery-result.json 分列 IDB、真实锁、实际 abort、冷读及保活证据；workspace-layout-comparison.png / workspace-layout-restored.png 已查看。上述仍是隔离 Chromium 分层证据，Host 日志/授权/设置/UI scope adapter/外层 frame 保持明示夹具；生产 GUI/AppFrame、生产 Host Session/prompt、Windows 和独立复核未验，旧 npm test 四项尚未修，不能称全回归绿。
- 其余失败也保留：layout-foundations-r1 包含未设置 SDK 环境的入口失败与正常 save 新 raw 回执字段断言不符；更新精确 JSON 回执预期而非删断言，设置 SDK 环境后再验。native-layout-recovery-r1 被 Playwright convenience context 禁止开第二页，改显式 browser.newContext；r4 的比较刷新让测试过早把尚未 busy 当完成，两个 once dialog handler 处理同一对话框，改为等真实 dialog 事件、明确处理再等结束。没有用 sleep 或抹掉失败认证恢复。
- 下一轮：项目/cwd 改变时保存与内容归属、别名/多文档/公开模块扩展和 dirty HMR；终端异步关闭失败/重试、断线重连、持续输出/idle；原生会话壳/tab 可见性与撤回；之后预览、IME/undo/a11y、旧四项、SDK bootstrap/依赖锁/打包和正式独立复核。整体目标与实现任务保持进行中，A1–A8 未减；不交卷采纳、不提交推送发布部署，不改运行 DSH/Mind 或已装载插件。


## 2026-10-27 第九轮：文档读写绑定原项目与规范目标

- 先跑真实 SDK 负对照 project-scope-old.tap：旧文档读取后把 Session cwd 扩展为仍包含原文件的父目录，旧 Host 没有拒绝该保存，测试以 Missing expected rejection 失败。单纯当前工作区 containment 与文件版本并不表示请求仍属于打开时的项目；没有把权限允许当成文档归属正确。
- Host 文件门增加 expectedProjectId，读写均精确核对实际 Session policy 得到的规范工作区；保存另要求 expectedAbsolutePath，与实际已解析目标的公开 fs.processPath 比较。缺绑定、外项目、错误规范目标拒绝，最后复验与原 fs.replaceIfVersion/version/链接/只读/owner 边界仍在。绑定只是意图断言，不授权限，不解析私有 FS key，也没有 Node fs 写旁路。Typert 严格 read/save 参数显式列出这些必填值，正式 RemoteService 方法同名同序；旧缺字段调用不走不安全兼容分支。
- 产品 transport 固定使用创建该 controller 时的 Host projectId；初次读响应必须匹配项目，保存响应必须匹配项目与原规范路径。错误响应使用非 definitive 的 WORKBENCH_SCOPE_RESPONSE，不能当作明确未写。文档模型另在保存成功清 pending 前检查返回 project/path；错回执保留基线、草稿和 uncertain，禁止直接重试，随后只能经绑定原项目的磁盘读取核对。没有把成功版本字符串当成归属证明。
- 新增 8 项基础场景：旧 cwd 改父项目拒写；缺项目/规范目标绑定拒写；同字节 sibling 采用其自身有效版本也不能代替原规范目标；切到另一工作区的绑定读取拒绝；真实 Gateway 缺字段在业务前拒绝、父工作区旧项目拒绝；模型错误 project/absolutePath 回执各保留未知状态。fixture 的便捷 read/save 明示注入初始项目绑定，rawFiles/rawCall 仍检查真实底层无 create 和缺字段行为，不能只测窄 wrapper 的不存在属性。基础 project-binding-r2 / foundations-round9.tap **145/145** 无失败/跳过。
- 新增 test:workspace-project-binding-native 与 native-project-binding-scenario：前置仍是真实客户端 Session/Chat、Input、Sidebar、Gateway、FS、xterm/PTY 链。测试改变实际隔离 Host Session 的 policy cwd（不是伪造 project 响应），分别改父目录与含同名同字节文件的子工作区；实际点击保存、等待本次 save 网络回执并检查 workspace-changed，原文件/另一项目文件逐字节不变，旧草稿 dirty 且非 unknown，绑定 compareDisk 同样拒绝。拒写画面 workspace-project-refused.png 已实际查看，明确提示旧草稿保留、未切换保存目标。
- 恢复原 Host cwd 后，再分别让真实 Host 写入成功、代理将成功回执的 projectId / absolutePath 改错：磁盘 Buffer 确实等于捕获草稿，但客户端标记 uncertain、禁再次保存；实际点击“核对磁盘结果”读取原目标后才解除未知并更新基线。核对期间原 document/textarea/iframe/xterm/实际原生输入节点和草稿/选区不被替换；另一项目文件始终保持原字节。projectBindingEvidence 逐项记录真实写入与注入边界，不把改回执当成 Host 真写了错误文件。
- build-round9.log 与全分层链退出 0；native-project-binding-r1/r2 均 1/1，layout/history/composer/reference/native/client/sidebar/ui/terminal-round9 各 1/1，git diff --check 通过。workspace-project-binding-result.json 有 Host policy fixture 及项目切换 UI/dirty HMR/认证的排除项；无 pageerror，Host fixture prompt 仍为 0。保留一次批量编辑 literal guard 因匹配两处而中止的记录，重定精确上下文后再改，没把未执行的脚本当通过。旧 npm test 四项尚未修，不称全回归绿。
- 本轮只完成文档读写归属保护，不代表完整“切换项目”体验：现有 controller 仍绑定原项目，不自动把旧草稿改绑到新 cwd；还要实现显式切换、旧草稿/网页/终端的保留与归档，核查目录和新终端 cwd 归属、别名/多文档去重、公开模块扩展、服务撤回/dirty HMR。其后终端关闭失败/重连/idle、实际会话壳/tab 可见性、预览 IME/undo/a11y、旧四项与 SDK bootstrap/依赖锁/打包、正式独立复核均保留。生产 GUI/Host Session/prompt/认证/AppFrame/Windows 未因此验收；目标继续进行中，不交卷采纳，不提交推送发布部署，运行 DSH/Mind 和已装载插件不动。


## 2026-10-27 第十轮：同会话保留项目列表与稳定内容 deck

- 从“Session 只缓存一个 controller”改为 project-shelf：同会话最多保留 8 个原项目 controller，各自拥有初始 Host 项目绑定、布局后端、内容与真实 ClientTerminals 子 Fiber；达到上限明确拒绝，不 LRU 丢弃脏草稿。初始化前后重新探测 Host，载入中换项目/撤回/取消不采用旧候选，只释放未显示的新候选，不关闭原 controller；错误 factory 复用已归属 controller 时拒绝改绑且不释放旧对象。非 loopback 仍用 origin+Host projectId 作本地布局身份，文件断言仍是原始 Host projectId。
- 操作区新增“保留项目／检查 Host 项目／打开 Host 当前项目／关闭所选项目”。检查只更新所观察 Host 身份；打开是明确采用 Host 当前项目；选择旧项目只是查看原内容，不会擅自设置 Host Session cwd，也不会把旧草稿保存目标改绑。不同项目通过稳定 key 的同父内容容器常驻，仅 visibility/inert/active 改变；不搬 DOM、不替换 iframe src、不 detach 原 xterm；inactive 的编辑器不抢焦点。保留项目和 Host 不一致时明确提示，文件保存仍由第九轮 Host 门拒绝错项目。
- 每项目的 ClientTerminals 由自己的真实 Cordis child Fiber 持有，并只保留自己的全局 contentId；不重写 native retainTabs 列表。目录调用前后核对原项目，启动新终端的 SDK create 前也核对；终端状态显示 SDK 返回的实际初始 cwd。**这只是目前的检查，不是 Host 原子项目 pin**：公开 TerminalCreateRequest 没有 cwd/expectedProjectId，不能据前置检查认证请求在网络或 Host 等待中变更 cwd 已安全；目录前后探测也不能认证 ABA/中途换回。下一轮要优先构造这些负场景并沿真实公开接口补强，不能先标完整项目切换归属通过。
- 新增 controller.releaseResources，把释放订阅/布局事务/自己的终端持有和用户明确 close 分开；卸载不主动发 Host process close。明确 close 遇文档 loading/saving/comparing 或布局保存中先拒绝，防在途内容丢归属。原等待锁测试相应先断言明确 close 返回 false，再用真实释放路径模拟卸载，仍验证无迟到写；没有删掉 LAYOUT_STALE/原件不变的断言。多项目批量关闭先检查全部：有草稿/终端/在途则要求逐个明确关闭，不能先丢一个再问下一个；干净项目的同步关闭全部在首次异步 release 前完成。取消单项目关闭不动其他项目。
- 回归抓出实际产品缺陷：最初把 native close handler 改成 async，sidebar-round10.tap 的原 assert.throws 失败。复核公开 SidebarRightCloseHandler=(sessionId,tab)=>void，SDK close 本身同步，不能等 Promise。**未将原测试改成 await 来掩盖接口错误**：改为 closeAllNow 同步确认/拒绝/提交，Fiber release Promise 另放 retiring 集合，teardown 等收尾；增加同步拒绝单元例，并在真实 Chromium 公共 sidebarRight.close 中取消确认，旧 tab/controller/dirty draft 继续保留。异步过程清理失败的用户可见重试仍属终端后续，不以排入释放当进程已结束。
- 新增 21 项 project-shelf 纯生命周期单元例：检查不改绑、显式打开与回访不重建、取消/撤回/晚候选、容量不驱逐、并发初始打开、候选误复用、各类多项目关闭前置、首次异步释放前全提交、卸载不冒充关闭、同步原生关闭闸等；这些明确是 doubles，不冒充浏览器。基础最终 foundations-round10-final.tap **166/166**，无失败/跳过。
- 新增 test:workspace-project-shelf-native：先运行既有完整 native Session/Chat/Input/Sidebar/Gateway/FS/PTY 引用链；改变隔离 Host Session 实际 header cwd 到 B，点击检查仍留在 A，A 刷新目录被拒；取消“关闭所选项目”仍保留 A 草稿及真实进程。明确打开 B，读同名文件并真实受控保存 B（逐字节仍为 CRLF），A 磁盘 Buffer 不变；B 保存不同布局后，另开真实 IDB 只读连接确认 B 有该折叠位置、A 原记录不变，不只比较客户端 cache。
- B 再实际启动第二个真实 PTY：执行只含 printf+shell PID 的命令，从实际 xterm 输出提取数字，不把命令回显当输出；Linux /proc/PID/cwd 分别核对 A 仍在原目录、B 在新目录。来回选择 12 次，A/B 编辑器及 xterm 节点、A iframe/表单、原生输入节点、原草稿/原始选区/input draft 均未替换，spawn 不增加。实际关闭 B 终端并等 RPC 成功和 process.done，再关 B 项目，只释放 B 子 Fiber；A controller 和真实 PID 仍存活。随后取消真实 SDK native close，A 继续存在；最终原生关闭 A 的增量 close/terminate 各 1，分层原有释放检查继续保留。
- native-project-shelf-r2 先通过基本双项目链，r4 加内核 cwd/取消项目关闭通过，最终 r5 包含同步原生关闭拒绝仍 1/1。build-round10-final.log 以及 sidebar/project-binding/layout/history/composer/reference/native/client/ui/terminal-round10-final 全链退出 0，diff 检查通过。workspace-project-shelf-result.json 分列证据与排除项；workspace-project-B.png / workspace-project-A-retained.png 已实际查看。Node 运行态/Host scope 来源、授权、日志、设置、UI scope adapter 与外框仍明确夹具；prompt 为 0，无模型调用，不是生产 GUI/完整 Host Session/认证/AppFrame/Windows 验收。
- 负记录不抹：project-shelf-unit-r1 因上面明确 close 的新在途拒绝语义而触发旧取消测试；r2 后 165/165，最终加同步闸为 166。native-project-shelf-r1 的预期 LF 与产品按 B 原样保留 CRLF 不符，改成精确 CRLF 而非 normalize；r3 的 PID 命令插入经 JS String.replace replacement 将双美元折为单美元，输出不是数字导致超时，用 literal edit 修复，并改后续 replacement 为函数，不归咎 SDK 进程。sidebar-round10 的同步闸负例是产品问题，保留并修产品。
- 后续优先：Host 目录读取/新终端创建的项目与 cwd 竞态（包含 ABA 与 create 到达前变更）、终端异步清理失败/重试/重连/idle/持续输出；保留 shelf 目前绑定原注入 scope，服务撤回重注入与 dirty HMR 重接线/草稿恢复尚未实现，不以当前初始化 guard 冒充。别名/多文档去重、公共模块扩展、真实会话壳/tab 可见性、项目工具栏主题窄屏/a11y、预览 IME/undo、旧 npm test 四项、可复现 SDK bootstrap/锁/打包及正式独立复核均未消失。旧四项未修，不能说所有回归绿。整体目标 A1–A8 继续，不交卷采纳、不提交推送发布部署，不动运行 DSH/Mind 或已装载插件。


## 2026-10-27 第十一轮：目录 ABA 与终端最后启动边界

- 真实 Chromium 负对照先保留：拦截原 workspaceFiles/list 请求，送达时把隔离 Host cwd 从 A 改 B，Host 返回后、交给客户端前又恢复 A；原前后 project 检查均看 A，却成功返回 ONLY-B-ENTRY.txt。terminal/create 同样延迟到达，原检查后真实 SDK/LocalSubprocessRuntime 已在 B 启动进程，spawnDelta=1。directory-scope-race-old.tap / terminal-scope-race-negative.tap 均按“必须拒绝”断言失败，两个 old-observed.json 保留原成功回执；不是只在模型里假设有竞态。
- 新 Host list(sessionId,path,expectedProjectId) 经严格 Typert schema/公开 RemoteService 声明，要求已认证 owner 和实际 Session policy 绑定；scope 把 policy 字段捕获为不可变快照，规范 resolve/contain 目录、拒绝末级目录符号链接，调用公开 fs.listDir(已解析目标)，不再让后来的 Session cwd 变成读取对象。回包前再核当前 Session/root、重新解析目录 targetKey；逻辑 A-B-A 即使最终恢复，也只会读原 A 的目标。per-child lstat 基于捕获的规范目录，把链接/其他类型显式禁用，不把 listDir 的跟随链接分类当可展开真目录。
- list 仅返回 projectId/规范目录/名称/类型/truncated，不读内容、不暴露 targetKey 或解析私有 FS key。回包最多 2000 条且条目编码预算 256KiB，追加 lstat 同样有界；**SDK listDir 本身是一次全量元数据返回，大目录扫描内存/耗时尚未认证为有界**。只读模式仍可列目录，越域/非目录/缺绑定/非 owner 拒绝，取消不回假成功。客户端采用匹配项目回执，并移除旧 remote.workspaceFiles 依赖与过时浏览器双探测分支，树与读写统一相对 policy workspaceRoot，而不是另用 Session cwd。
- 公开 SDK 0.2.1-rc.2 核查：TerminalController.create 最终经过 workingDirectory.ensure，再调用 Agent 执行环境的公开 subprocess.spawnTerminal；ensure 本身串行化后才读取当前目录，所以只在 Host create 之前再检查一次仍不够。新增 createTerminal 的严格 agent lookup 贡献，Gateway 提供真实查找结果，owner/Session 身份和原项目先验证；真实 terminalController 用可撤回的可选注入绑定，缺依赖明确不可用，撤回中取消本次分配，不绕到其他后端。
- terminal-binding 对实际查找得到的 Agent/context/subprocess 做**逐调用只读转发 facade**：保留真实 id、Session、fiber、其他服务及控制参数，只把这个 SDK create 调用取得的公开 spawnTerminal 能力收紧。SDK 的最终 spec.cwd 必须经公开 FS 解析成绑定项目的精确规范目录，且仍是目录、Session 仍在，才按规范路径交给原真实 provider；argv/env/尺寸/信号等照转。没有伪造新 Session、改 owner、覆盖全局 Context 服务、替换运行 runtime、私有导入或另写 PTY。SDK 继续掌管身份、限额、幂等、持有与流。回执另验 cwd：已有外项目 terminal id 的幂等返回也拒绝，不能认领，更不能把对方已有进程杀掉。它仍是 SDK 的系统用户终端权限语义，不冒充 Agent sandbox 隔离；祖先路径在 syscall 前被外部替换的残余 TOCTOU 不声称消除。
- 增加 8 项目录真实 SDK FS 用例：metadata-only/只读、缺绑定与非 owner 不达 listDir、越域/文件/末级链接、读取中 A-B-A 目标仍 A、最终留 B 拒绝、解析目标变化、条目/编码字节预算（受控 provider 元数据）、取消。另 8 项 terminal-binding 使用真实 SDK FS 与明确 controller/runtime doubles，检查真实字段/其他能力行为转发、不替换原 provider、owner/项目拒绝、queued ensure 的 A-B-A 在 spawn 前挡住、已有外项目 id 不杀、alias 规范路径、取消、陈旧 Session。doubles 不代替下一条实际原生取证。最终 foundations-round11.tap **182/182** 无失败/跳过。
- 三条独立 native wrapper：scope-races 在请求到达 B、响应前还原 A 时收到 Host workspace-changed；随后在实际 Host fs.listDir 期间再改 B 并还原，冷的这次真实读取仍返回 A 元数据，ONLY-B 不进 A 树。scope-terminal 的延迟 create 被拒，新增真实 spawn 为 0；scope-ensure 则让拥有的 workingDirectory 夹具方法在 SDK ensure 阶段返回 B 而 Host 已恢复 A，证明不是请求入口早拒绝，最终公开 spawn 门仍拒绝，spawnDelta=0。三个场景均另实际请求“B 项目＋A 已有真实终端 id”，SDK 幂等返回被后验门拒绝，原 A 仍 connected、不新增进程；失败的 TERM-RACE 通过真实确认关闭和 SDK close 队列收尾，不把其 DOM 当成新进程。结果分别写 workspace-scope-directory/terminal/ensure-result.json，不相互覆盖；启动拒绝图在关闭失败面板前截取，workspace-terminal-ensure-refused.png 已实际查看。
- build-round11.log 与全链退出 0：directory/terminal-scope/ensure/shelf/project-binding/layout/history/composer/reference/native/client/sidebar/ui/terminal-round11 各 1/1，基础 182/182，diff 通过。双项目真实 SDK/controller/runtime/PTY 的既有 12 次保活与 Linux 内核 cwd 核对仍通过新 facade，不只新增拒绝路径。Host Session/cwd/policy/owner、日志/设置/UI scope adapter/外框仍是明示夹具；prompt=0，无模型调用，生产完整 Host/真实 Agent 类与权限装配、AppFrame、跨执行后端、Windows 和独立复核仍欠，不能外推生产验收。
- 负记录保留：scoped-terminal r1 的 lookup 严格类型身份与 SDK 注册定义不符，改为公开 SDK SessionId typeSymbol 而非删校验；首次基础测还发现真实 Context.get 的服务代理不保证引用恒等，改测公开能力的行为与真实路径；listDir 会把链接分类为目标目录，产品加 lstat，而非放宽链接断言。fixture 重复 provide workingDirectory 被 Cordis 正确拒绝，改为测试自有 plain fixture 的 ensure 方法钩子并 finally 还原，不替换服务。terminal-scope new-r2 在拒绝已成功后因未收起失败 TERM-RACE，原“最后没有任何 xterm”断言超时；补真实关闭，保留原无 xterm 断言。shelf-r5 的旧客户端 Host 前缀文案与 Host 稳定拒绝不同，保留工作区变化语义断言。ensure-r4 把 SDK Error 实例跨 CDP 序列化丢非枚举 code，改在浏览器内提取 code/message 原语；不把 undefined 当产品正确拒绝。一次 literal guard 不匹配在写任何文件前中止，未虚报脚本执行。
- 下一轮优先终端异步清理失败/可见重试、断线重连/持续输出/idle 与撤回；保留 shelf 的服务重注入重接线、dirty HMR/草稿恢复仍未做。别名多文档去重、公共模块扩展、真实会话壳/tab 可见性、项目工具栏主题窄屏/a11y、预览 IME/undo、旧 npm 四项失败、可复现 SDK bootstrap/锁/打包与正式独立复核继续保留。A1–A8 未缩减，未整体验收/交卷/采纳，不提交推送发布部署；运行 DSH/Mind/已装载插件与安装 SDK 文件未改。


## 第十二轮：终端关闭失败、未确认回执与原生同步关闭（2026-10-27）

### 产品改动及公开契约

- 核对实际 rc.2 公开 client 声明/入口：ClientTerminals.close 返回 void，先保存关闭意图、移除 tab，异步 cleanup；公开 closeFailures / retryClose 才是失败与重试入口。Host close 的公开契约是 provider 清理及输出排空成功后返回，失败保留身份供重试。不能拿面板消失、detach 或释放 Fiber 代替关闭确认。
- 新 [terminal-cleanup.mjs](../src/workbench/terminal-cleanup.mjs) 只观察 SDK 公开 closeFailures 和本项目 manager 实际发出的 public Remote.close。控制器在调用 SDK.close 前登记 queued 意图，真实 RPC 开始才标 pending，只有 ok:true 回执清除；错误、缺失回执、网络异常都保留未确认状态。没有直接结束 PTY、私有队列/存储读取或第二套落盘关闭队列，持久关闭意图仍由 SDK 负责。
- 重试调用 SDK.retryClose，不重开 tab、不分配 PTY。它返回 void，且 SDK 可能忽略尚在收尾的重复请求，因此界面不能因按钮点击就伪造 pending 或清掉失败；以实际 Remote.close 调用/回执更新。导入 SDK 遗留失败，显示其原始 title/message；未确认任务上限 256，超量恢复显式 overflow 并阻止关项目，确认后自动装配剩余任务，绝不悄悄淘汰未知任务。有限确认身份缓存防止旧失败快照立即复活已确认任务。
- 操作区新增独立“终端关闭任务”区域：内容 panel 可移除，失败任务和重试按钮仍在，说明“进程状态未确认”。项目与实际原生 Sidebar 同步 close 在 queued/pending/failed 时拒绝释放项目/Fiber、保留文档。工作台包含运行终端时，首次确认只提交终端结束请求并保留草稿；得到宿主回执后，再明确关闭项目/处理草稿。仍遵守 SidebarRightCloseHandler 同步拒绝契约，不把它改成 async。
- 未确认关闭也进入 beforeunload 的未完成检查。强制服务卸载仍只释放资源，不声称 queued 清理成功。清理确认只替换自己拥有的旧关闭警告，不覆盖更晚的文件/布局错误或其他操作反馈。

### 真实 SDK / Chromium / PTY 验证

- 新 [native 场景](../test/fixtures/native-terminal-cleanup-scenario.mjs) 及 npm run test:workspace-terminal-cleanup-native，沿原有实际 Sidebar/ClientSessions/Chat/输入/引用/PTY 链路执行，不调用模型。两个故障由自有隔离夹具明确注入：
  1. provider terminate 持续拒绝目标进程，直到第二次明确 public close RPC 才允许；实际 SDK close 失败后原终端内容 panel 已移除，但失败行可见，真实目标 PID 与原终端 PID 都仍存活。直接项目 close 与实际 Sidebar.close 均拒绝；点击 SDK 重试后，真实 provider 结束目标，process.done 和 ESRCH 核对，仅目标退出，没有额外 spawn，原终端仍活着。SDK Host 可后台重试，测试不会将这些内部尝试误计为用户请求。
  2. 目标实际关闭、provider.done 已完成，但成功 HTTP 回执先被 gate 持有，UI 保持 pending、关闭仍拒绝；随后明确丢失回执，UI 保留 failed/未确认，不能因 PID 已不存在就在客户端假定成功。再点击 SDK 重试，Host 幂等确认关闭，清掉任务，terminate 次数不增加。
- 两场景后控制器、文档/选区、textarea、iframe、原 PTY xterm 和原生输入均保持原对象；原有网页表单不重挂。[关闭失败截图](../test-output/workspace-terminal-close-failed.png) 已看；[回执未知截图](../test-output/workspace-terminal-close-unknown.png) 已看。[结构化结果](../test-output/workspace-terminal-cleanup-result.json) 写明故障注入、实际部件及排除项。
- 最终 build-round12-final.log；foundations-round12-final.tap **200/200**，0 失败/跳过（新增 cleanup 14 项、controller 4 项）。cleanup、directory、terminal-scope、ensure、shelf、project-binding、layout、history、composer、reference、native、client、sidebar、ui、terminal 的 round12-final.tap 各 **1/1**；完整串行命令 exit0，diff 检查通过。先前 round12 非 final 链也全过，但最后文案归属修复后的 final 才是本轮最终基线。

### 失败记录与未完成事项

- 初版装饰器给无取消参数的 terminal/close 额外传了一个 undefined：严格 RPC 报 expected 2 argument(s), got 3，真实棚架回归超时。没有放松原断言；修复实际调用 arity，新增严格两参数单测，保留 cleanup-shelf-r1.tap。初版源码补丁最后在 package 脚本字面 guard 停止，前面文件已写、package 未写；只按现有脚本修复 package，未盲重放已完成补丁。
- 补上容量腾出后的失败装配及旧失败快照优先级；确认后旧“仍有未确认”页脚不能继续显示，且不能顺带覆盖无关反馈，均有单测。没有将本轮失败记录抹成首次即过。
- 这是隔离 SDK / Gateway / runtime / PTY 证据；Host Session/cwd/policy/认证、日志端、设置及 UI scope adapter/外框仍是明确夹具。不是生产完整会话壳/真实 Agent 装配、跨后端或 Windows 认证，也不是模型/prompt 执行证据。
- SDK 同源持久关闭恢复仍沿其原语义，跨 Host/其他会话归属未做完整审计；Session 消失且 SDK 不再保留重试记录时，不自动清除未知状态，后续需要合法的宿主核对/恢复交互。强制卸载/HMR 的草稿/未知结果挽救、终端重连/持续输出/idle/服务撤回仍需继续；不能用本轮关闭重试代替它们。
- 下一轮优先终端连接与撤回边界、原 scope shelf 的重注入与 dirty HMR 保全。别名/多文档规范去重、公共模块扩展卸载、真实 Header/AppFrame/session tab 可见性、主题窄屏/a11y、预览/IME/undo、SDK bootstrap/锁定打包、旧 4 个失败及正式独立复核仍欠。A1–A8 和三张设计不减；未整体交卷、采纳、提交、推送、发布、部署或触碰运行 DSH/Mind/已装载插件。


## 第十三轮：首次启动重试、真实断线输出恢复与输入禁用（2026-10-27）

### 产品修复及公开 SDK 行为

- 真实负对照：隔离 HTTP 故障在首次 create 到达 Host 分配前拒绝。旧按钮只有 connect；实际 TerminalView 尚无 info 时 connect 直接返回，点击后仍 failed、只有 1 次 create、spawnDelta0，要求恢复 connected 的断言真实失败。[负例](../test-output/terminal-retry-old-negative.tap) 与 [旧观测](../test-output/terminal-retry-old-observed.json) 保留，未改成“本来就不该重试”。
- 新 [terminal-state.mjs](../src/workbench/terminal-state.mjs)：仅作公开 TerminalViewState 的显示及操作决策。failed/disconnected 且未采用进程 info 时明确“重试启动”调用公开 refresh；已有 info 只“重新连接”调用 connect，绝不为确认过的身份创建替代进程。按钮执行时读取当前快照，busy/closing/closed 无重试。首次重试保留原 ID，只有用户明确点击后实际 spawn1。
- 只有 connected + SDK writable:true + info.state:running 才允许输入。xterm 初始 disableStdin，随上述状态更新，真实 helper textarea 有 aria-disabled；断线明确说明输入已停用且按键不重放。退出信息显示公开 exitCode；只读/缺失身份不假装可输入。重连/流代际/屏幕重置与输入队列仍由 SDK 管理，不自建重连循环、手工篡改 view 状态或替代 PTY。

### 实际 Gateway WebSocket / PTY 场景

- 新 [native 场景](../test/fixtures/native-terminal-reconnect-scenario.mjs) 与 npm run test:workspace-terminal-reconnect-native：实际首次启动失败、点击重试后保持 ID、实际成功分配一个 PTY，再明确关闭该试验终端；之后测试原 TERM-01。
- 在原 PTY 执行真实 bash gate。切断实际浏览器 WebSocket、SDK 状态进入 disconnected/writable:false 后，才由 Node 写自有 gate 文件，放行 shell 实际产生 40 行输出及完成标记，期间 PID 仍活。断线时通过实际 xterm textarea 键入测试命令，恢复后核对文件确实不存在，不用“界面没有显示字符”冒充无重放。
- 夹具公开 connection generation 恢复后，实际 SDK supervisor/retain/attach 自动重连，新 screen snapshot 同时含第 01 与 40 行，浏览器显示第 40 行。恢复后从 shell 再打印 $$，与原 kernel PID 一致，spawn/close/terminate delta 都为0。再真实断线并点击“重新连接”，恢复后仍是同一个 view/ID/PID，无新增进程。最终共两次新的 WebSocket 连接。
- controller、doc/正文草稿、textarea、iframe、原 xterm、原生输入对象和输入草稿在第一恢复检查均为原对象。原 iframe 的表单仍可见。截图 [断线](../test-output/workspace-terminal-disconnected.png) 和 [重连](../test-output/workspace-terminal-reconnected.png) 已读；[结构化结果](../test-output/workspace-terminal-reconnect-result.json) 写明真实部件、40 行、PID、delta、状态与排除项，prompt0。

### 夹具缺口，未伪称 SDK 缺陷

- 初版无法自动恢复：原夹具 loader.await 永不完成，没有接上 Gateway 公开 connection.start 的 onReconnectRequested；补上异步初始化完成及公开 start 回调，未调用 private mux。
- 随后新 socket 仍立即失败：原夹具把同一个 peer Context/Fiber 用于所有 admission，第一次关闭后已经 dispose，又给第二连接使用。真实 Gateway admission 是同步契约；公开 Cordis plugin 初始化实测并非同步，尝试在 admission 当场建 peer 的实验在写入前主动失败，没有改 SDK 签名或假称同步。
- 正确做法是在自有隔离 server 的 upgrade 外层异步准备每条连接独立的真实 Cordis peer Fiber，再将已就绪 admission 交实际同步 Gateway.handler/admitConnection，按连接幂等释放。认证仍明确是 owner 夹具，不是生产认证。r1/r2 失败日志保留，r3 自动恢复实际通过；没有靠改成手动重连来代替自动恢复断言。
- 去掉双项目结果里过时“只有启动前预检”的排除说明，改为明确项目选择不改 Host cwd、启动绑定另有 scope-race 回归。未回写旧证据冒充当时已经修复。

### 最终回归与未完成项

- [构建日志](../test-output/build-round13.log)；[基础回归](../test-output/foundations-round13.tap) **209/209**，0 失败/跳过（新增9个终端状态/动作单测）。reconnect、cleanup、directory、terminal-scope、ensure、shelf、project-binding、layout、history、composer、reference、native、client、sidebar、ui、terminal 的 round13.tap 各 **1/1**，全串行命令 exit0，diff检查通过。
- generation 可变数据源、连接 start 时序、owner admission/认证仍是明确的隔离夹具；实际 SDK Gateway/supervisor/终端状态机/retain/attach/runtime/PTY/原生 Chat 与输入参与。不是实际 dsh-client-connection 握手、真实生产 Host Session/Agent/policy/auth/prompt、其他后端或 Windows 的认证。默认该场景 unattendedTimeoutMs0，不能证明 idle 到期或长时间断线存活。
- 同服务内的连接代际恢复不等于 Cordis 服务撤回/重新注入，更不等于模块 HMR/浏览器重载的数据挽救。下一轮优先原 scope 棚架的撤回/重注入与 dirty/未知保存恢复；idle、长持续输出、并发浏览器输入所有权、别名多文档、公共模块、真实 Header/AppFrame/tab可见、主题窄屏/a11y、预览IME/undo、bootstrap锁打包、旧4失败和正式独立复核仍欠。A1–A8 与批准设计不减，整体未完成；无交卷采纳、提交推送、发布部署，未动运行 DSH/Mind/安装 SDK/已装载插件。


## 第十四轮：稳定内容席位与工作区接口撤回/重新接入（2026-10-27）

### 生命周期与请求边界

- 原生 tab kind/close handler/React 内容席位只依赖原生 Sidebar 服务，不再跟工作区 namespace 注入一起消失。SDK ClientTerminals 的真实子 Fiber 移到稳定 Remote/terminal/Connection owner 下，不再归属于更短的工作区 namespace consumer。没有 DOM 搬迁、第二套 xterm、PTY 或全局 provider 覆盖。
- 新 [service-epoch.mjs](../src/workbench/service-epoch.mjs) 是本地寿命断言，不是权限。每次接口注入有独立 AbortController，文件/目录/项目/终端启动调用捕获该 epoch 并合并请求信号；撤回即取消，旧 epoch 即使忽略取消、返回成功或原错误看似 definitive，也不能作为当前回执。上行未派发才返回 workbench/service-unavailable；在途变化返回大写 WORKBENCH_SERVICE_CHANGED，不能被文档当作确定未写而清掉 pending。
- 棚架/文档仍绑定原 Remote owner、projectId 和规范目标。namespace 在同一 owner 下重新注入后，旧 controller 可使用新接口；Remote/Connection/terminal owner 被整体替换时不会自动把旧项目授权解释为新 owner，保留内容并拒绝调用。Host owner/policy/Session/project/path/version 检查照旧，epoch 不代替这些检查。
- 新“重新接入文件接口”操作及 API.reconnectFiles 只处置自己持有的实际 SDK $mount disposer，再走公开 $mount 重建当前客户端 projection；并发请求合并，不重启 Host、不重开内容/进程、不自动重发写入。新增服务暂停提示；本地草稿仍可编辑/导出。引用与终端输入在缺少有效工作区 epoch 时停用，旧进程不因 namespace 暂停而收到 close。

### 真实 SDK / Chromium / FS / PTY 场景

- 新 [native 场景](../test/fixtures/native-service-rebind-scenario.mjs) 和 npm run test:workspace-service-rebind-native，实际通过产品恢复操作撤回/重新注册 namespace 共4次，公开 ctx.get 观察到4次 projection 缺席。没有用对象同名替换或模拟一声 reconnect 代替真实 Cordis 生命周期。
- 通过真实 Host/versioned FS 写入后，隔离 HTTP 故障 gate 持有成功回执；其间继续编辑，然后撤回旧接口。旧请求实际取消/拒绝采纳，Doc 保留 uncertain、原 pending capture 及后续新增文本。把 Host cwd 切到 B，原 A 的读回拒绝且 B 文件字节不变；回到 A 后，只有明确 reconcile 读回才确认原写入，保留后续草稿 dirty，未自动第二次 save。
- controller/doc/view、textarea/iframe/xterm/原生输入与输入草稿均是原对象，MutationObserver 记录内容节点断连0次，原真实 PID 存活；spawn/close/terminate 均无新增，activeRetains 不变，接口恢复后棚架 checkProject 正常。不是“丢弃后再生成一样的画面”。
- [未知保存图](../test-output/workspace-service-save-uncertain.png) 与 [接口恢复图](../test-output/workspace-service-rebound.png) 已读。[结构化结果](../test-output/workspace-service-rebind-result.json) 明示真实部件和排除项，prompt0。用户在测试中新编辑过文档；不把返回的 viewport 观测字段冒充未执行的视口不变断言。

### 真实回归发现并修复的 clean reload 竞态

- 第一版缺少 Content 的 servicesAvailable 属性传递，实际 slot 报未定义、无 .dshome-v2；修复实际 props 链而非跳过原生渲染断言，保留 service-native-base-r1.tap。
- 全链随后在原 packaged-client 重入测试超时。新增诊断实际定位：replacement0 重复注册 native type，新 ready 一直等待。稳定席位较早注册，旧 reentrantPass 不 await 异步 teardown，旧席位尚未释放，不能只靠 namespace 队列串行性。
- 新 [客户端](../src/workbench/client.mjs) clean replacement barrier：旧 dispose 立即公布自己的异步完成 Promise，新 API/ready 先可见，但真正注册席位、namespace 和引用桥要等旧清理完成；新旧都可在启动等待中被取消，卸载 Promise 幂等，失败不冒充成功。原始5次“新实例立即开始、旧实例还未完成退出”的断言完全保留，现通过。[诊断负例](../test-output/client-service-race-diagnostic.tap) 保留，未加 sleep 或放宽15秒 timeout。
- 该 barrier 只证明干净替换有序，不是脏文档 HMR 恢复，也不认证来自旧版未公布 Promise 的升级路径。

### 最终基线与欠项

- [构建](../test-output/build-round14-final.log)；[基础测试](../test-output/foundations-round14-final.tap) **220/220**，0 失败/跳过（新增11项 epoch/真实Document模型组合单测）。service、reconnect、cleanup、directory、terminal-scope、ensure、shelf、project-binding、layout、history、composer、reference、native、client、sidebar、ui、terminal 的 round14-final.tap 各 **1/1**，全串行命令 exit0，diff检查通过。非final全链因 client 竞态停止，不能算尾部测试已执行。
- 本轮只覆盖同 Remote/Connection owner 内工作区客户端 namespace 的撤回/重接，不等于 Host FS plugin 撤回、整个 Remote/Connection/terminal 服务替换、原生 Sidebar 提供者消失、插件 HMR 或浏览器刷新保全。Host Session/cwd/policy/owner/auth/journal/settings/UI scope adapter/外框仍是明确夹具，非生产完整会话壳/Agent/prompt、其他后端/Windows 验收。
- 下一轮优先脏草稿/未知保存/未确认关闭的 HMR 保全或受控阻止重载；整体 owner/终端服务撤回恢复仍需补。idle/长输出/并发输入、别名多文档、公共模块扩展、真实 Header/AppFrame/tab 可见性、主题窄屏/a11y（包括深色终端中按钮对比度）、预览IME/undo、SDK bootstrap/锁打包、旧4失败和正式独立复核仍欠。A1–A8及三图不减；目标仍进行中，无整体交卷采纳、提交推送、发布部署，运行 DSH/Mind/已装载插件及安装 SDK 未改。


## 第十五轮：公开 Cordis 配置更新的内容保护闸（2026-10-27）

### 边界先行，不把配置更新当作所有 HMR

实际读取当前安装 SDK 的公开声明：Cordis Events 的 internal/update 是 waterfall，明确允许不调用 next 来 veto；Fiber.update 在此 hook 后才更新/重启。Fiber.restart、dispose、依赖撤回、浏览器刷新不经过这一配置更新 veto，未由它保全。未读取到、未认证运行 DSH Web 的生产 HMR 接收器具体如何装卸插件；没有触碰它，也不把本轮称作完整 HMR 通过。

新 [reload-state.mjs](../src/workbench/reload-state.mjs) 只做本地只读 preflight。仍保留任何项目、项目操作进行中、异步退出未完或检查异常，一律暂缓会影响该插件的配置更新。即使文档干净，也不能假定网页表单、终端缓冲、选区及视图内存已经可恢复；因此这里是明确关闭项目再更新的保守闸，不是仅看 dirty 的乐观过滤。dirty/unknown/saving/loading/comparing、终端视图、网页地址、布局编辑/保存、关闭 requests+overflow 独立计数，供用户理解和测试核对；它们不授予 Host 权限，不读跨域 iframe，不保存/导出/关闭、不确认未知结果、不重放任何请求。

[客户端](../src/workbench/client.mjs) 使用公开 global/prepend update listener，通过该事件总线背后同 Cordis registry 的公开 Fiber uid 与 parent context 链限定影响本插件或其祖先的更新；旁支更新继续 next。只有当前 preflight 允许才放行，veto 不改 config、不卸载旧实例。服务/context 视图的引用相等不能当 Fiber 身份：最初引用比较在实际浏览器中未能命中，当前用公开局部 uid 识别；这不是宿主身份/授权判据。API.checkReload 与 status.reload 是新鲜只读快照，status.lastUpdate 是有界公开 Fiber 诊断，不存正文。界面提示是“拦截时”的状态与处理步骤，明确说明强制卸载/刷新不受保护，不用旧计数冒充当前待办。引用桥、RPC 与真实 SDK terminal 生命周期不因 veto 变化。

### 固定真实负例，随后走同一公共入口

- 新 [Native update 场景](../test/fixtures/native-update-guard-scenario.mjs) 直接对隔离 product Fiber 调 update/await；product 是 fixture 本来持有的实际 Cordis Fiber，新暴露仅在测试 fixture，产品无测试 flag/backdoor。
- 未加闸的 [真实负例](../test-output/update-guard-old-negative.tap)：dirty 时 config 被采用，API/controller/editor/iframe/xterm/view 都不是原对象，文档内存丢失，原生输入独立未变；activeRetains 从1降0，spawn/close/terminate 都0。保留 [原观测](../test-output/update-guard-dirty-old-negative.json)。不把“进程暂时没死”当作终端持有或内容无损。
- 初版局部对象匹配和 global 引用匹配均未真正挡住，update-guard-native-r1/r2 负结果保留，断言没有改为允许重挂。最终实际回执 target uid16、owner链uid16，改为同 registry uid 比较后命中，原 API/config/控制器/文档文本/编辑器/iframe/xterm/view/原生输入全部保留。未借私有 _hooks、私有 Registry/Fiber字段或改 SDK 实现来补。
- 最终 Native 以原实际 public update 入口累计6次：dirty、终端关闭真实失败、关闭已结束但回执仍挂起、关闭成功回执丢失未知、真实版本 FS 写后的 saving、namespace 撤回后的 uncertain。每次检查当前对应计数>0、配置未采用、原对象/文本保留、终端 connected、spawn/close/terminate 与 activeRetains 不因尝试而变化。关闭目标真实PID存亡、SDK retry 与未知写读回继续沿原 Round12/14 断言执行，veto 没有代替处理它们。
- 另一个 fixture 自有旁支 Fiber 的 update 正常重新执行2次，未被越域拦住。末尾明确完成真实待保存文本的保存、关闭原 PTY并获确认、关闭 native 保留项目、等待退出完成；checkReload 才变 allowed，实际 update 随后采用新 config、创建新 API且 ready成功，原生输入节点仍是同一个。没有“永远禁止一切更新”换取绿灯。
- [结构化结果](../test-output/workspace-update-guard-result.json) 包含6组原对象/计数观测、safe update/旁支不受影响和排除项，prompt0、errors空。[阻止更新图](../test-output/workspace-update-blocked.png) 已实际读取。结果中的 phase 是观察到的 terminal connected；各故障场景的标签另见具体调用/观测文件，不把它解释成伪造的 SDK lifecycle phase。

### 最终基线及未达成项

- 最终 [build](../test-output/build-round15-final.log)、[foundations](../test-output/foundations-round15-final.tap) **234/234**，0失败/跳过（新增14项 preflight及 uid/祖先/旁支/失效ID/循环/只读诊断单测）。update、service、reconnect、cleanup、directory、terminal-scope、ensure、shelf、project-binding、layout、history、composer、reference、native、client、sidebar、ui、terminal 的 round15-final.tap 各 **1/1**，全串行 exit0、diff检查通过。
- 另外实际重新运行 npm test：[旧回归日志](../test-output/legacy-round15-final.log) 仍 **63/67，exit1**。4项是 hashed CSS-module class 断言、delivery degrades 断言、feature cannot fire in-page 提示断言，以及 host apply 被无 ctx 调用时 reflect 缺失；未修、未删除或改宽。npm test 的 && 后 domtest 没有被执行，不能冒称通过它，更不能声称全仓回归全绿。
- 所有验证仍在隔离工作树、独立浏览器/Context/Gateway/真实FS/PTY中；Host Session/cwd/policy/owner/auth/journal/settings/UI adapter和外框仍明确夹具。被验是这份工作树/构建内容，不是 HEAD、已提交/推送或运行安装版本。
- 已完成的是配置更新受控 veto及清洁后放行，不是对生产 HMR 接收器/新 plugin apply后旧实例强制dispose/Fiber.restart/依赖撤回/全Remote或Connection/terminal服务替换/浏览器刷新的无损保证。实际祖先匹配逻辑有纯单测，Native覆盖本 product 和旁支；生产祖先装载链未认证。上述强制路径的可恢复草稿/明确降级仍待补。
- 下一步优先查清生产 Loader可用的公开 HMR/卸载入口并保留这些限制，同时推进剩余完整壳/可见性、终端撤回/idle/长输出/并发、别名多文档和扩展、主题窄屏a11y/IME/undo、bootstrap锁打包、旧4失败与正式独立复核。A1–A8/三图不减，整体任务未交卷采纳，未提交推送发布部署；运行 DSH/Mind/已载插件/安装 SDK 未改。


## 第十六轮：旧四失败逐项核对、DOM 兜底矩阵与幂等修复（2026-10-27）

### 不把四个过时断言冒称四个产品修复

先保留 [上轮旧失败](../test-output/legacy-round15-final.log) 63/67，再直接运行此前被 && 中断的原始 DOM suite，实际 [基线](../test-output/dom-round16-old-baseline.log) 是106/106，不是假定它过。四项逐一对照 [selftest](../test/selftest.mjs)、当前源码和真实 Gateway 测试：

1. hashed-selector 正则在整个打包 JS 上找“.字母_字母”，误中 Number.POSITIVE_INFINITY、DISABLE_DISPOSED、schema/checks exports 等 JS 属性，非 CSS 依赖。改成用锁定开发依赖 Acorn8.15.0 解析原始经典脚本，检查解码字面量/常量拼接/静态 template 中同一禁止形态，不靠忽略 enum 名字清单，原两个已审计的属性后缀例外仍保留。新 [AST literal guard](../test/fixtures/selector-contract.mjs) 和 [10项正反测试](../test/selector-contract.mjs) 检查真正带 hash 的 query/CSS 文本、JS转义、常量拼接及 template 都会抓住，注释/正则/JS属性不会误判；非法JS/模块导入不能以空结果通过。它是 literal/constant tripwire，不是完整 CSS/dataflow 分析器，不认证动态拼接的所有运行分支。当前 DOM suite 仍检查实际发出的规则。
2. delivery 的旧正则要求恰好双参 toast 紧贴 var mode；真实实现已带 session 来源和 !systemSent essential 参数，默认保留页内卡片，toast:false 只能抑制冗余备份，不能抑制系统构造失败时的唯一可见卡片。保留前后台/always/never判断、constructor探测和默认后台card留痕原断言；源码 tripwire 改验当前四参强制 fallback，另用实际执行的矩阵证实分支，不是允许忽略失败。
3. wiring gap 旧正则只接受双参；当前四参 null,true 是确保 toast:false 也能看到接线缺失。改验强制essential调用，并补 bare+toast:false 只出现一次、健康接线不误报的运行断言；既有grace及teardown取消断言仍在。
4. host apply 旧断言对已不再为空的宿主无参调用且要求 must do nothing，违背V2实际服务构造契约。现在仍要求导出function，还要求缺ctx失败(TypeError)、真实注入清单及所有服务方法存在；不改产品去假装注册成功。有效Context下注册/Remote身份与工作区/版本FS拒绝、终端接入继续由 foundations 中实际 [Gateway测试](../test/workspace-gateway.mjs) 取证，不以 stubCtx/no-op 主张宿主通过。

Acorn 仅开发测试用，精确版本/integrity 进入 [manifest](../package.json) 和 [lock](../package-lock.json)，未进入客户端或Host生产依赖。安装前实际 realpath 核对 worktree node_modules 和 .dev-sdk/node_modules 都在隔离树内，安装全加 ignore-scripts；分别有安装回执，无改安装 SDK/runtime/运行插件。标准 npm test 先执行 guard 正反测试再 selftest/DOM，不允许 guard 自身没测就当全绿。

### 新增矩阵发现的真正产品缺陷

[DOM double](../test/domtest.mjs) 的 FakeNotification 现在显式记录标准事件 listener 并能触发 error，constructor throw 也可定向注入。新增8项：toast:false 前台/权限拒绝/构造抛错的唯一可见兜底、延迟error重复、默认备份error后不重复、退出后迟到error不复活、gap不能被toast:false吞掉、健康接线无虚假gap。

其中实际发现新bug：toast:false 且构造成功后收到重复error会创建2个兜底卡片/重复close。[未改产品的负例](../test-output/dom-error-old-negative.log) 113/114，仅精确once断言失败，未删断言。随后在 [产品源码](../src/legacy-client.js) 给该通知error处理加 disposed/failed 幂等闸；首次才关闭句柄并创建essential fallback，后续/卸载后不再反应，原声响/前后台策略/默认备份不变。systemNotify返回值注释纠正为“constructor accepted，不是OS可见回执”，没有把构造成功改写为系统实际投递。该负例是运行经典包的DOM double注入，不是Windows系统通知实测；系统静默丢弃而不发error的 toast:false opt-out 仍不能凭constructor观测，默认备份保留。

### 最终回归与仍欠边界

- [build](../test-output/build-round16-final.log) exit0；[npm test](../test-output/legacy-round16-final.log) 的 selector10/10、旧selftest67/67、扩展DOM114/114 全部实际执行通过，没有靠原 && 停掉后半段。
- [foundations](../test-output/foundations-round16-final.tap) **244/244**，0失败/跳过（新增10项selector guard，在npm test与foundations重复执行不算额外独立收益）。update/service/reconnect/cleanup/directory/terminal-scope/ensure/shelf/project-binding/layout/history/composer/reference/native/client/sidebar/ui/terminal 的 round16-final.tap 各 **1/1**；含实际SDK/Chromium/FS/PTY的全串行命令exit0，diff检查通过。
- 只声称列出的脚本通过，不等于全部包里每个历史脚本、生产会话/OS通知或整体验收已过。未跑的旧 workbench 等脚本不冒充已跑；bootstrap/全打包复现/生产HMR Loader、强制卸载/服务owner替换、完整Header/AppFrame/tab可见、终端idle/长输出并发、多文档别名和公共扩展、主题窄屏a11y/IMEundo、正式独立复核仍欠。下一轮优先实际壳/可见性和UI整合，不把在安全回归中取得的绿色代替批准设计效果。
- A1–A8及三图不减，整体目标执行中，正式任务未整体交卷采纳；当前为未提交工作树构建，不是发布或安装版。未提交推送部署、未重启重载运行DSH/Mind或已装载插件，原安装SDK未写。


## 第十七轮：实际 AppFrame / Main / Header 与 Session scope 接线（2026-10-27）

### 不再用外框/模式按钮夹具证明原生入口

新增 [native-shell-entry](../test/fixtures/native-shell-entry.mjs) 与 npm run test:workspace-shell-native，复用隔离Gateway/FS/PTY、实际ClientSessions与日记后端。由 [公开浏览器导出解析器](../test/fixtures/sdk-client-source.mjs) 读取已核0.2.1-rc.2的 ui-session/ui-layout 等 ./client，不做私有深层导入，不改安装SDK。

新路径真正装配 ui-session 的标准source adapter、ui-layout 的 AppFrame与布局controller、ui-conversation 的 Main/ConversationHeader/SessionHeader/Lexical composer、ui-chat、SidebarRight；实际AppFrame独占root并声明子槽，未注册另一个自画Frame，也没有夹具“原版/工作台”按钮。在实际SessionHeader的 additive utilities 里点的是产品自己贡献的界面模式 group。旧外框/ready scope adapter 模式保留用于之前故障链，不以它们冒充新原生壳。

A/B 通过真实ClientSessions retain(mainView)切当前会话，ui-session实际发布对应binding/标准props，不再 Object.assign 一份固定A binding。日记 [fixture](../test/fixtures/session-journal-host.mjs) 默认仍是原A，新增可选B独立记录文件/seq/followers；本场景Host sessions/catalog加入B并按地址分发，schema与stream仍走实际SDK。A/B此处共享同一测试工作区，仅验证会话草稿与scope隔离，不冒称两个工作区路径隔离（后者由此前project/scope链取证）。创建/选择的辅助左导航、locale、theme snapshot、settings、frontend access answer、Host Session/cwd/owner/policy/auth/journal仍明示夹具；没有载入真正左Sidebar/workspace navigation provider或认证生产Host。

### 实际执行与精确身份边界

[场景](../test/fixtures/native-shell-scenario.mjs) 在实际Header点10次原版/工作台转换，并切5轮审阅/开发preset。真实Input DOM、既有Chat消息节点与草稿在同一会话的这些操作中身份未变；编辑布局及取消也另验当时的Input节点未变。不是“新建后内容看起来相同”。文件树实际按钮打开a.md，在真实textarea键入草稿；跨源测试页输入未提交表单；实际SDK/PTY运行shell，打印并核对kernel PID。

随后实际ILayout.selectPanel做其他主面板往返；改变窗口1280/1040/900/1920，以输入与工作台矩形连续3个animation frame不变为采样点，保留原 hit/边界断言：输入宽度>200，中心命中自身后代，操作区x不侵入输入右侧，page外层scrollWidth不越viewport。4组稳定输入hit均true，聊天400px中心轨道仍保留，工作区不足只在本区滚动。900以下、手机、DPR/缩放及整个resize过渡时序未认证。

真实会话 A→B→A→B→A，A聊天草稿保留、B独立草稿离开再回来仍在；文件controller/document/textarea/iframe/xterm/view在往返后仍为原对象，文档dirty、跨源表单值保留。保活检查阶段spawn/close/terminate无新增，原PID存活；末尾显式确认关闭该PTY后才查ESRCH。cleanup后activeRetains0、两Session activeFollowers0、prompt0、page errors空，不把“面板关闭”当作结束。

**输入节点身份不能跨范围偷换**：sameSession input/chat/draft严格true是模式/preset操作的断言；实际SDK在切其它main panel之后、以及另做Session切换之后，都会出现原生Input绑定DOM变化，最新结果分开记录 nativeNavigation 与 nativeSessionInputBindingChanged。草稿仍是各自正确数据。本插件没有为了强迫不同native Session共用一个DOM而搬迁/改写宿主树；也不声称其它main panel/不同会话的Input节点全程不变。主面板/会话生命周期不同于A5的同会话布局切换；扩大到它们的无重绑承诺未验。

### 保留测试负结果而非伪称产品修好

- r2文件树定位漏了实际图标前缀“▧”，正确公共按钮label后继续，不用直接调模型绕过真实点击。
- r3/r4在刚setViewport后的不同异步布局代次之间采样：输入已经变窄、工作区仍用旧宽度，hit得到wb-files。保留 [中间矩形](../test-output/native-shell-resize-before-settle.json) 和r4日志。新增3帧稳定条件不是删原hit/边界断言、加sleep或改宿主；稳定后4宽通过。该中间观测不能单凭采样断定用户已看见一帧遮挡，也不能由稳定通过声称全过程从未覆盖；强瞬态要求仍需专测。旁存的PNG是failure cleanup后来截图，不冒称与该JSON同一瞬时。
- r5把已经不再被retain的B当成仍有public binding，读ctx抛错；改为真正在B激活时读取，再离开/回来验证恢复，不伪造B context常驻。
- r6把最终Input节点与最初比较，跨入了native main/Session换绑范围；现在严格模式/preset身份断言在同Session同main阶段执行，后续换绑另观测、草稿仍严格检查；保留 [原观测](../test-output/native-shell-native-session-rebind-observed.json)。没有降低同会话模式/布局不重挂要求。

### 最终证据、视觉差距与后续

- [壳实测](../test-output/shell-round17-final.tap) 1/1；[结果](../test-output/workspace-native-shell-result.json) 明列身份、4宽几何、PID、换绑观察、双日记清理和夹具排除项。
- [回到A后的实际原生壳图](../test-output/workspace-native-shell-restored.png) 已读；此前bootstrap图也已读。它是接线/生命周期证据，不是批准三图的视觉验收；模式和项目栏仍未统一视觉、字体/调色是简化fixture，native初始45%右栏偏好使操作区比设计稿窄，布局属性/细节、空会话入口、主题与更窄窗口还需专修。
- 最终 [build](../test-output/build-round17-final.log)，npm test selector10/10+selftest67/67+DOM114/114；foundations244/244零跳过；shell/update/service/reconnect/cleanup/directory/terminal-scope/ensure/shelf/project-binding/layout/history/composer/reference/native/client/sidebar/ui/terminal 的 round17-final.tap 各1/1，全串行exit0。之后仅将本shell脚本的Main/Session诊断归因拆开，又重跑shell/npmtest/diff，均exit0；非shell测试依赖代码没有再变。未把重复执行累加成新独立收益。
- 下一轮优先真正统一模式/项目栏视觉和主题/窄宽/空会话入口，再补实际left workspace provider、resize瞬态、生产HMR/整体owner撤回、终端idle/长输出并发、别名多文档和扩展、IME/undo、bootstrap全包复现、正式独立复核。A1–A8及三图不减，整体目标仍执行中、非采纳交付；没有提交推送发布部署，没有动运行DSH/Mind/已载插件及安装SDK。


## 第十八轮：流式空会话入口、统一自有栏位和实际 SDK 主题（2026-10-27）

### 产品变更（未改 AppFrame / SDK / 运行页面）

- [client](../src/workbench/client.mjs) 保留非空会话Header.utilities的模式group；空会话原生Header会隐藏utilities，新增贡献到公开 conversation.hero.options 的同一Switch组件。移除shell.overlay的绝对定位 FallbackEntry：不抢占其它插件的single槽，不在输入区/其它main上另放浮动按钮，不搬迁宿主DOM。没有选定真实Session仍不伪造工作区入口。Hero控制与原生workspace chip同流，点击仍走原enter/session/服务检查。
- [chrome-css](../src/workbench/chrome-css.mjs) 仅在本插件dshome-v2 / wb-project-host / dshome-wb-switch上建立wb-*别名，消费实际SDK公开palette，不写body/Root的token或宿主列宽。模式pill包含aria-pressed、2px显式keyboard focus、disabled/hover。项目select/按钮统一30px控件、可换行工具条与受限label/select，不由长路径撑开宿主；[project-deck](../src/workbench/project-deck.mjs) 增加自有class/minWidth0，数据/内容key/保存行为未改。
- [ui](../src/workbench/ui.mjs) 控件显式取本插件前景/背景，而不是在深色Terminal父级继承浅字配浅按钮；体/栏/预览用同一自有palette，选中态随主题，solid主按钮独立深蓝以保持白字对比；小pane标题不再逐字换行。既有CSS拆成可读行，未因此重构内容宿主。公开token目录实测确认旧bg-layer-1/2同样是合法SDK token，不把此前简化theme fixture没提供它们当作SDK不存在；本轮别名整理不是声称修复不存在的token。

### 真实主题链和空会话数据条件

新增 [native-theme-settings](../test/fixtures/native-theme-settings.mjs) 仅模拟configForms的偏好存储回显；ThemeRuntime、主题token样式、matchMedia监听、theme/change与ui-layout presenter都来自同版实际SDK ./client apply，不再手画一份dark tokens来验dark。实际setTheme light/dark/system，system通过Chromium emulateMedia light/dark触发真实media query回调。结果保存getTheme、设置写记录和exportInspectTokens的公开目录。

Chrome新路径的B catalog标记blank，日记为空；真实ClientSessions / ui-session投影blank，不改私有UI状态。最初roster为空时，SDK因没有workspace chip而主动禁用Hero输入（placeholder.workspace），不是产品丢输入；补上明示的UI Workspace roster fixture（workspaceId/title/sessionIds A/B），让实际native guard按正常数据启用输入，没有force填禁用节点。设置存储、workspace roster/左nav/locale/access、Host Session/cwd/owner/policy/auth/journal仍是fixture；不能把本场景说成已接通生产Host/真正leftWorkspace provider。界面英文key来自明示locale fixture，字体/文案不算最终设计验收。

B故意不提供Host Agent lookup，点击实际“启动终端”经SDK/Typert得到真实failed启动投影，显示重试按钮；不是手造一个failed state。此场景spawn0，无OS进程声称；实际PTY保活另由全链shell/terminal等场景验证。

### 同环境只换产品 bundle 的负对照

修改前冻结 [old bundle](../test-output/round18-old-client.js)，baseline/current共用完全相同的新实际SDK Theme/AppFrame/Scene、工作区roster与Host故障；不改浏览器/viewport/label来让新版赢。[chrome场景](../test/fixtures/native-chrome-scenario.mjs) 两边都真正点击旧/新产品自己的入口；旧空会话没有group时只为继续矩阵而点旧浮动按钮，同时严格记缺少流式group和仍有浮动入口失败。

最终 [old negative](../test-output/chrome-old-negative-final.tap) exit1并有 [结构化旧观察](../test-output/workspace-chrome-baseline-observed.json)：空会话group0/浮动1、Header/项目栏缺统一样式、缺显式2px焦点，以及light/system-light终端重试字色rgb(214,226,243)配白底，对比1.30988。共10条失败含主题重复，不称10个独立产品bug，也不把旧浮动按钮的位置直接当作已实测盖住了输入。

当前 [positive](../test-output/chrome-round18-final.tap) 1/1，[当前结果](../test-output/workspace-native-chrome-result.json) failures[]、空会话group1/浮动0，Tab到工作台有solid2px焦点、Enter真展开再点原版收起。4种偏好/系统scheme下，实际pane、项目按钮、Terminal重试、非选中模式按钮的复合背景sRGB相对亮度对比均>=4.5（当前样本最低约8.64）；空会话输入DOM在这些theme变化中仍connected、输入草稿保留。没有把disabled控件计成正常按钮；这仅是选定控件，不是整页WCAG认证。

900px稳定3RAF后原native输入中心命中自身、工作区在其右侧、外页宽900；实际项目toolbar5控件均在本panel内。测试先前错误用所有nav按钮，扫到了本产品“单标签隐藏”nav的4个0矩形；现限定语义“会话项目”的toolbar，而不是移除外溢断言或修改模型来躲。旧/新最后都用这个相同准确选择范围，未再宣称原来4个0矩形是产品外溢bug。手机/更小宽、DPR/缩放、整个resize瞬态仍未认证。

### 验证与仍未交付的部分

- 已实际看 [空会话当前图](../test-output/workspace-chrome-blank-current.png)、[system-dark当前图](../test-output/workspace-chrome-system-dark-current.png)、900px当前图与旧light重试图；是接线/视觉差异证据，非三张批准设计的整体验收。Stage最小尺寸仍由本区滚动、native默认45%右栏与最终设计比例仍需对齐方案，不通过私写layout store来改宿主。
- 最终build-round18-final、npm test selector10/10+selftest67/67+DOM114/114；foundation244/244零跳过；chrome/shell/update/service/reconnect/cleanup/directory/terminal-scope/ensure/shelf/project-binding/layout/history/composer/reference/native/client/sidebar/ui/terminal各1/1，共20个分层wrapper，全串行exit0，diff check0。原19条没有因为新UI而跳过。没有新增纯模型测试凑增量。
- 最初old run曾goto(load)超时，尚无证据归因给产品或外部字体。新增仅此Chrome场景的非loopback请求拦截是隔离防护，不把它宣称为已证实的超时修复；最终externalRequests[]，不存在凭拦截伪造离线字体成功的结论。最终字体精确度未验。其它现场错误与r1/r2/r3日志保留，不把harness故障当旧产品负对照。
- 后续仍需：实际HMR receiver/整体owner替换与强制退出边界、终端idle/长输出并发、canonical alias多文档/模块扩展卸载、IME/undo与用户字体角色/DPR缩放、真正leftWorkspace/locale/provider与生产Host验证、bootstrap完整包复现及独立复核。A1–A8三图不减，不因本轮过数宣告完成；没有部署、提交推送或改运行DSH/Mind/已载插件/安装SDK。


## 第十九轮：实际 HMR 接收、图撤项与明确退出边界（2026-10-27）

用户更新后明确继续；重核工作树HEAD仍e4ca7cd，当前公开modules/hmr为0.2.1-rc.2、Loader1.0.6/Cordis4.0.5。不因版本号相同就认定全部字节不变。此前 本地暂停检查点（不随Git发布） 是历史未验状态，本节续接；未改运行DSH、安装SDK/Mind或已载插件。

### 接通的是实际 receiver，不是配置更新或直接调用dispose

新增 [HMR entry](../test/fixtures/native-hmr-entry.mjs)、[HMR scene](../test/fixtures/native-hmr-scenario.mjs)、npm run test:workspace-hmr-native。自有HTTP服务器提供真实SSE plugins/events；实际SDK dsh-client-hmr apply/EventSource收到rebuilt帧，经实际ClientModuleSystem/ClientEntries.reload与vendored Cordis Loader管理单一产品entry。graph帧走实际sync/reconcile/loader.remove，不手写替换流程，不覆写共享entries方法、不伪造Host旧图阻断其它插件，不用私有深层import或移动React节点。辅助SDK UI插件仍由fixture持有，图只包含产品；不是完整生产boot graph或Web kernel认证。

公开Loader根入口可运行Node，而无单独browser导出。直接browser bundle最初因node:module失败；[public-browser-loader](../test/fixtures/public-browser-loader.mjs) 仅为隔离浏览器提供显式平台边界：Node内部探测的版本字面量低于Node floor，node:module.createRequire若被调用则计数并立即报错，实际测得调用0。Loader、Entry、Cordis registry/cleanup、ModuleSystem/HMR/teardown本体均来自公开已安装包；没有用fake Loader代替实际销毁。此边界不是DSH真实kernel平台适配验证。查询Entry改用公开entries()迭代器，非早期错误的entries.values()。

早期错误保留：[r1](../test-output/hmr-receiver-r1.tap) 停在esbuild；r2/r3真正进入浏览器，但fixture bundle URL未给rev query，实际SDK报bundle URL product.js has no revision，旧资源未替换；这不是产品HMR保护。修成显式product.js?rev=...，并在初始reconciliation失败时响亮失败，r4才完成真正替换。r5和最终版进一步验证图撤项/readd、公开UI说明与严格串行barrier。

### 测到的是破坏性替换边界，不是无损恢复

[最终结构化结果](../test-output/workspace-native-hmr-result.json) ：

- 替换前持有真实dirty文档1、网页1、PTY1，checkReload.allowed=false；实际SSE代码重建仍把产品fiber20换成28，API替换，旧editor/iframe的isConnected=false，原controller没有恢复。此前只覆盖internal/update的配置保护不能拦截这条路径；不能用它承诺HMR安全。旧API没有记录一次对应配置update。
- 同一时段原生Lexical输入节点严格同一个，chat draft仍同值；这证明的是本产品entry被替换时的原生所有者边界，不能外推为其它SDK owner被替换也无损。
- 原Terminal retain流从1到0，但隔离Host设置unattendedTimeoutMs=0时原内核PID仍活着；detach不等于终止/退出，更不等于新产品有恢复旧终端入口。测试随后通过自有Host的实际TerminalController.close(agent,id)关闭已知owned终端，拿到close完成并用kill(pid,0)得到ESRCH；最终spawn1/close1/closed1/terminate1、activeRetains0。不是靠Host测试收尾吞掉孤儿后宣称产品自行安全回收。
- 替换前实际点击已有“导出草稿”，捕获真实浏览器download；落盘UTF8与该raw文档完全相等，包括BOM、CRLF和emoji。随后原Host文件仍等于原始内容；未用自动save消除dirty。仅此代表手动导出此文本样本成功，不是unknown-save回执认证、所有编码无损或自动恢复。
- 重复同rev通知后，追加实际SSE graph frame作为同一ClientEntries队列的序列屏障，再断言fiber没有再次变更；不再固定睡80ms冒充通知已处理。随后实际graph撤项使产品API为null、entry消失，原生input仍同一个；再加回graph得到新fiber35且无failures，原生input仍同一个，Node fallback0。两次通知/后续graph frames与资源HTTP请求均保存。

### 产品变更：不再用含糊“更新已保护”掩盖HMR

[reload-state](../src/workbench/reload-state.mjs) 增加不可变lifecycle元数据：configUpdate guarded，代码替换/图撤项/强制卸载/页面刷新 not-preserved，documentBackup manual-export，liveViewRecovery false；配置拦截提示保留原计数但明确“仅配置更新”，明确排除HMR和graph撤项。API status返回这份元数据，未加一个虚构的全局veto。

[project-deck](../src/workbench/project-deck.mjs) 新增本区域可展开的“更新与退出限制”，提示升级前保存/导出、核对未知保存、处理关闭任务、明确关闭项目，网页表单/终端内存不能从布局恢复。[chrome-css](../src/workbench/chrome-css.mjs) 只样式化本插件details/summary，限高滚动与keyboard focus，不覆盖聊天、不给页面另加浮层。该说明在实际浏览器中展开并核对过；它是边界说明，不是已经修好HMR数据保留。已有配置更新保护仍保留，原6类故障矩阵回归再次通过。

### 验证结果与后续

- [HMR最终测试](../test-output/hmr-round19-final.tap) 1/1，明确命名为release product content的测量，不标成“所有模块HMR保留通过”。实际已看 [替换前](../test-output/workspace-hmr-before.png) 与 [替换后](../test-output/workspace-hmr-after.png)，图非最终三设计视觉验收。
- 全串行build-round19-final、npm test selector10/selftest67/DOM114、foundations245/245零跳过；原20 wrapper加HMR共21各1/1、零fail/skip、exit0，diff check0。新增1个基础test只验证lifecycle不可变语义；实际销毁/原生输入/原始导出由上述真实浏览器/FS/PTY验证。包括原生shell/chrome、配置guard、service/reconnect/cleanup/scope/project/layout/history/composer/reference等原链均未跳过。
- [关键受测文件hash](../test-output/round19-verified-inputs.json) 对应本隔离工作树本次检查面，不代表已提交HEAD、暂存区、推送面或部署包。
- 后续回到产品范围：统一模块注册/扩展卸载与多文档canonical alias、真实多实例交互、终端idle/长输出并发、IME/undo/用户字体角色/DPR与缩放、真正leftWorkspace/locale/provider、生产Host与完整bootstrap包复现、独立复核。实际HMR无损保留仍不承诺：若未来要求此功能，需要合法的宿主preflight支持或另行设计恢复语义，不能本插件私自接管共享module graph。A1–A8三图不减，整体仍未验收，未部署/推送。
- 会话自动目标曾暂停；本轮用户已明确继续且本Mind业务目标进行中，但当前update_goal(resume)返回“the model cannot resume a paused goal; the user must resume it”。已向用户说明自动续跑仍需人侧恢复；本次没有绕过创建新目标，也不声称自动恢复成功。
