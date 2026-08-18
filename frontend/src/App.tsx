/**
 * 应用布局：工具栏 + 左侧节点库 + 中间画布 + 右侧属性面板 + 底部结果面板。
 */
import Canvas from './canvas/Canvas';
import NodePalette from './components/NodePalette';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import ResultsPanel from './components/ResultsPanel';

export default function App() {
  return (
    <div className="app">
      <Toolbar />
      <div className="app__body">
        <NodePalette />
        <main className="canvas-wrap">
          <Canvas />
        </main>
        <Inspector />
      </div>
      <ResultsPanel />
    </div>
  );
}
