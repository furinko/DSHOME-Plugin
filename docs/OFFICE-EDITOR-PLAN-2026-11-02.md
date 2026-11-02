# 完整 Office 编辑：待接入方案

用户目标：以鲸鱼工作台作为主要桌面工作入口，Word / Excel 在操作区内接近 Office 的完整编辑，优先保留文件格式；不能用正文提取后重写代替。

## 已核实与未完成

本机注册表有 Microsoft Office 安装记录；PATH 与常见安装目录未检出 Docker、Podman、ONLYOFFICE Desktop Editors 或 LibreOffice。这个检查不是穷尽扫描。桌面 Office 的安装不等于浏览器可嵌入的编辑服务。

本轮加入的 docx/xlsx/pptx 是本地只读内容预览，绝不是完整 Office 编辑器，不写回文件、不执行公式/宏。完整编辑尚未实现，也未安装任何文档服务、容器运行时或系统功能。

## 推荐落地方向

评估本机 ONLYOFFICE Docs 服务，鲸鱼操作区嵌入其编辑器。官方 Docs 模型需要文档存储服务、编辑服务和保存回调，不能只插入一个 iframe 就宣称保存完成。

1. 在独立本机文档服务中处理用户显式选定的文件副本，不向公网服务发送文件。运行时与数据单独存放，不改 DSH 安装目录、Mind 或 profile。
2. 编辑桥为每次打开创建有期限的文档授权、基准摘要和版本 key；不提供全盘任意路径下载接口。编辑器配置与回调须验证 JWT、文档身份及来源。密钥只在服务端，不能放进浏览器或日志。
3. 编辑过程优先保存到可恢复的工作副本，界面区分“有未提交改动 / 服务端副本已存 / 原文件已更新 / 结果待核对”。未收到有效回执不能显示已保存。
4. 用户保存原件时核对磁盘基准、备份原文件并完成读回校验；外部修改或身份变化进入冲突流程，提供另存为，不覆盖。浏览器目录句柄本身不能提供跨进程原子 CAS；若要求可靠写回，需要另外实现并验证本地文件桥。
5. 重启恢复必须能找回工作副本与未确认保存记录，文件被移动、删除、撤销权限时明确提示。关闭标签/切会话不丢编辑器状态；退出前有可导出副本。
6. 以含表格、图片、页眉页脚的 Word，含多表、公式、日期和格式的 Excel，以及带图文的 PPT 做往返验收。复杂宏、外部数据、字体和精确排版不能预先承诺与 Microsoft Office 完全一致。

## 安装影响与待决策

官方 Docker 版要求至少 4 GB RAM、40 GB 可用磁盘；Windows 原生服务版要求 Windows Server 2016+。普通 Windows 桌面本机运行可考虑 Docker/WSL2，但本机尚未检出此环境。安装会新增后台服务、容器数据和下载，启用虚拟化/WSL 可能需管理员权限或重启。这不是仅替换插件源码的操作。

因此，在用户确认采用本机文档服务之前，不安装 Docker/WSL、不改系统功能、不启动常驻服务、不上传真实文件。也不把“外部打开桌面 Office”称作工作台内编辑。若用户已有可用且受信的文档服务器，可另行核实接入范围与文件流向。

## 官方依据

- [Windows 文件/目录不能在同一个系统选择框混选](https://www.electronjs.org/docs/latest/api/dialog)：本轮依用户选择，分为“添加本机文件”和“添加本机文件夹”。
- [ONLYOFFICE 工作原理](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works)
- [保存回调与保存延迟](https://api.onlyoffice.com/docs/docs-api/get-started/how-it-works/saving-file)
- [Docker 系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-docker.aspx)
- [Windows 服务版系统要求](https://helpcenter.onlyoffice.com/docs/installation/docs-community-sys-reqs-windows.aspx)

该文档是实施边界与方案，不是已安装或编辑验收凭据。
