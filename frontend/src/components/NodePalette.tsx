/**
 * 左侧节点面板：直接罗列所有节点定义（不分组），点击添加到画布。
 * 后续节点多了再做分类。
 */
import type { LucideIcon } from 'lucide-react';
import {
  Brain, Clapperboard, FileText, HelpCircle, Image as ImageIcon,
  MessageSquare, Repeat, Terminal, Wand2,
} from 'lucide-react';

import { NODE_DEFS } from '../data/nodeDefs';
import { useCanvasStore } from '../store';

const ICONS: Record<string, LucideIcon> = {
  MessageSquare, Brain, FileText, Terminal, Repeat, ImageIcon, Wand2, Clapperboard,
};

export default function NodePalette() {
  const addNode = useCanvasStore((s) => s.addNode);

  return (
    <aside className="palette">
      <div className="palette__title">节点库</div>
      {NODE_DEFS.map((def) => {
        const Icon = ICONS[def.icon ?? ''] ?? HelpCircle;
        return (
          <button
            key={def.id}
            className="palette__item"
            title={def.description}
            onClick={() => addNode(def.id)}
          >
            <Icon size={14} />
            <span className="palette__item-name">{def.name}</span>
            <span className="palette__item-kind">{def.kind}</span>
          </button>
        );
      })}
    </aside>
  );
}