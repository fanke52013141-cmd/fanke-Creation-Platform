"""连线校验规则：前后端同一套类型匹配逻辑。

前端（frontend/src/engine/connections.ts）有同构实现，用于 React Flow 拖拽时的
isValidConnection；后端这里用于 API 兜底校验。规则必须保持一致。
"""
from __future__ import annotations

from ..defs import load_node_defs
from ..types import TYPE_MIGRATIONS


def type_is_compatible(source_type: str, target_types: list[str]) -> bool:
    """源类型是否可接入目标类型集合（含迁移表）。"""
    src = TYPE_MIGRATIONS.get(source_type, source_type)
    for t in target_types:
        tgt = TYPE_MIGRATIONS.get(t, t)
        if source_type == t or src == t or source_type == tgt or src == tgt:
            return True
    return False


def parse_handle(handle: str) -> tuple[str, str] | None:
    """把 React Flow handle id 解析成 (方向, 端口名)。格式: out-xxx / in-xxx。"""
    if not handle or "-" not in handle:
        return None
    direction, _, name = handle.partition("-")
    if direction not in ("out", "in") or not name:
        return None
    return direction, name


def is_valid_connection(
    source_type_id: str,
    source_handle: str,
    target_type_id: str,
    target_handle: str,
) -> bool:
    """类型级连线校验（后端兜底）。

    注：'单值口已有连线' 属于画布实例级状态，由前端维护；这里校验类型兼容性。
    """
    if source_type_id == target_type_id:
        # 同一节点定义（不同实例）之间也允许连线，这里不做自连判断（由前端按实例 id 判断）
        pass
    defs = load_node_defs()
    src_def = defs.get(source_type_id)
    tgt_def = defs.get(target_type_id)
    if not src_def or not tgt_def:
        return False
    src = parse_handle(source_handle)
    tgt = parse_handle(target_handle)
    if not src or not tgt:
        return False
    src_dir, src_name = src
    tgt_dir, tgt_name = tgt
    if src_dir != "out" or tgt_dir != "in":
        return False
    out_port = next((o for o in src_def.outputs if o.name == src_name), None)
    in_port = next((i for i in tgt_def.inputs if i.name == tgt_name), None)
    if out_port is None or in_port is None or not in_port.isConnection:
        return False
    return type_is_compatible(out_port.type, [in_port.type])
