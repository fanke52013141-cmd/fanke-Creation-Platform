"""节点 runtime：build 函数注册表。

设计（对齐 HANDOFF 3.5 节）：
- 每个节点定义在 node-defs.json 里声明 inputs/outputs；
- 这里实现"怎么跑"：auto 节点是确定性纯函数；chat/generator 在 P1/P2 接入真实模型。
- 加新节点 = node-defs.json 加一项 + 这里加一个 builder 并注册。

BuildContext = {"nodeId", "inputs"}（P0 精简版；P1 再加 providers / memory / emit）。
build 返回 {outputPortName: value}，形状受该节点 outputs 声明约束。
"""
from __future__ import annotations

import uuid
from typing import Any, Awaitable, Callable

from ..defs import load_node_defs
from ..types import NodeDef

# ---------------------------------------------------------------------------
# auto 节点：确定性纯函数
# ---------------------------------------------------------------------------


async def build_storyboard_packets(ctx: dict) -> dict:
    """auto fn: build_storyboard_packets
    输入：storyboard(Table) + styleBible(Document, 可选)
    输出：packets(Prompt[], array) —— 每镜一个提示词包
    """
    storyboard = ctx["inputs"].get("storyboard") or {}
    rows = storyboard.get("rows", [])
    packets = []
    for i, row in enumerate(rows):
        desc = (
            row.get("sceneDescription")
            or row.get("画面描述")
            or row.get("description")
            or ""
        )
        packets.append(
            {
                "index": i,
                "text": f"广告分镜 {i + 1}：{desc}",
                "negativePrompt": "",
                "variables": {"shotIndex": i},
                "seed": row.get("seed"),
            }
        )
    return {"packets": packets}


async def package_output(ctx: dict) -> dict:
    """auto fn: package_output
    输入：storyboard(Table) + images(Image[], 可选)
    输出：package(Document) —— 交付包 markdown
    """
    storyboard = ctx["inputs"].get("storyboard") or {}
    images = ctx["inputs"].get("images") or []
    rows = storyboard.get("rows", [])
    lines = ["# 交付包", "", f"- 镜头数：{len(rows)}", f"- 图片数：{len(images)}", ""]
    for i, row in enumerate(rows):
        lines.append(f"## 镜头 {i + 1}")
        lines.append(f"- 画面描述：{row.get('sceneDescription', '')}")
        lines.append(f"- 对白：{row.get('dialogue', '') or '—'}")
        lines.append("")
    return {
        "package": {
            "id": f"pkg-{uuid.uuid4().hex[:8]}",
            "title": "交付包",
            "markdown": "\n".join(lines),
        }
    }


# ---------------------------------------------------------------------------
# chat / review / generator：P0 占位，P1/P2 接入真实模型
# ---------------------------------------------------------------------------


def _placeholder_document(node_id: str, port_name: str, label: str, note: str) -> dict:
    return {
        "id": f"{node_id}-{port_name}",
        "title": label,
        "markdown": f"（{note}）",
    }


async def chat_default(node, ndef: NodeDef, inputs: dict) -> dict:
    """Chat 节点：从该节点会话取最新产物快照（由聊天面板对话产出）。

    未开聊/无产物时返回占位文档，提示打开聊天面板。P1 起接入 LangChain。
    """
    from ..chat.session import sessions

    session = sessions.by_node(node.id)
    products = session.products if session else {}
    out: dict[str, Any] = {}
    for o in ndef.outputs:
        label = o.label or o.name
        if o.name in products and products[o.name] is not None:
            out[o.name] = products[o.name]
        elif o.type == "Document":
            out[o.name] = _placeholder_document(
                node.id, o.name, label,
                f"{ndef.name} 的「{label}」— 点击节点打开聊天面板，对话后自动产出",
            )
        elif o.type == "Table":
            out[o.name] = {
                "columns": [
                    {"key": "sceneDescription", "label": "画面描述", "type": "text"},
                    {"key": "durationSec", "label": "时长", "type": "number"},
                    {"key": "dialogue", "label": "对白", "type": "text"},
                ],
                "rows": [],
            }
        else:
            out[o.name] = None
    return out


async def review_default(node, ndef: NodeDef, inputs: dict) -> dict:
    """P0 占位：默认批准（approve）。"""
    return {"decision": {"approved": True, "reason": "（P0 占位自动通过；P5 接入审查交互）"}}


async def generator_default(node, ndef: NodeDef, inputs: dict) -> dict:
    """Generator 节点：按提示词包逐镜生成图片（P2）。

    图片后端：providers/image_adapter.get_image_backend ——
    Mock（离线 SVG 占位，自动登记为资产 Revision）或 Real（配 key 后）。
    """
    packets = inputs.get("packets") or []
    provider_id = ndef.providerId or ""
    model_id = ndef.modelId or ""
    from ..providers.image_adapter import get_image_backend

    backend = get_image_backend(provider_id, model_id)
    images: list[dict] = []
    seed_in = inputs.get("seed") or {}
    base_seed = seed_in.get("seed") if isinstance(seed_in, dict) else None
    for i, p in enumerate(packets):
        if isinstance(p, dict):
            prompt = p.get("text") or p.get("prompt") or ""
        else:
            prompt = str(p)
        opts = dict(ndef.params or {})
        seed = None
        if isinstance(p, dict):
            seed = p.get("seed")
        opts["seed"] = seed if seed is not None else (base_seed if base_seed is not None else i)
        results = backend.generate(prompt, opts)
        images.extend(results or [])
    return {
        "images": images,
        "seed": {"seed": base_seed if base_seed is not None else 0, "note": "P2 图片生成已完成"},
    }


async def asset_default(node, ndef: NodeDef, inputs: dict) -> dict:
    """Asset 节点（P2）：透传上游图片作为资产 head；也支持人工导入（见主要上传 API）。

    版本化在 generator 内部登记 asset 时已发生；这里对输入图片再登记一次
    为新资产（按 assetId 维度），使 asset 节点成为独立的"资产库"入口。
    """
    images = inputs.get("images") or []
    return {"head": images}


# ---------------------------------------------------------------------------
# 注册表
# ---------------------------------------------------------------------------

_BUILDERS: dict[str, Callable[..., Awaitable[dict]]] = {
    "build_storyboard_packets": build_storyboard_packets,
    "package_output": package_output,
}


async def run_build(node, ndef: NodeDef, inputs: dict) -> dict:
    """按节点定义分发到具体 builder。"""
    if ndef.kind == "auto":
        if not ndef.fn:
            raise ValueError(f"auto 节点缺少 fn: {ndef.id}")
        builder = _BUILDERS.get(ndef.fn)
        if not builder:
            raise ValueError(f"未注册的 fn: {ndef.fn}")
        return await builder({"nodeId": node.id, "inputs": inputs})
    if ndef.kind == "chat":
        return await chat_default(node, ndef, inputs)
    if ndef.kind == "review":
        return await review_default(node, ndef, inputs)
    if ndef.kind == "generator":
        return await generator_default(node, ndef, inputs)
    if ndef.kind == "memory":
        # P1：返回空记忆句柄（P1.5 接入真实会话记忆聚合）
        return {
            o.name: {"sessionId": f"mem-{node.id}", "messages": []}
            for o in ndef.outputs
        }
    if ndef.kind == "asset":
        return await asset_default(node, ndef, inputs)
    # table 等：P0 暂为被动数据节点，直接透传 data
    return {o.name: inputs.get(o.name) for o in ndef.outputs if o.name in inputs}
