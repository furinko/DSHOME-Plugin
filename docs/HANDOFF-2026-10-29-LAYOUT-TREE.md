# 整窗通用布局树接线 · 2026-10-29

## 状态与边界

在隔离 `DSHOME-workbench-next` 的 `ca65e3b` 之上继续开发，尚未提交或推送。运行源 `DSHOME-Plugin/main` 仍是干净的 `be204e5`；未装载、重启、改 profile 或私人数据。没有安装依赖，既有依赖 junction 仅用于构建测试。

这是**布局树接线阶段**，不是完整模块化工作台：整窗仍只有原有工作便笺、网页两个内容实例。没有新增真实文件树、文件保存、PTY、上下文引用或持久化。尚未实现多实例创建 UI、鼠标拖动分割条或模块拖放；分割比例支持编辑滑块及分割条方向键。共享状态仍是连接代次内工作区内存；刷新不恢复。

## 实现

- `p0/panels.mjs`：接续原未跟踪草稿，使用 `src/workbench/model.mjs` 注册便笺/网页并建立初始分割树。不再另行维护两块固定 CSS 排序。
- `p0/layout-view.mjs`：通用树编辑/几何渲染。草稿操作不改变已提交现场；支持应用、取消、撤销/重做、选定分割方向/比例、面板停靠四边或合并标签、交换、收起展开、放大还原。
- 所有内容节点固定在同一父节点、保持原 key，只变更绝对几何和可见性。标签、放大和收起不销毁 iframe/textarea。尺寸不足仅操作区内部滚动，不覆盖右侧聊天。
- 模型新增严格校验、原子更新的 `setSplitAxis`；放大时激活另一标签也切换放大目标，避免标签与内容不一致。
- `p0/extension.mjs` 接入上述组件，保留原生 Frame/聊天及 Windows 拖窗补丁。布局动作使用当前可用场景检查，不增加文件/终端/AI 权限。
- `test:dual` 现在同时运行既有布局事务与新树接线测试。

## 本机证据

以下日志在本候选 `test-output/`（忽略文件，未入 Git），未将模型自述当独立复核：

| 检查 | 结果 | 记录 |
|---|---|---|
| 场景/旧事务/新树/布局模型 | 47 通过，0 失败/跳过 | `tree-unit-20261029.log` |
| 真实 rc.3 SDK + Chrome 隔离浏览器 | 1 场景通过，30 项命名检查通过 | `tree-browser-20261029.log`、`p0-result.json` |
| Selector | 10/10 | `tree-selector-20261029.log` |
| Selftest | 67/67 | `tree-selftest-20261029.log` |
| DOM | 114/114 | `tree-domtest-20261029.log` |
| 完整 Foundation，指定 SDK | 245 项：241 通过、4 失败、0 跳过 | `tree-foundations-sdk-20261029.log` |

4 项 Foundation 失败均发生在 Windows 创建测试符号链接时，原始 EPERM 保留，不算通过。不调整权限、不降级断言。第一次 Foundation 调用漏设 `DSH_SDK_ROOT`，207 通过/3 模块加载失败，原日志 `tree-foundations-20261029.log` 保留；补足隔离 SDK 路径后的结果如上。

构建固定上游 SHA `eb011a7b5699fac7f3ad0aa15408f46a6cf47f79b8cc15db1f81739e81e70587`，12 个锚点、单 root 注册；双布局输出 SHA `90e20809e5af69a6a2ad088420075bbbfb3053156306ae3e82cc016942acc4d6`。`git diff --check` 通过。

浏览器覆盖：原版 DOM/几何与未修改上游对照、布局取消与应用、实际几何、标签合并/再拆分、放大中的标签切换、收起展开、A/B 同工作区共享、C 工作区隔离、聊天输入、窄窗、深色、旧侧栏工具、Windows 拖窗样式。iframe HTTP 请求 1→1；页面异常为空；终端启动 0。已查看 `p0-workbench.png` 的隔离场景截图。工作区记录/导航/授权答案/Host 日志仍为夹具，不是生产 GUI 验收，也不是实际文件/终端接线证明。

## 复核与接续

尝试正式工程委派时，部署的 `memberFileAccess.read` 上限拒绝候选目录；没有成员被创建。未用其他委派入口绕过。随后按真实 Lead 实例绑定自执行任务，保留原任务及后继记录。独立复核未完成；本轮没有自签通过票。

下一步应先复用真实内容控制器的 session/project 权限边界，再扩展多内容实例、项目级持久化、上下文引用；每一步继续保持真正原版、工作区现场与聊天输入，不把两模块阶段当最终目标。独立文件复核需要部署者为成员授予本候选必要只读目录及可用复核通道；不需要为继续本会话开发扩大权限。未来装载仍需用户单次明确同意。

## 复现

使用宿主提供的 Node 绝对路径，或仅为当前命令设置其 PATH：

```sh
node --test p0/panels.test.mjs p0/layout-edit.test.mjs p0/scene.test.mjs p0/abort.test.mjs test/workspace-model.mjs
node scripts/build.mjs
node --test p0/browser.mjs
```

浏览器包装器默认指定现有隔离 SDK 和 Chrome；Foundation 需显式设置 `DSH_SDK_ROOT=C:/Users/kuro/.dsh/repos/audits/dshome-v2-deploy-20261028/sdk`。不要修改共享 `.dev-sdk`/`node_modules`，不运行部署脚本。
