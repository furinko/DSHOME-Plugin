# 整窗候选逐项证据（收尾中，非独立验收票）

对应冻结业务任务 task-从已装载且用户确认布局正常的7b-cyiaj；当前候选未提交/推送/装载。

| 冻结判据 | 实现及证据 | 边界 |
|---|---|---|
| 真实文件树、编辑/受控冲突保存、终端网页同时可用 | controller、shared-files、ui；整窗 full-scenario 实际目录/保存、外部修改版本冲突、磁盘比较、明确采用基线再保存、实际PTY与iframe | Host工作区/文件系统真实；授权答复和目录来源装配含测试夹具 |
| 工作区共享但当前会话权限，撤销/失联拒绝，跨区隔离 | authority、shared-entry；shared-scope-scenario 的写后丢回执撤回竞态；multi-terminal-scenario 的所有者隔离；reconnect-scenario 的新代际、旧输入拒绝及原所属会话显式关闭 | 连接代际来源为夹具；生产连接/登录未验；远端服务被替换后旧入口不自动移权 |
| 多实例、关闭保护、显式引用 | 多文档独立草稿/保存，双终端独立真实进程；网页/便笺；可信模块注册/撤回/重注册/故障导出；原生选择引用与返回定位 | 扩展非沙箱；不承诺任意原生应用接入或AI自动操作 |
| 项目隔离、布局恢复、预设且不重放命令 | 实际IndexedDB损坏恢复/事务中止/双页CAS冲突；只保存布局元数据；刷新后无自动PTY创建/文件重开 | 内存网页表单/文档草稿不作为布局内容持久化；刷新需先导出 |
| 应用取消撤销、分割拖动交换标签收起放大不重建内容 | model基础；full-scenario真实pointer拖入标签；layout-interactions-scenario键盘分隔、交换取消/应用、放大、运行终端折叠；同一编辑器/iframe/终端/原生输入实例、显式脏草稿保留 | 全量可访问性和所有第三方网页状态未穷举 |
| 原版、原生右聊天、拖窗、原有工具及回归 | 原生根只注册一次；原版/工作台、全局页与窄屏；window-scenario；旧侧栏收起遮挡修复；legacy-current和registry-current | 生产GUI/Windows真实拖窗事件仍与隔离夹具分开；独立复核未完成 |

## 当前读数

- 最后一次整窗 `active-generation-recovery3-20261030.log` 通过：4真实PTY启动、4终止、5关闭回执（含一次幂等重试），activeRetains=0。包含模块故意抛错和关闭响应丢失：预期诊断按精确阶段/内容保留，不是“零错误日志”。
- 最新 foundations `foundations-final-candidate-20261030.log`：275项，271通过、4失败、0跳过；四项全部在Windows符号链接夹具创建处EPERM。并未把路径隔离未测项记成通过。
- `dual-current-20261030.log`：17/17；`legacy-current-20261030.log`：selector10/10、selftest67/67、DOM114/114；真实SDK注册检查通过。之后新增代码主要为旧终端收尾；最终冻结前仍需统一重跑/记录构建指纹。
- 旧侧栏服务替换、关闭故障、真实WebSocket断线恢复分别有通过记录。不能替代整窗对应场景。
- 两次Windows真实Host关闭失败（包括 surviving pid:0）保留；最新通过不解释它们的根因或证明长期稳定性。

## 隔离与剩余收尾

本轮只读核实 live-linked DSHOME-Plugin 仍干净，HEAD=7b502cca7bb02ca2c383c4dde03a677c24d06c33。该读数是源码位置，不声称当前进程已加载其他候选。开发文件只在DSHOME-workbench-next；共享依赖junction未改。

仍需统一包/构建产物核对与当前证据冻结，独立复核如通道可用则进行，否则明确未验；不以任务测试通过自动认证整体完成。不得装载、重启或推送。
