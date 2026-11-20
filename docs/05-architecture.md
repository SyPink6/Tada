# Tada! Agent 架构方案 v0.2

> 本文档反映 **已落地** 的架构（Python 后端迁移完成后）。v0.1 是设计草案；v0.2 是实现现状。

在 [02-product.md](./02-product.md) 的产品边界与 [03-ai.md](./03-ai.md) 的 AI 行为约束之上，Tada 是一个面向 ADHD 体验人群的陪伴型 Agent。

## 1. 架构总览（三层）

```
浏览器 (React, port 4174)
  ↕ /api/* (相对路径)
Node 代理 (preview.mjs, port 4174)
  — 静态文件服务 + /api/* 转发到 Python
  ↕ HTTP (proxy)
Python 后端 (FastAPI, port 8080)
  ├── Agent loop（工具调用循环，服务端跑）
  ├── TaskService（任务 CRUD + 重复派生 + 按天完成 + 排序）
  ├── KnowledgeService（RAG：向量+BM25 混合检索 + rerank）— 复用 mind-py
  ├── DailyLog（对话按天存 + 类别标签）
  └── prompts.py（模块化 system prompt）
  ↕
SQLite (tada.db) + Chroma (向量) + maragate (LLM + embedding)
```

**关键设计**：agent loop 在**服务端**跑（Python），工具**in-process** 执行（直接调 TaskService/KnowledgeService，无 HTTP 往返）。前端只发用户消息、收最终回复。

## 2. Agent loop（服务端工具调用循环）

ReAct 范式（函数调用版）：推理 → 行动（tool_calls）→ 观察（工具结果）→ 再推理 → … → 最终回复。

```
用户消息 → build_system_prompt(今天日期) + messages
  → maragate /chat/completions（reasoning_effort='none' + tools）
  → 若返回 tool_calls → execute_tool(Python in-process) → 结果喂回 → 再调
  → 直到纯文本回复
  → 记 daily_log（user + assistant，按工具推断类别）
  → 返回 {reply, actions}
```

**LLM**：maragate（OpenAI 兼容），模型 `azure/gpt-6-luna`，推理模型须 `reasoning_effort:'none'` 才能用 function tools。
**embedding**：`alibaba/text-embedding-v4`（1024 维），走 maragate `/embeddings`。

文件：`server/app/services/agent.py`（AgentService.run）。

## 3. 数据模型（SQL + Chroma）

SQLite（`server/data/tada.db`），MySQL-ready（改 `DATABASE_URL` 一行切 MySQL）。

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `tasks` | id, title, time, order, recurrence(JSON), start_date, end_date, done, created_at | 任务（零散/短期/长期） |
| `completions` | id, task_id, date, unique(task_id,date) | 重复任务按天完成记录 |
| `knowledge_chunks` | id, source, source_index, content, embedding_json, created_at | RAG 知识块（mind-py 模型） |
| `daily_log` | id, date, category, entry_type, content, created_at | 按天对话日志（schedule/info/microstep/chat） |

**Chroma**（`server/data/chroma/`，嵌入式 PersistentClient）：存知识块的向量索引（cosine），由 mind-py 的 `ChromaKnowledgeStore` 管理。

**任务类型**（通过 recurrence + end_date 表达）：
- 零散（oneoff）：无 recurrence，start_date = 那天。
- 短期（short）：recurrence + end_date（有界范围，如"下周一到三每天"）。
- 长期（long）：recurrence + end_date 空（无界，如"每天"/"每周日"）。

**排序**：有 time 的按时排在前；无 time 的按 `order` 排在后。`order` 替代优先级（不显示高/中/低标签）。支持拖动 + 自动排序（LLM）+ 新任务插入（不打乱已有）。

文件：`server/app/models/entities.py`、`server/app/services/tasks.py`。

## 4. 工具注册表（11 个，Python）

