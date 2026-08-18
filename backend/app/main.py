"""无限画布 · 后端 API（FastAPI）。

启动（开发）：
    cd backend
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .artifacts import asset_store
from .chat.session import sessions
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

# 静态图片资源（资产库文件，/assets/... 对外访问）
app.mount("/assets", StaticFiles(directory=asset_store.root), name="assets")


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


# ---------------------------------------------------------------------------
# 聊天 API（P1：Chat 节点右侧聊天面板）
# ---------------------------------------------------------------------------


class ChatSessionCreate(BaseModel):
    nodeId: str
    nodeTypeId: str


class ChatMessageSend(BaseModel):
    content: str


@app.post("/api/chat/sessions")
async def create_chat_session(req: ChatSessionCreate) -> dict:
    """按画布节点实例创建/获取会话（幂等）。"""
    try:
        s = sessions.get_or_create(req.nodeId, req.nodeTypeId)
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
    """发一条用户消息，返回 assistant 回复 + 解析出的产物。"""
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")
    try:
        return await _send_message_async(session_id, req.content)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc


async def _send_message_async(session_id: str, content: str) -> dict:
    """LLM 调用是同步阻塞的，丢到线程池避免卡住事件循环。"""
    import asyncio

    return await asyncio.to_thread(sessions.send_message, session_id, content)


# ---------------------------------------------------------------------------
# 资产 API（P2）
# ---------------------------------------------------------------------------


@app.get("/api/assets")
async def list_assets() -> dict:
    """列出全部资产（含 head 版本与版本数）。"""
    return {"assets": asset_store.list_assets()}


@app.get("/api/assets/{asset_id}")
async def get_asset(asset_id: str) -> dict:
    """查单资产，含全部版本。"""
    versions = asset_store.versions(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail="asset not found")
    return {
        "assetId": asset_id,
        "versions": [v.to_dict() for v in versions],
        "head": versions[-1].to_dict(),
    }


@app.post("/api/assets/upload")
async def upload_asset(
    file: UploadFile,
    assetId: str | None = None,
    title: str = "",
) -> dict:
    """人工导入一个文件为资产（版本化）。multipart 表单。"""
    import mimetypes
    from .artifacts import new_asset_id

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="空文件")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    aid = assetId or new_asset_id("ast")
    version = asset_store.create_revision(
        aid,
        content,
        mime,
        source={"kind": "upload", "filename": file.filename or "", "title": title},
    )
    return {"assetId": aid, "version": version.to_dict(), "url": version.url}


@app.get("/api/assets/{asset_id}/versions")
async def list_asset_versions(asset_id: str) -> dict:
    versions = asset_store.versions(asset_id)
    if not versions:
        raise HTTPException(status_code=404, detail="asset not found")
    return {
        "assetId": asset_id,
        "versions": [v.to_dict() for v in versions],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
