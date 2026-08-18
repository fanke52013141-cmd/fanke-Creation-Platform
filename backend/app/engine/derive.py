"""自动派生连线（流程图模式）：按类型匹配自动连线。"""
from __future__ import annotations

from ..defs import load_node_defs
from ..types import Edge, GraphNode
from .connections import type_is_compatible


def derive_edges(nodes: list[GraphNode]) -> list[Edge]:
    """输入画布上的节点实例列表，按 inputs/outputs 类型 + 语义标签派生实例级连线。

    规则（与前端 derive.ts 同构）：
    - 只连 isConnection 的输入口；
    - 源输出类型与目标输入类型兼容（含迁移表）；
    - 目标输入口声明了 accepts 时，源输出口的 provides 必须与其有交集
      （语义匹配，避免 Document 泛类型乱连）；未声明 accepts 的口不自动连。
    - 跳过自连（同一实例）。
    """
    defs = load_node_defs()
    out: list[Edge] = []
    for tgt in nodes:
        tdef = defs.get(tgt.nodeTypeId)
        if not tdef:
            continue
        for ip in tdef.inputs:
            if not ip.isConnection or not ip.accepts:
                continue
            for src in nodes:
                if src.id == tgt.id:
                    continue
                sdef = defs.get(src.nodeTypeId)
                if not sdef:
                    continue
                for op in sdef.outputs:
                    if type_is_compatible(op.type, [ip.type]) and set(op.provides) & set(ip.accepts):
                        out.append(
                            Edge(
                                source=src.id,
                                sourcePort=op.name,
                                target=tgt.id,
                                targetPort=ip.name,
                                via=ip.type,
                            )
                        )
    return out
