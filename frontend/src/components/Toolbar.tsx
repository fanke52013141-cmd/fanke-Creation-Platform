/**
 * 顶部工具栏：自动连线 / 执行画布 / 清空。
 */
import { Loader2, Play, Trash2, Wand2 } from 'lucide-react';
import { executeGraph } from '../api';
import { useCanvasStore } from '../store';

export default function Toolbar() {
  const autoConnect = useCanvasStore((s) => s.autoConnect);
  const clearCanvas = useCanvasStore((s) => s.clearCanvas);
  const toGraphPayload = useCanvasStore((s) => s.toGraphPayload);
  const isExecuting = useCanvasStore((s) => s.isExecuting);
  const setIsExecuting = useCanvasStore((s) => s.setIsExecuting);
  const setExecResults = useCanvasStore((s) => s.setExecResults);
  const setExecError = useCanvasStore((s) => s.setExecError);

  const handleRun = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecError(null);
    try {
      const payload = toGraphPayload();
      const res = await executeGraph(payload);
      setExecResults(res.results);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : String(e));
      setExecResults(null);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar__brand">🎬 无限画布</div>
      <div className="toolbar__actions">
        <button className="btn" onClick={autoConnect} title="按类型匹配自动连线（可再手动调整）">
          <Wand2 size={14} /> 自动连线
        </button>
        <button className="btn btn--primary" onClick={handleRun} disabled={isExecuting}>
          {isExecuting ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
          {isExecuting ? '执行中…' : '执行画布'}
        </button>
        <button className="btn btn--danger" onClick={clearCanvas}>
          <Trash2 size={14} /> 清空
        </button>
      </div>
    </header>
  );
}
