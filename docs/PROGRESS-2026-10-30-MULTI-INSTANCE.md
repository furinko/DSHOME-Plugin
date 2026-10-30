# 多实例与扩大回归

## 真实多文档

新增 `p0/multi-document-scenario.mjs`，两个真实宿主文件同时打开：A 文档保留脏草稿，切到会话 B 保存 B 文档，磁盘 A 不变；文档对象共享但草稿/保存独立，关闭 B 不关闭 A，取消关闭 A 保留草稿。

`test-output/multi-document-browser3-20261030.log` 通过。前两次失败是测试按输入相对路径及 POSIX 路径猜测实际 Windows 回执路径；修正测试取当前真实路径，未放宽文件服务校验。

## 真实多终端

新增 `p0/multi-terminal-scenario.mjs`：会话 A 与 B 各启动一个真实 PTY、发送各自 echo 并观察 xterm 输出。B 不能写 A 的终端；混合所有者时关闭整工作区在任何部分关闭前拒绝。B 显式关闭自己的终端不影响 A，返回 A 后关闭 A。

第一轮失败暴露测试 Gateway 的 agent lookup 仅登记 A，B 环境查询未能找到身份。修正隔离夹具为 B/C 登记各自 session 对应的独立对象，未把 B 冒充 A，未改变产品权限。

`test-output/multi-terminal-browser2-20261030.log` 通过，完整场景最新 `test-output/p0-result.json`：spawn=3、terminate=3、closed=3、activeRetains=0（原主场景一个 + 新增两个）。这不是生产 GUI 或独立复核。

## 场景释放

前轮补了显式释放旧现场：拒绝仍启动的终端/未确认关闭请求，确认后关闭内容并删除旧场景元数据，释放八场景上限名额；当前场景不能通过该入口释放。场景单测10通过，`test-output/retained-release-browser2-20261030.log`验证取消保留、确认清理。

## 基础与旧版回归

package 的 foundations 已纳入新增租约、共享文件、拖拽、便笺、扩展与导出测试。新增 `scripts/run-local-regressions.mjs` 直接调用当前 Node 执行包内已声明 Node 测试，不依赖此机缺失的 npm，不捕获子进程管道，不安装依赖。

- 配置公开 SDK 后 foundations：270 项，266通过，4失败，0跳过。四项仍为 Windows 创建符号链接 EPERM，未伪装绿灯。
- 旧版 selector 10/10、selftest67/67、DOM114/114。旧 DOM 夹具 React 缺少 Component 导致批量加载错误，按真实 React 形状补类基类后通过；没有删除旧断言。
- 原始失败日志保留：缺 npm、缺 SDK 环境、旧 React mock 不完整等不是产品通过证据。

尚需：设计逐项核对、交互全矩阵、部分故障/服务替换验证、包与 README 更新、证据冻结和独立复核边界。未提交、推送、装载或重启。