| 工具 | 作用 | 服务 |
| --- | --- | --- |
| `create_task` | 建任务（含重复/时间） | TaskService |
| `list_tasks` | 看某天安排（含派生重复任务）或所有 | TaskService |
| `update_task` | 改任意字段（标题/时间/日期/重复规则/结束日期） | TaskService |
| `delete_task` | 删任务（重复规则整条删） | TaskService |
| `toggle_task` | 标某天完成/取消（重复任务按天记） | TaskService |
| `insert_task` | 新无时间任务插入位置（不打乱已有） | TaskService |
| `apply_order` | 设一天无时间任务的完整顺序 | TaskService |
| `save_snippet` | 存文字/链接进知识库 | KnowledgeService |
| `list_snippets` | 列出知识库片段 | KnowledgeService |
| `delete_snippet` | 删知识库片段 | KnowledgeService |
| `search_knowledge` | 向量+BM25 混合检索知识库 | KnowledgeService |

工具定义：`server/app/services/tool_defs.py`（纯数据，OpenAI function-calling schema）。
工具调度：`server/app/services/agent.py`（execute_tool，in-process 调 TaskService/KnowledgeService）。

## 5. RAG（复用 mind-py）

直接复用 `D:\Laura_Project\mind-py` 的 RAG 代码（原样拷贝，算法未改）：

- **chunking**：滑动窗口（512 字符 + 64 重叠）。
- **混合检索**：向量（Chroma cosine）+ BM25（关键词），加权融合（0.65:0.35）。
- **rerank**：本地确定性（词法 + 覆盖 + 短语），不额外调模型。
- **上下文扩展**：最优块 + 前后邻居。
- **降级**：向量不可用 → BM25 兜底。

文件：`server/app/services/knowledge.py`（KnowledgeService）、`server/app/services/vector_store.py`（ChromaKnowledgeStore）—— 均从 mind-py 拷贝，仅 `knowledge.py` 的 pypdf 导入改懒加载。

## 6. Prompt 模块（模块化 system prompt）

`server/app/services/prompts.py` — `build_system_prompt(ctx)` 按请求拼装：

| 模块 | 内容 | 稳定/动态 |
| --- | --- | --- |
| PERSONA | 团子定位：温和/不催/不评判/陪伴不指挥 | 稳定 |
| SITUATION | 今天日期（动态） | 动态 |
| SAFETY | 红线：不涉医疗/不羞辱/不打卡 | 稳定 |
| CAPABILITIES | 11 个工具列表 + 何时用 | 随工具增减 |
| PLANNING_RULES | 日程规则：不拆解/重复/冲突/改/删 | 功能模块 |
| ORDER_RULES | 排序规则：insert_task/apply_order | 功能模块 |
| KNOWLEDGE_RULES | 信息收集：粘贴先问/存/RAG 问答/删 | 功能模块 |
| OUTPUT_STYLE | 简短温暖/不复述/只问必要的 | 稳定 |

服务端拼装（客户端不能注入 system 角色）。

## 7. 前端（React → Node 代理 → Python）

- **React**（`desktop/src/main.jsx`）：团子对话页（首页）+ 日程安排 + 日历 + 零碎信息 tab。通过 `api.mjs` 调 `/api/*`。
- **Node 代理**（`desktop/scripts/preview.mjs`）：静态文件 + `/api/*` 转发到 Python（8080）。无 CORS 问题。
- **api.mjs**：`chat()`/`listTasks()`/`toggleTask()`/`deleteTask()`/`applyOrder()`/`listSnippets()`/`deleteSnippet()`/`listDailyLog()`/`occursOn()`。

旧的客户端模块（agent-client/tools/planner-store/snippet-store/hooks/daily-log）仍在文件里（未删，按不删除约定），但不再被 import。

## 8. 安全与降级（沿用 03-ai.md）

- 服务端结构校验 + 工具名白名单（客户端不能注入 system 或未知工具）。
- 不涉医疗诊断/不索用药史/不羞辱/不打卡。
- 不上传完整历史（只发当前对话所需轮次，≤30 条，每条 ≤2000 字）。
- 密钥在 `desktop/.env`（gitignored），仅服务端。
- CSP `connect-src 'self'`（前端只跟同源 Node 代理说话）。
- 向量不可用 → BM25 兜底（RAG 降级）。

