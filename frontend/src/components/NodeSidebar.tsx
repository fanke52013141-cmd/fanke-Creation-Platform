/**
 * 右侧面板统一分派：
 * - 分镜节点（editorHint='storyboard'）→ 双 Tab：💬对话 / 🎬分镜表
 * - chat 节点 → ChatPanel
 * - review 节点 → ReviewPanel
 * - 其他 → Inspector（属性面板）
 */
import { useState } from 'react';
import type { Node } from '@xyflow/react';

import { getNodeDef } from '../data/nodeDefs';
import ChatPanel from './ChatPanel';
import StoryboardEditor from './StoryboardEditor';
import ReviewPanel from './ReviewPanel';
import Inspector from './Inspector';
import type { CanvasNodeData } from '../types';

type Tab = 'chat' | 'storyboard';

export default function NodeSidebar({ node }: { node: Node<CanvasNodeData> }) {
  const def = getNodeDef(node.data.nodeTypeId);
  const kind = def?.kind;
  const isStoryboard = def?.editorHint === 'storyboard';
  const [tab, setTab] = useState<Tab>('storyboard');

  if (isStoryboard) {
    return (
      <div className="node-sidebar">
        <div className="sidebar-tabs">
          <button
            className={tab === 'chat' ? 'active' : ''}
            onClick={() => setTab('chat')}
          >
            💬 对话生成
          </button>
          <button
            className={tab === 'storyboard' ? 'active' : ''}
            onClick={() => setTab('storyboard')}
          >
            🎬 分镜表编辑
          </button>
        </div>
        <div className="node-sidebar__body">
          {tab === 'chat' ? <ChatPanel node={node} /> : <StoryboardEditor node={node} />}
        </div>
      </div>
    );
  }

  if (kind === 'chat') return <ChatPanel node={node} />;
  if (kind === 'review') return <ReviewPanel node={node} />;
  return <Inspector />;
}