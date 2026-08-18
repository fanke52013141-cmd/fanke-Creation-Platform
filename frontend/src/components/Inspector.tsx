/**
 * 右侧属性面板：选中节点的参数编辑（isConnection=false 的字段）+ 信息 + 删除。
 * 参数写入 node.data.params，执行时随 payload 发给后端。
 */
import { Trash2 } from 'lucide-react';
import { getNodeDef } from '../data/nodeDefs';
import { useCanvasStore } from '../store';
import type { InputPort } from '../types';

function ParamControl({
  port,
  value,
  onChange,
}: {
  port: InputPort;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const editor = port.editor ?? 'text';
  const base = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  switch (editor) {
    case 'multiline':
      return (
        <textarea
          value={base(value)}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          placeholder={port.description}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={base(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'dropdown':
      return (
        <select value={base(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(port.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'toggle':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    default:
      return (
        <input
          type="text"
          value={base(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={port.description}
        />
      );
  }
}

export default function Inspector() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const updateNodeParams = useCanvasStore((s) => s.updateNodeParams);
  const removeNode = useCanvasStore((s) => s.removeNode);

  const node = nodes.find((n) => n.id === selectedId);
  if (!node) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">选中一个节点查看/编辑参数</div>
      </aside>
    );
  }

  const def = getNodeDef(node.data.nodeTypeId);
  if (!def) return null;

  const params = (node.data.params ?? {}) as Record<string, unknown>;
  const paramPorts = def.inputs.filter((i) => !i.isConnection);

  return (
    <aside className="inspector">
      <div className="inspector__title">{def.name}</div>
      <div className="inspector__meta">
        <span className="inspector__badge">{def.kind}</span>
        <span className="inspector__id">{node.id}</span>
      </div>
      {def.description && <p className="inspector__desc">{def.description}</p>}

      {paramPorts.length > 0 && (
        <div className="inspector__params">
          <div className="inspector__section">参数</div>
          {paramPorts.map((port) => (
            <label className="inspector__field" key={port.name}>
              <span className="inspector__field-label">
                {port.label || port.name}
                {port.required ? ' *' : ''}
              </span>
              <ParamControl
                port={port}
                value={params[port.name] ?? port.defaultValue}
                onChange={(v) => updateNodeParams(node.id, { [port.name]: v })}
              />
            </label>
          ))}
        </div>
      )}

      {def.systemPrompt && (
        <div className="inspector__params">
          <div className="inspector__section">系统提示词</div>
          <pre className="inspector__prompt">{def.systemPrompt}</pre>
        </div>
      )}

      <button className="inspector__delete" onClick={() => removeNode(node.id)}>
        <Trash2 size={13} /> 删除节点
      </button>
    </aside>
  );
}
