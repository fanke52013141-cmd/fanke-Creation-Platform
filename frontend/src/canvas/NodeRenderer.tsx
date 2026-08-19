/**
 * 通用节点渲染器（schema 驱动，仿 LangFlow GenericNode）。
 * 三段式：header（标题/类型/执行徽标）+ body（内容显化区）+ footer（端口）。
 */
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  Check, X, AlertTriangle, Clock, Loader, Eye, Copy,
  HelpCircle, Image as ImageIcon, MessageSquare, type LucideIcon,
} from 'lucide-react';
import { useState, useCallback } from 'react';

import { getManifest } from '../data/nodeDefs';
import { inHandleId, outHandleId } from '../engine/connections';
import type { ParamSchema } from '../types';

// ============ 图标映射 ============

const KIND_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare, process: MessageSquare, generator: ImageIcon,
  data: ImageIcon, code: HelpCircle, group: HelpCircle, loop: HelpCircle,
  branch: HelpCircle, output: HelpCircle, preview: Eye,
};

const KIND_LABELS: Record<string, string> = {
  chat: '对话', process: '处理', generator: '生成', data: '数据',
  code: '代码', group: '分组', loop: '循环', branch: '分支',
  output: '输出', preview: '预览',
};

// ============ 状态徽标 ============

const STATUS_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  'awaiting-human': { icon: Clock, label: '等待人工', color: '#f2994a' },
  'stale': { icon: AlertTriangle, label: '已过期', color: '#e67e22' },
  'cached': { icon: Clock, label: '缓存', color: '#219653' },
  'error': { icon: X, label: '错误', color: '#c0392b' },
  'skipped': { icon: X, label: '已跳过', color: '#95a5a6' },
  'running': { icon: Loader, label: '运行中', color: '#4c5cff' },
  'done': { icon: Check, label: '完成', color: '#219653' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className="wf-node__status-badge" style={{ color: cfg.color, borderColor: cfg.color }}>
      <Icon size={10} />
      <span>{cfg.label}</span>
    </span>
  );
}

// ============ 内容显化 ============

function NodeBody({ data, manifest }: { data: Record<string, unknown>; manifest: { id: string; kind: string; outputs: ParamSchema[] } }) {
  // 状态徽标
  const status = data._status as string | undefined;
  const outputs = data._outputs as Record<string, unknown> | undefined;

  // 收集图片
  const images: Array<{ url: string; id: string }> = [];
  if (outputs) {
    for (const v of Object.values(outputs)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'url' in (item as object)) {
            const img = item as { url: string; id?: string };
            images.push({ url: img.url, id: img.id || img.url });
          }
        }
      }
    }
  }

  // 收集文本
  let textPreview = '';
  if (outputs) {
    for (const v of Object.values(outputs)) {
      if (typeof v === 'string') { textPreview = v; break; }
      if (v && typeof v === 'object' && 'markdown' in (v as object)) {
        textPreview = (v as { markdown: string }).markdown.slice(0, 120);
        break;
      }
    }
  }

  return (
    <div className="wf-node__body">
      {status && <StatusBadge status={status} />}

      {images.length > 0 && (
        <div className="wf-node__images">
          {images.slice(0, 6).map((img, i) => (
            <img
              key={img.id}
              src={img.url}
              alt={`img-${i}`}
              className="wf-node__thumb"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `{{${data.nodeTypeId}.images[${i}]}}`);
              }}
            />
          ))}
          {images.length > 6 && (
            <span className="wf-node__more">+{images.length - 6}</span>
          )}
        </div>
      )}

      {textPreview && images.length === 0 && (
        <div className="wf-node__text-preview">
          <span className="wf-node__text-content">{textPreview}</span>
        </div>
      )}

      {!status && !images.length && !textPreview && (
        <div className="wf-node__empty">就绪</div>
      )}
    </div>
  );
}

// ============ 端口 ============

function ParamPort({ param, isInput }: { param: ParamSchema; isInput: boolean }) {
  const isArray = param.items !== undefined;
  const isReq = param.required === true;
  return (
    <div className={`wf-port wf-port--${isInput ? 'in' : 'out'}`} key={param.name}>
      {isInput && (
        <Handle type="target" position={Position.Left} id={inHandleId(param.name)} className="wf-handle" />
      )}
      <span className="wf-port__name">{param.label || param.name}</span>
      {isArray && <span className="wf-port__badge">[]</span>}
      {isReq && <span className="wf-port__badge wf-port__badge--req">必填</span>}
      {param.semantic && <span className="wf-port__badge">{param.semantic}</span>}
      {!isInput && (
        <Handle type="source" position={Position.Right} id={outHandleId(param.name)} className="wf-handle" />
      )}
    </div>
  );
}

// ============ 主渲染器 ============

export default function NodeRenderer({ data, selected }: NodeProps<Node<{ nodeTypeId: string; config?: Record<string, unknown> }>>) {
  const manifest = getManifest(data.nodeTypeId);
  if (!manifest) {
    return <div className="wf-node wf-node--unknown">未知节点: {data.nodeTypeId}</div>;
  }
  const Icon = KIND_ICONS[manifest.kind] ?? HelpCircle;
  const inputPorts = manifest.inputs;
  const outputPorts = manifest.outputs;

  return (
    <div className={`wf-node wf-node--${manifest.kind}${selected ? ' is-selected' : ''}`}>
      {/* Header */}
      <div className="wf-node__header">
        <Icon size={14} className="wf-node__icon" />
        <span className="wf-node__title">{manifest.name}</span>
        <span className="wf-node__kind">{KIND_LABELS[manifest.kind] || manifest.kind}</span>
        {manifest.execution === 'interactive' && <span className="wf-node__exec-badge">需人工</span>}
      </div>

      {/* Body — 内容显化区 */}
      <NodeBody data={data as Record<string, unknown>} manifest={manifest as { id: string; kind: string; outputs: ParamSchema[] }} />

      {/* Footer — 端口 */}
      <div className="wf-node__ports">
        <div className="wf-node__inputs">
          {inputPorts.length === 0 && !manifest.dynamicParams && (
            <div className="wf-port wf-port--in" style={{ color: '#a0a6b6', fontSize: 11 }}>无输入</div>
          )}
          {inputPorts.map((port) => <ParamPort key={port.name} param={port} isInput />)}
        </div>
        <div className="wf-node__outputs">
          {outputPorts.length === 0 && !manifest.dynamicParams && (
            <div className="wf-port wf-port--out" style={{ color: '#a0a6b6', fontSize: 11 }}>无输出</div>
          )}
          {outputPorts.map((port) => <ParamPort key={port.name} param={port} isInput={false} />)}
        </div>
      </div>
    </div>
  );
}