# 工作台 Next 交接 · 2026-10-28

## 一句话

本分支在**已装载的 `be204e5` 之上**，给整窗工作台的操区加上了**真正生效的事务式布局编辑**（方向／比例／交换，可应用可取消），并用真实 SDK 浏览器场景证明调整布局时网页实例、便笺和聊天草稿都没有被重建。

**这不是完整模块化工作台。** 通用多模块布局树、真实文件树／文档／终端接线、布局持久化、上下文引用都还没接。

## 分支与基线

- 仓库：`DSHOME-workbench-next`（本地隔离克隆），远端 `origin` = `C:/Users/kuro/.dsh/repos/DSHOME-Plugin`（本地裸路径，非 GitHub）。
- 分支：`feat/workbench-next`
- 基线：`be204e518b867aef6a298303b14758dc164d34f9`（`DSHOME-Plugin/main`，含拖窗修补）
- 运行中 `DSHOME-Plugin` 仍是干净的 `be204e5`：本轮未装载、未重启、未改 profile、未动安装目录和私人数据。
- 依赖用 junction 指向既有 `DSHOME-shell-v2` 的 `node_modules`／`.dev-sdk`，**未安装新依赖**。

## 本轮完成

1. **布局编辑事务模型** [`p0/layout-edit.mjs`](../p0/layout-edit.mjs)
   - 草稿与已提交状态分离：编辑中不改变实际布局。
   - `begin / update / cancel / apply` 四步；`cancel` 丢弃草稿，`apply` 才提交。
   - 严格字段白名单 `axis | ratio | swapped`，比例限制在 0.2–0.8，非法值**不产生任何状态变更**。
   - 无文件、终端、网络、会话或 AI 执行权限；纯表现层。
2. **操作区接入** [`p0/extension.mjs`](../p0/extension.mjs)
   - 场景头部新增“编辑布局”控件组：分割方向（左右／上下）、分割比例滑块、交换位置、取消、应用布局。
   - 应用后便笺与网页按 `order` 与网格比例重排；旧的分栏下拉在编辑中被禁用，应用时统一回到 `split`，避免两套布局语义打架。
   - 布局状态是 **Scene 组件级内存状态**：同一工作区切换会话时保留，**刷新或重开不恢复**。
3. **回归场景扩展** [`p0/scenario.mjs`](../p0/scenario.mjs)
   - 新增：取消不改布局、应用后方向／顺序／比例生效、应用后几何真的上下排列、内容实例仍是同一 DOM 节点、同工作区跨会话共享布局、跨工作区布局隔离。

## 证据（本机实测）

| 项目 | 结果 |
|---|---|
| 单元测试 `p0/layout-edit.test.mjs` + `scene.test.mjs` + `abort.test.mjs` | **13 通过 / 0 失败 / 0 跳过** |
| 浏览器场景 `p0/browser.mjs`（真实 rc.3 SDK + 真实 Chrome） | **1 通过**，**26 项命名检查**全绿 |
| 页面异常 / 控制台消息 / 终端启动 | `[]` / `[]` / `0` |
| iframe 请求次数 | **1 → 1**（布局调整与模式切换都未重载） |
| 构建 | 固定安装版上游 SHA `eb011a7b…`，12 处补丁，`rootRegistrations: 1`，输出 SHA `28200c8d6bef…` |

关键检查名：`transactional-layout-applied`、`layout-applied-geometry`、`layout-edit-preserves-content-instance`、`shared-workspace-layout`、`different-workspace-layout-isolated`、`original-native-tree-match`、`existing-sidebar-tools-compatible`。

**测试边界**：工作区条目、导航、授权答案、设置传输、Host 日志是合成夹具；不是生产 GUI，也没有真实模型调用。26 项检查是脚本断言，不是独立复核结论。

## 未完成（不要当成已完成）

- **通用多模块布局没有接**：仓库里已有更完整的布局树模型 [`src/workbench/model.mjs`](../src/workbench/model.mjs)（分割树、标签、收起、放大、预设、校验），但它仍服务于旧的侧栏工作台，**尚未接到整窗 `Desktop`**。当前整窗操区只有便笺＋网页两块。
- **真实内容未接**：文件树、可编辑文档（含版本冲突保存）、终端（PTY）都还在旧侧栏路径上，未在整窗操区验证。
- **布局不持久化**：切换、刷新、重开都不恢复。
- **上下文引用／区域标注未做**。
- **独立复核未做**：没有复核员实例，也没有独立复跑。
- **未装载**：以上全部只在隔离候选，实际客户端仍是 `be204e5`。

## 下一步建议（按依赖顺序）

1. 把 `src/workbench/model.mjs` 的布局树接到 `p0/Desktop`：一个稳定父节点 + 每实例稳定 key，布局变化只改 `geometry`，**不重挂** iframe／textarea／xterm。
2. 用 `createWorkspaceModel({ projectId, initial })` + `validateProject` 做**项目级**布局持久化（布局不含文件正文、URL、草稿、终端参数）。
3. 把 `createEntry` 里的真实服务（`workspaceFiles.list`、文档 `read/save` 带版本、`ClientTerminals`）按 `sessionId` + `projectId` 边界接进整窗操区；注意旧代码里这些依赖 `activeOwner` 与 `services.available(owner)`，整窗路径要自己重新核一遍，不能直接复用旧引用。
4. 补负例：权限撤销后不得沿用旧会话执行；布局保存不得写入文档；重连不得重放终端命令。
5. 每一步都保持：原版可切回、右侧原生聊天不动、窗口可拖、旧侧栏工具仍可用。

## 复现

```sh
node scripts/build.mjs
node --test p0/layout-edit.test.mjs p0/scene.test.mjs p0/abort.test.mjs
DSH_SDK_ROOT=<rc3-sdk> WORKBENCH_BROWSER=<chrome> node --test p0/browser.mjs
```

构建脚本会校验固定上游 SHA 与 12 个唯一锚点，命中失败即停止；不会装载任何 profile。
