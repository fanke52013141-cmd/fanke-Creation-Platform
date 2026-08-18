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

    # 动态端口节点：从 node.data.ports 读取端口定义
    if ndef.dynamicPorts:
        ports_data = node.data.get("ports", {}) if isinstance(node.data, dict) else {}
        input_ports = ports_data.get("inputs", [])
    else:
        input_ports = ndef.inputs

    # 1) 解析上游输入
    inputs: dict = {}
    for port in input_ports:
        # 支持 dict 或 InputPort 对象
        port_name = port["name"] if isinstance(port, dict) else port.name
        port_is_connection = port.get("isConnection", False) if isinstance(port, dict) else port.isConnection
        port_array = port.get("array", False) if isinstance(port, dict) else port.array
        port_required = port.get("required", False) if isinstance(port, dict) else port.required
        port_label = port.get("label", port_name) if isinstance(port, dict) else (port.label or port_name)
        port_default = port.get("defaultValue") if isinstance(port, dict) else port.defaultValue

        if not port_is_connection:
            inputs[port_name] = node.data.get(port_name, port_default)
            continue
        vals = [
            results[e.source].get(e.sourcePort)
            for e in graph.edges
            if e.target == nid and e.targetPort == port_name and e.source in results
        ]
        vals = [v for v in vals if v is not None]
        if port_array:
            flat: list = []
            for v in vals:
                if isinstance(v, list):
                    flat.extend(v)
                else:
                    flat.append(v)
            inputs[port_name] = flat
        else:
            inputs[port_name] = vals[0] if vals else None
        if port_required and not vals:
            results[nid] = {"error": f"缺少必需输入: {port_label}"}
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

        # 循环节点特殊处理：遍历输出列表，对每个元素驱动下游节点执行
        if ndef.kind == "loop":
            # 找下游节点（以 loop 节点为 source 的边）
            downstream = [
                (e.target, e.targetPort)
                for e in graph.edges
                if e.source == nid
            ]
            if downstream and out:
                # 取循环的第一个输出作为列表
                loop_results = None
                for val in out.values():
                    if isinstance(val, list):
                        loop_results = val
                        break
                if loop_results:
                    # 对每个输出元素，重新构建下游输入并执行
                    for item_idx, item in enumerate(loop_results):
                        for dn_id, dn_port in downstream:
                            dn_node = next((n for n in graph.nodes if n.id == dn_id), None)
                            if not dn_node:
                                continue
                            dn_def = defs.get(dn_node.nodeTypeId)
                            if not dn_def:
                                continue
                            # 为下游节点注入当前循环项
                            dn_inputs = {dn_port: item}
                            # 如果下游节点已执行过，补上它自己的其他输入
                            if dn_id in results:
                                existing = results[dn_id]
                                if isinstance(existing, dict):
                                    for k, v in existing.items():
                                        if k not in dn_inputs:
                                            dn_inputs[k] = v
                            try:
                                dn_out = await run_build(dn_node, dn_def, dn_inputs)
                                # 合并结果：如果下游节点有多个输出，按 index 合并
                                if dn_id in results:
                                    existing = results[dn_id]
                                    if isinstance(existing, dict) and isinstance(dn_out, dict):
                                        for k, v in dn_out.items():
                                            if isinstance(v, list):
                                                existing[k] = existing.get(k, []) + v
                                            else:
                                                existing[k] = v
                                else:
                                    results[dn_id] = dn_out
                            except Exception as exc2:
                                results[dn_id] = {"error": f"循环项 {item_idx}: {type(exc2).__name__}: {exc2}"}
    except Exception as exc:  # noqa: BLE001
        results[nid] = {"error": f"{type(exc).__name__}: {exc}"}
