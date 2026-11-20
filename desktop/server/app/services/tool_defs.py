"""Tool definitions (OpenAI function-calling schema), ported from Tada's tool-defs.mjs."""
TOOL_DEFS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "建任务进日历。支持重复（每天/每周/工作日/范围）。一件事=一个任务，不拆解。",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务标题，≤40字"},
                    "date": {"type": "string", "description": "起始日期 YYYY-MM-DD"},
                    "time": {"type": "string", "description": "具体时间 HH:MM；没有就省略"},
                    "recurrence": {
                        "type": "object",
                        "description": "重复规则，不传=单次",
                        "properties": {
                            "freq": {"type": "string", "enum": ["daily", "weekly", "weekdays"]},
                            "days": {"type": "array", "items": {"type": "integer"}, "description": "weekly 时用，0=周日..6=周六"},
                        },
                    },
                    "endDate": {"type": "string", "description": "结束日期；不传=长期，传了=短期"},
                },
                "required": ["title", "date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "看某天的安排（含派生的重复任务），或不传日期看所有。",
            "parameters": {"type": "object", "properties": {"date": {"type": "string", "description": "YYYY-MM-DD；不传则返回所有"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "修改一个任务的任意字段。所有“改”类的请求都用它，只传要改的字段。",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "任务 id"},
                    "title": {"type": "string"},
                    "time": {"type": "string", "description": "新时间 HH:MM；改为无时间传空字符串"},
                    "date": {"type": "string"},
                    "recurrence": {
                        "type": "object",
                        "description": "新重复规则，传了就覆盖",
                        "properties": {
                            "freq": {"type": "string", "enum": ["daily", "weekly", "weekdays"]},
                            "days": {"type": "array", "items": {"type": "integer"}},
                        },
                    },
                    "endDate": {"type": "string", "description": "改为长期传空字符串"},
                },
                "required": ["id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "删除一个任务（重复规则整条删）。",
            "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_task",
            "description": "标某天完成/取消。重复任务按天记，需传 date。",
            "parameters": {"type": "object", "properties": {"id": {"type": "integer"}, "date": {"type": "string", "description": "YYYY-MM-DD"}}, "required": ["id", "date"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "insert_task",
            "description": "把新无时间任务插到当天无时间队列指定位置（不打乱已有）。",
            "parameters": {"type": "object", "properties": {"id": {"type": "integer"}, "date": {"type": "string"}, "position": {"type": "integer", "description": "0=最前，n=最后"}}, "required": ["id", "date", "position"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "apply_order",
            "description": "设一天无时间任务的完整顺序。",
            "parameters": {"type": "object", "properties": {"date": {"type": "string"}, "orderedIds": {"type": "array", "items": {"type": "integer"}}}, "required": ["date", "orderedIds"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_snippet",
            "description": "把文字/链接存进知识库（之后可被 search_knowledge 检索）。",
            "parameters": {"type": "object", "properties": {"content": {"type": "string", "description": "要存的内容（文字或 URL）"}, "type": {"type": "string", "enum": ["text", "link"]}, "title": {"type": "string", "description": "标题，≤20字，总结内容大意"}, "category": {"type": "string", "description": "可选类别（如'学习笔记'、'想法'、'技术'）"}}, "required": ["content", "type", "title"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_snippets",
            "description": "列出知识库里已存的所有片段。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_snippet",
            "description": "删除知识库一条片段（按 source）。",
            "parameters": {"type": "object", "properties": {"source": {"type": "string", "description": "片段来源/标题"}}, "required": ["source"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge",
            "description": "向量+BM25 混合检索知识库，返回最相关的片段。",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}, "required": ["query"]},
        },
    },
]
