"""无限画布 · 后端 API（FastAPI）。

启动（开发）：
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .defs import artifact_types, load_node_defs
from .engine.connections import is_valid_connection
from .engine.derive import derive_edges
from .engine.execute import execute
from .types import Graph

app = FastAPI(title="无限画布 API", version="0.1.0")

# 开发期前端地址（Vite 默认 5173）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "app": "无限画布", "version": "0.1.0"}


@app.get("/api/nodes")
async def nodes() -> dict:
    """返回全部节点定义（前端画布渲染 + 加节点面板的数据源）。"""
    defs = load_node_defs()
    return {
        "nodes": [d.model_dump() for d in defs.values()],
        "artifactTypes": artifact_types(),
    }


class ConnectionCheck(BaseModel):
    sourceTypeId: str
    sourceHandle: str
    targetTypeId: str
    targetHandle: str


@app.post("/api/validate-connection")
async def validate_connection(req: ConnectionCheck) -> dict:
    """后端兜底连线校验（前端拖拽时已用同构规则校验）。"""
    return {
        "valid": is_valid_connection(
            req.sourceTypeId, req.sourceHandle, req.targetTypeId, req.targetHandle
        )
    }


@app.post("/api/derive")
async def derive(graph: Graph) -> dict:
    """自动派生连线（流程图模式）。"""
    return {"edges": [e.model_dump() for e in derive_edges(graph.nodes)]}


@app.post("/api/execute")
async def execute_graph(graph: Graph) -> dict:
    """执行画布图：分层并发 + 按节点缓存 + 环检测。"""
    results = await execute(graph)
    return {"results": results}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
