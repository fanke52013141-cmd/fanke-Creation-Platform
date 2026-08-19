"""节点 runtime（v2.1）：builder 注册表。

每个节点种类一个 builder。
MVP 阶段用 mock 实现，P1/P2 接入真实 LLM/API。
"""
from __future__ import annotations

import uuid
from typing import Any

from ..registry import register_builder, get_manifest, resolve_node_manifest
from ..types import NodeInstance, NodeManifest


async def build_chat(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Chat 节点：从会话取产物（MVP 返回 mock）。"""
    from ..chat.session import sessions
    session = sessions.by_node(node.id)
    products = session.products if session else {}
    out = {}
    # manifest 输出
    for o in manifest.outputs:
        if o.name in products and products[o.name] is not None:
            out[o.name] = products[o.name]
        else:
            out[o.name] = {"id": f"{node.id}-{o.name}", "title": o.label, "markdown": f"（Mock {o.label}）"}
    # 实例级输出
    if node.param_schemas and node.param_schemas.get("outputs"):
        for ps in node.param_schemas["outputs"]:
            if ps.name in products and products[ps.name] is not None:
                out[ps.name] = products[ps.name]
            else:
                out[ps.name] = {"id": f"{node.id}-{ps.name}", "title": ps.label, "markdown": f"（Mock {ps.label}）"}
    return out


async def build_process(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Process 节点：单次 LLM 变换（MVP mock）。"""
    out = {}
    for o in manifest.outputs:
        if o.semantic == "decision":
            out[o.name] = {"approved": True, "reason": "Mock 审查通过"}
        else:
            out[o.name] = {"id": f"{node.id}-{o.name}", "title": f"Mock {o.label}", "markdown": f"（Mock 处理结果：{o.label}）"}
    if node.param_schemas and node.param_schemas.get("outputs"):
        for ps in node.param_schemas["outputs"]:
            if ps.semantic == "decision":
                out[ps.name] = {"approved": True, "reason": "Mock 审查通过"}
            else:
                out[ps.name] = {"id": f"{node.id}-{ps.name}", "title": f"Mock {ps.label}", "markdown": f"（Mock 处理结果：{ps.label}）"}
    return out


async def build_generator(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Generator 节点：图片/视频生成（MVP mock SVG）。"""
    prompt = inputs.get("prompt", "mock prompt")
    count = node.config.get("count", 1)
    images = []
    for i in range(count):
        images.append({
            "id": f"{node.id}-img-{i}",
            "url": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTBlMGUwIi8+PHRleHQgeD0iMTI4IiB5PSIxMjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTkiIGZvbnQtc2l6ZT0iMTQiPk1vY2sgSW1hZ2U8L3RleHQ+PC9zdmc+",
            "width": 256, "height": 256, "mime": "image/svg+xml",
        })
    return {"images": images, "seed": {"seed": 42}}


async def build_data(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Data 节点：透传输入。"""
    return inputs


async def build_code(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Code 节点：JS Worker 沙箱（MVP 占位）。"""
    return {"output": "// Code 节点（MVP 占位，实际执行在 Web Worker）"}


async def build_group(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Group 节点：聚合成员输出。"""
    member_ids = node.config.get("memberIds", [])
    aggregated = {}
    for mid in member_ids:
        if mid in states:
            aggregated[mid] = states[mid].get("outputs", {})
    return aggregated


async def build_loop(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Loop 节点：由 execute.py 统一处理，此处占位。"""
    return {"output": []}


async def build_branch(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Branch 节点：条件路由。"""
    condition_source = node.config.get("conditionSource", "decision-input")
    decision = inputs.get("decision", {})
    data = inputs.get("data")
    if condition_source == "decision-input":
        if isinstance(decision, dict) and decision.get("approved") is True:
            return {"then": data, "else": None}
        return {"then": None, "else": data}
    return {"then": data, "else": None}


async def build_output(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Output 节点：收集结果（MVP 透传）。"""
    return inputs


async def build_preview(node: NodeInstance, manifest: NodeManifest, inputs: dict, states: dict) -> dict:
    """Preview 节点：interactive，由挂起机制处理。"""
    # 实际由引擎挂起，这里只是示意
    return {"output": inputs.get("media")}


# ============ 注册所有 builder ============

register_builder("chat", build_chat)
register_builder("process", build_process)
register_builder("generator", build_generator)
register_builder("data", build_data)
register_builder("code", build_code)
register_builder("group", build_group)
register_builder("loop", build_loop)
register_builder("branch", build_branch)
register_builder("output", build_output)
register_builder("preview", build_preview)