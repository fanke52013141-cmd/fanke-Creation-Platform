/**
 * 代码编辑器节点（Code 节点）。编辑 Python 代码，配置输入输出端口。
 */
import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { useCanvasStore } from '../store';
import type { CanvasNodeData } from '../types';

export default function CodeEditor({ node }: { node: Node<CanvasNodeData> }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const currentCode = (node.data.code as string) || '';
  const [code, setCode] = useState(currentCode);
  const [showHelp, setShowHelp] = useState(false);

  const handleChange = (val: string) => {
    setCode(val);
    updateNodeData(node.id, 'code', val);
  };

  return (
    <aside className="sb-panel">
      <div className="sb-panel__header">
        <div>
          <div className="sb-panel__title">🔧 代码</div>
          <div className="sb-panel__sub">Python 脚本执行</div>
        </div>
        <button
          className="btn"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => setShowHelp(!showHelp)}
        >
          {showHelp ? '隐藏帮助' : '帮助'}
        </button>
      </div>

      {showHelp && (
        <div style={{ padding: '8px 12px', background: '#f7f8fb', fontSize: 12, lineHeight: 1.6, borderBottom: '1px solid #eef0f5' }}>
          <strong>输入变量：</strong><code>inputs</code>（dict，键为输入端口名）<br />
          <strong>输出变量：</strong><code>output</code>（dict，键为输出端口名）<br />
          <strong>示例：</strong>
          <pre style={{ background: '#eef0f5', padding: 6, borderRadius: 4, marginTop: 4, fontSize: 11 }}>
{`# 从上游取数据，处理后输出
data = inputs.get('input1', [])
output = {'result': [item for item in data if item.get('active')]}`}
          </pre>
        </div>
      )}

      <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            flex: 1, resize: 'none', border: '1px solid #d3d8e3', borderRadius: 8,
            padding: 10, fontSize: 12, fontFamily: 'Consolas, monospace', lineHeight: 1.6,
            background: '#1e1e2e', color: '#cdd6f4',
          }}
          placeholder="# 输入通过 inputs 字典访问&#10;# 输出通过 output 变量返回&#10;output = {'result': inputs.get('data', [])}"
          spellCheck={false}
        />
      </div>
    </aside>
  );
}