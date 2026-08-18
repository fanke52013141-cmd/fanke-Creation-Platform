"""Provider Registry：模型调用是基础设施层（非节点）。

配置在根目录 providers.config.json（可提交，key 只存环境变量名）；
真实密钥一律从环境变量读取（os.environ），绝不落盘明文。

P0：只提供骨架 + 从配置加载 chat provider 的能力，供 P1 LangChain 聊天使用。
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_CONFIG_PATH = _ROOT / "providers.config.json"


@dataclass
class ChatProvider:
    id: str
    baseURL: str
    apiKeyEnv: str
    models: list[dict] = field(default_factory=list)

    @property
    def api_key(self) -> str:
        """从环境变量读 key；未设置时返回空串（调用时再报错）。"""
        return os.environ.get(self.apiKeyEnv, "")

    def resolve(self) -> dict:
        """解析成可传给 OpenAI 客户端的配置。"""
        return {
            "base_url": self.baseURL,
            "api_key": self.api_key,
        }


@lru_cache(maxsize=1)
def _load_config() -> dict:
    if not _CONFIG_PATH.exists():
        return {"chat": [], "image": []}
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def list_chat_providers() -> list[ChatProvider]:
    cfg = _load_config()
    out = []
    for item in cfg.get("chat", []):
        out.append(
            ChatProvider(
                id=item.get("id", ""),
                baseURL=item.get("baseURL", ""),
                apiKeyEnv=item.get("apiKeyEnv", ""),
                models=item.get("models", []),
            )
        )
    return out


def find_chat_provider(provider_id: str) -> ChatProvider | None:
    for p in list_chat_providers():
        if p.id == provider_id:
            return p
    return None


def list_image_providers() -> list[dict]:
    cfg = _load_config()
    return cfg.get("image", [])
