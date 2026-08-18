/**
 * 资产节点编辑器（Asset 节点）。
 * 点击或拖拽上传图片/视频/音频，节点内显示媒体内容。
 * 参考 Infinite-Canvas 的 smart-image 节点设计。
 */
import { useState, useCallback, useRef, type DragEvent } from 'react';
import { Upload, Music } from 'lucide-react';
import type { Node } from '@xyflow/react';
import { useCanvasStore } from '../store';
import { uploadAsset } from '../api';
import type { CanvasNodeData } from '../types';

interface MediaItem {
  url: string;
  mime: string;
  name?: string;
  width?: number;
  height?: number;
}

export default function AssetEditor({ node }: { node: Node<CanvasNodeData> }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const mediaItems = ((node.data as Record<string, unknown>).mediaItems as MediaItem[]) || [];
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addMedia = useCallback(async (files: FileList | File[]) => {
    const fileList = Array.from(files).filter(f => {
      const type = f.type.toLowerCase();
      return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');
    });
    if (!fileList.length) return;

    const newItems: MediaItem[] = [];
    for (const file of fileList) {
      try {
        const result = await uploadAsset(file);
        newItems.push({
          url: result.url,
          mime: file.type || 'application/octet-stream',
          name: file.name,
        });
      } catch {
        // 上传失败时用本地预览 URL 兜底
        const url = URL.createObjectURL(file);
        newItems.push({ url, mime: file.type, name: file.name });
      }
    }
    updateNodeData(node.id, 'mediaItems', [...mediaItems, ...newItems]);
  }, [mediaItems, node.id, updateNodeData]);

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
      if (input.files?.length) addMedia(input.files);
    };
    input.click();
  }, [addMedia]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addMedia(e.dataTransfer.files);
  }, [addMedia]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const removeItem = useCallback((index: number) => {
    const next = mediaItems.filter((_, i) => i !== index);
    updateNodeData(node.id, 'mediaItems', next);
  }, [mediaItems, node.id, updateNodeData]);

  return (
    <aside className="sb-panel">
      <div className="sb-panel__header">
        <div className="sb-panel__title">📦 资产</div>
        <div className="sb-panel__sub">{mediaItems.length} 个文件</div>
      </div>

      <div
        ref={dropRef}
        className={`asset-editor__dropzone ${dragOver ? 'drag-over' : ''}`}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload size={24} />
        <span>点击上传或拖拽文件到此处</span>
        <span className="asset-editor__hint">支持图片、视频、音频</span>
      </div>

      <div className="asset-editor__grid">
        {mediaItems.map((item, i) => (
          <div key={i} className="asset-editor__item">
            <button className="asset-editor__remove" onClick={() => removeItem(i)}>×</button>
            {item.mime.startsWith('video/') ? (
              <video src={item.url} controls className="asset-editor__media" />
            ) : item.mime.startsWith('audio/') ? (
              <div className="asset-editor__audio">
                <Music size={20} />
                <audio src={item.url} controls />
              </div>
            ) : (
              <img src={item.url} alt={item.name || ''} className="asset-editor__media" />
            )}
            <span className="asset-editor__name">{item.name || item.url.slice(0, 20)}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}