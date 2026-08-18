# 🎬 无限画布 · 视频生产工具

类似 LibTV 的无限画布视频/广告生产工具：**节点式画布 + 角色化对话 + 图片生成**。
单人单机使用，Python(FastAPI) 后端 + React Flow(TS) 前端。

> 完整架构决策见 [HANDOFF.md](HANDOFF.md)（交接文档）。

## 当前进度（P0 地基 ✅）

| 能力 | 状态 |
|------|------|
| 节点类型系统（ArtifactType / BaseNode / typed sockets） | ✅ |
| 类型化连线校验（前后端同一套规则） | ✅ |
| 自动派生连线（类型 + 语义标签匹配，生成 9 步主链） | ✅ |
| 执行引擎（拓扑分层 + 每层并发 + 按节点缓存 + 环检测） | ✅ |
| React Flow 无限画布 + 通用 NodeRenderer（加节点零前端） | ✅ |
| 节点库面板 / 属性面板（参数编辑）/ 执行结果面板 | ✅ |
| 9 个广告流程节点可视化与执行 | ✅ |

## 目录结构

```
无限画布/
├─ node-defs.json          ← 单一事实来源：所有节点的 inputs/outputs 定义
├─ providers.config.json   ← Provider 配置（key 只存环境变量名）
├─ .env.example            ← 环境变量模板（复制为 .env 填真实值）
├─ backend/                ← FastAPI 后端
│  ├─ app/
│  │  ├─ types.py          ← ArtifactType / NodeDef / Graph（对齐 node-defs.json）
│  │  ├─ defs.py           ← 加载 node-defs.json
│  │  ├─ engine/           ← connections / derive / layers / execute
│  │  ├─ providers/        ← Provider Registry（骨架）
│  │  ├─ nodes/runtime.py  ← 各节点 build 函数注册表
│  │  └─ main.py           ← /api/nodes /api/derive /api/validate-connection /api/execute
│  └─ .venv/
└─ frontend/               ← React + Vite + React Flow
   └─ src/
      ├─ types.ts          ← 与后端 types.py 对齐
      ├─ engine/           ← connections.ts / derive.ts（与后端同构）
      ├─ data/nodeDefs.ts  ← import node-defs.json（vite alias @node-defs）
      ├─ canvas/           ← Canvas.tsx / NodeRenderer.tsx
      └─ components/       ← NodePalette / Inspector / Toolbar / ResultsPanel
```

## 快速启动

```bash
# 1. 后端（终端 1）
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt     # Windows
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000

# 2. 前端（终端 2）
cd frontend
npm install
npm run dev                                        # → http://localhost:5173
```

浏览器打开 **http://localhost:5173**：
1. 左侧「节点库」点击添加 9 个流程节点（或任意几个）；
2. 点「自动连线」按语义生成主链（也可手动拖拽连线，类型不符会拒绝）；
3. 点「执行画布」→ 底部弹出逐节点执行结果。

## 环境变量（安全红线）

所有真实密钥**只**写在 `backend/.env`（或系统环境变量），代码一律用 `os.environ` 读取：

```bash
# .env（复制自 .env.example，绝不提交 git）
OPENAI_API_KEY=sk-xxxx        # 使用轮换后的新 key
OPENAI_BASE_URL=https://www.codex2api.com/v1
OPENAI_MODEL=gpt-5.6-sol
```

- `.gitignore` 已忽略 `.env`、`node_modules`、`.venv`、`dist`。
- ❌ 绝不在代码/配置/文档里写真实 Key。

## 加新节点（扩展性核心）

**只需两步，前端零改动：**

1. **`node-defs.json`** 加一项：`kind`（chat/generator/asset/table/auto/review/memory）+ `inputs[]`/`outputs[]`（`type` 类型、`isConnection` 是否连线口、`accepts`/`provides` 语义标签）。
2. **`backend/app/nodes/runtime.py`** 注册对应 build 函数（auto 节点为确定性函数；chat/generator 接模型）。

画布渲染、连线校验、自动连线、执行引擎全部自动适配新节点。

> 语义标签（`accepts`/`provides`）作用：自动连线时既要「类型兼容」又要「语义匹配」，避免多个 Document 类输出互相乱连。手动拖拽仍按类型校验。

## 路线图

| 阶段 | 目标 | 状态 |
|------|------|------|
| P0 | 类型系统 + 引擎 + 画布 + 9 节点可视化 | ✅ 完成 |
| P1 | Provider + Chat 节点（LangChain + 右侧聊天面板）+ Memory | ⏭ 下一步 |
| P2 | Generator 图片生成闭环 + Asset 版本化 + 图片网格 | ⏳ |
| P3 | Table 分镜表定制前端（镜头卡片 + 时间线） | ⏳ |
| P4 | LangGraph 编排 + Review 驳回回流 | ⏳ |
| P5 | Auto/Review 完善 + 完整闭环 | ⏳ |
| P6 | 音频/视频生成（含抽帧） | ⏳ |
