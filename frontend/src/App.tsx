/**
 * 应用布局：工具栏 + 左侧节点库 + 中间画布 + 右侧面板（Chat节点→聊天面板，其他→属性面板）+ 底部结果面板。
 */
import Canvas from './canvas/Canvas';
import NodePalette from './components/NodePalette';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import ResultsPanel from './components/ResultsPanel';
import ChatPanel from './components/ChatPanel';
import { useCanvasStore } from './store';
import { getNodeDef } from './data/nodeDefs';

export default function App() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const selectedNode = nodes.find((n) => n.id === selectedId);
  const isChatNode =
    !!selectedNode && getNodeDef(selectedNode.data.nodeTypeId)?.kind === 'chat';

  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <NodePalette />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        {isChatNode && selectedNode ? <ChatPanel node={selectedNode} /> : <Inspector />}
      </div>
      <ResultsPanel />
    </div>
  );
}
