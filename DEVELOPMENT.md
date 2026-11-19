# 换一台电脑继续开发 Tada!

仓库：https://github.com/SyPink6/Tada 。当前可运行项目在 `desktop/`；`desktop-v0.1/` 是保留的早期源码草稿。

## 第一次在新电脑上打开

准备 Git、Node.js 22 或更新的兼容版本、Python 3，以及 64 位 Windows。安装依赖和 Electron 时需要联网；应用当前没有真实 AI 调用。

```powershell
git clone https://github.com/SyPink6/Tada.git
cd Tada\desktop
node scripts/setup-portable.mjs
npm run desktop
```

安装入口从 `package.json` 读取固定依赖版本，并检查下载完整性；Electron 二进制下载失败时可切换镜像，但仍使用官方发布页的 SHA-256 校验。不会自动清理或覆盖已有依赖。首次运行可稍等下载完成。

若暂时只看浏览器展示，可以只下载前端依赖：

```powershell
node scripts/setup-portable.mjs --web-only
npm run preview
```

浏览器打开 http://127.0.0.1:4174 。要运行真实桌面版，再执行不带 `--web-only` 的安装命令。

## 日常开发与同步

切换电脑前先提交并推送当前电脑的改动。在另一台电脑开始工作前，确认没有未提交的修改，再执行 `git pull --ff-only`。如果提示分支分叉，先保留双方改动并处理，不使用强制推送或破坏性重置。

```powershell
git status
git add desktop/src desktop/electron desktop/scripts desktop/tests docs
git commit -m "Describe the change"
git push origin main
```

新文档、素材等其他文件可按需明确添加；推送前检查暂存列表。现有源码使用构建后运行的方式；修改后关闭托盘中的 Tada，再运行 `npm run desktop` 即可看到新界面。浏览器预览同样需要重新运行构建启动命令，目前没有自动热更新。

GitHub 同步源码和文档，**不跨电脑同步个人任务、完成记录或偏好**。它们仍只保存在各自电脑的 `desktop/data/`。若以后需要任务同步，应作为单独功能设计。

## 目录导航

| 目录/文件 | 用途 |
| --- | --- |
| `desktop/src/` | React 界面、任务状态和存储桥接 |
| `desktop/electron/` | 透明窗口、托盘、跨进程调用和置顶逻辑 |
| `desktop/scripts/` | 可复现安装、构建、预览、桌面启动 |
| `desktop/tests/` | 状态检查、浏览器流程和原生窗口检查 |
| `assets/` | 品牌方向板与设计参数 |
| `docs/` | 品牌、MVP、AI 与研究方案 |
| `GITHUB.md` | 上传范围与数据保留约定 |

## 验证命令

在 `desktop/` 中运行：

```powershell
npm test
npm run build
node tests/run-topmost-portable.mjs
```

置顶检查会在新的独立目录中创建测试应用，验证真实 Windows 窗口标记，不会退出当前 Tada 或使用个人任务记录。测试产物和构建目录保留在本机，不上传。

浏览器流程检查：先在一个终端运行 `npm run preview`，再在另一个终端运行 `node tests/browser.mjs`。该检查使用本机 Microsoft Edge；如果安装位置不同，需调整测试中的浏览器路径。

除跨设备开发所需的新入口外，历史文件均保留。旧安装与测试说明仍在历史文档中；首次安装和置顶检查以本页命令为准。
