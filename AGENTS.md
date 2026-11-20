# Tada 项目协作约定

## 开发入口

- 当前应用在 `desktop/`；`desktop-v0.1/` 已删除（早期草稿）。
- 架构是双服务：Python 后端（FastAPI, 8080）+ Node 前端代理（4174）。
- 首次安装与跨电脑步骤见 `DEVELOPMENT.md`；使用 `node scripts/setup-portable.mjs`。
- Electron + React + Python(FastAPI) 混合架构，已接入真实 AI（maragate）。
- 数据库用 MySQL，向量库用 Chroma（嵌入式）。
- 本机任务与运行数据不上传。遵守 `.gitignore`，不要提交 `data/`、`work/`、依赖和运行时目录。
- 改动后运行相关检查；窗口置顶回归使用 `node tests/run-topmost-portable.mjs`。
