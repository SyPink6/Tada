# 换一台电脑继续开发 Tada!

仓库：https://github.com/SyPink6/Tada 。当前可运行项目在 `desktop/`。

## 架构概览

双服务架构：

```
浏览器 (React, 4174) ←→ Node 代理 (4174) ←→ Python 后端 (8080)
                                                    ↓
                                           MySQL + Chroma + maragate LLM
```

- **Python 后端**（FastAPI, 8080）：agent loop + 任务 CRUD + RAG 检索 + 对话日志。
- **Node 前端代理**（4174）：静态文件服务 + `/api/*` 转发到 Python。
- **MySQL**：任务、完成记录、对话日志、知识块。
- **Chroma**（嵌入式）：RAG 向量索引。
- **maragate**（OpenAI 兼容）：LLM（`azure/gpt-6-luna`）+ embedding（`alibaba/text-embedding-v4`）。
- **Electron**：桌面宠物团子，通过 IPC 调 Python 后端聊天。

## 第一次在新电脑上打开

准备 Git、Node.js 22+、Python 3.11+、MySQL 8.x，以及 64 位 Windows。

```powershell
git clone https://github.com/SyPink6/Tada.git
cd Tada\desktop

# 1. 安装前端依赖 + Electron 二进制
node scripts/setup-portable.mjs

# 2. 安装 Python 后端依赖
cd server
pip install -r requirements.txt
cd ..

# 3. 配置密钥
copy .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL / DATABASE_URL

# 4. 启动 MySQL（或用已有实例），创建数据库
# CREATE DATABASE tada CHARACTER SET utf8mb4;

# 5. 启动 Python 后端
cd server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080

# 6. 启动 Node 前端（另一个终端）
npm run preview
```

浏览器打开 http://127.0.0.1:4174 。

桌面宠物（Electron）：
```powershell
npm run desktop
```

## 日常开发与同步

切换电脑前先提交并推送。在另一台电脑开始工作前，确认没有未提交的修改，再执行 `git pull --ff-only`。

```powershell
git status
git add desktop/src desktop/electron desktop/scripts desktop/server desktop/tests docs
git commit -m "Describe the change"
git push origin main
```

GitHub 同步源码和文档，**不跨电脑同步个人任务、完成记录或偏好**。它们在各自电脑的 MySQL 里。

## 目录导航

| 目录/文件 | 用途 |
| --- | --- |
| `desktop/src/` | React 界面（main.jsx）+ 前端 API 客户端（api.mjs） |
| `desktop/electron/` | 桌面宠物：透明窗口、托盘、IPC 聊天 |
| `desktop/scripts/` | 构建、预览、桌面启动、安装 |
| `desktop/server/` | Python 后端（FastAPI） |
| `desktop/server/app/services/` | agent loop、任务服务、RAG（复用 mind-py）、prompt 模块 |
| `desktop/server/app/models/` | 数据模型（Task/Completion/DailyLog/KnowledgeChunk） |
| `desktop/server/app/api/` | 所有 API 端点 |
| `docs/` | 品牌、MVP、AI 行为、架构方案 |

## 验证命令

在 `desktop/` 中运行：

```powershell
npm test
npm run build
node tests/run-topmost-portable.mjs
```

置顶检查会在新的独立目录中创建测试应用，验证真实 Windows 窗口标记。

## 配置文件

| 文件 | 说明 |
| --- | --- |
| `desktop/.env` | maragate 密钥 + MySQL 连接串（gitignored，不上传） |
| `desktop/.env.example` | 模板（可上传） |
| `desktop/server/requirements.txt` | Python 依赖 |
| `desktop/package.json` | Node 依赖 + 脚本入口 |
