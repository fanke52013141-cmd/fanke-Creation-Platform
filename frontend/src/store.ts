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
  controlLinks: Edge[];  // 控制链接（虚线，drive/rerun）
  selectedNodeId: string | null;
  selectedNodeIds: string[];  // 多选/框选节点 id
  isExecuting: boolean;
  execResults: Record<string, unknown> | null;
  execError: string | null;

  onNodesChange: OnNodesChange<Node<CanvasNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (conn: Connection) => void;

  addNode: (nodeTypeId: string, position?: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;
  setSelection: (ids: string[]) => void;
  updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
  updateNodeData: (nodeId: string, key: string, value: unknown) => void;
  autoConnect: () => void;
  clearCanvas: () => void;
  loadProject: (nodes: Node<CanvasNodeData>[], edges: Edge[]) => void;
  setIsExecuting: (v: boolean) => void;
  setExecResults: (r: Record<string, unknown> | null) => void;
  setExecError: (e: string | null) => void;
  toGraphPayload: () => GraphPayload;
  /** 获取选中节点的子图（包含连同的边） */
  getSelectedGraph: () => { nodes: Node<CanvasNodeData>[]; edges: Edge[] } | null;
}

const nodeById = (nodes: Node<CanvasNodeData>[]) =>
  new Map(nodes.map((n) => [n.id, n]));

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  controlLinks: [],
  selectedNodeId: null,
  selectedNodeIds: [],
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

  setSelection: (ids) => set({ selectedNodeIds: ids }),

  updateNodeParams: (nodeId, params) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, params: { ...(n.data.params ?? {}), ...params } } } : n,
      ),
    }),

  updateNodeData: (nodeId, key, value) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n,
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

  clearCanvas: () => set({ nodes: [], edges: [], controlLinks: [], selectedNodeId: null, selectedNodeIds: [], execResults: null, execError: null }),

  loadProject: (nodes, edges) =>
    set({ nodes, edges, selectedNodeId: null, execResults: null, execError: null }),

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

  getSelectedGraph: () => {
    const { nodes, edges } = get();
    const selectedIds = get().selectedNodeIds;
    if (selectedIds.length === 0) return null;
    const selectedSet = new Set(selectedIds);
    const filteredNodes = nodes.filter((n) => selectedSet.has(n.id));
    const filteredEdges = edges.filter((e) => selectedSet.has(e.source) && selectedSet.has(e.target));
    return { nodes: filteredNodes, edges: filteredEdges };
  },
}));
