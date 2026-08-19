"""引用解析器（v2.1）：解析 {{nodeId.outputPath}}，类型校验，扇入拼接。

与 frontend/src/engine/ref-engine.ts 同构。
"""
from __future__ import annotations

import re
from typing import Any

from ..types import NodeInstance, ParamSource, NodeManifest, Graph


def parse_ref(input_str: str) -> dict | None:
    """解析 "{{nodeId.a.b[0].c}}" 为 {nodeId, path}。"""
    m = re.match(r"^\{\{([^.]+)\.(.+)\}\}$", input_str.strip())
    if not m:
        return None
    node_id = m.group(1)
    raw_path = m.group(2)
    # 路径分割：a.b[0].c → ["a", "b", "0", "c"]
    parts = re.split(r"\.(?=[^\[\]]*(?:\[|$))|\[|\]", raw_path)
    path = [p for p in parts if p]
    return {"node_id": node_id, "path": path}


def resolve_ref(
    ref: dict,
    node_states: dict[str, dict[str, Any]],
) -> Any:
    """沿 nodeStates[nodeId].outputs 按路径取值。"""
    node_id = ref["node_id"]
    path = ref["path"]
    state = node_states.get(node_id)
    if not state:
        return None
    outputs = state.get("outputs", {})
    value = outputs
    for segment in path:
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


def resolve_node_inputs(
    node: NodeInstance,
    graph: Graph,
    node_states: dict[str, dict[str, Any]],
    registry: dict[str, NodeManifest],
) -> dict[str, Any]:
    """解析一个节点的所有输入参数。

    - 单引用 → 取值
    - 多引用扇入（list 参数）→ 按序拼接
    - 值引用 → 直接取值
    - 未提供且非必填 → None
    - 合并 manifest 与实例级 paramSchemas
    """
    manifest = registry.get(node.manifest_id)
    if not manifest:
        return {}

    # 合并参数声明
    all_inputs = list(manifest.inputs)
    if node.param_schemas and node.param_schemas.get("inputs"):
        existing_names = {p.name for p in all_inputs}
        for ps in node.param_schemas["inputs"]:
            if ps.name not in existing_names:
                all_inputs.append(ps)

    resolved: dict[str, Any] = {}
    for param in all_inputs:
        name = param.name
        raw = node.inputs.get(name)
        if raw is None:
            resolved[name] = None
            continue

        # 单引用或单值
        if isinstance(raw, dict) and raw.get("kind") == "ref":
            resolved[name] = resolve_ref(raw, node_states)
        elif isinstance(raw, dict) and raw.get("kind") == "value":
            resolved[name] = raw.get("value")
        # 多引用扇入（list 参数）
        elif isinstance(raw, list):
            values = []
            for item in raw:
                if isinstance(item, dict) and item.get("kind") == "ref":
                    v = resolve_ref(item, node_states)
                    if v is not None:
                        # 如果值是 list 且参数是 list，展平一层
                        if isinstance(v, list) and param.type == "list":
                            values.extend(v)
                        else:
                            values.append(v)
                elif isinstance(item, dict) and item.get("kind") == "value":
                    values.append(item.get("value"))
            resolved[name] = values
        else:
            resolved[name] = raw

    return resolved


def check_type(req: dict, target_schema: dict) -> str | None:
    """检查类型是否兼容。返回 None=OK，返回 str=错误信息。"""
    # TODO: 实现完整的 typeCompatible + semanticWarn（见 §4.4 规范）
    return None