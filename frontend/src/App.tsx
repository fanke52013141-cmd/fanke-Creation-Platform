/**
 * 应用布局：工具栏 + 左侧节点库 + 中间画布（含资产面板浮动按钮）+
 * 右侧面板（选中节点→NodeSidebar 智能分派；未选中→属性面板）+ 底部结果面板。
 * 资产面板在画布上浮动显示（参考 Infinite-Canvas 的设计），不在左侧。
 */
import { useState } from 'react';
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
  const [showAssetPanel, setShowAssetPanel] = useState(false);

  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <NodePalette />
        <main className="canvas-wrap">
          <Canvas />
          <button
            className="canvas-asset-toggle"
            onClick={() => setShowAssetPanel(!showAssetPanel)}
            title="资产库"
          >
            📦 资产
          </button>
          {showAssetPanel && (
            <div className="canvas-asset-overlay">
              <AssetPanel onClose={() => setShowAssetPanel(false)} />
            </div>
          )}
        </main>
        {selectedNode ? <NodeSidebar node={selectedNode} /> : <Inspector />}
      </div>
      <ResultsPanel />
    </div>
  );
}