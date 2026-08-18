/**
 * 连线校验规则 —— 与后端 backend/app/engine/connections.py 同构。
 * React Flow 拖拽时用 isValidConnection 实时校验；后端 /api/validate-connection 兜底。
 */

import type { Node, Edge } from '@xyflow/react';
import type { ArtifactType, NodeDef } from '../types';
import { TYPE_MIGRATIONS } from '../types';

export function typeIsCompatible(sourceType: ArtifactType, targetTypes: ArtifactType[]): boolean {
  const src = TYPE_MIGRATIONS[sourceType] ?? sourceType;
  return targetTypes.some((t) => {
    const tgt = TYPE_MIGRATIONS[t] ?? t;
    return sourceType === t || src === t || sourceType === tgt || src === tgt;
  });
}

/** handle id 格式：out-{portName} / in-{portName} */
export const outHandleId = (portName: string) => `out-${portName}`;
export const inHandleId = (portName: string) => `in-${portName}`;

function parseHandle(handle: string | null | undefined): { direction: 'out' | 'in'; name: string } | null {
  if (!handle) return null;
  const idx = handle.indexOf('-');
  if (idx <= 0) return null;
  const direction = handle.slice(0, idx);
  const name = handle.slice(idx + 1);
  if ((direction !== 'out' && direction !== 'in') || !name) return null;
  return { direction, name };
}

/** 校验一条新连线（拖拽时调用）。nodeById: 画布实例 id -> React Flow Node */
export function isValidConnection(
  conn: { source: string; target: string; sourceHandle: string | null; targetHandle: string | null },
  nodeById: Map<string, Node>,
  getNodeDefById: (id: string) => NodeDef | undefined,
): boolean {
  if (conn.source === conn.target) return false; // 禁止自连

  const srcNode = nodeById.get(conn.source);
  const tgtNode = nodeById.get(conn.target);
  if (!srcNode || !tgtNode) return false;

  const srcDef = getNodeDefById(srcNode.data?.nodeTypeId as string);
  const tgtDef = getNodeDefById(tgtNode.data?.nodeTypeId as string);
  if (!srcDef || !tgtDef) return false;

  const src = parseHandle(conn.sourceHandle);
  const tgt = parseHandle(conn.targetHandle);
  if (!src || !tgt || src.direction !== 'out' || tgt.direction !== 'in') return false;

  const outPort = srcDef.outputs.find((o) => o.name === src.name);
  const inPort = tgtDef.inputs.find((i) => i.name === tgt.name);
  if (!outPort || !inPort || !inPort.isConnection) return false;

  if (!typeIsCompatible(outPort.type, [inPort.type])) return false;
  return true;
}

/** 画布已有的连线中，某输入口是否已被占用（单值口只允许一条入边） */
export function hasIncomingEdge(edges: Edge[], nodeId: string, portName: string): boolean {
  return edges.some((e) => e.target === nodeId && e.targetHandle === inHandleId(portName));
}
