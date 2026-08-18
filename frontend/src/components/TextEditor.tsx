/**
 * 文本编辑器节点（Text 节点）。手动编辑文本内容。
 */
import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { useCanvasStore } from '../store';
import type { CanvasNodeData } from '../types';

export default function TextEditor({ node }: { node: Node<CanvasNodeData> }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const currentContent = (node.data.content as string) || (node.data.text as string) || '';
  const [text, setText] = useState(currentContent);

  const handleChange = (val: string) => {
    setText(val);
    updateNodeData(node.id, 'content', val);
  };

  return (
    <aside className="sb-panel">
      <div className="sb-panel__header">
        <div className="sb-panel__title">📝 文本</div>
        <div className="sb-panel__sub">手动编辑文本内容</div>
      </div>
      <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            flex: 1, resize: 'none', border: '1px solid #d3d8e3', borderRadius: 8,
            padding: 10, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6,
          }}
          placeholder="在此输入文本内容..."
        />
      </div>
    </aside>
  );
}