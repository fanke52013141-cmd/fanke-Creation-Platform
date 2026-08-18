/**
 * 聊天会话状态（zustand）：右侧聊天面板的数据源。
 */
import { create } from 'zustand';
import { createChatSession, sendChatMessage, type ChatMessageDTO } from '../api';

interface ChatState {
  nodeId: string | null;
  sessionId: string | null;
  messages: ChatMessageDTO[];
  products: Record<string, unknown>;
  loading: boolean;
  error: string | null;

  openChat: (nodeId: string, nodeTypeId: string) => Promise<void>;
  closeChat: () => void;
  send: (content: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  nodeId: null,
  sessionId: null,
  messages: [],
  products: {},
  loading: false,
  error: null,

  openChat: async (nodeId, nodeTypeId) => {
    // 同一节点重复点击不重建会话
    if (get().nodeId === nodeId && get().sessionId) return;
    set({ nodeId, messages: [], products: {}, error: null, loading: true });
    try {
      const info = await createChatSession(nodeId, nodeTypeId);
      set({ sessionId: info.sessionId, messages: info.messages, products: info.products });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },

  closeChat: () =>
    set({ nodeId: null, sessionId: null, messages: [], products: {}, error: null }),

  send: async (content) => {
    const { sessionId, messages } = get();
    if (!sessionId || !content.trim()) return;
    set({
      messages: [...messages, { role: 'user', content }],
      loading: true,
      error: null,
    });
    try {
      const res = await sendChatMessage(sessionId, content);
      set({
        messages: [...get().messages, res.message],
        products: res.products,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },
}));
