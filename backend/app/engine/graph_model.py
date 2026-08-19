"""图模型（v2.1 定稿）—— 与 frontend/src/engine/graph-model.ts 同构。

核心职责：
1. 从数据引用和控制链接推导拓扑序
2. 从 drive 控制链接计算循环体闭包
3. 环检测
4. V1-V14 校验
"""
from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from ..types import Graph, NodeInstance, NodeManifest, ControlLink, RefIssue

# ============ 引用解析 ============


def parse_ref(input_str: str) -> dict | None:
    """解析 "{{nodeId.a.b[0].c}}" 为 {nodeId, path}。"""
    import re
    m = re.match(r"^\{\{([^.]+)\.(.+)\}\}$", input_str)
    if not m:
        return None
    node_id = m.group(1)
    # 路径解析：a.b[0].c → ["a", "b", "0", "c"]
    path = re.split(r"\.(?=[^\[\]]*(?:\[|$))|\[|\]", m.group(2))
    path = [p for p in path if p]
    return {"node_id": node_id, "path": path}


def resolve_ref(ref: dict, graph: Graph) -> Any:
    """沿 nodeState.outputs 按路径取值。"""
    node = next((n for n in graph.nodes if n.id == ref["node_id"]), None)
    if not node or not node.state or not node.state.outputs:
        return None
    value = node.state.outputs
    for segment in ref["path"]:
        if value is None:
            return None
        if isinstance(value, dict):
            value = value.get(segment)
        elif isinstance(value, list):
            try:
                value = value[int(segment)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return value


# ============ 拓扑排序（Kahn） ============


def derive_ref_edges(graph: Graph) -> list[tuple[str, str]]:
    """从数据引用推导有向边。"""
    edges: list[tuple[str, str]] = []
    for node in graph.nodes:
        for param_name, source in node.inputs.items():
            sources = source if isinstance(source, list) else [source]
            for src in sources:
                if isinstance(src, dict) and src.get("kind") == "ref" and src.get("node_id"):
                    edges.append((src["node_id"], node.id))
    return edges


def topological_layers(graph: Graph) -> tuple[list[list[str]], list[str]]:
    """Kahn 算法：返回 (拓扑层, 环内节点)。"""
    edges = _derive_edges(graph)
    indeg: dict[str, int] = {n.id: 0 for n in graph.nodes}
    adj: dict[str, list[str]] = defaultdict(list)
    for s, t in edges:
        if s in indeg and t in indeg:
            adj[s].append(t)
            indeg[t] += 1

    queue = deque(n for n in indeg if indeg[n] == 0)
    layers: list[list[str]] = []
    remaining = set(indeg.keys())

    while queue:
        layer = list(queue)
        layers.append(layer)
        queue.clear()
        for n in layer:
            remaining.discard(n)
            for m in adj[n]:
                indeg[m] -= 1
                if indeg[m] == 0 and m in remaining:
                    queue.append(m)

    cycle_nodes = sorted(remaining)
    return layers, cycle_nodes


# ============ drive 闭包（循环体确定） ============


def resolve_body(loop_node: NodeInstance, graph: Graph, link: ControlLink) -> list[NodeInstance]:
    """从 drive 链接目标出发，沿数据引用向下找传递闭包（循环体）。"""
    node_map = {n.id: n for n in graph.nodes}
    downstream: set[str] = set()
    frontier = {link.target}
    while frontier:
        next_: set[str] = set()
        for f_id in frontier:
            if f_id in downstream or f_id == loop_node.id:
                continue
            downstream.add(f_id)
            # 谁引用了 f_id 的输出？
            for n in graph.nodes:
                if n.id in downstream or n.id == loop_node.id:
                    continue
                for param_name, source in n.inputs.items():
                    sources = source if isinstance(source, list) else [source]
                    for src in sources:
                        if isinstance(src, dict) and src.get("kind") == "ref" and src.get("node_id") == f_id:
                            next_.add(n.id)
        frontier = next_

    result = [node_map[link.target]]
    for id_ in sorted(downstream):
        if id_ != link.target:
            n = node_map.get(id_)
            if n:
                result.append(n)
    return result


# ============ 校验规则 V1-V14 ============


def validate_graph(graph: Graph, registry: dict[str, NodeManifest]) -> list[RefIssue]:
    """执行全部校验规则，返回问题列表。"""
    issues: list[RefIssue] = []
    node_map = {n.id: n for n in graph.nodes}

    # V1: 数据引用的 nodeId 必须存在
    for node in graph.nodes:
        for param_name, source in node.inputs.items():
            sources = source if isinstance(source, list) else [source]
            for src in sources:
                if isinstance(src, dict) and src.get("kind") == "ref" and src.get("node_id"):
                    if src["node_id"] not in node_map:
                        issues.append(RefIssue(
                            level="error", rule="V1",
                            message=f"节点 {node.id} 的参数 {param_name} 引用了不存在的节点 {src['node_id']}",
                            node_id=node.id,
                        ))

    # V2: outputPath 必须有效
    for node in graph.nodes:
        for param_name, source in node.inputs.items():
            sources = source if isinstance(source, list) else [source]
            for src in sources:
                if isinstance(src, dict) and src.get("kind") == "ref" and src.get("node_id") and src.get("output_path"):
                    target = node_map.get(src["node_id"])
                    if not target:
                        continue
                    manifest = registry.get(target.manifest_id)
                    if not manifest:
                        continue
                    all_outputs = list(manifest.outputs)
                    if target.param_schemas and target.param_schemas.get("outputs"):
                        all_outputs.extend(target.param_schemas["outputs"])
                    import re
                    top_key = re.sub(r"\[\d+\]", "", src["output_path"].split(".")[0])
                    if not top_key:
                        continue
                    exists = any(o.name == top_key for o in all_outputs)
                    if not exists:
                        issues.append(RefIssue(
                            level="error", rule="V2",
                            message=f"节点 {node.id} 引用 {src['node_id']}.{src['output_path']}，但该节点没有输出参数 \"{top_key}\"",
                            node_id=node.id,
                        ))

    # V6: drive 只能从 loop 发出
    for link in graph.links:
        if link.kind == "drive":
            node = node_map.get(link.source)
            if node and node.manifest_id != "loop":
                issues.append(RefIssue(
                    level="error", rule="V6",
                    message=f"drive 控制链接只能从 loop 节点发出，但 {link.source} 是 {node.manifest_id} 类型",
                    node_id=link.source,
                ))

    # V7: drive 目标及闭包内禁 interactive
    for link in graph.links:
        if link.kind == "drive":
            loop_node = node_map.get(link.source)
            if not loop_node:
                continue
            body = resolve_body(loop_node, graph, link)
            for bn in body:
                m = registry.get(bn.manifest_id)
                if m and m.execution == "interactive":
                    issues.append(RefIssue(
                        level="error", rule="V7",
                        message=f"循环体包含 interactive 节点 {bn.name}（{bn.id}），不允许",
                        node_id=bn.id,
                    ))

    # V8: drive 闭包不得含 loop 自身
    for link in graph.links:
        if link.kind == "drive":
            loop_node = node_map.get(link.source)
            if not loop_node:
                continue
            body = resolve_body(loop_node, graph, link)
            if any(b.id == link.source for b in body):
                issues.append(RefIssue(
                    level="error", rule="V8",
                    message=f"loop 节点 {link.source} 的 drive 闭包包含自身",
                    node_id=link.source,
                ))

    # V9: rerun 只能从 branch 发出，目标存在
    for link in graph.links:
        if link.kind == "rerun":
            node = node_map.get(link.source)
            if node and node.manifest_id != "branch":
                issues.append(RefIssue(
                    level="error", rule="V9",
                    message=f"rerun 控制链接只能从 branch 节点发出，但 {link.source} 是 {node.manifest_id} 类型",
                    node_id=link.source,
                ))
            if link.target not in node_map:
                issues.append(RefIssue(
                    level="error", rule="V9",
                    message=f"rerun 目标 {link.target} 不存在",
                    node_id=link.source,
                ))

    # V10: rerun 不得指向自身下游
    for link in graph.links:
        if link.kind == "rerun":
            layers, _ = topological_layers(graph)
            layer_of: dict[str, int] = {}
            for i, layer in enumerate(layers):
                for nid in layer:
                    layer_of[nid] = i
            from_layer = layer_of.get(link.source, -1)
            to_layer = layer_of.get(link.target, -1)
            if to_layer >= from_layer and to_layer != -1:
                issues.append(RefIssue(
                    level="error", rule="V10",
                    message=f"rerun 目标 {link.target} 不在上游（层 {to_layer} >= {from_layer} 的 {link.source}）",
                    node_id=link.source,
                ))

    # V11: group 成员不得含自身
    for node in graph.nodes:
        if node.manifest_id == "group":
            members = node.config.get("memberIds", []) if isinstance(node.config, dict) else []
            if node.id in members:
                issues.append(RefIssue(
                    level="error", rule="V11",
                    message=f"group 节点 {node.id} 包含自身作为成员",
                    node_id=node.id,
                ))

    # V13: Loop.count ≤ maxIterations
    for node in graph.nodes:
        if node.manifest_id == "loop":
            config = node.config if isinstance(node.config, dict) else {}
            count = config.get("count", 0)
            max_iter = config.get("maxIterations", 100)
            if isinstance(count, (int, float)) and isinstance(max_iter, (int, float)) and count > max_iter:
                issues.append(RefIssue(
                    level="error", rule="V13",
                    message=f"loop 节点 {node.id} 的 count({count}) 超过 maxIterations({max_iter})",
                    node_id=node.id,
                ))

    # V12: 模板引用的 manifestId 必须在注册表中（启动断言，此处不重复）

    return issues