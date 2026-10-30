# 设计对照与真实布局交互

## 视觉发现与修复

实际查看整窗设计 `audits/application-workbench-design-20261028/01-daily.png` 和当前隔离截图。结构为左导航、主操作区、固定右聊天；继续保留原生 Session/输入组件，不复刻假聊天。旧 SVG V2 的默认左聊天说明不覆盖后续右聊天要求。这里尚不是逐像素设计验收或生产 GUI 验收。

发现旧截图中收起的原生侧栏工具仍遮住主操作区。新增浏览器断言先证失败：SDK `isExpanded()===false` 但工具内容持续可见。诊断记录显示框架 `rightbarShown=false`、面板 `aria-hidden=true`；工作台零宽停靠覆盖布局失去原本的遮挡边界。单独设置祖先 visibility:hidden 仍被后代显式可见性覆盖，原失败日志保留。

修复：私有构建接缝传递真实 `layoutInfo.rightbarShown` 到框架属性；只在工作台、非全局页、工具收起时对原生侧栏列 `display:none`。不销毁内容或关闭进程，不改原版模式 CSS。`design-drawer-fixed2-20261030.log` 通过，重新实际查看 `full-desktop-dark.png` 确认主操作区无侧栏遮挡。后续同场景回归也经过该断言。

## 活跃内容上的布局操作

新增 `p0/layout-interactions-scenario.mjs`，在真实文件、网页和运行中的 PTY 同时存在时执行：

- 文档放大/还原；运行终端收起/展开，关闭计数不变。
- 键盘方向键调整实际分隔条，ARIA 数值随之改变。
- 在操作区布局编辑中交换文档/网页，取消准确保持原布局；应用交换，再交换回来。
- 所有捕获的文档编辑器、iframe、终端、文档模型、原生聊天输入必须非空，操作后保持同一实例；显式脏草稿和未发送聊天内容不变。
- iframe 加载计数、PTY 启动/关闭计数不变；没有用纯模型测试冒充浏览器操作。

交换选择控件补明确 `aria-label`，避免嵌套 label 的选项文字使可访问名称随选项变动。首轮定位失败日志保留。

最终 `test-output/layout-interactions3-20261030.log` 通过，结构化结果在 `test-output/p0-result.json` 的 layoutInteractions。完整场景含原生会话、真实文件保存/冲突、布局存储恢复、多终端与文档；目录/导航/连接代际仍有明确夹具。

未装载、重启、提交或推送。完整键盘可访问性、更多失败恢复、发布检查和独立复核尚未全部完成。
