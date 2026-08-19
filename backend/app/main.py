"""无限画布 · 后端 API（FastAPI）v2.1。

启动（开发）：
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .artifacts import asset_store
from .chat.session import sessions
from .registry import load_all_manifests, manifest_ids, check_v12, get_manifest
from .engine.graph_model import validate_graph, topological_layers, resolve_body
from .engine.execute import execute
from .types import Graph, NodeInstance, ControlLink

app = FastAPI(title="无限画布 API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory=asset_store.root), name="assets")

# ============ V12 启动断言 ============

missing = check_v12()
if missing:
    import logging
    logging.warning(f"[V12] 模板引用了不存在的 manifestId: {missing}")


# ============ 节点定义 API ============


@app.get("/api/health")
async def health() -> dict:
    return {"ok": True, "app": "无限画布", "version": "2.1.0"}


@app.get("/api/nodes")
async def nodes() -> dict:
    """返回全部 10 个节点定义（前端画布渲染 + 节点面板的数据源）。"""
    manifests = load_all_manifests()
    return {
        "nodes": [m.model_dump() for m in manifests.values()],
        "manifestIds": manifest_ids(),
    }


@app.get("/api/manifests/{manifest_id}")
async def get_node_manifest(manifest_id: str) -> dict:
    m = get_manifest(manifest_id)
    if not m:
        raise HTTPException(status_code=404, detail=f"manifest not found: {manifest_id}")
    return m.model_dump()


# ============ 执行 API ============


class ExecuteRequest(BaseModel):
    graph: dict


@app.post("/api/execute")
async def execute_graph(req: ExecuteRequest) -> dict:
    """执行画布图（v2.1 新格式：nodes + links + inputs/config）。"""
    graph = Graph.model_validate(req.graph)

    # 校验
    manifests = load_all_manifests()
    issues = validate_graph(graph, manifests)
    errors = [i for i in issues if i.level == "error"]
    if errors:
        return {"results": {}, "errors": [e.model_dump() for e in errors]}

    results = await execute(graph)

    return {"results": results, "errors": []}


# ============ 校验 API ============


class ValidateRequest(BaseModel):
    graph: dict


@app.post("/api/validate")
async def validate_graph_endpoint(req: ValidateRequest) -> dict:
    """校验图，返回所有问题（V1-V14）。"""
    graph = Graph.model_validate(req.graph)
    manifests = load_all_manifests()
    issues = validate_graph(graph, manifests)
    return {"issues": [i.model_dump() for i in issues]}


# ============ 聊天 API（复用现有） ============


class ChatSessionCreate(BaseModel):
    nodeId: str
    nodeTypeId: str
    nodeData: dict | None = None


class ChatMessageSend(BaseModel):
    content: str


@app.post("/api/chat/sessions")
async def create_chat_session(req: ChatSessionCreate) -> dict:
    try:
        s = sessions.get_or_create(req.nodeId, req.nodeTypeId, req.nodeData)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "sessionId": s.id,
        "nodeId": s.node_id,
        "systemPrompt": s.system_prompt,
        "model": s.model_ref,
        "messages": s.messages,
        "products": s.products,
    }


@app.get("/api/chat/sessions/{session_id}/messages")
async def get_chat_messages(session_id: str) -> dict:
    s = sessions.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    return {"messages": s.messages}


@app.get("/api/chat/sessions/{session_id}/products")
async def get_chat_products(session_id: str) -> dict:
    s = sessions.get(session_id)
    if not s:
        raise HTTPException(status_code=404, detail="session not found")
    return {"products": s.products}


@app.post("/api/chat/sessions/{session_id}/messages")
async def send_chat_message(session_id: str, req: ChatMessageSend) -> dict:
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")
    try:
        return await _send_message_async(session_id, req.content)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc


async def _send_message_async(session_id: str, content: str) -> dict:
    import asyncio
    return await asyncio.to_thread(sessions.send_message, session_id, content)


# ============ 资产 API（复用现有） ============


@app.get("/api/assets")
async def list_assets() -> dict:
    return {"assets": asset_store.list_assets()}


@app.get("/api/assets/{asset_id}")
async def get_asset(asset_id: str) -> dict:
    versions = asset_store.versions(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail="asset not found")
    return {"assetId": asset_id, "versions": [v.to_dict() for v in versions], "head": versions[-1].to_dict()}


@app.post("/api/assets/upload")
async def upload_asset(file: UploadFile, assetId: str | None = None, title: str = "") -> dict:
    import mimetypes
    from .artifacts import new_asset_id
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="空文件")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    aid = assetId or new_asset_id("ast")
    version = asset_store.create_revision(aid, content, mime, source={"kind": "upload", "filename": file.filename or "", "title": title})
    return {"assetId": aid, "version": version.to_dict(), "url": version.url}


@app.get("/api/assets/{asset_id}/versions")
async def list_asset_versions(asset_id: str) -> dict:
    versions = asset_store.versions(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail="asset not found")
    return {"assetId": asset_id, "versions": [v.to_dict() for v in versions]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)