/**
 * 底部执行结果面板：显示后端 /api/execute 返回的逐节点产出。
 * - 含图片对象（{url, mime 以 image/ 开头}）的值，渲染成缩略图网格（ImageGrid 雏形）；
 * - 其余结构用 JSON 展示。
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useCanvasStore } from '../store';

interface ImageObj {
  url: string;
  mime?: string;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

function isImage(v: unknown): v is ImageObj {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ImageObj).url === 'string' &&
    typeof (v as ImageObj).mime === 'string' &&
    (v as ImageObj).mime!.startsWith('image/')
  );
}

/** 递归找到值里的图片对象 / 图片数组 */
function collectImages(value: unknown, out: ImageObj[] = []): ImageObj[] {
  if (isImage(value)) {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectImages(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const k of Object.keys(value as object)) {
      collectImages((value as Record<string, unknown>)[k], out);
    }
  }
  return out;
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="预览" className="lightbox__img" />
    </div>
  );
}

/** 单节点结果：图片网格 + 其余 JSON */
function NodeResult({ label, value }: { label: string; value: unknown }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const images = collectImages(value);
  const meta = JSON.stringify(value, null, 2);

  return (
    <div className="result-node">
      <div className="result-node__head">{label}</div>
      {images.length > 0 && (
        <div className="result-node__grid">
          {images.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              className="img-thumb"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(img.url);
              }}
              title={img.url}
            >
              <img src={img.url} alt={img.url} />
            </button>
          ))}
        </div>
      )}
      <pre className="result-node__json">{meta}</pre>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

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
      ) : results ? (
        <div className="results__scroll">
          {Object.entries(results).map(([nodeId, value]) => (
            <NodeResult key={nodeId} label={nodeId} value={value} />
          ))}
        </div>
      ) : (
        <pre className="results__error">无结果</pre>
      )}
    </div>
  );
}