"""聊天会话管理（内存）。

单人单机：进程内 dict 即足够，重启丢失（P1 阶段）。
会话按画布节点实例 id（node_id）唯一；LLM 回复中解析出的产物
（brief/story/styleBible/assetPlan/storyboard 等）存 session.products，
执行引擎跑 Chat 节点时从会话取最新快照。
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from ..defs import load_node_defs
from ..providers.chat_adapter import get_chat_backend


def extract_json(text: str) -> str | None:
    """从 LLM 回复提取 JSON 文本：优先 ```json 块，其次首尾花括号。"""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        return m.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        return text[start : end + 1]
    return None


def extract_products(text: str, outputs: list[Any]) -> dict:
    """把 LLM 回复中的 JSON 映射到节点 outputs（按端口名取字段）。"""
    raw = extract_json(text)
    if raw is None:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    products: dict = {}
    for o in outputs:
        if o.name in data and data[o.name] is not None:
            products[o.name] = data[o.name]
    return products


@dataclass
class ChatSession:
    id: str
    node_id: str
    node_type_id: str
    system_prompt: str
    model_ref: dict
    messages: list[dict] = field(default_factory=list)
    products: dict = field(default_factory=dict)


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, ChatSession] = {}

    def get(self, session_id: str) -> ChatSession | None:
        return self._sessions.get(session_id)

    def by_node(self, node_id: str) -> ChatSession | None:
        for s in self._sessions.values():
            if s.node_id == node_id:
                return s
        return None

    def get_or_create(self, node_id: str, node_type_id: str) -> ChatSession:
        existing = self.by_node(node_id)
        if existing:
            return existing
        defs = load_node_defs()
        ndef = defs.get(node_type_id)
        if not ndef:
            raise ValueError(f"未知节点定义: {node_type_id}")
        s = ChatSession(
            id=f"cs-{uuid.uuid4().hex[:10]}",
            node_id=node_id,
            node_type_id=node_type_id,
            system_prompt=ndef.systemPrompt or "",
            model_ref=ndef.model or {},
        )
        self._sessions[s.id] = s
        return s

    def send_message(self, session_id: str, content: str) -> dict:
        s = self.get(session_id)
        if not s:
            raise KeyError(session_id)
        s.messages.append({"role": "user", "content": content})
        backend = get_chat_backend(s.model_ref)
        try:
            reply = backend.generate(s.system_prompt, s.messages[:-1], content)
        except Exception as exc:
            error_msg = f"模型调用失败: {type(exc).__name__}: {exc}"
            s.messages.append({"role": "assistant", "content": error_msg})
            return {"message": {"role": "assistant", "content": error_msg}, "products": {}}
        s.messages.append({"role": "assistant", "content": reply})

        defs = load_node_defs()
        ndef = defs.get(s.node_type_id)
        if ndef:
            s.products = extract_products(reply, ndef.outputs)
        return {"message": {"role": "assistant", "content": reply}, "products": s.products}


# 全局单例（进程内存）
sessions = SessionManager()
