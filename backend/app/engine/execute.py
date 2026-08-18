"""执行引擎：拓扑分层 + 每层并发 + 按节点缓存 + 环检测（仿 LangFlow Graph.process）。

P0 阶段：
- auto 节点（build_storyboard_packets / package_output）真实执行；
- chat / review / generator 节点由 runtime 占位，P1/P2 接入真实模型后替换。
"""
from __future__ import annotations

import asyncio
import hashlib
import json

from ..defs import load_node_defs
from ..nodes.runtime import run_build
from ..types import Graph
from .layers import topological_layers


def _cache_key(node_type_id: str, inputs: dict) -> str:
    blob = json.dumps(
        {"type": node_type_id, "inputs": inputs},
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


async def execute(graph: Graph) -> dict[str, dict]:
    """执行画布图，返回 {nodeId: 产出物}。

    缓存策略：按 (节点类型 + 输入内容 hash) 缓存；环内节点自动关闭缓存
    （避免死循环读旧值）；控制流（review 回流）不走缓存层。
    """
    defs = load_node_defs()
    node_ids = [n.id for n in graph.nodes]
    edges = [(e.source, e.target) for e in graph.edges]
    layers, cycle_nodes = topological_layers(node_ids, edges)

    results: dict[str, dict] = {}
    cache: dict[str, dict] = {}

    for layer in layers:
        await asyncio.gather(
            *[
                _run_node(n, graph, results, cache, cycle_nodes, defs)
                for n in graph.nodes
                if n.id in layer
            ]
        )

    # 环内节点：层执行结束后补跑一次（确定性首次执行）
    if cycle_nodes:
        await asyncio.gather(
            *[
                _run_node(n, graph, results, cache, set(), defs)
                for n in graph.nodes
                if n.id in cycle_nodes and n.id not in results
            ]
        )

    return results


async def _run_node(
    node,
    graph: Graph,
    results: dict[str, dict],
    cache: dict[str, dict],
    cycle_nodes: set[str],
    defs: dict,
) -> None:
    nid = node.id
    ndef = defs.get(node.nodeTypeId)
    if not ndef:
        results[nid] = {"error": f"unknown node def: {node.nodeTypeId}"}
        return

    # 1) 解析上游输入
    inputs: dict = {}
    for port in ndef.inputs:
        if not port.isConnection:
            # 参数字段从节点 data 取
            inputs[port.name] = node.data.get(port.name, port.defaultValue)
            continue
        vals = [
            results[e.source].get(e.sourcePort)
            for e in graph.edges
            if e.target == nid and e.targetPort == port.name and e.source in results
        ]
        vals = [v for v in vals if v is not None]
        if port.array:
            inputs[port.name] = vals
        else:
            inputs[port.name] = vals[0] if vals else None
        if port.required and not vals:
            results[nid] = {"error": f"缺少必需输入: {port.label or port.name}"}
            return

    # 2) 缓存命中？
    key = _cache_key(node.nodeTypeId, inputs)
    if nid not in cycle_nodes and key in cache:
        results[nid] = cache[key]
        return

    # 3) 调 build
    try:
        out = await run_build(node, ndef, inputs)
        results[nid] = out
        if nid not in cycle_nodes:
            cache[key] = out
    except Exception as exc:  # noqa: BLE001
        results[nid] = {"error": f"{type(exc).__name__}: {exc}"}
