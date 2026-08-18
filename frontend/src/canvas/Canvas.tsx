/**
 * 画布（React Flow）：节点渲染 + 类型化连线校验 + 拖拽连线。
 * nodeTypes 在模块级定义，避免每次渲染重建导致 React Flow 重挂载。
 */
import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type IsValidConnection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import NodeRenderer from './NodeRenderer';
import { useCanvasStore } from '../store';
import { isValidConnection } from '../engine/connections';
import { getNodeDef } from '../data/nodeDefs';

// 模块级常量：加新节点类型时在这里登记自定义渲染组件（目前全部走通用渲染器）
const nodeTypes = { generic: NodeRenderer };

export default function Canvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const selectNode = useCanvasStore((s) => s.selectNode);

  const isValid = useMemo<IsValidConnection>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n as Node]));
    return (conn) =>
      isValidConnection(
        {
          source: conn.source,
          target: conn.target,
          sourceHandle: conn.sourceHandle ?? null,
          targetHandle: conn.targetHandle ?? null,
        },
        byId,
        getNodeDef,
      );
  }, [nodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValid}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(null)}
      fitView
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: false }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls />
      <MiniMap pannable zoomable nodeColor={() => '#7c8cf8'} />
    </ReactFlow>
  );
}
