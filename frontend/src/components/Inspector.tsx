/**
 * 右侧属性面板：选中节点的配置编辑（manifest.config 字段）+ 信息 + 删除。
 * 配置写入 node.data.config，执行时随 payload 发给后端。
 */
import { Trash2 } from 'lucide-react';
import { getManifest } from '../data/nodeDefs';
import { useCanvasStore } from '../store';
import type { ConfigField } from '../types';

function ConfigControl({ field, value, onChange }: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  switch (field.editor) {
    case 'multiline':
      return (
        <textarea
          value={base(value)}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.desc}
        />
      );
    case 'number':
    case 'slider':
      return (
        <input
          type="number"
          value={base(value)}
          min={field.range?.min}
          max={field.range?.max}
          step={field.range?.step}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'dropdown':
      return (
        <select value={base(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
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
          placeholder={field.desc}
        />
      );
  }
}

export default function Inspector() {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedId = useCanvasStore((s) => s.selectedNodeId);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNode = useCanvasStore((s) => s.removeNode);

  const node = nodes.find((n) => n.id === selectedId);
  if (!node) {
    return (
      <aside className="inspector">
        <div className="inspector__empty">选中一个节点查看/编辑参数</div>
      </aside>
    );
  }

  const manifest = getManifest(node.data.nodeTypeId);
  if (!manifest) return null;

  const config = (node.data.config ?? {}) as Record<string, unknown>;

  return (
    <aside className="inspector">
      <div className="inspector__title">{manifest.name}</div>
      <div className="inspector__meta">
        <span className="inspector__badge">{manifest.kind}</span>
        <span className="inspector__id">{node.id}</span>
      </div>
      {manifest.description && <p className="inspector__desc">{manifest.description}</p>}

      {manifest.config.length > 0 && (
        <div className="inspector__params">
          <div className="inspector__section">配置</div>
          {manifest.config.map((field) => (
            <label className="inspector__field" key={field.key}>
              <span className="inspector__field-label">
                {field.label || field.key}
                {field.required ? ' *' : ''}
              </span>
              <ConfigControl
                field={field}
                value={config[field.key] ?? field.defaultValue}
                onChange={(v) => updateNodeData(node.id, 'config', { ...config, [field.key]: v })}
              />
            </label>
          ))}
        </div>
      )}

      <button className="inspector__delete" onClick={() => removeNode(node.id)}>
        <Trash2 size={13} /> 删除节点
      </button>
    </aside>
  );
}