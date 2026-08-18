/**
 * 画布状态（zustand）：节点/连线/选中/自动连线/执行 payload 转换。
 * 数据流：node-defs（单一事实来源）→ 画布节点实例（data.nodeTypeId 引用定义）。
 */
import { create } from 'zustand';
import { nanoid } from 'nanoid';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';

import { NODE_DEF_MAP, getNodeDef } from './data/nodeDefs';
import { isValidConnection, inHandleId, outHandleId } from './engine/connections';
import { deriveEdges } from './engine/derive';
import type { CanvasNodeData, EdgePayload, GraphPayload } from './types';

interface CanvasState {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  isExecuting: boolean;
  execResults: Record<string, unknown> | null;
  execError: string | null;

  onNodesChange: OnNodesChange<Node<CanvasNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (conn: Connection) => void;

  addNode: (nodeTypeId: string, position?: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
  autoConnect: () => void;
  clearCanvas: () => void;
  setIsExecuting: (v: boolean) => void;
  setExecResults: (r: Record<string, unknown> | null) => void;
  setExecError: (e: string | null) => void;
  toGraphPayload: () => GraphPayload;
}

const nodeById = (nodes: Node<CanvasNodeData>[]) =>
  new Map(nodes.map((n) => [n.id, n]));

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  isExecuting: false,
  execResults: null,
  execError: null,

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (conn) => {
    if (!conn.source || !conn.target) return;
    const valid = isValidConnection(conn, nodeById(get().nodes), getNodeDef);
    if (!valid) return;
    set({
      edges: addEdge({ ...conn, id: `e-${nanoid(8)}` }, get().edges),
    });
  },

  addNode: (nodeTypeId, position) => {
    const def = NODE_DEF_MAP[nodeTypeId];
    if (!def) return;
    const id = `${nodeTypeId}-${nanoid(6)}`;
    const node: Node<CanvasNodeData> = {
      id,
      type: 'generic',
      position: position ?? {
        x: 80 + Math.random() * 240,
        y: 80 + Math.random() * 240,
      },
      data: { nodeTypeId, params: {} },
    };
    set({ nodes: [...get().nodes, node] });
  },

  removeNode: (nodeId) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  updateNodeParams: (nodeId, params) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, params: { ...(n.data.params ?? {}), ...params } } } : n,
      ),
    }),

  autoConnect: () => {
    const { nodes } = get();
    const derived = deriveEdges(nodes, getNodeDef);
    const edges: Edge[] = derived.map((d, i) => ({
      id: `e-auto-${i}-${nanoid(4)}`,
      source: d.source,
      sourceHandle: outHandleId(d.sourcePort),
      target: d.target,
      targetHandle: inHandleId(d.targetPort),
      type: 'default',
      label: d.via,
      data: { via: d.via },
    }));
    set({ edges });
  },

  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  setIsExecuting: (v) => set({ isExecuting: v }),

  setExecResults: (r) => set({ execResults: r }),

  setExecError: (e) => set({ execError: e }),

  toGraphPayload: (): GraphPayload => {
    const { nodes, edges } = get();
    const edgePayloads: EdgePayload[] = edges
      .map((e) => {
        const sourcePort = (e.sourceHandle ?? '').replace(/^out-/, '');
        const targetPort = (e.targetHandle ?? '').replace(/^in-/, '');
        const via = (e.data as { via?: string } | undefined)?.via;
        const srcNode = nodes.find((n) => n.id === e.source);
        const srcDef = srcNode ? NODE_DEF_MAP[srcNode.data.nodeTypeId] : undefined;
        const outPort = srcDef?.outputs.find((o) => o.name === sourcePort);
        return {
          source: e.source,
          sourcePort,
          target: e.target,
          targetPort,
          via: (via ?? outPort?.type ?? 'Data') as EdgePayload['via'],
        };
      })
      .filter((e) => e.sourcePort && e.targetPort);

    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        nodeTypeId: n.data.nodeTypeId,
        position: { x: n.position.x, y: n.position.y },
        data: n.data,
      })),
      edges: edgePayloads,
    };
  },
}));
