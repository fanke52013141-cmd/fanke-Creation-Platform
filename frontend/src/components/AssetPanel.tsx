/**
 * 资产库面板（浮动在画布上）。显示所有已生成的图片资产，支持上传。
 * 参考 Infinite-Canvas 的 canvas-asset-panel 设计。
 */
import { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { fetchAssets, uploadAsset, type AssetInfo } from '../api';

export default function AssetPanel({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAssets();
      setAssets(res.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await uploadAsset(file);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  }, [load]);

  return (
    <div className="canvas-asset-panel">
      <div className="canvas-asset-panel__head">
        <span className="canvas-asset-panel__title">📦 资产库</span>
        <div className="canvas-asset-panel__actions">
          <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={handleUpload}>
            <Upload size={12} /> 上传
          </button>
          <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={onClose}>
            <X size={12} />
          </button>
        </div>
      </div>
      {error && <div className="canvas-asset-panel__error">{error}</div>}
      <div className="canvas-asset-panel__grid">
        {assets.length === 0 && !loading && (
          <div className="canvas-asset-panel__empty">暂无资产</div>
        )}
        {assets.map((a) => {
          if (!a.head) return null;
          const isImage = a.head.mime?.startsWith('image/');
          const isVideo = a.head.mime?.startsWith('video/');
          return (
            <div key={a.assetId} className="canvas-asset-panel__item" title={a.assetId}>
              {isImage ? (
                <img src={a.head.url} alt={a.assetId} />
              ) : isVideo ? (
                <video src={a.head.url} className="canvas-asset-panel__video-preview" />
              ) : (
                <div className="canvas-asset-panel__file-icon">
                  <ImageIcon size={20} />
                </div>
              )}
              <span className="canvas-asset-panel__item-tag">{a.head.mime?.split('/')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}