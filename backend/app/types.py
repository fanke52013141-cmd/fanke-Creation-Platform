"""节点类型系统（v2.1 定稿）—— 与 frontend/src/types.ts 完全镜像。

单一事实来源：manifests/*.json。
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ============ 基础 ============

NodeKind = Literal[
    "chat", "process", "generator", "data", "code",
    "group", "loop", "branch", "output", "preview",
]

NodeCategory = Literal["core", "flow", "utility"]
ExecutionClass = Literal["instant", "interactive"]

BaseType = Literal[
    "string", "integer", "number", "boolean",
    "time", "object", "list", "file",
]

FileSubType = Literal[
    "image", "audio", "video", "document", "code", "default",
]

SemanticType = Literal[
    "prompt", "document", "decision", "shot", "storyboard", "asset-list",
]

FieldEditor = Literal[
    "text", "multiline", "number", "slider", "dropdown",
    "toggle", "file", "code", "json", "hidden",
]

# ============ 参数值来源 ============


class ParamSource(BaseModel):
    kind: str  # "value" | "ref"
    value: Optional[Any] = None
    node_id: Optional[str] = None
    output_path: Optional[str] = None


# ============ 参数 schema ============


class ParamSchema(BaseModel):
    name: str
    label: str = ""
    desc: str = ""
    required: bool = False
    type: str  # BaseType
    semantic: Optional[str] = None  # SemanticType
    file_sub_type: Optional[str] = None  # FileSubType
    items: Optional["ParamSchema"] = None
    properties: list["ParamSchema"] = Field(default_factory=list)
    default_from: Optional[ParamSource] = None
    editor: Optional[str] = None  # FieldEditor
    options: list[str] = Field(default_factory=list)


# ============ 配置字段 ============


class ConfigField(BaseModel):
    key: str
    label: str = ""
    desc: str = ""
    type: str  # BaseType
    required: bool = False
    default_value: Optional[Any] = None
    editor: str = "text"  # FieldEditor
    options: list[str] = Field(default_factory=list)
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    range_step: Optional[float] = None


# ============ Manifest（节点定义） ============


class NodeManifest(BaseModel):
    schema_version: str = "v1"
    id: str
    kind: str  # NodeKind
    name: str = ""
    name_for_model: Optional[str] = None
    description: str = ""
    icon: str = ""
    category: str = "core"  # NodeCategory
    execution: str = "instant"  # ExecutionClass
    dynamic_params: bool = False
    inputs: list[ParamSchema] = Field(default_factory=list)
    outputs: list[ParamSchema] = Field(default_factory=list)
    config: list[ConfigField] = Field(default_factory=list)


# ============ 实例状态 ============


class NodeState(BaseModel):
    status: str = "idle"  # NodeStatus
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    progress: Optional[float] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None


# ============ 实例 ============


class NodeInstance(BaseModel):
    id: str
    manifest_id: str
    name: str = ""
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    inputs: dict[str, Any] = Field(default_factory=dict)  # ParamSource | list[ParamSource]
    config: dict[str, Any] = Field(default_factory=dict)
    param_schemas: Optional[dict[str, Any]] = None  # {inputs: ParamSchema[], outputs: ParamSchema[]}
    state: Optional[NodeState] = None


# ============ 控制链接 ============


class ControlLink(BaseModel):
    source: str  # from
    target: str  # to
    kind: str  # "drive" | "rerun"
    label: Optional[str] = None


# ============ 图 ============


class Graph(BaseModel):
    schema_version: str = "2.1"
    nodes: list[NodeInstance] = Field(default_factory=list)
    links: list[ControlLink] = Field(default_factory=list)
    viewport: dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0, "zoom": 1})
    node_states: Optional[dict[str, NodeState]] = None


# ============ 校验结果 ============


class RefIssue(BaseModel):
    level: str  # "error" | "warn"
    message: str
    node_id: Optional[str] = None
    rule: Optional[str] = None