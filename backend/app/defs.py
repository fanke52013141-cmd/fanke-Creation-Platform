"""节点定义注册表：以根目录 node-defs.json 为单一事实来源。

加新节点 = 在 node-defs.json 加一项 + 在 nodes/runtime.py 注册 build 函数。
前端与后端都从这里读取，不存在"UI 写一遍、运行时写一遍"。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .types import NodeDef

_ROOT = Path(__file__).resolve().parents[2]  # backend/ -> 项目根
_DEFS_PATH = _ROOT / "node-defs.json"


@lru_cache(maxsize=1)
def load_node_defs() -> dict[str, NodeDef]:
    """返回 {nodeDefId: NodeDef}。"""
    if not _DEFS_PATH.exists():
        raise FileNotFoundError(f"node-defs.json 不存在: {_DEFS_PATH}")
    with open(_DEFS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    defs: dict[str, NodeDef] = {}
    for item in data.get("nodes", []):
        nd = NodeDef.model_validate(item)
        defs[nd.id] = nd
    return defs


@lru_cache(maxsize=1)
def artifact_types() -> list[str]:
    with open(_DEFS_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return list(data.get("artifactTypes", []))
