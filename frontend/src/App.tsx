/**
 * 应用布局：工具栏 + 左侧节点库 + 中间画布 +
 * 右侧面板（选中节点→NodeSidebar 智能分派；未选中→属性面板）+ 底部结果面板。
 */
import Canvas from './canvas/Canvas';
import NodePalette from './components/NodePalette';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import ResultsPanel from './components/ResultsPanel';
import NodeSidebar from './components/NodeSidebar';
import AssetPanel from './components/AssetPanel';
import { useCanvasStore } from './store';

export default function App() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const selectedNode = nodes.find((n) => n.id === selectedId);

  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <div className="app__left">
          <NodePalette />
          <AssetPanel />
        </div>
        <main className="canvas-wrap">
          <Canvas />
        </main>
        {selectedNode ? <NodeSidebar node={selectedNode} /> : <Inspector />}
      </div>
      <ResultsPanel />
    </div>
  );
}