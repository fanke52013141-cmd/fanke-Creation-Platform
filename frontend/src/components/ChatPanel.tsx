/**
 * 右侧聊天面板（Chat 节点）：消息流 + 输入框 + 产物预览。
 * 点击 Chat 节点打开；对话中模型产出（brief/story/...）解析后
 * 实时显示在下方「产出」区，并同步到该节点的输出（执行引擎可读）。
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';
import type { Node } from '@xyflow/react';

import { useChatStore } from '../store/chatStore';
import { getNodeDef } from '../data/nodeDefs';
import type { CanvasNodeData } from '../types';

export default function ChatPanel({ node }: { node: Node<CanvasNodeData> }) {
  const def = getNodeDef(node.data.nodeTypeId);
  const messages = useChatStore((s) => s.messages);
  const products = useChatStore((s) => s.products);
  const loading = useChatStore((s) => s.loading);
  const error = useChatStore((s) => s.error);
  const openChat = useChatStore((s) => s.openChat);
  const send = useChatStore((s) => s.send);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void openChat(node.id, node.data.nodeTypeId);
  }, [node.id, node.data.nodeTypeId, openChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void send(text);
  };

  return (
    <aside className="chat-panel">
      <div className="chat-panel__header">
        <div className="chat-panel__title">💬 {def?.name ?? '聊天'}</div>
        <div className="chat-panel__sub">
          {def?.model ? `${def.model.modelId}${def.model.variant ? ` · ${def.model.variant}` : ''}` : ''}
          {def?.systemPrompt ? ` · ${def.systemPrompt.slice(0, 40)}…` : ''}
        </div>
      </div>

      <div className="chat-panel__messages">
        {messages.length === 0 && !loading && (
          <div className="chat-panel__hint">
            向「{def?.name}」发送消息开始对话。
            <br />
            模型会按节点要求产出结构化结果（如简报/剧本），显示在下方「产出」区。
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-msg__bubble">
              {m.role === 'assistant' && m.content.includes('```json') ? (
                <details>
                  <summary>模型回复（含 JSON 产物）</summary>
                  <pre>{m.content}</pre>
                </details>
              ) : (
                <span className="chat-msg__text">{m.content}</span>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-msg__bubble chat-msg__bubble--loading">
              <Loader2 size={13} className="spin" /> 思考中…
            </div>
          </div>
        )}
        {error && <div className="chat-panel__error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {Object.keys(products).length > 0 && (
        <div className="chat-panel__products">
          <div className="chat-panel__products-title">📦 产出（已同步到节点输出）</div>
          {Object.entries(products).map(([name, value]) => (
            <details key={name} className="chat-product" open>
              <summary className="chat-product__summary">{name}</summary>
              <pre className="chat-product__body">{JSON.stringify(value, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}

      <form className="chat-panel__input" onSubmit={handleSend}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={2}
        />
        <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
          <Send size={14} /> 发送
        </button>
      </form>
    </aside>
  );
}
