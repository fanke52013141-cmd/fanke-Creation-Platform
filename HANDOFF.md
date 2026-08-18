# 无限画布 · 视频生产工具 — Handoff 文档

> 这是一份**自包含的交接文档**，供在另一台电脑上接力开发使用。它汇总了全部架构决策、定稿的节点 Schema 设计、开源调研结论与落地路线。打开本文件即可获得开发所需的全部上下文，不依赖 `_research/` 里的克隆仓库。

---

## ⚠️ 安全须知（开工前必读）

- **曾经明文暴露过一个真实 API Key**（`sk-55c9e030……`，codex2api 网关）。它已出现在对话记录中，应视为泄露。**请立即去 codex2api 后台轮换/吊销该 Key。**
- 本文档所有配置示例**只使用环境变量占位符**（如 `${OPENAI_API_KEY}` / `process.env.OPENAI_API_KEY`），绝不写入真实密钥。落地代码必须沿用此约定，`.env` 一律加入 `.gitignore`。

---

## 目录

1. [项目概述](#1-项目概述)
2. [架构总览](#2-架构总览)
3. [★ 节点 Schema 设计（定稿）](#3-节点-schema-设计定稿)
4. [执行引擎](#4-执行引擎)
5. [Provider 层](#5-provider-层)
6. [画布与渲染](#6-画布与渲染)
7. [实时通信](#7-实时通信)
8. [分镜数据模型（核心壁垒）](#8-分镜数据模型核心壁垒)
9. [技术栈选型](#9-技术栈选型)
10. [开源参考地图](#10-开源参考地图)
11. [项目目录结构](#11-项目目录结构)
12. [分阶段路线图](#12-分阶段路线图)
13. [关键决策记录（ADR）](#13-关键决策记录adr)
14. [快速启动清单](#14-快速启动清单)

---

## 1. 项目概述

### 要做什么
一个**类似 LibTV 的无限画布视频/广告生产工具**。LibTV 是 2026 年上线的"首个同时面向人与 Agent 的专业视频创作平台"，支持从脚本、分镜到成片全流程（**它本身闭源**）。我们要用开源组件复刻其产品形态。

### 核心形态
- **无限画布**作为操作界面，节点拖拽、自动连线、协作。
- **聊天节点**：点击弹出右侧聊天面板，由角色化系统提示词驱动，LangChain 实现。
- **生成节点**：调模型/接口产出图片（音频/视频后续解锁）。
- **分镜表节点**：结构化镜头表，画布原生编辑。
- **自动化节点 + 审查节点**：确定性变换 + 审批回流。

### 起源
本项目是把已有的 **creative-ad-video**（https://github.com/fanke52013141-cmd/creative-ad-video，一套基于 Codex 的广告视频生产 DAG）**从命令行驱动迁移到画布 + 聊天驱动**。原项目的 9 步流程（创意策略→审查→视觉方向→资产计划→分镜→分镜审查→提示词→图片生成→打包）将成为画布上的节点。

### 一句话定位
> **LangFlow 式的节点系统 + ai-jaaz 式的图片生成/画布联动 + 自建的真分镜模型，三者缝合成一个面向广告/视频生产的无限画布工具。**

---

## 2. 架构总览

五层架构，自上而下：

```
┌─ 表现层 ─────────────────────────────────────────────────────┐
│  无限画布（React Flow / xyflow）+ 通用节点渲染器（schema 驱动） │
│  + 特殊节点的定制前端（分镜表网格、图片网格）                    │
├─ 原语层（7 种节点类型）───────────────────────────────────────┤
│  💬Chat  🎨Generator  📦Asset  📋Table  ⚙️Auto  ✅Review  🧠Memory │
├─ 编排层 ─────────────────────────────────────────────────────┤
│  执行引擎：画布 JSON → Graph → 拓扑分层并发执行 + 按节点缓存     │
│  类型校验：前后端同一套规则（typed sockets）                     │
├─ Provider 层（基础设施，非节点）─────────────────────────────┤
│  Provider Registry → Chat 适配器 / ImageGen 适配器 / ...        │
│  配置驱动，key 走 env；借鉴 LiteLLM 的统一抽象思想              │
├─ 存储层 ─────────────────────────────────────────────────────┤
│  对象存储 + 版本化产物（Artifact Revision，不可变快照）          │
│  画布文档存为原生 {nodes, edges, viewport} JSON                 │
└──────────────────────────────────────────────────────────────┘
```

### 两个正交维度理解节点
| 维度 | 取值 |
|------|------|
| **引擎（怎么跑）** | conversation（人+LLM）/ generation（模型调用）/ automation（纯函数）/ passive（只持有数据） |
| **产物形态（产出什么）** | 文本文档 / 结构化表格 / 媒体（图片音频视频）/ 决策 / 记忆句柄 |

7 种节点原语就是这两个维度的实用组合。

---

## 3. 节点 Schema 设计（定稿）

> 这是整个项目的地基。核心思想来自 **LangFlow**：节点用**声明式 `inputs[]/outputs[]`** 定义类型化插口，**输出类型从实现方法的返回类型自动推断**，前后端用同一套类型规则校验连线。

### 3.1 设计原则（源自 LangFlow，已验证可行）

1. **节点 = 一个声明 `inputs[]` / `outputs[]` 的对象**，画布渲染器和执行器消费同一份声明，不存在"UI 写一遍、运行时写一遍"。
2. **类型化插口（typed sockets）**：每个插口带一个 `ArtifactType`，非法连线（如 `Image→Shot`）在 UI 拖拽时即被拒绝，后端再兜底校验一次。
3. **输出类型自动推断**：仿 LangFlow 的 `Output(method=...)` + 方法返回注解。TS 里用映射类型让 `build()` 函数的返回值被 outputs 声明自动约束——类型对不上编译期就报错。
4. **通用渲染器 + schema 驱动**：绝大多数节点由一个 `GenericNode` 组件按序列化 schema 自动渲染，**加新节点零前端代码**；只有真正特殊的（分镜表网格、图片网格）才单独写前端。
5. **记忆是独立可连线节点**，不是 Chat 节点的属性。

### 3.2 Artifact 类型系统（typed sockets）

这是连线上流动的"货物类型"。先定死集合，新增类型走显式登记 + 迁移表。

```ts
// src/types/artifact.ts

/** 所有可在连线上流动的类型（typed socket 的 "形状"） */
export type ArtifactType =
  | 'Message'    // 单条聊天消息 / 文本
  | 'Document'   // markdown 文档（brief / story / style bible）
  | 'Prompt'     // 构造好的提示词
  | 'Shot'       // 单个分镜镜头（见第 8 节）
  | 'Image'      // 图片
  | 'Audio'      // 音频
  | 'Video'      // 视频
  | 'Memory'     // 对话历史句柄
  | 'ModelRef'   // 已配置的 provider 模型引用
  | 'Decision'   // 审批决策（approve/reject）
  | 'Table'      // 结构化表格
  | 'Data';      // 通用 JSON（兜底）

/** 每种 ArtifactType 在运行时的实际值形状（编译期类型安全） */
export interface RuntimeValueMap {
  Message:  { id: string; role: 'user' | 'assistant' | 'system'; content: string; files?: AssetRef[] };
  Document: { id: string; title: string; markdown: string };
  Prompt:   { text: string; variables: Record<string, unknown> };
  Shot:     Shot;                       // 见第 8 节
  Image:    { id: string; url: string; width: number; height: number; mime: string };
  Audio:    { id: string; url: string; durationMs: number };
  Video:    { id: string; url: string; durationMs: number };
  Memory:   { sessionId: string; messages: RuntimeValueMap['Message'][] };
  ModelRef: { providerId: string; modelId: string; variant?: string };
  Decision: { approved: boolean; reason?: string };
  Table:    { columns: Column[]; rows: Record<string, unknown>[] };
  Data:     unknown;
}

/** 类型重命名迁移表：旧类型 → 新类型，保证旧画布不会因改名而失效（仿 LangFlow TYPE_MIGRATIONS） */
export const TYPE_MIGRATIONS: Partial<Record<ArtifactType, ArtifactType>> = {
  // 例：'DataFrame': 'Table'  // 未来重命名时在这里登记
};
```

### 3.3 核心 NodeDef 接口

```ts
// src/types/node.ts

export type NodeKind =
  | 'chat' | 'generator' | 'asset' | 'table' | 'auto' | 'review' | 'memory';

/** 输入插口 */
export interface InputPort {
  name: string;
  type: ArtifactType;
  array?: boolean;        // true = 接受该类型的数组（可接入多个上游）
  required?: boolean;
  defaultValue?: unknown;
  /** true = 连线插口（从上游节点取值）；false = 参数字段（用户在节点上填写） */
  isConnection?: boolean;
  /** 参数字段的 UI 提示：text | multiline | dropdown | slider | file | hidden ... */
  editor?: 'text' | 'multiline' | 'dropdown' | 'slider' | 'number' | 'file' | 'toggle' | 'hidden';
  options?: string[];     // editor=dropdown 时的候选项
}

/** 输出插口 */
export interface OutputPort {
  name: string;
  type: ArtifactType;
  array?: boolean;
  /** 绑定的产出方法名（仿 LangFlow 的 Output(method=...)） */
  method?: string;
}

/** 所有节点的公共字段 */
export interface BaseNode {
  id: string;             // nanoid，画布上唯一
  kind: NodeKind;
  name: string;           // 展示名
  description?: string;
  icon?: string;          // lucide 图标名
  inputs: InputPort[];
  outputs: OutputPort[];
  /** 画布坐标（由画布库管理，序列化进文档） */
  position?: { x: number; y: number };
}

/** 从节点定义推导出 build() 应返回的类型（类型自动推断的核心） */
export type NodeOutputs<N extends BaseNode> = {
  [P in Extract<N['outputs'][number], { name: string }>['name']]: OutputsOfPort<
    Extract<N['outputs'][number], { name: P }>
  >;
};
type OutputsOfPort<P extends OutputPort> =
  P extends { array: true } ? RuntimeValueMap[P['type']][] : RuntimeValueMap[P['type']];

/** build() 收到的上下文：已解析的上游输入 + Provider 访问 + 工具 */
export interface BuildContext<N extends BaseNode> {
  nodeId: string;
  inputs: ResolveInputs<N>;
  providers: ProviderAccess;   // 见第 5 节
  memory?: RuntimeValueMap['Memory'];
  /** 主动向画布推送进度（流式生成/逐帧进度） */
  emit: (event: NodeEvent) => void;
}
type ResolveInputs<N extends BaseNode> = {
  [P in Extract<N['inputs'][number], { name: string }>['name']]: InputValueOf<
    Extract<N['inputs'][number], { name: P }>
  >;
};
type InputValueOf<P extends InputPort> =
  P extends { array: true } ? RuntimeValueMap[P['type']][] : RuntimeValueMap[P['type']];
```

> **类型自动推断怎么用**：定义节点时，`outputs` 声明了哪些口、什么类型，那么它的 `build(ctx)` 的返回类型 `NodeOutputs<MyNode>` 就被自动约束成对应形状。写错返回值，TS 编译期直接报错——和 LangFlow 用方法返回注解派生 output type 是同一思想，只是搬到 TS 的映射类型。

### 3.4 连线校验规则（前后端同一套）

```ts
// src/engine/connections.ts

export function typeIsCompatibleWith(sourceType: ArtifactType, targetTypes: ArtifactType[]): boolean {
  const src = TYPE_MIGRATIONS[sourceType] ?? sourceType;
  return targetTypes.some((t) => {
    const tgt = TYPE_MIGRATIONS[t] ?? t;
    return sourceType === t || src === t || sourceType === tgt || src === tgt;
  });
}

/** UI 拖拽时调用（React Flow isValidConnection） */
export function isValidConnection(
  conn: { source: string; target: string; sourceHandle: string; targetHandle: string },
  nodes: BaseNode[],
): boolean {
  if (conn.source === conn.target) return false;          // 禁止自连
  const src = findOutputPort(nodes, conn.source, conn.sourceHandle);
  const tgt = findInputPort(nodes, conn.target, conn.targetHandle);
  if (!src || !tgt || !tgt.isConnection) return false;
  // 数组目标可接受多个同类上游；单值目标只接受一个
  const accept = tgt.array ? [tgt.type] : [tgt.type];
  if (!typeIsCompatibleWith(src.type, accept)) return false;
  if (!tgt.array && hasIncomingEdge(nodes, conn.target, conn.targetHandle)) return false; // 单值口已有连线
  return true;
}
```

**两种连线模式并存**：
- **自动派生**（适合流程图式）：节点只声明 `consumes/produces`，由 `deriveEdges()` 按类型匹配自动连线（见下）。
- **手动拖拽**（适合自由编辑）：用户拖线，`isValidConnection` 实时校验类型。

```ts
// src/engine/derive.ts —— 自动派生连线（流程图模式）
export interface Edge { source: string; sourcePort: string; target: string; targetPort: string; via: ArtifactType; }

export function deriveEdges(nodes: BaseNode[]): Edge[] {
  const out: Edge[] = [];
  for (const consumer of nodes) {
    for (const ip of consumer.inputs) {
      if (!ip.isConnection) continue;
      for (const producer of nodes) {
        for (const op of producer.outputs) {
          if (typeIsCompatibleWith(op.type, [ip.type])) {
            out.push({ source: producer.id, sourcePort: op.name, target: consumer.id, targetPort: ip.name, via: ip.type });
          }
        }
      }
    }
  }
  return out;
}
```

### 3.5 七种节点的完整定义

下面每种原语给出：职责、扩展字段、inputs/outputs 示范、build 实现要点。**这些就是后续写代码的蓝本。**

---

#### 3.5.1 💬 Chat 节点（对话）

人 + LLM 协作产出文本文档。点击节点弹出右侧聊天面板。

```ts
// src/types/nodes/chat.ts
export interface ChatNode extends BaseNode {
  kind: 'chat';
  /** 角色化系统提示词（驱动整个对话的角色与约束） */
  systemPrompt: string;
  /** 引用的模型（指向 Provider Registry 里的 chat 模型） */
  model: { providerId: string; modelId: string; variant?: 'low'|'medium'|'high'|'xhigh'|'max' };
  tools?: string[];          // 可调用工具标识（写文档、读上游等）
  allowUpload?: boolean;     // 是否允许在聊天面板上传文件（多模态输入）
}
```

**实例——"创意策略"节点**：
```ts
const ideaStrategy: ChatNode = {
  id: 'idea-strategy',
  kind: 'chat',
  name: '创意策略',
  icon: 'Lightbulb',
  systemPrompt: '你是资深广告创意策略师。用五步脑洞法产出 3 条差异化创意方案，定稿为 brief.md 与 story.md。不写分镜、不写生成提示词。',
  model: { providerId: 'codex2api', modelId: 'gpt-5.6-sol', variant: 'high' },
  allowUpload: true,
  inputs: [
    { name: 'memory',   type: 'Memory',   isConnection: true },   // 可选：接对话历史
    { name: 'refs',     type: 'Document', isConnection: true, array: true }, // 可选：参考文档
  ],
  outputs: [
    { name: 'brief', type: 'Document', method: 'buildBrief' },
    { name: 'story', type: 'Document', method: 'buildStory' },
  ],
};

// 运行时实现（build 返回类型被 outputs 自动约束）
export const ideaStrategyRuntime: NodeRuntime<ChatNode> = {
  def: ideaStrategy,
  async build(ctx) {
    // ctx.providers.chat 调用 LLM；ctx.memory 注入历史；多轮对话在聊天面板交互完成
    // 对话产出经 OutputParser 解析为两份 Document
    return {
      brief: { id, title: '创意简报', markdown: /* ... */ },
      story: { id, title: '剧本', markdown: /* ... */ },
    };
  },
};
```

---

#### 3.5.2 🎨 Generator 节点（生成）

调模型/接口产出媒体，单次参数化调用。多模态扩展靠同一个基类。

```ts
// src/types/nodes/generator.ts
export interface GeneratorNode extends BaseNode {
  kind: 'generator';
  modality: 'image' | 'audio' | 'video';
  providerId: string;        // 指向 Provider Registry 的 image/audio/video 段
  modelId: string;
  params: GeneratorParams;
}
export interface GeneratorParams {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  seed?: number;
  negativePrompt?: string;
  inputImageId?: string;     // 图生图/编辑时的参考图 asset id
  num?: number;              // 一次产出几张（默认 1）
}
```

**双输出设计（仿 LangFlow LCModelComponent）**：产出物 + 确定性输入，便于下游链式复用。
```ts
outputs: [
  { name: 'image', type: 'Image', method: 'buildImage' },     // 渲染结果
  { name: 'seed',  type: 'Data',  method: 'buildSeed' },      // 确定性参数（下游视频节点要用）
],
```

实现要点（借鉴 ai-jaaz 的 `PROVIDERS` 策略表）：把"同步 / 异步轮询 / WebSocket 流"三种完成机制藏在一个 `await provider.generate(...)` 后面，上层无感。

---

#### 3.5.3 📦 Asset 节点（资产）

被动持有媒体/数据，版本化、可复用。本身不干活，只被别的节点读写。

```ts
// src/types/nodes/asset.ts
export interface AssetNode extends BaseNode {
  kind: 'asset';
  mediaType: 'image' | 'audio' | 'video' | 'document';
  versions: AssetVersion[];   // 版本历史，最新版为 head
}
export interface AssetVersion {
  rev: number;
  url: string;
  sha256: string;             // 不可变快照（借鉴已有 Artifact Revision）
  mime: string;
  width?: number; height?: number; durationMs?: number;
  createdAt: string;
  source: { nodeId: string; providerId?: string; prompt?: string };
}
```

build 即返回 head 版本。重生成/人工导入登记为**新 Revision**（旧版保留，旧审批失效）。

---

#### 3.5.4 📋 Table 节点（结构化编辑）

结构化内容，人在画布上编辑。最重要的实例是**分镜表**。

```ts
// src/types/nodes/table.ts
export interface TableNode extends BaseNode {
  kind: 'table';
  schema: Column[];
  rows: Record<string, unknown>[];
  /** 决定前端用哪种定制编辑器；缺省 generic 用通用表格 */
  editorHint?: 'storyboard' | 'asset-list' | 'script' | 'generic';
}
export interface Column { key: string; label: string; type: 'text'|'number'|'image-ref'|'select'; options?: string[]; }
```

**实例——"分镜表"节点**：`editorHint: 'storyboard'`，前端渲染为镜头卡片网格 + 时间线（画布原生核心功能，见第 8 节）。

---

#### 3.5.5 ⚙️ Auto 节点（自动化）

确定性纯函数变换，无 LLM、无人介入。

```ts
// src/types/nodes/auto.ts
export interface AutoNode extends BaseNode {
  kind: 'auto';
  /** 确定性函数标识，注册在函数表里 */
  fn: string;
  fnParams?: Record<string, unknown>;
}
```

**实例——"分镜提示词"**：`fn: 'build_storyboard_packets'`，输入分镜 JSON + 风格圣经，输出 V/SB/S 数据包。

---

#### 3.5.6 ✅ Review 节点（审查）

审批门禁 + 标注回流。产出 Decision + 画布上的标注。

```ts
// src/types/nodes/review.ts
export interface ReviewNode extends BaseNode {
  kind: 'review';
  /** 驳回时回流到的目标节点 id（控制流，显式声明） */
  onRejectNodeId?: string;
  annotations?: ReviewAnnotation[];
}
export interface ReviewAnnotation { targetNodeId: string; severity: 'P0'|'P1'|'P2'; note: string; }
```

---

#### 3.5.7 🧠 Memory 节点（记忆）

**独立节点**，不是 Chat 节点的属性（这是 LangFlow 的关键设计）。被多个节点共享读写。

```ts
// src/types/nodes/memory.ts
export interface MemoryNode extends BaseNode {
  kind: 'memory';
  mode: 'store' | 'retrieve';
  sessionId: string;
  contextId?: string;
  backend: 'db' | 'vector' | 'ephemeral';
  n?: number;                // retrieve 时取最近 n 条
}
```

**实例**：一个全局 `Memory` 节点（retrieve 模式），创意策略、创意审查、视觉方向这几个 Chat 节点都把它的 `memory` 输出接到自己的 `memory` 输入——共享同一段对话上下文，而 Chat 节点本身保持无状态。

### 3.6 节点关系：数据流 vs 控制流

- **数据流**（自动/校验）：由 `inputs/outputs` 的类型匹配派生，确定性。
- **控制流**（显式）：Review 的 `onRejectNodeId` 这种回流路由，人工声明，不参与类型派生。
- 两个维度互不干扰：数据流自动、控制流显式。

### 3.7 Provider 引用机制

节点通过 `{ providerId, modelId }` 引用一个已配置的模型，由 Provider Registry 解析成 `baseURL + apiKey + params` 去调用。**节点不直接知道 URL 和 key**——这是 Provider 层的职责（见第 5 节）。

---

## 4. 执行引擎

借鉴 **LangFlow 的 `Graph.process`**：拓扑分层 + 每层并发 + 按节点缓存 + 环检测。

```ts
// src/engine/execute.ts

export interface Graph { nodes: BaseNode[]; edges: Edge[]; }

export async function execute(graph: Graph, seedInputs: Record<string, unknown>): Promise<Map<string, unknown>> {
  const layers = topologicalLayers(graph);    // 拓扑排序成层
  const cache = new Map<string, unknown>();   // nodeId → 结果（按节点缓存）
  for (const layer of layers) {
    // 每层并发执行（asyncio/asyncio 风格 → TS 的 Promise.all）
    await Promise.all(layer.map((node) => runNode(node, graph, cache)));
  }
  return cache;
}

async function runNode(node: BaseNode, graph: Graph, cache: Map<string, unknown>) {
  // 1. 缓存命中？
  const key = cacheKey(node, graph);          // (nodeId + 输入 hash)
  if (!inCycle(node, graph) && cache.has(key)) { node.output = cache.get(key); return; }
  // 2. 解析上游输入
  const inputs = resolveInputs(node, graph, cache);
  // 3. 调 build
  const rt = REGISTRY[node.kind][node.fn ?? 'default'];
  const out = await rt.build({ nodeId: node.id, inputs, providers, emit: (...) => {} });
  // 4. 缓存 + 落盘
  cache.set(key, out);
  persistArtifactRevision(node.id, out);      // 版本化快照
}
```

### 缓存策略（仿 LangFlow）
- 按 `(nodeId + 输入内容的 hash)` 缓存结果。
- **环里的节点自动关闭缓存**（否则死循环读旧值）。
- **反应式子图**（Listen/Notify 类）自动重算。
- 对图片/视频生成这种"贵且确定性高"的节点，缓存至关重要——改一帧不用重跑整条链。

### 环检测
对存在环的图，要求声明 `maxIterations`；async 路径用 `findCycleVertices` 标记环内节点并关缓存。我们的流程主链是 DAG，环只出现在 Review 回流这种控制流上（控制流不走缓存层）。

---

## 5. Provider 层

**模型调用是独立的基础设施层，不是节点。** 被 Chat 节点和 Generator 节点共享调用。

### 结构

```ts
// src/providers/registry.ts
export interface ProviderRegistry {
  chat:  ChatProvider[];    // OpenAI 兼容的聊天模型
  image: ImageGenProvider[];// 图片生成（各家私有接口）
  audio: AudioGenProvider[];// 未来
  video: VideoGenProvider[];// 未来
}

export interface ChatProvider {
  id: string;
  baseURL: string;
  apiKeyEnv: string;        // 环境变量名，绝不存明文 key
  models: ChatModel[];
}
export interface ChatModel {
  id: string; name: string;
  context: number; output: number;
  variants: ('low'|'medium'|'high'|'xhigh'|'max')[];
}

export interface ImageGenProvider {
  id: string;
  apiStyle: 'jimeng'|'kling'|'dalle'|'openai-images'|'replicate'|'comfyui';
  apiKeyEnv: string;
  models: ImageModel[];
}
```

### 为什么 chat 和 image 分两类
聊天是 OpenAI 兼容的 `/chat/completions`；图片是各家私有接口，API 形态完全不同。Registry 里各自一套**适配器（adapter）**，节点只通过 `modelId` 引用，Registry 负责解析和路由。

### Provider 调度（借鉴 ai-jaaz 的策略表）

```ts
// 一个统一的 generate 接口，把同步/异步轮询/WebSocket 流藏在后面（仿 ai-jaaz ImageGenerator ABC）
export interface ImageGenerator {
  generate(prompt: string, model: string, opts: { aspectRatio?: string; seed?: number; inputImageId?: string }): Promise<GenResult>;
}
const IMAGE_PROVIDERS: Record<string, ImageGenerator> = {
  jimeng:    new JimengGenerator(),
  kling:     new KlingGenerator(),
  replicate: new ReplicateGenerator(),   // 同步：Prefer: wait
  comfyui:   new ComfyUIGenerator(),     // WebSocket 实时进度
  // ...
};
```

### 配置文件（可提交；key 走 env）

参考用户提供的 opencode 配置结构，转成我们的 Registry 默认值：

```jsonc
// providers.config.json —— 可提交到仓库
{
  "chat": [
    {
      "id": "codex2api",
      "baseURL": "https://www.codex2api.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",      // ← 指向环境变量名，不是值
      "models": [
        { "id": "gpt-5.6-sol",   "name": "GPT-5.6 Sol",   "context": 1050000, "output": 128000, "variants": ["low","medium","high","xhigh","max"] },
        { "id": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "context": 1050000, "output": 128000, "variants": ["low","medium","high","xhigh","max"] },
        { "id": "gpt-5.6-luna",  "name": "GPT-5.6 Luna",  "context": 1050000, "output": 128000, "variants": ["low","medium","high","xhigh","max"] },
        { "id": "gpt-5.5",       "name": "GPT-5.5",       "context": 1050000, "output": 128000, "variants": ["low","medium","high","xhigh"] },
        { "id": "gpt-5.4",       "name": "GPT-5.4",       "context": 1050000, "output": 128000, "variants": ["low","medium","high","xhigh"] },
        { "id": "gpt-5.4-mini",  "name": "GPT-5.4 Mini",  "context": 400000,  "output": 128000, "variants": ["low","medium","high","xhigh"] },
        { "id": "gpt-5.2",       "name": "GPT-5.2",       "context": 400000,  "output": 128000, "variants": ["low","medium","high","xhigh"] }
      ]
    }
  ],
  "image": [
    { "id": "jimeng", "apiStyle": "jimeng", "apiKeyEnv": "JIMENG_API_KEY", "models": [ /* ... */ ] }
  ]
}
```
```bash
# .env —— 绝不提交（加入 .gitignore）
OPENAI_API_KEY=sk-xxxx        # ← 用你轮换后的新 key
JIMENG_API_KEY=...
```

---

## 6. 画布与渲染

### 画布库选型
**首选 React Flow（@xyflow/react）**——LangFlow 已验证它能承载"通用节点渲染器 + typed-edge 校验 + 大量节点"。tldraw 也是可选（更偏自由绘图），但 React Flow 在"节点图"场景更顺手。**两者都支持自定义节点组件 + 序列化 `{nodes, edges, viewport}`。**

### 通用节点渲染器（schema 驱动，仿 LangFlow GenericNode）
一个 `<NodeRenderer node={...} />` 组件，根据节点的 `inputs/outputs` schema 自动渲染字段控件与插口。**加新节点 = 只写后端定义，零前端代码。** 仅以下情况写定制前端：
- 分镜表（`editorHint: 'storyboard'`）→ 镜头卡片网格 + 时间线
- 图片网格（Generator/Asset 结果）→ 缩略图网格 + 版本对比

### 类型化连线（前后端同规则）
React Flow 的 `<Handle isValidConnection={...}>` 接入第 3.4 节的 `isValidConnection`，handle 的 id 里编码 `{type, array, nodeId}`，与后端存储的 edge 同构——UI 校验和后端校验用同一套。

### 节点 ↔ 画布联动（借鉴 ai-jaaz）
生成结果和画布元素共享**稳定 id**（如 `im_xxxxxxxx`）。聊天里点图片有"在画布上定位"按钮 → `reactFlow.fitView({ nodes: [id] })` 平移缩放到该节点。分镜表某行 ↔ 对应生成帧也用这个范式。

---

## 7. 实时通信（借鉴 ai-jaaz）

**单一 WebSocket 通道 + 前端 eventBus 按 type 分发**。别为每种节点开一个 socket。

```ts
// 后端只广播一种事件
ws.send({ type: 'node_progress', nodeId, payload });   // 进度
ws.send({ type: 'image_generated', nodeId, payload }); // 生成完成
ws.send({ type: 'storyboard_row_updated', ... });      // 未来扩展
```
```ts
// 前端 mitt eventBus 分发
eventBus.on('image_generated', handler);
```

适合：流式聊天 token、图片逐帧进度、分镜行更新、视频段就绪等。

---

## 8. 分镜数据模型（核心壁垒）

> **这是我们的核心壁垒，必须自建。** 调研证明：ai-jaaz 的"分镜"只是"图片撒在 Excalidraw 上"，完全没有镜头级元数据；LangFlow 是通用 LLM 编排，没有视频领域 schema。市面上没有现成的可抄。

```ts
// src/types/storyboard.ts

/** 单个分镜镜头 */
export interface Shot {
  id: string;                  // 稳定 id，贯穿"分镜表行 ↔ 生成帧 ↔ 画布节点"
  index: number;               // 镜头序号
  durationSec: number;         // 时长
  sceneDescription: string;    // 画面描述
  action: string;              // 可执行动作
  cameraAngle?: string;        // 机位/景别
  dialogue?: string;           // 对白
  /** 广告文字（内容 + 画面位置），逐字核验用 */
  adText?: { content: string; position?: 'top'|'center'|'bottom'|'overlay' };
  prompt?: string;             // 生成的图片提示词
  negativePrompt?: string;
  seed?: number;
  referenceImageIds?: string[];
  generatedImageId?: string;   // 关联的生成图片 asset id
  status: 'draft' | 'prompted' | 'generating' | 'done' | 'rejected';
  continuityTags?: string[];   // 连续性标签（角色/场景一致性）
}

/** 分镜表（一个 Table 节点的数据） */
export interface Storyboard {
  id: string;
  shots: Shot[];
  aspectRatio: '16:9' | '9:16' | '1:1';
  frameRate?: number;
}
```

**连续性审查**（Review 节点实例）：检查镜头边界的角色/道具/空间/视线一致性，P0 问题阻塞资产制作。审查标注直接叠加在分镜序列上。

---

## 9. 技术栈选型

| 层 | 选型 | 借鉴谁 | 备注 |
|----|------|--------|------|
| 画布 | **React Flow (@xyflow/react)** | LangFlow | 节点图场景最顺手；tldraw 备选 |
| 节点类型系统 | 自研 `BaseNode`（声明式 I/O + 类型自动推断） | LangFlow | TS 映射类型实现 |
| 执行引擎 | 自研（分层并发 + 按节点缓存 + 环检测） | LangFlow | `Graph.process` |
| 聊天引擎 | **LangChain**（SystemMessage + Tools + Memory 节点） | LangFlow | |
| 编排 | **LangGraph**（节点=graph node，State=产物；驳回回流用 conditional edge） | LangFlow | |
| Provider 统一抽象 | 自研 Registry + 适配器；可选用 **LiteLLM** 垫底 | LiteLLM / ai-jaaz | |
| 图片生成调度 | 策略表 + `ImageGenerator` 接口 | ai-jaaz | 学机制，UI 自研 |
| 资产存储 | 对象存储 + 版本化（Artifact Revision） | ai-jaaz / ComfyUI | 不可变快照 |
| 画布文档 | 原生 `{nodes, edges, viewport}` JSON | LangFlow | 易版本管理/diff/重跑 |
| 后端 | Node.js（或 Python/FastAPI） | — | 前后端同语言推荐 Node + TS |
| 实时 | 单 WebSocket 通道 + eventBus | ai-jaaz | |

---

## 10. 开源参考地图

经多轮深挖，每个能力都有**经过验证的标杆**：

| 能力 | 最佳参考 | 借鉴什么 | 协议 | 仓库 |
|------|---------|---------|------|------|
| 节点定义 schema（声明式 I/O + 类型自动推断） | **LangFlow** | 类声明 inputs/outputs，输出类型从方法返回注解派生 | **MIT ✅** | langflow-ai/langflow |
| 类型化连线校验（前后端同规则 + 迁移表） | **LangFlow** | `isValidConnection` + `_find_matching_output_method` | MIT | |
| 通用节点渲染器（schema 驱动，加节点零前端） | **LangFlow** | `GenericNode` 按序列化 schema 渲染 | MIT | |
| 执行引擎（分层并发 + 按节点缓存 + 环检测） | **LangFlow** | `Graph.process` 拓扑分层 | MIT | |
| 聊天/LLM 节点（system prompt + 记忆独立节点） | **LangFlow** | `LanguageModel` + 独立 `Memory` 节点 | MIT | |
| 图片生成 provider 调度（策略表 + 抽象基类 + 三种完成机制藏一个接口） | **ai-jaaz** | `PROVIDERS` 表 + `ImageGenerator` ABC | ⚠️ 改版 Apache，学机制不抄 UI | muharihar/ai-jaaz |
| 节点 ↔ 画布联动（稳定 id + scroll-to-content） | **ai-jaaz** | `im_xxx` id + `scrollToContent` | ⚠️ | |
| 实时推送（单通道 + eventBus） | **ai-jaaz** | `session_update` + mitt | ⚠️ | |
| Provider 统一抽象（100+ LLM 一接口 + 成本/限流/日志） | **LiteLLM** | 直接垫底 | MIT | BerriAI/litellm |
| 节点系统范式（typed socket、执行、缓存） | **ComfyUI** | `INPUT_TYPES/RETURN_TYPES` | GPL（注意商用） | comfyanonymous/ComfyUI |
| 分镜数据模型 | ❌ **都没有** | **自建**（核心壁垒） | — | — |

### 许可证警示
- **ai-jaaz 是改版 Apache 2.0**：多租户/SaaS 商用要授权、不能移除品牌、**UI/UX（图标/组件排列/prompt 交互）受保护不许照搬做衍生品**。→ **只学它的架构模式和 provider 调度代码结构，前端必须自研。**
- **LangFlow MIT**：可自由借鉴模式。
- **ComfyUI GPL**：借鉴思想没问题，直接拷代码要注意 GPL 传染性。

### 深挖要点摘要
**LangFlow（最关键参考）**：
- 节点 = 类，`inputs[]`（typed 字段 + 连线口）/`outputs[]`（每个 output 绑一个方法，类型从返回注解派生）。
- 类型校验前后端同一套字符串集合匹配 + TYPE_MIGRATIONS 迁移表。
- 一个 `GenericNode` 渲染所有节点；加节点零前端代码。
- Memory 是独立节点，不塞进 LLM 节点。
- 执行：`Graph.from_payload(JSON)` → 拓扑分层并发 → 按 vertex.id 缓存，环/反应式自动关缓存。
- 画布文档 = `{nodes, edges, viewport}` 原生 JSON。

**ai-jaaz**：
- 6 家图片 provider 一个 `PROVIDERS` 表 + `ImageGenerator` ABC，同步/异步轮询/WebSocket 三种完成机制藏在 `await generate()` 后。
- 单 WebSocket 通道 + mitt eventBus 分发。
- 聊天 ↔ 画布用 `im_xxx` 稳定 id + `scrollToContent` 互相定位。
- **它的"分镜"是假的**（无镜头 schema），验证了我们必须自建分镜模型。

---

## 11. 项目目录结构

```
无限画布/
├─ HANDOFF.md                      ← 本文档
├─ package.json
├─ tsconfig.json
├─ providers.config.json           ← 可提交（key 走 env 名）
├─ .env                            ← 绝不提交（真实 key）
├─ .gitignore                      ← 含 .env
├─ src/
│  ├─ types/
│  │  ├─ artifact.ts               ← ArtifactType + RuntimeValueMap + TYPE_MIGRATIONS
│  │  ├─ node.ts                   ← BaseNode / InputPort / OutputPort / NodeOutputs / BuildContext
│  │  ├─ nodes/
│  │  │  ├─ chat.ts  generator.ts  asset.ts  table.ts  auto.ts  review.ts  memory.ts
│  │  └─ storyboard.ts             ← Shot / Storyboard
│  ├─ engine/
│  │  ├─ connections.ts            ← isValidConnection / typeIsCompatibleWith
│  │  ├─ derive.ts                 ← deriveEdges（自动派生）
│  │  ├─ layers.ts                 ← topologicalLayers
│  │  └─ execute.ts                ← execute（分层并发 + 缓存 + 环检测）
│  ├─ providers/
│  │  ├─ registry.ts               ← ProviderRegistry + 加载 providers.config.json
│  │  ├─ chat/                     ← OpenAI 兼容适配器
│  │  └─ image/                    ← jimeng/kling/replicate/comfyui 适配器（仿 ai-jaaz）
│  ├─ nodes/                       ← 每种节点的 runtime 实现（build 函数）+ 注册表
│  ├─ canvas/
│  │  ├─ NodeRenderer.tsx          ← 通用渲染器（schema 驱动）
│  │  ├─ StoryboardEditor.tsx      ← 分镜表定制前端
│  │  └─ ImageGrid.tsx             ← 图片网格定制前端
│  ├─ chat/
│  │  └─ ChatPanel.tsx             ← 右侧聊天面板（LangChain 交互）
│  ├─ realtime/
│  │  └─ socket.ts                 ← 单 WebSocket 通道 + eventBus
│  └─ main.tsx
└─ _research/                      ← 调研克隆（不带走，另一台机器可重新克隆）
   ├─ langflow/
   └─ ai-jaaz/
```

---

## 12. 分阶段路线图

| 阶段 | 目标 | 产出 | 验收 |
|------|------|------|------|
| **P0 地基** | 类型系统（artifact/node）+ 执行引擎（分层+缓存）+ 连线校验 + deriveEdges + React Flow 画布骨架 + 通用 NodeRenderer | 能放节点、自动连线、类型校验生效 | 9 个流程节点可视化跑通 |
| **P1 Provider 层 + Chat** | Provider Registry（chat）+ Chat 节点（LangChain + 右侧聊天面板 + 上传）+ Memory 节点 | 创意策略能对话产出 brief/story | 端到端跑通 1 个聊天节点 |
| **P2 Generator + Asset** | 图片生成（先接 API）+ Asset 版本化 + 画布图片网格 | 图片可生成/重生成/对比 | 图片闭环跑通 |
| **P3 Table（分镜表）** | Table 节点 + 分镜表定制前端（镜头卡片网格 + 时间线） | 分镜表可在画布上增删改镜头 | 分镜闭环跑通 |
| **P4 编排** | LangGraph DAG 把节点串起来；Review 驳回回流；State 在节点间流转 | 整条流程一键推进 | 9 步流程自动推进 |
| **P5 Auto + Review** | Auto 节点（确定性脚本）+ Review 节点（审批门禁 + 标注） | 提示词自动生成、审查回流 | 完整闭环 |
| **P6 扩展** | 音频/视频生成（解锁 Generator 其他 modality）；模板市场 | 新模态节点 | — |

**第一个可见里程碑 = P0 + P1**（画布 + 聊天节点跑通），约 2–3 周雏形。

---

## 13. 关键决策记录（ADR）

**ADR-01 为什么选 React Flow 而非 tldraw**
LangFlow 已用 React Flow（@xyflow/react）验证它能承载通用节点渲染器 + typed-edge + 大量节点，正是"节点图"场景。tldraw 更偏自由绘图。两者都支持自定义节点 + 序列化 JSON。

**ADR-02 为什么类型自动推断**
LangFlow 的精髓：output 类型从方法返回注解派生 → typed socket 零成本。搬到 TS 用映射类型 `NodeOutputs<N>` 让 build() 返回值被 outputs 声明约束，类型错配编译期即报错，避免手写类型字符串出错。

**ADR-03 为什么 Memory 是独立节点**
LangFlow 把对话历史做成可连线节点，LLM 节点保持无状态。好处：多个 Chat 节点共享同一段上下文；记忆后端（DB/向量库/临时）可替换而不动 Chat 节点。

**ADR-04 为什么 Provider 是基础设施层而非节点**
Provider 是"配置 + 网络调用"，没有 consumes/produces，不参与连线派生，也没有画布可视化形态。做成节点会污染类型系统。节点只通过 `{providerId, modelId}` 引用。

**ADR-05 为什么分镜模型必须自建**
ai-jaaz 证明"图片撒在画布上"做不出真分镜（无镜头号/时长/动作/连续性）；LangFlow 是通用编排无视频领域 schema。`Shot` 结构化模型是核心壁垒，无可抄。

**ADR-06 为什么支持两种连线模式**
流程图场景适合自动派生（声明 consumes/produces 即连线，新增节点 O(1)）；自由编辑场景适合手动拖拽（用户掌控）。两者共享同一套类型校验规则。

---

## 14. 快速启动清单

在另一台电脑接力开发，按此顺序：

1. **环境**：Node ≥ 20、pnpm、Git。
2. **建项目**：`pnpm create vite@latest 无限画布 -- --template react-ts`，装 `@xyflow/react`、`zustand`、`lucide-react`、`nanoid`、`langchain`、`@langchain/openai`、`langgraph`。
3. **按第 11 节建目录**，先把 `src/types/artifact.ts`、`src/types/node.ts` 写出来（直接抄第 3 节代码）。
4. **写引擎**：`src/engine/{connections,derive,layers,execute}.ts`（抄第 3.4、4 节）。
5. **配 Provider**：建 `providers.config.json`（抄第 5 节）+ `.env`（填**轮换后的新 key**）+ `.gitignore` 加 `.env`。
6. **P0 画布**：React Flow + `NodeRenderer`，先把 9 个流程节点定义放进去，验证自动连线 + 类型校验。
7. **P1 聊天**：Chat 节点 + 右侧 `ChatPanel` + LangChain，跑通"创意策略"产出 brief/story。
8. **对照路线图**继续 P2→P6。

### 必须遵守的红线
- ❌ 绝不在代码/配置/文档里写真实 API Key，一律 `process.env` / `${VAR}`。
- ❌ 绝不照搬 ai-jaaz 的 UI/图标/组件排列（改版 Apache 明确禁止）。
- ✅ 借鉴 LangFlow（MIT）的架构模式。
- ✅ 节点一律声明式 I/O，连线类型校验，加节点零前端。

---

*文档版本 v1 · 生成于本会话调研结束时 · 包含 LangFlow + ai-jaaz 双轮深挖结论 + 定稿节点 Schema*
