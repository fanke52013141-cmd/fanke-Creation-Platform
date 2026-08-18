/**
 * 通用节点渲染器（schema 驱动，仿 LangFlow GenericNode）。
 * 根据 node-defs.json 的 inputs/outputs 自动渲染插口与参数字段。
 * 加新节点 = 只改 node-defs.json + 后端注册 build，此组件零改动。
 */
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  Archive,
  Clapperboard,
  ClipboardCheck,
  HelpCircle,
  Image as ImageIcon,
  Lightbulb,
  Package,
  Palette,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

import { getNodeDef } from '../data/nodeDefs';
import { inHandleId, outHandleId } from '../engine/connections';
import type { CanvasNodeData, NodeKind } from '../types';

const ICONS: Record<string, LucideIcon> = {
  Lightbulb,
  ClipboardCheck,
  Palette,
  Package,
  Clapperboard,
  Wand2,
  ImageIcon,
  Archive,
};

const KIND_LABELS: Record<NodeKind, string> = {
  chat: '对话',
  generator: '生成',
  asset: '资产',
  table: '表格',
  auto: '自动',
  review: '审查',
  memory: '记忆',
};

export default function NodeRenderer({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const def = getNodeDef(data.nodeTypeId);
  if (!def) {
    return <div className="wf-node wf-node--unknown">未知节点: {data.nodeTypeId}</div>;
  }
  const Icon = ICONS[def.icon ?? ''] ?? HelpCircle;
  const params = (data.params ?? {}) as Record<string, unknown>;

  return (
    <div className={`wf-node wf-node--${def.kind}${selected ? ' is-selected' : ''}`}>
      <div className="wf-node__header">
        <Icon size={14} className="wf-node__icon" />
        <span className="wf-node__title">{def.name}</span>
        <span className="wf-node__kind">{KIND_LABELS[def.kind]}</span>
      </div>

      {def.description && <div className="wf-node__desc">{def.description}</div>}

      <div className="wf-node__ports">
        <div className="wf-node__inputs">
          {def.inputs.map((port) =>
            port.isConnection ? (
              <div className="wf-port wf-port--in" key={port.name}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={inHandleId(port.name)}
                  className="wf-handle"
                />
                <span className="wf-port__name">{port.label || port.name}</span>
                {port.array && <span className="wf-port__badge">[]</span>}
                {port.required && <span className="wf-port__badge wf-port__badge--req">必填</span>}
              </div>
            ) : (
              <div className="wf-port wf-port--in wf-port--param" key={port.name}>
                <span className="wf-port__name">{port.label || port.name}</span>
                <span className="wf-port__val">
                  {String(params[port.name] ?? port.defaultValue ?? '') || '—'}
                </span>
              </div>
            ),
          )}
        </div>

        <div className="wf-node__outputs">
          {def.outputs.map((port) => (
            <div className="wf-port wf-port--out" key={port.name}>
              <span className="wf-port__name">{port.label || port.name}</span>
              <span className="wf-port__type">
                {port.type}
                {port.array ? '[]' : ''}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={outHandleId(port.name)}
                className="wf-handle"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
