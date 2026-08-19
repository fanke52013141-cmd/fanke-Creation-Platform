"""节点定义注册表：以 manifests/ 目录为单一事实来源。

从 manifests/*.json 加载所有节点定义，注册 builder 函数。
启动时执行 V12 断言：模板引用的 manifestId 必须在注册表中。
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .types import NodeManifest, NodeInstance

_MANIFESTS_DIR = Path(__file__).resolve().parents[2] / "manifests"


@lru_cache(maxsize=1)
def load_all_manifests() -> dict[str, NodeManifest]:
    """返回 {manifestId: NodeManifest}。"""
    manifests: dict[str, NodeManifest] = {}
    if not _MANIFESTS_DIR.exists():
        raise FileNotFoundError(f"manifests 目录不存在: {_MANIFESTS_DIR}")
    for f in sorted(_MANIFESTS_DIR.glob("*.json")):
        with open(f, encoding="utf-8") as fp:
            data = json.load(fp)
        m = NodeManifest.model_validate(data)
        manifests[m.id] = m
    return manifests


@lru_cache(maxsize=1)
def manifest_ids() -> list[str]:
    return sorted(load_all_manifests().keys())


# ============ V12 启动断言 ============


def check_v12(graph: dict[str, Any] | None = None, template_manifest_ids: list[str] | None = None) -> list[str]:
    """检查模板引用的 manifestId 是否都在注册表中。

    返回不存在的 manifestId 列表（空列表=通过）。
    """
    registered = manifest_ids()
    if template_manifest_ids is None:
        template_manifest_ids = _load_template_references()
    missing = [tid for tid in template_manifest_ids if tid not in registered]
    return missing


def _load_template_references() -> list[str]:
    """从 templates.json 提取所有 nodeTypeId 引用。"""
    templates_path = Path(__file__).resolve().parents[2] / "templates.json"
    if not templates_path.exists():
        return []
    with open(templates_path, encoding="utf-8") as f:
        data = json.load(f)
    refs: set[str] = set()
    _collect_type_ids(data, refs)
    return list(refs)


def _collect_type_ids(obj: Any, out: set[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "nodeTypeId" and isinstance(v, str):
                out.add(v)
            else:
                _collect_type_ids(v, out)
    elif isinstance(obj, list):
        for item in obj:
            _collect_type_ids(item, out)


# ============ Builder 注册表 ============


_BUILDERS: dict[str, Any] = {}


def register_builder(manifest_id: str, builder_fn: Any) -> None:
    """注册一个 builder 函数。"""
    _BUILDERS[manifest_id] = builder_fn


def get_builder(manifest_id: str) -> Any | None:
    return _BUILDERS.get(manifest_id)


def get_manifest(manifest_id: str) -> NodeManifest | None:
    return load_all_manifests().get(manifest_id)


def resolve_node_manifest(node: NodeInstance) -> NodeManifest | None:
    """获取节点实例的具体 manifest（合并实例级 paramSchemas）。"""
    base = get_manifest(node.manifest_id)
    if not base:
        return None
    if not node.param_schemas:
        return base
    # 合并实例级参数声明
    merged = base.model_copy(deep=True)
    if node.param_schemas.get("inputs"):
        merged.inputs = [
            *[p for p in merged.inputs if not any(ns.name == p.name for ns in node.param_schemas["inputs"])],
            *node.param_schemas["inputs"],
        ]
    if node.param_schemas.get("outputs"):
        merged.outputs = [
            *[p for p in merged.outputs if not any(ns.name == p.name for ns in node.param_schemas["outputs"])],
            *node.param_schemas["outputs"],
        ]
    return merged