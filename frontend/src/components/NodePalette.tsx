/**
 * 左侧节点面板：从 ALL_MANIFESTS 渲染所有节点，点击添加到画布。
 */
import type { LucideIcon } from 'lucide-react';
import {
  Brain, Clapperboard, FileText, FolderOpen, GitBranch, Eye, Download,
  HelpCircle, Image as ImageIcon, MessageSquare, Repeat, Terminal, Wand2,
} from 'lucide-react';

import { ALL_MANIFESTS } from '../data/nodeDefs';
import { useCanvasStore } from '../store';

const ICONS: Record<string, LucideIcon> = {
  MessageSquare, Brain, Wand2, FileText, Terminal, FolderOpen, Repeat, GitBranch, Download, Eye, ImageIcon, Clapperboard,
};

export default function NodePalette() {
  const addNode = useCanvasStore((s) => s.addNode);

  return (
    <aside className="palette">
      <div className="palette__title">节点库</div>
      {ALL_MANIFESTS.map((def) => {
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