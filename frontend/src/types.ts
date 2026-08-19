/**
 * 节点类型系统（v2.1 定稿）—— 与 backend/app/types.py 完全镜像。
 * 单一事实来源：manifests/*.json。
 */

// ============ 基础 ============

export type NodeKind =
  | 'chat' | 'process' | 'generator' | 'data' | 'code'
  | 'group' | 'loop' | 'branch' | 'output' | 'preview';

export type NodeCategory = 'core' | 'flow' | 'utility';

export type ExecutionClass = 'instant' | 'interactive';

export type BaseType =
  | 'string' | 'integer' | 'number' | 'boolean'
  | 'time' | 'object' | 'list' | 'file';

export type FileSubType =
  | 'image' | 'audio' | 'video' | 'document' | 'code' | 'default';

export type SemanticType =
  | 'prompt' | 'document' | 'decision' | 'shot' | 'storyboard' | 'asset-list';

export type FieldEditor =
  | 'text' | 'multiline' | 'number' | 'slider' | 'dropdown'
  | 'toggle' | 'file' | 'code' | 'json' | 'hidden';

// ============ 参数 ============

export type ParamSource =
  | { kind: 'value'; value: unknown }
  | { kind: 'ref'; nodeId: string; outputPath: string };

export interface ParamSchema {
  name: string;
  label: string;
  desc?: string;
  required?: boolean;
  type: BaseType;
  semantic?: SemanticType;
  fileSubType?: FileSubType;
  items?: ParamSchema;
  properties?: ParamSchema[];
  defaultFrom?: ParamSource;
  editor?: FieldEditor;
  options?: string[];
}

// ============ 配置字段 ============

export interface ConfigField {
  key: string;
  label: string;
  desc?: string;
  type: BaseType;
  required?: boolean;
  defaultValue?: unknown;
  editor: FieldEditor;
  options?: string[];
  range?: { min: number; max: number; step?: number };
}

// ============ Manifest（节点定义） ============

export interface NodeManifest {
  schemaVersion: string;
  id: string;
  kind: NodeKind;
  name: string;
  nameForModel?: string;
  description: string;
  icon?: string;
  category: NodeCategory;
  execution: ExecutionClass;
  dynamicParams: boolean;
  inputs: ParamSchema[];
  outputs: ParamSchema[];
  config: ConfigField[];
}

// ============ 实例与状态 ============

export type NodeStatus =
  | 'idle' | 'ready' | 'running' | 'awaiting-human'
  | 'done' | 'error' | 'skipped' | 'stale' | 'cached';

export interface NodeState {
  status: NodeStatus;
  outputs?: Record<string, unknown>;
  error?: string;
  progress?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface NodeInstance {
  id: string;
  manifestId: string;
  name: string;
  position: { x: number; y: number };
  inputs: Record<string, ParamSource | ParamSource[]>;
  config: Record<string, unknown>;
  paramSchemas?: { inputs: ParamSchema[]; outputs: ParamSchema[] };
  state?: NodeState;
}

// ============ 图（混合关系） ============

export interface ControlLink {
  source: string;   // 源节点 id（Python 侧字段名）
  target: string;   // 目标节点 id
  kind: 'drive' | 'rerun';
  label?: string;
}

export interface Graph {
  schemaVersion: string;
  nodes: NodeInstance[];
  links: ControlLink[];
  viewport?: { x: number; y: number; zoom: number };
  nodeStates?: Record<string, NodeState>;
}

// ============ 兼容旧版类型（P0 过渡期用，后续逐步移除） ============

/** @deprecated 使用 NodeInstance */
export interface CanvasNodeData {
  nodeTypeId: string;
  config?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

/** @deprecated */
export interface EdgePayload {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  via: string;
}

/** @deprecated */
export interface GraphPayload {
  nodes: Array<{ id: string; nodeTypeId: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: EdgePayload[];
}

// @deprecated 旧版 ArtifactType/NodeDef 等，保持 connections.ts/derive.ts 可编译
export type ArtifactType = string;
export interface NodeDef {
  id: string;
  kind: string;
  name: string;
  icon?: string;
  description?: string;
  inputs: Array<{ name: string; type: string; isConnection?: boolean; required?: boolean; label?: string; description?: string; editor?: string; options?: string[]; defaultValue?: unknown; accepts?: string[] }>;
  outputs: Array<{ name: string; type: string; provides?: string[] }>;
  systemPrompt?: string;
  dynamicPorts?: boolean;
}
export const TYPE_MIGRATIONS: Record<string, string> = {};

export interface RefIssue {
  level: 'error' | 'warn';
  message: string;
  nodeId?: string;
  rule?: string;
}