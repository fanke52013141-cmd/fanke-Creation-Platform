"""拓扑分层：把图按依赖关系分成可并发执行的层（Kahn 算法）。

返回 (layers, cycle_nodes)：
- layers: list[list[nodeId]]，同层节点互不依赖、可并发执行；
- cycle_nodes: 环内（及被环阻塞）的节点 id，需标记为"环内、关闭缓存"。
"""
from __future__ import annotations

from collections import defaultdict, deque


def topological_layers(
    node_ids: list[str],
    edges: list[tuple[str, str]],
) -> tuple[list[list[str]], list[str]]:
    indeg: dict[str, int] = {n: 0 for n in node_ids}
    adj: dict[str, list[str]] = defaultdict(list)
    for s, t in edges:
        if s in indeg and t in indeg:
            adj[s].append(t)
            indeg[t] += 1

    queue: deque[str] = deque(n for n in node_ids if indeg[n] == 0)
    layers: list[list[str]] = []
    remaining: set[str] = set(node_ids)

    while queue:
        layer = list(queue)
        layers.append(layer)
        next_queue: deque[str] = deque()
        for n in layer:
            remaining.discard(n)
            for m in adj[n]:
                indeg[m] -= 1
                if indeg[m] == 0 and m in remaining:
                    next_queue.append(m)
        queue = next_queue

    cycle_nodes = sorted(remaining)
    return layers, cycle_nodes
