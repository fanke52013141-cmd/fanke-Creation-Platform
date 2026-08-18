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

    分镜节点（editorHint='storyboard'）优先使用 node.data 手动编辑的 storyboardData，
    否则回退到会话产物。这样手动编辑和 LLM 生成可共存。
    """
    from ..chat.session import sessions

    out: dict[str, Any] = {}

    # 分镜节点：优先手动编辑数据
    if ndef.editorHint == "storyboard":
        storyboard_data = node.data.get("storyboardData") if isinstance(node.data, dict) else None
        if storyboard_data and isinstance(storyboard_data, dict):
            for o in ndef.outputs:
                if o.name == "storyboard" and storyboard_data.get("rows"):
                    out[o.name] = {"columns": storyboard_data.get("columns", [
                        {"key": "sceneDescription", "label": "画面描述", "type": "text"},
                        {"key": "durationSec", "label": "时长", "type": "number"},
                        {"key": "cameraAngle", "label": "机位", "type": "text"},
                        {"key": "dialogue", "label": "对白", "type": "text"},
                    ]), "rows": storyboard_data.get("rows", [])}
                else:
                    out[o.name] = None
            return out

    session = sessions.by_node(node.id)
    products = session.products if session else {}
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
    """Review 节点：优先读 node.data.reviewDecision（前端审批面板写入）。

    有 decision → 透传；无 → 返回"待审批"占位。
    """
    # 从 node.data 读审批决策（前端 ReviewPanel 写入）
    review_data = node.data.get("reviewDecision") if isinstance(node.data, dict) else None
    if review_data and isinstance(review_data, dict):
        approved = review_data.get("approved", False)
        reason = review_data.get("reason", "")
        return {"decision": {"approved": approved, "reason": reason}}
    # 无决策 → 待审批占位
    return {"decision": {"approved": None, "reason": "（待审批）"}}


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
    """按节点定义分发到具体 builder。

    支持：
    - kind='chat': 通用对话（从会话取产物）
    - kind='review': 审批（从 node.data.reviewDecision 取决策）
    - kind='text': 文本容器（透传 data.content）
    - kind='code': Python 代码执行
    - kind='auto': 内置函数（向后兼容）
    - kind='generator': 图片生成（向后兼容）
    - 动态端口节点：从 node.data.ports 获取输出定义
    """
    # 动态端口节点：从 node.data.ports 读取输出定义
    if ndef.dynamicPorts:
        ports = node.data.get("ports", {}) if isinstance(node.data, dict) else {}
        outputs_def = ports.get("outputs", [])
    else:
        outputs_def = ndef.outputs

    if ndef.kind == "auto":
        if not ndef.fn:
            raise ValueError(f"auto 节点缺少 fn: {ndef.id}")
        builder = _BUILDERS.get(ndef.fn)
        if not builder:
            raise ValueError(f"未注册的 fn: {ndef.fn}")
        return await builder({"nodeId": node.id, "inputs": inputs})
    if ndef.kind == "chat":
        result = await chat_default(node, ndef, inputs)
        # 动态端口：只返回 outputs_def 中定义的端口
        if ndef.dynamicPorts:
            return {o["name"]: result.get(o["name"]) for o in outputs_def}
        return result
    if ndef.kind == "review":
        result = await review_default(node, ndef, inputs)
        if ndef.dynamicPorts:
            return {o["name"]: result.get(o["name"]) for o in outputs_def}
        return result
    if ndef.kind == "generator":
        result = await generator_default(node, ndef, inputs)
        return result
    if ndef.kind == "memory":
        result = {o.name: {"sessionId": f"mem-{node.id}", "messages": []} for o in ndef.outputs}
        return result
    if ndef.kind == "asset":
        return await asset_default(node, ndef, inputs)
    if ndef.kind == "text":
        # 文本节点：从 data.content 取文本，或从上游输入取
        if isinstance(node.data, dict):
            content = node.data.get("content", node.data.get("text", ""))
        else:
            content = inputs.get("content", "")
        return {"content": {"id": f"{node.id}-text", "title": "文本", "markdown": str(content)}}
    if ndef.kind == "code":
        return await code_default(node, ndef, inputs, outputs_def)

    # 其他（透传）
    out_names = [o["name"] if isinstance(o, dict) else o.name for o in outputs_def]
    return {n: inputs.get(n) for n in out_names if n in inputs}


async def code_default(node, ndef: NodeDef, inputs: dict, outputs_def: list) -> dict:
    """代码执行节点。运行 Python 代码，注入 inputs 变量，读取 output 变量。"""
    code = node.data.get("code", "") if isinstance(node.data, dict) else ""
    if not code:
        code = ndef.code or ""
    if not code:
        return {o["name"]: None for o in outputs_def}

    # 准备执行环境
    import io
    import sys
    import json

    local_vars = {
        "inputs": inputs,
        "output": None,
        "json": json,
        "__builtins__": __builtins__,
    }

    try:
        exec(code, local_vars)
    except Exception as exc:
        return {o["name"]: {"error": f"{type(exc).__name__}: {exc}"} for o in outputs_def}

    output = local_vars.get("output")
    if output is None:
        return {o["name"]: None for o in outputs_def}
    if isinstance(output, dict):
        return {o["name"]: output.get(o["name"]) for o in outputs_def}
    # 单值输出
    if outputs_def:
        return {outputs_def[0]["name"]: output}
    return {}
