"""图片生成适配器：Mock（离线 SVG 占位图）/ Real（预留 OpenAI images 接口）。

统一接口：generate(prompt, opts) -> list[ImageDTO]
- Mock：根据 prompt 生成一张 SVG 占位图（颜色/文字随 prompt 变化），
  写入资产库并返回可访问 URL —— 不联网也能跑通整个图片闭环；
- Real：配置了 OPENAI_API_KEY 且 provider 有 image 段时，调用
  OpenAI 兼容 /images/generations（如 codex2api 的 gpt-image-1）。
"""
from __future__ import annotations

import hashlib
import re
from typing import Any, Protocol

from ..artifacts import asset_store, new_asset_id


class ImageGenBackend(Protocol):
    def generate(self, prompt: str, opts: dict[str, Any]) -> list[dict[str, Any]]: ...


def _aspect_size(aspect_ratio: str | None, base: int = 1024) -> tuple[int, int]:
    ar = aspect_ratio or "1:1"
    m = re.match(r"(\d+):(\d+)", ar)
    if not m:
        return base, base
    w, h = int(m.group(1)), int(m.group(2))
    if w >= h:
        return base, int(base * h / w)
    return int(base * w / h), base


class MockImageBackend:
    """离线占位：prompt → 一张 SVG（颜色随 prompt hash 变化，含提示词摘要）。"""

    def generate(self, prompt: str, opts: dict[str, Any]) -> list[dict[str, Any]]:
        width, height = _aspect_size(opts.get("aspectRatio"))
        hue = int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:4], 16) % 360
        color = f"hsl({hue}, 62%, 55%)"
        dark = f"hsl({hue}, 62%, 30%)"
        summary = prompt[:60] if prompt else "(空提示词)"
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{color}"/>
      <stop offset="100%" stop-color="{dark}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="{width*0.5}" cy="{height*0.42}" r="{min(width,height)*0.18}" fill="rgba(255,255,255,0.25)"/>
  <rect x="{width*0.06}" y="{height*0.72}" width="{width*0.88}" height="{height*0.2}" rx="14" fill="rgba(0,0,0,0.35)"/>
  <text x="{width*0.5}" y="{height*0.83}" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="{max(16, int(min(width,height)*0.028))}">Mock · {summary}</text>
</svg>"""
        asset_id = new_asset_id("im")
        version = asset_store.create_revision(
            asset_id,
            svg.encode("utf-8"),
            "image/svg+xml",
            source={"provider": "mock", "prompt": prompt, "opts": opts},
            width=width,
            height=height,
        )
        return [
            {
                "id": asset_id,
                "url": version.url,
                "width": width,
                "height": height,
                "mime": "image/svg+xml",
                "rev": version.rev,
            }
        ]


class RealImageBackend:
    """真实生成：OpenAI 兼容 /images/generations（如 codex2api 的 gpt-image-1）。"""

    def __init__(self, provider_id: str, model_id: str) -> None:
        self.provider_id = provider_id
        self.model_id = model_id
        from .registry import find_chat_provider

        provider = find_chat_provider(provider_id)
        if not provider:
            raise ValueError(f"未配置 image provider: {provider_id}")
        cfg = provider.resolve()
        self._api_key = cfg["api_key"]
        self._base_url = cfg["base_url"]

    def generate(self, prompt: str, opts: dict[str, Any]) -> list[dict[str, Any]]:
        import requests

        from ..artifacts import asset_store, new_asset_id

        width, height = _aspect_size(opts.get("aspectRatio"), base=1024)
        num = int(opts.get("num", 1))
        seed = opts.get("seed")

        payload = {
            "model": self.model_id,
            "prompt": prompt,
            "n": num,
            "size": f"{width}x{height}",
            "response_format": "b64_json",
        }
        if seed is not None:
            payload["seed"] = seed

        resp = requests.post(
            f"{self._base_url.rstrip('/')}/images/generations",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for i, item in enumerate(data.get("data", [])):
            b64 = item.get("b64_json")
            if b64:
                import base64

                content = base64.b64decode(b64)
            else:
                url = item.get("url")
                if url:
                    img_resp = requests.get(url, timeout=30)
                    img_resp.raise_for_status()
                    content = img_resp.content
                else:
                    continue

            asset_id = new_asset_id("im")
            width = item.get("width", width)
            height = item.get("height", height)
            mime = "image/png"
            version = asset_store.create_revision(
                asset_id,
                content,
                mime,
                source={"provider": self.provider_id, "model": self.model_id, "prompt": prompt, "opts": opts},
                width=width,
                height=height,
            )
            results.append({
                "id": asset_id,
                "url": version.url,
                "width": width,
                "height": height,
                "mime": mime,
                "rev": version.rev,
            })
        return results


def get_image_backend(provider_id: str, model_id: str) -> ImageGenBackend:
    """按配置选择真实或 Mock 图片后端（key 未配时走 Mock）。"""
    from .registry import list_image_providers

    for p in list_image_providers():
        if p.get("id") == provider_id:
            from ..providers.registry import find_chat_provider

            chat = find_chat_provider(provider_id)
            if chat and chat.api_key:
                return RealImageBackend(provider_id, model_id)
    return MockImageBackend()
