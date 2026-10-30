# 整窗模块扩展接口（开发中）

通过 Cordis `dshomeDesktop` 服务的 `registerModule(definition)` 注册**已安装、可信的客户端插件**提供的 React 组件。不是用户输入 JavaScript 的执行器，不从 URL 下载代码，不是原生应用嵌入接口，也不是沙箱。

```js
ctx.inject(['dshomeDesktop'], scope => {
  scope.effect(() => scope.get('dshomeDesktop').registerModule({
    kind: 'example-checklist', // 小写字母起始，后续小写字母/数字/短横线，最多64字符
    label: '清单',            // 最多80字符
    minWidth: 240, minHeight: 180,
    render: Checklist,        // 使用宿主共享的 React，不捆绑第二份 React
  }));
});
function Checklist({ instanceId, state, setState, active }) {
  // 组件返回 React 节点；每个面板独立 state，初始为 null。
  // setState({text:'...'}); 写入本地托管状态；不请求宿主或发送消息。
  // setState(null); 明确清空本地状态。
  return React.createElement('textarea', {
    'aria-label': '清单 '+instanceId,
    value: state?.text ?? '',
    onChange: e => setState({text:e.target.value}),
  });
}
```

用户通过「编辑布局 → ＋ 模块 → 应用」创建实例。注册不自动创建面板，不执行命令。注册返回幂等注销函数；提供者应将它绑定到自己的插件生命周期。禁止覆盖内置类型和重复注册，连接失败回退已完成的局部登记。

## 状态与撤回

- `state` 是本实例内存中的 JSON 往返副本，递归冻结；`setState` 的 JSON 文本上限为 262144 UTF-16 单元。循环、不可序列化和超大数据拒绝，不部分修改旧内容。
- **非 null 状态视为待保护数据**。关闭需确认，配置更新/离页提醒纳入统计；「导出模块状态」下载 JSON 草稿。导出不冒充用户已经安全保存，所以仍提醒。
- 托管状态不写进布局，刷新/卸载不恢复它；插件自身 React state 也不保证在提供者撤回后保留。正常布局切换保持内容实例，提供者撤回保留面板元数据和托管 state，并显示不可用占位。
- 重注册相同 kind 可重显托管 state；旧提供者保存的 setState 回调永久失效，不能因重注册而复活。内容实例关闭后回调也失效。
- 渲染错误有局部 React error boundary，保留托管状态供导出。事件处理器/异步回调错误不是 React 渲染边界可捕获的范围，提供者仍须自行处理。

## 权限边界

目前仅开放展示和本地托管状态，不向 renderer 传 controller、会话凭据、文件/终端服务、聊天插入或 AI 执行接口。`active` 仅表示当前可见状态，不是授权。已安装插件本身可能有自己的宿主能力，必须独立通过宿主原有授权；本接口没有把第三方代码变成安全沙箱。

代码/表格等工具可作为这种可信组件接入；不因此声称任何具体工具已实现。跨域网页读取、原生应用嵌入、内容发送给模型和 AI 操作契约仍未交付。

## 当前证据

`test/module-registry.mjs` 覆盖注册/注销/回退；`test/module-content.mjs` 覆盖数据隔离、边界及旧回调失效。`p0/full-scenario.mjs` 使用真实整窗运行时登记显示组件，创建实例、更新托管数据、撤回/重注册并验证旧回调拒绝与关闭保护。浏览器日志 `test-output/module-render-browser2-20261030.log` 通过；这是隔离 SDK，不是生产装载或独立复核。

后续 `test-output/module-failure-browser3-20261030.log` 验证故意抛错的真实 React 提供者被局部边界接住，仍能下载原托管 JSON，替换为正常提供者后显示原状态。React 开发运行时的两条同名故意异常及一条 ProviderBoundary 诊断在精确故障阶段核对并完整保留；其他错误仍失败，没有静默清空错误数组。首轮预期诊断未纳入断言、第二轮漏接浏览器诊断参数的失败日志保留。
