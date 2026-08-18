/**
 * 分镜表定制前端（MVP-P3，核心壁垒）。
 * Table 节点的 storyboard 编辑器：镜头卡片列表，画布内增删改。
 * 编辑数据写入 node.data.storyboardData，执行时作为该节点输出；
 * 也可通过「对话」Tab 用 LLM 生成，两者互为覆盖/起点。
 */
import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { Node } from '@xyflow/react';

import { useCanvasStore } from '../store';
import type { CanvasNodeData } from '../types';

interface ShotRow {
  sceneDescription: string;
  durationSec?: number | null;
  cameraAngle?: string;
  dialogue?: string;
  adText?: { content?: string; position?: string };
  [k: string]: unknown;
}

interface StoryboardData {
  aspectRatio?: string;
  rows?: ShotRow[];
}

const POSITIONS = ['center', 'top', 'bottom', 'overlay'];

const EMPTY_SHOT: ShotRow = {
  sceneDescription: '新镜头：空白画面描述',
  durationSec: 5,
  cameraAngle: '全景',
  dialogue: '',
  adText: { content: '', position: 'center' },
};

function FieldText({
  label,
  value,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="sb-field">
      <span className="sb-field__label">{label}</span>
      {multiline ? (
        <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
        />
      )}
    </label>
  );
}

function ShotCard({
  index,
  row,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  index: number;
  row: ShotRow;
  onUpdate: (patch: Partial<ShotRow>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="sb-card">
      <div className="sb-card__head">
        <span className="sb-card__index">#{index + 1}</span>
        <span className="sb-card__dur">{(Number(row.durationSec) || 0).toFixed(1)}s</span>
        <div className="sb-card__actions">
          <button className="sb-icon-btn" title="复制镜头" onClick={onDuplicate}>
            <Copy size={13} />
          </button>
          <button className="sb-icon-btn sb-icon-btn--danger" title="删除镜头" onClick={onRemove}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="sb-card__body">
        <FieldText
          label="画面描述"
          multiline
          value={row.sceneDescription}
          onChange={(v) => onUpdate({ sceneDescription: v })}
        />
        <div className="sb-field-row">
          <FieldText
            label="时长(秒)"
            value={row.durationSec == null ? '' : String(row.durationSec)}
            onChange={(v) => onUpdate({ durationSec: v === '' ? null : Number(v) })}
          />
          <FieldText
            label="机位/景别"
            value={row.cameraAngle ?? ''}
            onChange={(v) => onUpdate({ cameraAngle: v })}
          />
        </div>
        <FieldText
          label="对白/字幕"
          multiline
          value={row.dialogue ?? ''}
          onChange={(v) => onUpdate({ dialogue: v })}
        />
        <div className="sb-field-row">
          <FieldText
            label="广告文字"
            value={row.adText?.content ?? ''}
            onChange={(v) => onUpdate({ adText: { content: v, position: row.adText?.position ?? 'center' } })}
          />
          <label className="sb-field">
            <span className="sb-field__label">位置</span>
            <select
              value={row.adText?.position ?? 'center'}
              onChange={(e) => onUpdate({ adText: { content: row.adText?.content ?? '', position: e.target.value } })}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

export default function StoryboardEditor({ node }: { node: Node<CanvasNodeData> }) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const storyboardData = (node.data.storyboardData as StoryboardData | undefined) ?? {};
  const existingRows = storyboardData.rows ?? [];
  const [rows, setRows] = useState<ShotRow[]>(existingRows.length ? existingRows : []);
  const [aspect, setAspect] = useState(storyboardData.aspectRatio ?? '16:9');

  const commit = (next: ShotRow[]) => {
    setRows(next);
    updateNodeData(node.id, 'storyboardData', { aspectRatio: aspect, rows: next });
  };

  const addShot = () => commit([...rows, { ...EMPTY_SHOT }]);
  const updateShot = (index: number, patch: Partial<ShotRow>) =>
    commit(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const removeShot = (index: number) => commit(rows.filter((_, i) => i !== index));
  const duplicateShot = (index: number) => commit([...rows, { ...rows[index] }]);
  const onAspectChange = (v: string) => {
    setAspect(v);
    updateNodeData(node.id, 'storyboardData', { aspectRatio: v, rows });
  };

  const totalSec = rows.reduce((s, r) => s + (Number(r.durationSec) || 0), 0);

  return (
    <aside className="sb-panel">
      <div className="sb-panel__header">
        <div>
          <div className="sb-panel__title">🎬 分镜表</div>
          <div className="sb-panel__sub">
            {rows.length} 镜头 · 总时长 {totalSec.toFixed(1)}s
          </div>
        </div>
        <label className="sb-panel__aspect">
          比例
          <select value={aspect} onChange={(e) => onAspectChange(e.target.value)}>
            {['16:9', '9:16', '1:1', '4:3'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="sb-panel__empty">
          还没有镜头。<br />
          点下方「添加镜头」手动编辑，或切换到「💬 对话」让模型生成分镜。
        </div>
      ) : (
        <div className="sb-panel__list">
          {rows.map((row, i) => (
            <ShotCard
              key={i}
              index={i}
              row={row}
              onUpdate={(p) => updateShot(i, p)}
              onRemove={() => removeShot(i)}
              onDuplicate={() => duplicateShot(i)}
            />
          ))}
        </div>
      )}

      <button className="sb-add" onClick={addShot}>
        <Plus size={14} /> 添加镜头
      </button>
    </aside>
  );
}