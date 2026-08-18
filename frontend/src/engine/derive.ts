/**
 * 自动派生连线（流程图模式）—— 与后端 backend/app/engine/derive.py 同构。
 * 按 inputs/outputs 类型匹配自动连线，共享同一套 typeIsCompatible 规则。
 */

import type { Node } from '@xyflow/react';
import type { ArtifactType, NodeDef } from '../types';
import { typeIsCompatible } from './connections';

export interface DerivedEdge {
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  via: ArtifactType;
}

export function deriveEdges(
  nodes: Node[],
  getNodeDefById: (id: string) => NodeDef | undefined,
): DerivedEdge[] {
  const out: DerivedEdge[] = [];
  for (const target of nodes) {
    const tDef = getNodeDefById(target.data?.nodeTypeId as string);
    if (!tDef) continue;
    for (const ip of tDef.inputs) {
      if (!ip.isConnection || !ip.accepts || ip.accepts.length === 0) continue;
      for (const source of nodes) {
        if (source.id === target.id) continue;
        const sDef = getNodeDefById(source.data?.nodeTypeId as string);
        if (!sDef) continue;
        for (const op of sDef.outputs) {
          const provides = op.provides ?? [];
          const accepts = ip.accepts ?? [];
          if (
            typeIsCompatible(op.type, [ip.type]) &&
            provides.some((p) => accepts.includes(p))
          ) {
            out.push({
              source: source.id,
              sourcePort: op.name,
              target: target.id,
              targetPort: ip.name,
              via: ip.type,
            });
          }
        }
      }
    }
  }
  return out;
}
