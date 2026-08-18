/**
 * 右侧面板统一分派：
 * - chat → ChatPanel（对话）
 * - process → ProcessPanel（单次 LLM 处理）
 * - review → ReviewPanel（审核，兼容旧版）
 * - text → TextEditor（文本编辑）
 * - code → CodeEditor（代码编辑）
 * - loop → CodeEditor（循环代码编辑）
 * - asset → AssetEditor（资产管理）
 * - generator → GeneratorEditor（生成配置）
 * - 其他 → Inspector（属性面板）
 */
import { useState } from 'react';
import type { Node } from '@xyflow/react';

import { getNodeDef } from '../data/nodeDefs';
import ChatPanel from './ChatPanel';
import ReviewPanel from './ReviewPanel';
import TextEditor from './TextEditor';
import CodeEditor from './CodeEditor';
import AssetEditor from './AssetEditor';
import StoryboardEditor from './StoryboardEditor';
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
          <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>💬 对话生成</button>
          <button className={tab === 'storyboard' ? 'active' : ''} onClick={() => setTab('storyboard')}>🎬 分镜表编辑</button>
        </div>
        <div className="node-sidebar__body">
          {tab === 'chat' ? <ChatPanel node={node} /> : <StoryboardEditor node={node} />}
        </div>
      </div>
    );
  }

  if (kind === 'chat') return <ChatPanel node={node} />;
  if (kind === 'process' || kind === 'review') return <ReviewPanel node={node} />;
  if (kind === 'text') return <TextEditor node={node} />;
  if (kind === 'code' || kind === 'loop') return <CodeEditor node={node} />;
  if (kind === 'asset') return <AssetEditor node={node} />;
  return <Inspector />;
}