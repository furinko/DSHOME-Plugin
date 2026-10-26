# 已批准的工作台 V2 设计稿

这三张是1920×1080可编辑SVG及PNG预览，不是已实现界面。用户已认可方向；当前只完成接口核对、范围整理和未接入模型WIP，后续实现已按用户要求暂停。

- [01 日常布局 SVG](<workbench-v2-01-daily.svg>) · [PNG](<workbench-v2-01-daily.png>)：文件、文档、终端、网页同屏。
- [02 布局编辑 SVG](<workbench-v2-02-layout-editor.svg>) · [PNG](<workbench-v2-02-layout-editor.png>)：模块库、有效分割目标与属性限制在操作区。
- [03 切换保留状态 SVG](<workbench-v2-03-switch-preserve.svg>) · [PNG](<workbench-v2-03-switch-preserve.png>)：收起文件树和终端，保留同一文档、网页及聊天草稿。

[静态验证记录](<visual-check.json>)仅证明SVG可编辑、原图渲染的聊天/输入像素一致，无脚本/外部资产；不能据此宣布客户端交互、文件保存或PTY保活通过。301个文字元素的原始浏览器边界检查没有区域越界。

制图源为 [create_design.py](<create_design.py>)，Windows本地Chrome渲染为 [render-and-check.mjs](<render-and-check.mjs>)，像素/XML校验为 [verify_visual.py](<verify_visual.py>)。生成器写回本目录，请在副本中运行以保留已批准版本。渲染器的Chrome默认路径是Windows安装路径；不是宿主GUI自动化。

范围与继续条件以 [本次交接](<../../HANDOFF-2026-10-26.md>) 为准；不要自动继续开发或部署。
