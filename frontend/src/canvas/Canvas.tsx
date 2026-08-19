/**
 * 画布（React Flow）：节点渲染 + 双线样式 + 框选/选择执行。
 */
import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  type IsValidConnection,
  type Node,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import NodeRenderer from './NodeRenderer';
import ControlLinkEdge from './ControlLinkEdge';
import { useCanvasStore } from '../store';
import { isValidConnection } from '../engine/connections';
import { getNodeDef } from '../data/nodeDefs';

const nodeTypes = { generic: NodeRenderer };
const edgeTypes = { 'control-link': ControlLinkEdge };

export default function Canvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const controlLinks = useCanvasStore((s) => s.controlLinks);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const setSelection = useCanvasStore((s) => s.setSelection);

  // 合并数据边和控制链接边
  const allEdges = useMemo(() => {
    return [...edges, ...controlLinks];
  }, [edges, controlLinks]);

  const isValid = useMemo<IsValidConnection>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n as Node]));
    return (conn) =>
      isValidConnection(
        { source: conn.source, target: conn.target, sourceHandle: conn.sourceHandle ?? null, targetHandle: conn.targetHandle ?? null },
        byId,
        getNodeDef,
      );
  }, [nodes]);

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelection(params.nodes.map((n) => n.id));
  }, [setSelection]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={allEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValid}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      onSelectionChange={onSelectionChange}
      selectionMode={SelectionMode.Partial}
      selectionOnDrag
      panOnDrag={[1, 2]}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: false }}
      defaultEdgeOptions={{ type: 'default' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls />
      <MiniMap pannable zoomable nodeColor={() => '#7c8cf8'} />
    </ReactFlow>
  );
}