/**
 * 资产库面板：显示所有已生成的图片资产，支持上传。
 */
import { useEffect, useState, useCallback } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { fetchAssets, uploadAsset, type AssetInfo } from '../api';

export default function AssetPanel() {
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
    input.accept = 'image/*';
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
    <div className="asset-panel">
      <div className="asset-panel__header">
        <span className="asset-panel__title">📦 资产库</span>
        <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={handleUpload}>
          <Upload size={12} /> 上传
        </button>
      </div>
      {error && <div className="asset-panel__error">{error}</div>}
      <div className="asset-panel__grid">
        {assets.length === 0 && !loading && (
          <div className="asset-panel__empty">暂无资产</div>
        )}
        {assets.map((a) => {
          if (!a.head) return null;
          const isImage = a.head.mime?.startsWith('image/');
          return (
            <div key={a.assetId} className="asset-panel__item" title={a.assetId}>
              {isImage ? (
                <img src={a.head.url} alt={a.assetId} />
              ) : (
                <div className="asset-panel__file-icon">
                  <ImageIcon size={20} />
                </div>
              )}
              <span className="asset-panel__item-id">{a.assetId.slice(0, 10)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}