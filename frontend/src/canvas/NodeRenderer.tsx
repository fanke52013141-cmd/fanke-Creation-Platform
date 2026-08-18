/**
 * 通用节点渲染器（schema 驱动，仿 LangFlow GenericNode）。
 * 根据 node-defs.json 的 inputs/outputs 自动渲染插口与参数字段。
 * 动态端口节点（dynamicPorts=true）从 node.data.ports 读取端口定义。
 */
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  Archive, Brain, Clapperboard, ClipboardCheck, FileText, FolderOpen,
  HelpCircle, Image as ImageIcon, Lightbulb, MessageSquare, Package,
  Palette, Repeat, Terminal, Wand2, type LucideIcon,
} from 'lucide-react';

import { getNodeDef } from '../data/nodeDefs';
import { inHandleId, outHandleId } from '../engine/connections';
import type { CanvasNodeData, InputPort, NodeKind, OutputPort } from '../types';

const ICONS: Record<string, LucideIcon> = {
  Lightbulb, ClipboardCheck, Palette, Package, Clapperboard, Wand2,
  ImageIcon, Archive, Brain, FolderOpen, MessageSquare, FileText, Terminal, Repeat,
};

const KIND_LABELS: Record<NodeKind, string> = {
  chat: '对话', generator: '生成', asset: '资产', table: '表格',
  auto: '自动', review: '审查', memory: '记忆', code: '代码', text: '文本', loop: '循环',
};

function PortRow({ port, isInput }: { port: InputPort | OutputPort; isInput: boolean }) {
  const p = port as unknown as Record<string, unknown>;
  const name = p.name as string;
  const label = (p.label as string) || name;
  const type = p.type as string || '';
  const isArray = p.array as boolean;
  const isReq = p.required as boolean;
  return (
    <div className={`wf-port wf-port--${isInput ? 'in' : 'out'}`} key={name}>
      {isInput && (
        <Handle
          type="target"
          position={Position.Left}
          id={inHandleId(name)}
          className="wf-handle"
        />
      )}
      <span className="wf-port__name">{label}</span>
      {isArray && <span className="wf-port__badge">[]</span>}
      {isReq && <span className="wf-port__badge wf-port__badge--req">必填</span>}
      {!isInput && (
        <>
          <span className="wf-port__type">{type}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={outHandleId(name)}
            className="wf-handle"
          />
        </>
      )}
    </div>
  );
}

export default function NodeRenderer({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  const def = getNodeDef(data.nodeTypeId);
  if (!def) {
    return <div className="wf-node wf-node--unknown">未知节点: {data.nodeTypeId}</div>;
  }
  const Icon = ICONS[def.icon ?? ''] ?? HelpCircle;
  const params = (data.params ?? {}) as Record<string, unknown>;

  // 抑制 params 未使用警告（后续用于显示参数值）
  void params;

  // 动态端口：从 data.ports 读取
  const ports = data.ports as { inputs?: InputPort[]; outputs?: OutputPort[] } | undefined;
  const inputPorts = def.dynamicPorts ? (ports?.inputs ?? []) : def.inputs;
  const outputPorts = def.dynamicPorts ? (ports?.outputs ?? []) : def.outputs;

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
          {inputPorts.length === 0 && !def.dynamicPorts && (
            <div className="wf-port wf-port--in" style={{ color: '#a0a6b6', fontSize: 11 }}>
              无输入
            </div>
          )}
          {inputPorts.map((port) => <PortRow key={port.name} port={port} isInput />)}
        </div>

        <div className="wf-node__outputs">
          {outputPorts.length === 0 && !def.dynamicPorts && (
            <div className="wf-port wf-port--out" style={{ color: '#a0a6b6', fontSize: 11 }}>
              无输出
            </div>
          )}
          {outputPorts.map((port) => <PortRow key={port.name} port={port} isInput={false} />)}
        </div>
      </div>
    </div>
  );
}