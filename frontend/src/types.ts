/**
 * 前端类型系统 —— 与后端 backend/app/types.py 完全对齐。
 * 字符串常量必须与 node-defs.json（单一事实来源）一致。
 */

/** 所有可在连线上流动的类型（typed socket 的"形状"） */
export type ArtifactType =
  | 'Message'
  | 'Document'
  | 'Prompt'
  | 'Shot'
  | 'Image'
  | 'Audio'
  | 'Video'
  | 'Memory'
  | 'ModelRef'
  | 'Decision'
  | 'Table'
  | 'Data';

export type NodeKind =
  | 'chat'
  | 'generator'
  | 'asset'
  | 'table'
  | 'auto'
  | 'review'
  | 'memory';

/** 类型重命名迁移表（仿 LangFlow TYPE_MIGRATIONS） */
export const TYPE_MIGRATIONS: Partial<Record<ArtifactType, ArtifactType>> = {};

export interface InputPort {
  name: string;
  type: ArtifactType;
  array?: boolean;
  required?: boolean;
  isConnection?: boolean;
  label?: string;
  description?: string;
  editor?: 'text' | 'multiline' | 'dropdown' | 'slider' | 'number' | 'file' | 'toggle' | 'hidden';
  options?: string[];
  defaultValue?: unknown;
  /** 语义标签（自动连线用）：接受哪些语义物，如 ["brief"] */
  accepts?: string[];
}

export interface OutputPort {
  name: string;
  type: ArtifactType;
  array?: boolean;
  label?: string;
  method?: string;
  /** 语义标签（自动连线用）：提供哪些语义物，如 ["brief"] */
  provides?: string[];
}

export interface NodeDef {
  id: string;
  kind: NodeKind;
  name: string;
  icon?: string;
  description?: string;
  inputs: InputPort[];
  outputs: OutputPort[];
  // chat
  systemPrompt?: string;
  model?: { providerId: string; modelId: string; variant?: string };
  allowUpload?: boolean;
  // auto
  fn?: string;
  // generator
  modality?: 'image' | 'audio' | 'video';
  providerId?: string;
  modelId?: string;
  params?: Record<string, unknown>;
  // review
  onRejectNodeId?: string;
  // table
  editorHint?: string;
}

/** 画布节点实例的自定义 data */
export interface CanvasNodeData extends Record<string, unknown> {
  nodeTypeId: string;
  /** 参数面板编辑的值（对应 InputPort 中 isConnection=false 的字段） */
  params?: Record<string, unknown>;
}

/** 与后端 Graph / Edge 对齐的 payload（执行时发送） */
export interface EdgePayload {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  via: ArtifactType;
}

export interface GraphNodePayload {
  id: string;
  nodeTypeId: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphPayload {
  nodes: GraphNodePayload[];
  edges: EdgePayload[];
}

/** 每帧执行结果 */
export interface ExecutionResult {
  results: Record<string, unknown>;
}
