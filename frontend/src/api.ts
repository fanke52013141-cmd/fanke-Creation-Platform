/**
 * 后端 API 客户端（走 Vite 代理 /api -> 127.0.0.1:8000）。
 */
import type { NodeManifest, Graph } from './types';

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

export async function fetchNodeDefs(): Promise<{ nodes: NodeManifest[]; manifestIds: string[] }> {
  return jsonFetch('/nodes');
}

export async function executeGraph(graph: Graph): Promise<{ results: Record<string, unknown>; errors?: unknown[] }> {
  return jsonFetch('/execute', {
    method: 'POST',
    body: JSON.stringify({ graph }),
  });
}

export async function validateGraph(graph: Graph): Promise<{ issues: unknown[] }> {
  return jsonFetch('/validate', {
    method: 'POST',
    body: JSON.stringify({ graph }),
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

// ---------------------------------------------------------------------------
// 资产 API
// ---------------------------------------------------------------------------

export interface AssetInfo {
  assetId: string;
  head: { url: string; mime: string; width?: number; height?: number } | null;
  versionsCount: number;
}

export async function fetchAssets(): Promise<{ assets: AssetInfo[] }> {
  return jsonFetch('/assets');
}

export async function uploadAsset(file: File, assetId?: string): Promise<{ assetId: string; url: string }> {
  const form = new FormData();
  form.append('file', file);
  if (assetId) form.append('assetId', assetId);
  const res = await fetch('/api/assets/upload', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}