## 9. 已落地 vs. 待做

### 已落地 ✅
- Python 后端（FastAPI + SQLite + Chroma + maragate）。
- Agent loop（服务端工具调用循环，11 个工具 in-process）。
- 任务系统（CRUD + 零散/短期/长期重复 + 按天完成 + 排序/拖动/自动排序/插入）。
- RAG（mind-py 混合检索 + rerank + chunking + 降级）。
- 零碎信息收集（save_snippet + 意图识别 + list/delete）。
- 对话按天存（daily_log + 类别标签 + 日期回看）。
- 前端切到 Python 后端（Node 代理 + api.mjs）。
- 模块化 prompt（8 个模块 + 动态拼接）。
- 时间冲突检测（agent 问改还是保持）。
- 删除确认（界面弹窗 + 对话先查再确认）。

### 待做 ⏳
- **微步+计时+自进化**：选任务→团子生成启动小步→气泡+进度条→"我准备好了"→计时器→完成→日历同步。`微步执行` tab 空着。
- **图片粘贴**（vision）：粘贴图片→团子看图→描述→embed→存。需前端 paste 事件 + 多模态消息。
- **链接阅读**（fetch_url）：服务端抓网页正文→切块→RAG。
- **MySQL**：装 MySQL → 改 `DATABASE_URL` 一行切过去（代码不动）。
- **「我的角落」迁移**：原始陪伴卡片（model.mjs + storage.mjs）仍在 IndexedDB，未迁 Python。
- **桌面宠物接 Python**：Electron 团子接 agent loop（给 Electron 主进程加 Python 后端连接）。

## 10. 文件结构

```
desktop/
├── server/                      # Python 后端（新）
│   ├── app/
│   │   ├── main.py              # FastAPI 应用
│   │   ├── api/routes.py        # 所有 API 端点
│   │   ├── core/
│   │   │   ├── config.py        # Settings（maragate + SQLite + Chroma + RAG 参数）
│   │   │   └── database.py      # SQLAlchemy 引擎（从 mind-py 拷贝）
│   │   ├── models/entities.py   # KnowledgeChunk + Task + Completion + DailyLog
│   │   └── services/
│   │       ├── agent.py         # Agent loop + 工具调度
│   │       ├── prompts.py       # 模块化 system prompt
│   │       ├── tool_defs.py     # 11 个工具 schema
│   │       ├── tasks.py         # TaskService（任务 CRUD + 派生 + 排序）
│   │       ├── knowledge.py     # KnowledgeService（RAG，从 mind-py 拷贝）
│   │       └── vector_store.py  # ChromaKnowledgeStore（从 mind-py 拷贝）
│   ├── data/                    # SQLite + Chroma（运行时生成）
│   └── requirements.txt
├── src/                         # React 前端
│   ├── main.jsx                 # UI 组件（对话/日历/日程/信息 tab）
│   ├── api.mjs                  # 前端 API 客户端（调 Python 后端）
│   ├── styles.css
│   └── (旧模块：agent-client/tools/planner-store/... 仍在，不再 import)
├── scripts/
│   ├── preview.mjs              # Node 服务器（静态 + /api/* 代理）
│   ├── build.mjs                # esbuild 打包
│   └── (旧：agent.mjs/llm.mjs/embed.mjs 仍在，被代理取代)
├── electron/                    # 桌面宠物（Electron，未接 Python）
├── .env                         # maragate 密钥（gitignored）
└── .env.example                 # 模板
```

## 11. 如何运行

```powershell
# 1. 启动 Python 后端（8080）
cd desktop\server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080

# 2. 启动 Node 前端（4174，代理到 Python）
cd desktop
npm run preview

# 3. 浏览器打开 http://127.0.0.1:4174
```

**切 MySQL**：装 MySQL → 改 `server/app/core/config.py` 的 `database_url` 为 `mysql+pymysql://user:pass@host/db` → 重启。代码不动。

**桌面宠物**：`npm run desktop`（Electron，目前独立，未接 Python 后端）。
