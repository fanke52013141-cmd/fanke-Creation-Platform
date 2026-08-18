/**
 * 节点定义数据源：import 项目根目录 node-defs.json（单一事实来源，经 vite alias @node-defs 映射）。
 * 加新节点 = 改 node-defs.json + 后端 nodes/runtime.py 注册 build，前端零改动。
 */
import raw from '@node-defs';
import type { NodeDef, ArtifactType } from '../types';

interface NodeDefsFile {
  version: string;
  artifactTypes: ArtifactType[];
  nodes: NodeDef[];
}

const data = raw as NodeDefsFile;

export const ARTIFACT_TYPES: ArtifactType[] = data.artifactTypes;
export const NODE_DEFS: NodeDef[] = data.nodes;

/** { nodeDefId: NodeDef } 索引，供渲染与连线校验快速查找 */
export const NODE_DEF_MAP: Record<string, NodeDef> = Object.fromEntries(
  data.nodes.map((n) => [n.id, n]),
);

export const getNodeDef = (id: string): NodeDef | undefined => NODE_DEF_MAP[id];
