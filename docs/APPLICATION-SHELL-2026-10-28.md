# 整应用外壳重构 · 2026-10-28

用户纠正此前实现仍依赖侧边栏，并明确选择“沿用设计稿，重做整个应用外壳”。当前工作树 `C:/Users/kuro/.dsh/repos/DSHOME-shell-v2`，分支 `feat/application-shell-v2-20261028`，基线 `b30e7af`。运行关联的 `DSHOME-Plugin/main` 保持该基线，没有自动装载、改 profile 或重启。

## 结果

- 应用主体改为顶栏、项目导航、独立对话区和主操作区。聊天与文件/文档/终端/网页由同一个根布局安排，工作台不再是 `sidebar.right.pane.tab` 的内容。
- 新 `application-shell.mjs` 拥有根席位与子席位；复用真实原生 Conversation、输入、左侧导航及全局主页面。设置/其他主页面有返回工作空间入口，不销毁后台工作区。其他原生辅助工具仍有兼容容器。
- 通过正式 bundle patch 禁用旧 `ui-layout`，插入嵌套布局包，保持其公共客户端模块 ID。发现 SDK 的 patch `name` 只是名称断言，不能改名，因此没有使用无效的原行改名办法。实际 rc.3 boot/registry 检查覆盖替换包、两个内容入口及 HTTP 产物。
- 布局包保留公共 `layout` 服务、导航取消信号、panelInfo、快捷键与主题呈现。项目与内容读写仍沿原 Host owner/Session/FS/version 检查，没有扩权或新增写旁路。
- 同一会话的专注模式、布局编辑、预设、全局页面切换保留聊天输入和内容 DOM。跨会话通过公共 `sessions.retain`、显式 `SessionProvider` 保留工作空间；原生输入随真实 Session 绑定切换，草稿保留，不声称跨会话还是同一个输入节点。
- Session 引用属于应用外壳，标签为 `dshomeWorkspace`，不依赖 Sidebar retention。最多保留16个会话空间；没有静默淘汰。项目设置中的“关闭工作空间”先走原确认、未知保存和终端关闭回执规则，再释放引用。
- 项目维护操作收进“项目设置”，操作区以项目名和布局工具条呈现，避免把全部工程控制堆在主界面。

## 验证

本机实际 SDK 为 `0.2.1-rc.3`，浏览器是本机 Chrome，SDK/测试依赖使用隔离副本。未访问真实聊天、记忆、凭据或模型服务。

`test:application-shell` 是一条端到端隔离场景，实际检查：原生聊天输入；三个宽度的全应用几何；键盘调整聊天宽度；专注/主页面切换；A/B/A Session 草稿与内容隔离；真实 Gateway/FS 文件保存；布局编辑保持输入；审阅/开发保持网页表单；真实 Windows CMD PTY 的进程内变量在全部切换后仍存在；真实 ThemeRuntime 深浅切换；脏草稿取消关闭；确认关闭及 Session 引用归零。终端 spawn/close/terminate 各1次，结束时 activeRetains=0，页面及 Slot 错误为空。

选择器10/10、自检67/67、DOM114/114及实际 SDK registry/boot检查通过。基础245项为241通过、4失败、0跳过；四项均为 Windows 创建符号链接夹具 EPERM，未改测试或计为通过。构建、diff检查及打包通过，布局子包完整入包。

早期失败包括测试依赖不完整、场景调用了不存在的方法、原生跨 Session 输入节点被错误假定不变，以及窄屏隐藏后错误使用可见元素计数；相应断言改为真实模型/DOM观察，保留原日志。跨会话测试还促使实现补上显式 Session 引用保活。未删除这些状态保持检查。SDK overlay 名称断言失败则修正了实际打包方案。

原 Sidebar 形态的一组历史 wrapper 场景并未全部迁移，不能把旧21条成绩算成本版通过；本版也未获独立产品复核或生产 GUI 验收。该端到端场景的项目行、Host journal/policy/owner admission、settings storage仍为明示夹具，真实导航外壳/聊天/输入/ThemeRuntime/Gateway/FS/PTY不使用替身。设计稿的结构已接入，截图中的示例数据不代表真实项目。

本地审计与截图：`C:/Users/kuro/.dsh/repos/audits/dshome-application-shell-20261028`。原始设计图不改写。本轮未 push、合并到运行目录、装载或修改桌面安装包。
