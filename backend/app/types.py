"""节点类型系统：与根目录 node-defs.json（单一事实来源）对齐。

对应 HANDOFF 第 3 节：ArtifactType / BaseNode / InputPort / OutputPort。
TS 前端有同一套类型定义（frontend/src/types.ts），两侧字符串必须一致。
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

#: 所有可在连线上流动的类型（typed socket 的"形状"）
ArtifactType = Literal[
    "Message", "Document", "Prompt", "Shot", "Image", "Audio", "Video",
    "Memory", "ModelRef", "Decision", "Table", "Data",
]

NodeKind = Literal["chat", "generator", "asset", "table", "auto", "review", "memory"]

#: 类型重命名迁移表（仿 LangFlow TYPE_MIGRATIONS）。重命名类型时在这里登记，旧画布不失效。
TYPE_MIGRATIONS: dict[str, str] = {}


class InputPort(BaseModel):
    """输入插口：连线口（isConnection）或参数字段。"""

    name: str
    type: ArtifactType
    array: bool = False
    required: bool = False
    isConnection: bool = False
    label: str = ""
    description: str = ""
    editor: str = "text"  # text | multiline | dropdown | slider | number | file | toggle | hidden
    options: list[str] = Field(default_factory=list)
    defaultValue: Any = None
    #: 语义标签（自动连线用）：该输入口接受哪些语义物（如 ["brief"]）。
    #: 自动派生要求"类型兼容 AND 语义匹配"；未声明 accepts 的口不参与自动连线（只手动）。
    accepts: list[str] = Field(default_factory=list)


class OutputPort(BaseModel):
    """输出插口。"""

    name: str
    type: ArtifactType
    array: bool = False
    label: str = ""
    method: Optional[str] = None
    #: 语义标签（自动连线用）：该输出口提供哪些语义物（如 ["brief"]）。
    provides: list[str] = Field(default_factory=list)


class NodeDef(BaseModel):
    """节点定义（node-defs.json 中每一项）。"""

    id: str
    kind: NodeKind
    name: str
    icon: str = ""
    description: str = ""
    inputs: list[InputPort] = Field(default_factory=list)
    outputs: list[OutputPort] = Field(default_factory=list)
    # chat
    systemPrompt: Optional[str] = None
    model: Optional[dict[str, Any]] = None
    allowUpload: bool = False
    # auto
    fn: Optional[str] = None
    # generator
    modality: Optional[str] = None
    providerId: Optional[str] = None
    modelId: Optional[str] = None
    params: dict[str, Any] = Field(default_factory=dict)
    # review
    onRejectNodeId: Optional[str] = None
    # table
    editorHint: Optional[str] = None


class GraphNode(BaseModel):
    """画布上的节点实例（文档中序列化）。"""

    id: str
    nodeTypeId: str = Field(..., description="对应 node-defs.json 里的节点 id")
    position: dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0})
    data: dict[str, Any] = Field(default_factory=dict)


class Edge(BaseModel):
    """一条连线（实例级）。"""

    source: str
    sourcePort: str
    target: str
    targetPort: str
    via: ArtifactType


class Graph(BaseModel):
    """一个画布文档：{nodes, edges}（viewport 前端保存）。"""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
