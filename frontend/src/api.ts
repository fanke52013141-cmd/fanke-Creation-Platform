/**
 * 后端 API 客户端（走 Vite 代理 /api -> 127.0.0.1:8000）。
 */
import type { ExecutionResult, GraphPayload, NodeDef } from './types';

const BASE = '/api';

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
