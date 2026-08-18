"""资产存储：版本化不可变快照（Artifact Revision，仿 HANDOFF 3.5.3）。

- 每个资产（asset_id）有一串版本（rev 从 1 递增），旧版本永不覆盖；
- 文件存 backend/data/assets/{asset_id}/rev-{n}.{ext}；
- 元数据（sha256/mime/尺寸/source）存 meta.json；
- URL 通过 FastAPI 静态服务 /assets/... 对外提供。
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
ASSETS_ROOT = DATA_ROOT / "assets"

_EXT_BY_MIME = {
    "image/svg+xml": ".svg",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/json": ".json",
    "text/markdown": ".md",
}


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class AssetVersion:
    rev: int
    url: str
    sha256: str
    mime: str
    width: int | None = None
    height: int | None = None
    durationMs: int | None = None
    createdAt: str = ""
    source: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


class AssetStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or ASSETS_ROOT
        self.root.mkdir(parents=True, exist_ok=True)

    # ---- 内部 ----

    def _asset_dir(self, asset_id: str) -> Path:
        return self.root / asset_id

    def _meta_path(self, asset_id: str) -> Path:
        return self._asset_dir(asset_id) / "meta.json"

    def _read_meta(self, asset_id: str) -> dict:
        p = self._meta_path(asset_id)
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
        return {"assetId": asset_id, "versions": []}

    def _write_meta(self, asset_id: str, meta: dict) -> None:
        self._asset_dir(asset_id).mkdir(parents=True, exist_ok=True)
        self._meta_path(asset_id).write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ---- 查询 ----

    def list_assets(self) -> list[dict]:
        out = []
        if not self.root.exists():
            return out
        for d in sorted(self.root.iterdir()):
            if not d.is_dir():
                continue
            meta = self._read_meta(d.name)
            versions = meta.get("versions", [])
            out.append(
                {
                    "assetId": d.name,
                    "head": versions[-1] if versions else None,
                    "versionsCount": len(versions),
                }
            )
        return out

    def versions(self, asset_id: str) -> list[AssetVersion]:
        meta = self._read_meta(asset_id)
        return [AssetVersion(**v) for v in meta.get("versions", [])]

    def head(self, asset_id: str) -> AssetVersion | None:
        vs = self.versions(asset_id)
        return vs[-1] if vs else None

    def get(self, asset_id: str, rev: int | None = None) -> AssetVersion | None:
        vs = self.versions(asset_id)
        if not vs:
            return None
        if rev is None:
            return vs[-1]
        return next((v for v in vs if v.rev == rev), None)

    def load_bytes(self, asset_id: str, rev: int) -> bytes | None:
        v = self.get(asset_id, rev)
        if not v:
            return None
        p = self.root / v.url.removeprefix("/assets/")
        if p.exists():
            return p.read_bytes()
        return None

    # ---- 写入 ----

    def create_revision(
        self,
        asset_id: str,
        content: bytes,
        mime: str,
        source: dict | None = None,
        width: int | None = None,
        height: int | None = None,
        duration_ms: int | None = None,
    ) -> AssetVersion:
        d = self._asset_dir(asset_id)
        d.mkdir(parents=True, exist_ok=True)

        meta = self._read_meta(asset_id)
        rev = len(meta.get("versions", [])) + 1
        ext = _EXT_BY_MIME.get(mime, ".bin")
        filename = f"rev-{rev}{ext}"
        (d / filename).write_bytes(content)

        sha = hashlib.sha256(content).hexdigest()
        version = AssetVersion(
            rev=rev,
            url=f"/assets/{asset_id}/{filename}",
            sha256=sha,
            mime=mime,
            width=width,
            height=height,
            durationMs=duration_ms,
            createdAt=_now_iso(),
            source=source or {},
        )
        meta["versions"].append(version.to_dict())
        self._write_meta(asset_id, meta)
        return version


# 全局单例
asset_store = AssetStore()


def new_asset_id(prefix: str = "im") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"
