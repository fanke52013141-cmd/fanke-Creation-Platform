"""执行引擎（v2.1）：新 Graph 格式（nodes + links + ref 解析）。

与 frontend/src/engine/execute.ts 同构。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any

from ..registry import get_manifest, get_builder, resolve_node_manifest, load_all_manifests
from ..types import Graph, NodeInstance, NodeManifest, NodeState
from .graph_model import topological_layers, resolve_body, derive_ref_edges
from .ref_engine import resolve_node_inputs, resolve_ref, parse_ref

# ============ 缓存 ============

_cache: dict[str, Any] = {}


def _cache_key(manifest: NodeManifest, config: dict, resolved_inputs: dict) -> str:
    blob = json.dumps(
        {"type": manifest.id, "config": config, "inputs": resolved_inputs},
        sort_keys=True, ensure_ascii=False, default=str,
    )
    return "kv:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ============ 主入口 ============


async def execute(graph: Graph) -> dict[str, Any]:
    """执行画布图，返回 {nodeId: {outputs, status, error}}。

    1. 拓扑排序（数据引用边）
    2. 逐层并发执行 instant 节点
    3. interactive 节点挂起
    4. 循环体展开执行
    5. 缓存 + 过期
    """
    _node_states: dict[str, dict[str, Any]] = {}
    _manifests = load_all_manifests()

    # 构建数据引用边
    ref_edges = derive_ref_edges(graph)
    node_ids = [n.id for n in graph.nodes]
    edge_list = [(s, t) for s, t in ref_edges]
    layers, _ = topological_layers(node_ids, edge_list)

    # 确定 body 节点（循环体内的节点，应被循环引擎控制而非拓扑序执行）
    body_node_ids: set[str] = set()
    for link in graph.links:
        if link.kind == "drive":
            loop_node = next((n for n in graph.nodes if n.id == link.source), None)
            if loop_node:
                body = resolve_body(loop_node, graph, link)
                for bn in body:
                    body_node_ids.add(bn.id)

    # 执行（跳过 body 节点，它们由循环引擎单独控制）
    for layer in layers:
        await asyncio.gather(*[
            _run_node(n, graph, _node_states, _manifests, body_node_ids)
            for n in graph.nodes if n.id in layer and n.id not in body_node_ids
        ])

    return _node_states


async def _run_node(
    node: NodeInstance,
    graph: Graph,
    node_states: dict,
    manifests: dict[str, NodeManifest],
    body_node_ids: set[str],
) -> None:
    nid = node.id
    manifest = get_manifest(node.manifest_id)
    if not manifest:
        node_states[nid] = {"status": "error", "error": f"未知 manifestId: {node.manifest_id}"}
        return

    # interactive 节点 → 挂起
    if manifest.execution == "interactive":
        node_states[nid] = {"status": "awaiting-human", "outputs": {}}
        return

    # 解析输入
    resolved_inputs = resolve_node_inputs(node, graph, node_states, manifests)

    # 检查必填参数
    for inp in manifest.inputs:
        if inp.required:
            val = resolved_inputs.get(inp.name)
            if val is None:
                node_states[nid] = {"status": "skipped", "outputs": {"_skipped": f"缺少必填输入: {inp.label}"}}
                return

    # 缓存检查
    ck = _cache_key(manifest, node.config, resolved_inputs)
    if ck in _cache:
        node_states[nid] = {"status": "cached", "outputs": _cache[ck]}
        return

    # 执行
    node_states[nid] = {"status": "running"}
    try:
        # loop/branch 走 execute.py 的完整逻辑，不走 builder 的简化版
        if manifest.kind == "loop":
            outputs = await _execute_loop(node, graph, manifest, node_states, manifests)
        elif manifest.kind == "branch":
            outputs = await _execute_branch(node, manifest, resolved_inputs)
        else:
            builder = get_builder(node.manifest_id)
            if builder:
                outputs = await builder(node, manifest, resolved_inputs, node_states)
            elif manifest.kind == "process":
                outputs = await _mock_process(node, manifest, resolved_inputs)
            elif manifest.kind == "generator":
                outputs = await _mock_generator(node, manifest, resolved_inputs)
            elif manifest.kind == "data":
                outputs = resolved_inputs
            elif manifest.kind == "code":
                outputs = {"output": "// 代码节点（MVP 占位）"}
            else:
                outputs = resolved_inputs

        node_states[nid] = {"status": "done", "outputs": outputs}
        _cache[ck] = outputs
    except Exception as exc:
        node_states[nid] = {"status": "error", "error": f"{type(exc).__name__}: {exc}"}


# ============ Mock 执行器 ============


async def _mock_process(node: NodeInstance, manifest: NodeManifest, inputs: dict) -> dict:
    """Mock 处理节点：返回占位输出。"""
    out = {}
    for o in manifest.outputs:
        if o.semantic == "decision":
            out[o.name] = {"approved": True, "reason": "Mock 审查通过"}
        else:
            out[o.name] = {"id": f"{node.id}-{o.name}", "title": f"Mock {o.label}", "markdown": f"（Mock 处理结果：{o.label}）"}
    # 实例级 paramSchemas 的输出
    if node.param_schemas and node.param_schemas.get("outputs"):
        for ps in node.param_schemas["outputs"]:
            if ps.semantic == "decision":
                out[ps.name] = {"approved": True, "reason": "Mock 审查通过"}
            else:
                out[ps.name] = {"id": f"{node.id}-{ps.name}", "title": f"Mock {ps.label}", "markdown": f"（Mock 处理结果：{ps.label}）"}
    return out


async def _mock_generator(node: NodeInstance, manifest: NodeManifest, inputs: dict) -> dict:
    """Mock 生成节点：返回占位 SVG 图片。"""
    prompt = inputs.get("prompt", "mock prompt")
    count = node.config.get("count", 1)
    images = []
    for i in range(count):
        images.append({
            "id": f"{node.id}-img-{i}",
            "url": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTBlMGUwIi8+PHRleHQgeD0iMTI4IiB5PSIxMjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIGZpbGw9IiM5OTkiIGZvbnQtc2l6ZT0iMTQiPk1vY2sgSW1hZ2U8L3RleHQ+PC9zdmc+",
            "width": 256,
            "height": 256,
            "mime": "image/svg+xml",
            "prompt": str(prompt)[:50],
        })
    return {"images": images, "seed": 42}


# ============ 循环引擎 ============


async def _execute_loop(
    loop_node: NodeInstance,
    graph: Graph,
    manifest: NodeManifest,
    node_states: dict,
) -> dict:
    """执行循环（有界迭代）。"""
    # 找 drive 链接
    drive_links = [l for l in graph.links if l.source == loop_node.id and l.kind == "drive"]
    if not drive_links:
        return {"output": []}

    link = drive_links[0]
    body = resolve_body(loop_node, graph, link)

    mode = loop_node.config.get("mode", "count")
    count = loop_node.config.get("count", 1)
    max_iter = loop_node.config.get("maxIterations", 100)
    execution = loop_node.config.get("execution", "serial")
    parallel_limit = loop_node.config.get("parallelLimit", 3)
    prompts_text = loop_node.config.get("prompts", "")

    # 确定迭代轮次
    if mode == "count":
        rounds = list(range(count))
    elif mode == "iterate-prompts":
        prompts = [p.strip() for p in prompts_text.split("\n") if p.strip()]
        rounds = prompts
        if len(rounds) > max_iter:
            return {"output": {"error": f"提示词列表长度 {len(rounds)} 超过 maxIterations={max_iter}"}}
    else:
        raise NotImplementedError(f"mock 暂不支持 {mode} 模式")

    results = []
    total_rounds = len(rounds)

    if execution == "parallel":
        sem = asyncio.Semaphore(parallel_limit)
        async def run_round(i_idx, round_i_data):
            async with sem:
                return await _run_body_round(body, total_rounds, loop_node, graph, node_states, i_idx, round_i_data)
        tasks = [run_round(i, rounds[i]) for i in range(total_rounds)]
        results = await asyncio.gather(*tasks)
    else:
        for i in range(total_rounds):
            r = await _run_body_round(body, total_rounds, loop_node, graph, node_states, i, rounds[i])
            results.append(r)

    return {"output": results}


async def _run_body_round(
    body: list,
    total_rounds: int,
    loop_node: NodeInstance,
    graph: Graph,
    node_states: dict,
    round_idx: int,
    round_data: Any,
) -> dict:
    """跑一轮循环体。"""
    round_outputs = {}
    # 注入计数 token（浅拷贝 config，避免副作用污染）
    for bn in body:
        new_config = dict(bn.config)
        for key, val in bn.config.items():
            if isinstance(val, str):
                new_config[key] = val.replace("{{loop.counter}}", str(round_idx + 1)).replace("{{loop.total}}", str(total_rounds))
        bn.config = new_config

    # 执行 body 节点（拓扑序已由外部保证）
    for bn in body:
        if bn.manifest_id == "generator":
            inputs = {"prompt": str(round_data) if isinstance(round_data, str) else f"Round {round_idx}", "count": 1}
            out = await _mock_generator(bn, get_manifest(bn.manifest_id), inputs)
            node_states[bn.id] = {"status": "done", "outputs": out}
            round_outputs[bn.id] = out
        elif bn.manifest_id == "process":
            inputs = {"input": round_data}
            manifest = get_manifest(bn.manifest_id)
            out = await _mock_process(bn, manifest, inputs)
            node_states[bn.id] = {"status": "done", "outputs": out}
            round_outputs[bn.id] = out
        else:
            node_states[bn.id] = {"status": "done", "outputs": {"output": round_data}}
            round_outputs[bn.id] = {"output": round_data}

    return round_outputs


# ============ 分支引擎 ============


async def _execute_branch(
    node: NodeInstance,
    manifest: NodeManifest,
    inputs: dict,
) -> dict:
    """执行分支：条件路由。"""
    condition_source = node.config.get("conditionSource", "decision-input")
    decision = inputs.get("decision", {})
    data = inputs.get("data")

    if condition_source == "decision-input":
        if isinstance(decision, dict) and decision.get("approved") is True:
            return {"then": data, "else": None}
        else:
            return {"then": None, "else": data}

    return {"then": data, "else": None}