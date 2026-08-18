/**
 * 底部执行结果面板：显示后端 /api/execute 返回的逐节点产出。
 * P0 用 JSON 树展示；后续各节点接入定制展示（图片网格/分镜表等）。
 */
import { X } from 'lucide-react';
import { useCanvasStore } from '../store';

export default function ResultsPanel() {
  const results = useCanvasStore((s) => s.execResults);
  const error = useCanvasStore((s) => s.execError);
  const setExecResults = useCanvasStore((s) => s.setExecResults);
  const setExecError = useCanvasStore((s) => s.setExecError);

  if (!results && !error) return null;

  const close = () => {
    setExecResults(null);
    setExecError(null);
  };

  return (
    <div className="results">
      <div className="results__header">
        <span className="results__title">执行结果</span>
        <button className="results__close" onClick={close}>
          <X size={14} />
        </button>
      </div>
      {error ? (
        <pre className="results__error">{error}</pre>
      ) : (
        <pre className="results__body">{JSON.stringify(results, null, 2)}</pre>
      )}
    </div>
  );
}
