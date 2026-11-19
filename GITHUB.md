# GitHub 同步与运行说明

当前可运行源码在 `desktop/`，品牌素材在 `assets/`，产品规划在 `docs/`。`desktop-v0.1/` 保留早期草稿与准备脚本；使用当前版本时以 `desktop/` 为准。

## 上传范围

纳入 Git：产品文档、品牌方向板、设计参数、React 界面、Electron 窗口逻辑、启动脚本和测试源码。

不纳入 Git：本机任务和完成记录、窗口会话、日志、构建目录、下载归档、依赖与 Electron 二进制运行时。`.gitignore` 仅排除上传，不会删除任何本地文件。连接仓库之前不对外上传。

## 在另一台 Windows 电脑运行

需要 Node.js 22 或更新的兼容版本、Python 3、64 位 Windows，以及下载依赖所需的网络连接。

克隆仓库后，在 `desktop` 目录运行：

```powershell
npm run setup
npm run desktop
```

`setup` 会校验并向新目录添加依赖及 Electron 运行时，不执行第三方安装脚本，也不清理已有内容。首次 Electron 下载来自 GitHub，可能较慢。浏览器展示使用 `npm run preview`，地址为 http://127.0.0.1:4174 。

本机现有的依赖目录使用目录链接复用早期版本；这些目录不上传。新克隆的副本由 `setup` 在 `desktop` 下创建独立依赖，无需复制本机目录链接。

## 后续同步

每次推送前检查改动和暂存文件，只推送期望分享的源码与文档。正常提交和推送会保留版本历史；不使用强制推送、清理、重置或删除分支。

若目标仓库已有内容，先读取其分支与文件，保留所有现有内容。任何冲突都需要使用新增目录或新版本文件等保留内容的方式处理，不直接覆盖。

本项目当前是无真实模型调用的示例展示版。没有包含个人任务记录，也不代表临床或疗效验证结果。

## 当前推荐入口

跨电脑开发请优先阅读 [DEVELOPMENT.md](DEVELOPMENT.md)：使用 `node scripts/setup-portable.mjs` 进行可校验、支持下载回退的安装。置顶测试使用 `node tests/run-topmost-portable.mjs`，它会自行创建独立测试目录。
