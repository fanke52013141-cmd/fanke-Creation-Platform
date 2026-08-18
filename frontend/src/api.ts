/**
 * 后端 API 客户端（走 Vite 代理 /api -> 127.0.0.1:8000）。
 */
import type { ExecutionResult, GraphPayload, NodeDef } from './types';

const BASE = '/api';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  nodes: Array<{ id: string; nodeTypeId: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
  edges: Array<{ source: string; sourcePort: string; target: string; targetPort: string; via: string }>;
}

export async function fetchTemplates(): Promise<{ templates: TemplateDef[] }> {
  return jsonFetch('/templates');
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<{ ok: boolean }> {
  return jsonFetch('/health');
}

export async function fetchNodeDefs(): Promise<{ nodes: NodeDef[]; artifactTypes: string[] }> {
  return jsonFetch('/nodes');
}

export async function executeGraph(graph: GraphPayload): Promise<ExecutionResult> {
  return jsonFetch('/execute', {
    method: 'POST',
    body: JSON.stringify(graph),
  });
}

export async function validateConnection(req: {
  sourceTypeId: string;
  sourceHandle: string;
  targetTypeId: string;
  targetHandle: string;
}): Promise<{ valid: boolean }> {
  return jsonFetch('/validate-connection', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ---------------------------------------------------------------------------
// 聊天 API（P1）
// ---------------------------------------------------------------------------

export interface ChatMessageDTO {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSessionInfo {
  sessionId: string;
  nodeId: string;
  systemPrompt: string;
  model: Record<string, unknown>;
  messages: ChatMessageDTO[];
  products: Record<string, unknown>;
}

export async function createChatSession(
  nodeId: string,
  nodeTypeId: string,
  nodeData?: Record<string, unknown>,
): Promise<ChatSessionInfo> {
  return jsonFetch('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ nodeId, nodeTypeId, nodeData }),
  });
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
): Promise<{ message: ChatMessageDTO; products: Record<string, unknown> }> {
  return jsonFetch(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
