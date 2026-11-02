# 日常交互优化 · 2026-11-02

基于459775f，在独立DSHOME-interaction-20261102、feat/interaction-20261102实现。未部署、推送或升级宿主，未改profile、Mind和私人数据。

## 交互变化

- 高频工具栏保留打开文件、新建、搜索操作。打开文件直接进入文件模式，Ctrl/⌘+P与Ctrl/⌘+Shift+P分别用于文件和命令，保留原Ctrl/⌘+K及终端键盘边界。
- 布局预设、编辑、保存、恢复、导入导出集中到“布局”入口。取消布局编辑后焦点返回该入口。固定右上角聊天/工作台按钮与条件品牌不变。
- 新建菜单用“打开文件、文件浏览器、新建终端、打开网页、新建便笺”表示动作；终端仍需明确点击启动，不因菜单选择就执行命令。
- 标签文字、未保存标记和独立关闭按钮相邻，关闭仍调用原受保护控制器。未保存文档、便笺、网页及运行终端的确认没有绕过；隐藏面板与关闭内容仍是不同操作。
- 布局和新建面板可点击外部收起，Esc收起并返回对应入口。外部收起使用click而非pointerdown，避免按钮按下时布局变化吞掉原点击。
- 快速打开输入框Home/End恢复文本首尾移动，上下键仍选择结果。面板关闭保留原焦点恢复与异步取消保护。
- 文档冲突采用“保留我的修改／使用磁盘版本”等措辞，并说明选择不会立即写盘，后续保存仍检查版本；存储及权限模型未变。

参考：[VS Code界面](https://code.visualstudio.com/docs/editing/getting-started/userinterface)、[键盘约定](https://code.visualstudio.com/docs/reference/default-keybindings)、[W3C菜单焦点约定](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)。此处是原生按钮组成的disclosure，不冒称完整ARIA菜单实现。

## 验证与限制

证据在仓库外audits/interaction-20261102。新增interaction-scenario通过真实SDK/Chrome检查布局入口、Esc焦点、外部点击、文件直接打开、Home/End、命令快捷键及便笺关闭取消/确认；沿用固定位置、品牌、窄窗和内容保持专项。

首次新增场景因测试相对locator组合错误超时，修正为当前选中标签容器，保留interaction-browser-01.log。首次完整回归使用旧“检查布局存储”入口超时；迁移后第二次暴露pointerdown收起吞点击的产品问题，已改click，原日志保留。测试迁移只改变入口与文案，保存/冲突/文件字节/权限/终端/内容实例断言保留。

基础回归287项：283通过、4项Windows symlink EPERM失败、0跳过。首次沙箱运行另有icons构建目录访问失败，无该限制复核后通过；原失败保留。未修改全局权限或SDK，未把历史Windows终端清理失败视为普遍解决。

本轮没有独立复核或生产GUI验收。隔离场景的工作区目录、导航和授权仍为显式夹具；截图不是生产界面。最新完整回归结果见审计目录最终记录。

最终完整真实SDK/Chrome回归full-browser-03.log：1/1通过、0跳过，包括新增交互专项及既有整窗链。最终selector10/10、自检67/67、DOM114/114、dual19/19、SDK注册检查通过。截图test-output/interaction-workbench.png已人工视觉核对；首次关闭按钮继承最小宽度问题已修正。
