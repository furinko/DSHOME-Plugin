# 扩大旧路径回归（未全绿）

- `expanded-regression-20261030.log`：真实客户端装配、原生侧栏和 P0 场景/布局基础合计20项，19通过，1失败。失败来自独立 `workspace-terminal.mjs` 固定 `/bin/bash`，在本机 Windows 不存在；未跳过、未算通过。
- 老浏览器包装器首次调用缺 Playwright 缓存 Chrome；改用本机已有 Chrome 可执行路径和隔离临时 profile，未安装软件。
- 第二轮到达真实终端，暴露旧命令固定 Bash printf/for/sleep，实际夹具已为 CMD，命令不能产生预期输出。
- 修改公共浏览器夹具：Windows 在自有临时根生成 Node 小脚本，经真实 PTY 中 CMD 调用，报告实际父 shell PID 和定时五条输出。SDK 提供非零 PID 时仍必须匹配；Windows 未提供时使用实际子进程观测的 ppid，仍检查进程存活和显式关闭后的 ESRCH。Linux 保留原 Bash 测试。
- `service-rebind-native3-20261030.log` 通过：真实 SDK 旧侧栏路径服务替换回归可运行。不能将其冒充整窗路径服务替换验收。
- `terminal-cleanup-native3-20261030.log` 和 `terminal-reconnect-native3-20261030.log` 仍失败：各自辅助场景还含旧 shell 命令（启动后 PID 输出超时、离线标记未产生）。需逐一核对并适配，不降低清理与恢复断言。

原失败日志全部保留。此轮未改权限、安装依赖、装载、重启或推送。总体目标继续进行。
