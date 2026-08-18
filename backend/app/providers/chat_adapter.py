"""Chat 后端适配器：真实 LangChain ChatOpenAI / 无 key 时 Mock。

统一接口：generate(system, history, user) -> str
- 配置了 OPENAI_API_KEY（provider.resolve 有值）→ RealChatBackend（LangChain）
- 未配置 → MockChatBackend（固定 JSON 模板，端到端联调用，UI 上会标注）

这样即使还没填 key，聊天面板/产出解析/执行引擎整条链路也能先跑通。
"""
from __future__ import annotations

from typing import Protocol

from .registry import find_chat_provider


class ChatBackend(Protocol):
    def generate(self, system: str, history: list[dict], user: str) -> str: ...


# ---------------------------------------------------------------------------
# Mock 模板：包含全部 Chat 节点可能的产出字段（brief/story/styleBible/assetPlan/storyboard）
# ---------------------------------------------------------------------------

_MOCK_BRIEF = """# 创意简报（Mock 模式）

> ⚠️ 当前未配置 OPENAI_API_KEY，回复为模板占位。填入 .env 后自动切换真实模型。

## 核心洞察
面向 Z 世代夏日场景的饮品广告，主打「一口回到夏天」的情绪价值，
把产品与海浪/冰爽/汽水气泡做视觉通感。

## 3 条差异化创意方向
1. 汽水与海浪的视觉通感（产品倒影成浪）
2. 办公室里的迷你夏日（桌面微缩沙滩）
3. 从 0 到 100 的冰爽刻度（温度计叙事）
"""

_MOCK_STORY = """# 剧本（Mock 模式）

> ⚠️ 未配置 OPENAI_API_KEY，模板占位。

## 结构
- 开场（0-3s）：产品特写，气泡上升，标题「一口回到夏天」
- 发展（3-8s）：办公室白领拧开瓶盖瞬间穿越到海滩
- 高潮（8-12s）：浪花与汽水喷溅同构，品牌 logo 出现
- 结尾（12-15s）：产品静物 + 广告语「你的夏天，从这一口开始」
"""

_MOCK_STYLE = """# 视觉风格圣经（Mock 模式）

## 色彩基调
- 主色：海盐蓝 #4FB3E8、汽水透明高光 #FFFFFF
- 辅色：落日橙 #FF9F43、薄荷绿 #7ED4A2

## 构图与镜头语言
- 大量微距气泡/水花慢镜头
- 高饱和、通透光影，模拟夏日正午

## 角色形象
- 年轻白领（25-30 岁），清爽休闲装
"""

_MOCK_ASSET_PLAN = {
    "columns": [
        {"key": "name", "label": "素材", "type": "text"},
        {"key": "type", "label": "类型", "type": "select", "options": ["image", "audio", "video"]},
        {"key": "purpose", "label": "用途", "type": "text"},
        {"key": "source", "label": "来源", "type": "text"},
    ],
    "rows": [
        {"name": "产品特写静物", "type": "image", "purpose": "开场镜头", "source": "生成"},
        {"name": "海边场景参考", "type": "image", "purpose": "背景板", "source": "生成"},
        {"name": "气泡慢镜头", "type": "video", "purpose": "高潮镜头", "source": "素材库"},
    ],
}

_MOCK_STORYBOARD = {
    "columns": [
        {"key": "sceneDescription", "label": "画面描述", "type": "text"},
        {"key": "durationSec", "label": "时长", "type": "number"},
        {"key": "cameraAngle", "label": "机位", "type": "text"},
        {"key": "dialogue", "label": "对白/字幕", "type": "text"},
    ],
    "rows": [
        {"sceneDescription": "微距产品特写，气泡上升", "durationSec": 3, "cameraAngle": "特写", "dialogue": "一口回到夏天"},
        {"sceneDescription": "办公室白领拧开瓶盖，光线变化", "durationSec": 5, "cameraAngle": "中景", "dialogue": ""},
        {"sceneDescription": "浪花与汽水喷溅同构", "durationSec": 4, "cameraAngle": "升格慢镜", "dialogue": ""},
        {"sceneDescription": "产品静物 + 品牌 logo", "durationSec": 3, "cameraAngle": "俯拍", "dialogue": "你的夏天，从这一口开始"},
    ],
}

_MOCK_PRODUCTS: dict[str, object] = {
    "brief": {"id": "mock-brief", "title": "创意简报", "markdown": _MOCK_BRIEF},
    "story": {"id": "mock-story", "title": "剧本", "markdown": _MOCK_STORY},
    "styleBible": {"id": "mock-style", "title": "视觉风格圣经", "markdown": _MOCK_STYLE},
    "assetPlan": {"id": "mock-asset", "title": "资产清单", **_MOCK_ASSET_PLAN},
    "storyboard": {"id": "mock-sb", "title": "分镜表", **_MOCK_STORYBOARD},
}


class MockChatBackend:
    """无 key 时：返回固定 JSON 模板（含用户输入摘要，便于确认链路通）。"""

    def __init__(self, model_id: str):
        self.model_id = model_id

    def generate(self, system: str, history: list[dict], user: str) -> str:
        import json as _json

        note = f"（Mock 模式，未配置 OPENAI_API_KEY，未真正调用 {self.model_id}。已收到你的输入：「{user[:60]}」）"
        products = {
            name: (dict(p) if isinstance(p, dict) else p)
            for name, p in _MOCK_PRODUCTS.items()
        }
        for name, p in products.items():
            if isinstance(p, dict) and "markdown" in p:
                p["markdown"] = p["markdown"] + "\n\n" + note
        return _json.dumps(products, ensure_ascii=False, indent=2)


class RealChatBackend:
    """真实 LangChain ChatOpenAI（OpenAI 兼容中转站）。"""

    def __init__(self, provider_id: str, model_id: str, variant: str | None = None):
        from langchain_openai import ChatOpenAI

        provider = find_chat_provider(provider_id)
        if not provider:
            raise ValueError(f"未配置 chat provider: {provider_id}")
        cfg = provider.resolve()
        if not cfg["api_key"]:
            raise ValueError(f"环境变量 {provider.apiKeyEnv} 未设置")
        self.llm = ChatOpenAI(
            model=model_id,
            api_key=cfg["api_key"],
            base_url=cfg["base_url"],
            temperature=0.7,
            max_retries=2,
            timeout=120,
        )

    def generate(self, system: str, history: list[dict], user: str) -> str:
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        messages = [SystemMessage(content=system)]
        for m in history:
            if m["role"] == "user":
                messages.append(HumanMessage(content=m["content"]))
            elif m["role"] == "assistant":
                messages.append(AIMessage(content=m["content"]))
        messages.append(HumanMessage(content=user))
        resp = self.llm.invoke(messages)
        content = resp.content
        return content if isinstance(content, str) else str(content)


def get_chat_backend(model_ref: dict) -> ChatBackend:
    """按模型引用选择真实或 Mock 后端。"""
    provider_id = model_ref.get("providerId", "")
    model_id = model_ref.get("modelId", "gpt-5.6-sol")
    variant = model_ref.get("variant")
    provider = find_chat_provider(provider_id)
    if provider and provider.api_key:
        return RealChatBackend(provider_id, model_id, variant)
    return MockChatBackend(model_id)
