/**
 * 左侧节点面板：列出全部节点定义（按 kind 分组），点击添加到画布。
 */
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
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
} from 'lucide-react';

import { NODE_DEFS } from '../data/nodeDefs';
import { useCanvasStore } from '../store';
import type { NodeKind } from '../types';

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

const GROUP_ORDER: NodeKind[] = ['chat', 'review', 'auto', 'generator', 'asset', 'table', 'memory'];
const GROUP_LABELS: Record<NodeKind, string> = {
  chat: '💬 对话',
  generator: '🎨 生成',
  asset: '📦 资产',
  table: '📋 表格',
  auto: '⚙️ 自动化',
  review: '✅ 审查',
  memory: '🧠 记忆',
};

export default function NodePalette() {
  const addNode = useCanvasStore((s) => s.addNode);

  const groups = useMemo(() => {
    const map = new Map<NodeKind, typeof NODE_DEFS>();
    for (const def of NODE_DEFS) {
      if (!map.has(def.kind)) map.set(def.kind, []);
      map.get(def.kind)!.push(def);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({
      kind: k,
      defs: map.get(k)!,
    }));
  }, []);

  return (
    <aside className="palette">
      <div className="palette__title">节点库</div>
      {groups.map(({ kind, defs }) => (
        <div className="palette__group" key={kind}>
          <div className="palette__group-label">{GROUP_LABELS[kind]}</div>
          {defs.map((def) => {
            const Icon = ICONS[def.icon ?? ''] ?? HelpCircle;
            return (
              <button
                key={def.id}
                className="palette__item"
                title={def.description}
                onClick={() => addNode(def.id)}
              >
                <Icon size={14} />
                <span>{def.name}</span>
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
