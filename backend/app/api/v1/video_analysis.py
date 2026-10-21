"""
ExamProctor.ai — Recorded-Video Analysis Endpoints.
Allows professors/administrators to create video analysis sessions, record detected events
with video-relative timestamps, store representative snapshot evidence, and generate
downloadable PDF inspection reports with embedded images.
"""

import hashlib
import io
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List, Any

import aiofiles
import shutil
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, ForbiddenError, NotFoundError
from app.core.permissions import ProfessorUser
from app.db.models import ProctorEvent, Snapshot, User, VideoAnalysisSession, AuditLog
from app.db.session import get_db
from app.api.v1.reports import (
    EVIDENCE_TYPES,
    _fmt_dt,
    fmt_duration,
    load_snapshot_bytes,
    render_report_pdf,
)

router = APIRouter(prefix="/video-analysis", tags=["video-analysis"])


def _format_video_time(ms: Optional[int]) -> str:
    """Format millisecond offset into HH:MM:SS.mmm format."""
    if ms is None:
        return "00:00:00.000"
    total_seconds = ms / 1000.0
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:06.3f}"


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    source_filename: str = Field(..., max_length=255)
    source_size_bytes: int = Field(..., ge=1)
    source_sha256: str = Field(..., min_length=64, max_length=64)
    source_duration_ms: Optional[int] = Field(None, ge=0)


class VideoEventItem(BaseModel):
    event_id: str
    event_type: str
    event_status: str = "confirmed"
    video_timestamp_ms: int = Field(..., ge=0)
    duration_ms: Optional[int] = Field(None, ge=0)
    confidence: Optional[float] = None
    bounding_boxes: Optional[Any] = None
    detector_name: Optional[str] = "MediaPipe Tasks Vision"
    metadata: Optional[dict] = None


class RecordEventsRequest(BaseModel):
    events: List[VideoEventItem]


class CompleteSessionRequest(BaseModel):
    source_duration_ms: Optional[int] = Field(None, ge=0)
    analysis_status: Optional[str] = "completed"


# ── Authorization Helper ──────────────────────────────────────────────────────

async def _get_authorized_session(
    session_id: str, actor: dict, db: AsyncSession
) -> VideoAnalysisSession:
    stmt = select(VideoAnalysisSession).where(
        VideoAnalysisSession.video_analysis_session_id == session_id
    )
    session: Optional[VideoAnalysisSession] = (await db.execute(stmt)).scalars().first()
    if not session:
        raise NotFoundError("Video analysis session")
    if session.created_by_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError("Not authorized to access this video analysis session.")
    return session


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/sessions", status_code=201)
async def create_analysis_session(
    body: CreateSessionRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new recorded video analysis session."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    session = VideoAnalysisSession(
        video_analysis_session_id=session_id,
        created_by_user_id=actor["sub"],
        source_filename=body.source_filename,
        source_size_bytes=body.source_size_bytes,
        source_sha256=body.source_sha256.lower(),
        source_duration_ms=body.source_duration_ms,
        analysis_status="processing",
        pipeline_version="1.0.0",
        started_at=now,
        created_at=now,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "data": {
            "video_analysis_session_id": session.video_analysis_session_id,
            "source_filename": session.source_filename,
            "source_size_bytes": session.source_size_bytes,
            "source_sha256": session.source_sha256,
            "source_duration_ms": session.source_duration_ms,
            "analysis_status": session.analysis_status,
            "started_at": session.started_at.isoformat(),
        }
    }


@router.get("/sessions")
async def list_analysis_sessions(
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """List video analysis sessions for the authenticated professor."""
    stmt = select(VideoAnalysisSession)
    if actor["role"] != "admin":
        stmt = stmt.where(VideoAnalysisSession.created_by_user_id == actor["sub"])
    stmt = stmt.order_by(VideoAnalysisSession.created_at.desc())
    sessions = (await db.execute(stmt)).scalars().all()

    return {
        "data": [
            {
                "video_analysis_session_id": s.video_analysis_session_id,
                "source_filename": s.source_filename,
                "source_size_bytes": s.source_size_bytes,
                "source_sha256": s.source_sha256,
                "source_duration_ms": s.source_duration_ms,
                "analysis_status": s.analysis_status,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}")
async def get_analysis_session(
    session_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Get full details, events, and snapshot references for a video analysis session."""
    session = await _get_authorized_session(session_id, actor, db)

    events_stmt = (
        select(ProctorEvent)
        .where(ProctorEvent.video_analysis_session_id == session_id)
        .order_by(ProctorEvent.client_started_at.asc())
    )
    events = (await db.execute(events_stmt)).scalars().all()

    snaps_stmt = select(Snapshot).where(
        Snapshot.video_analysis_session_id == session_id
    )
    snapshots = (await db.execute(snaps_stmt)).scalars().all()

    summary: dict[str, dict] = {}
    for e in events:
        summary.setdefault(e.event_type, {"total": 0, "confirmed": 0})
        summary[e.event_type]["total"] += 1
        if e.event_status == "confirmed":
            summary[e.event_type]["confirmed"] += 1

    return {
        "data": {
            "video_analysis_session_id": session.video_analysis_session_id,
            "source_filename": session.source_filename,
            "source_size_bytes": session.source_size_bytes,
            "source_sha256": session.source_sha256,
            "source_duration_ms": session.source_duration_ms,
            "analysis_status": session.analysis_status,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "created_at": session.created_at.isoformat(),
            "event_summaries": [
                {"event_type": k, "total": v["total"], "confirmed": v["confirmed"]}
                for k, v in summary.items()
            ],
            "events": [
                {
                    "event_id": e.event_id,
                    "event_type": e.event_type,
                    "event_status": e.event_status,
                    "video_timestamp_ms": (e.meta or {}).get("video_timestamp_ms"),
                    "video_time_str": _format_video_time((e.meta or {}).get("video_timestamp_ms")),
                    "client_started_at": e.client_started_at.isoformat(),
                    "client_ended_at": e.client_ended_at.isoformat() if e.client_ended_at else None,
                    "duration_ms": e.duration_ms,
                    "confidence": float(e.confidence) if e.confidence is not None else None,
                    "bounding_boxes": e.bounding_boxes,
                    "metadata": e.meta or {},
                }
                for e in events
            ],
            "snapshots": [
                {
                    "snapshot_id": s.snapshot_id,
                    "event_id": s.event_id,
                    "capture_reason": s.capture_reason,
                    "video_timestamp_ms": (s.width if False else None),
                    "storage_status": s.storage_status,
                    "size_bytes": s.size_bytes,
                    "sha256": s.sha256,
                }
                for s in snapshots
            ],
        }
    }


@router.post("/sessions/{session_id}/events")
async def record_analysis_events(
    session_id: str,
    body: RecordEventsRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Record detected proctoring events associated with the video analysis timeline."""
    session = await _get_authorized_session(session_id, actor, db)
    now = datetime.now(timezone.utc)

    created_events = []
    base_epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)

    for item in body.events:
        # Check idempotency for event_id
        existing = (
            await db.execute(
                select(ProctorEvent).where(ProctorEvent.event_id == item.event_id)
            )
        ).scalars().first()
        if existing:
            continue

        started_dt = base_epoch + timedelta(milliseconds=item.video_timestamp_ms)
        ended_dt = (
            started_dt + timedelta(milliseconds=item.duration_ms)
            if item.duration_ms is not None
            else None
        )

        meta = dict(item.metadata or {})
        meta["video_timestamp_ms"] = item.video_timestamp_ms
        meta["video_time_str"] = _format_video_time(item.video_timestamp_ms)

        event = ProctorEvent(
            event_id=item.event_id,
            video_analysis_session_id=session.video_analysis_session_id,
            attempt_id=None,
            event_type=item.event_type,
            event_status=item.event_status,
            client_started_at=started_dt,
            client_ended_at=ended_dt,
            server_received_at=now,
            duration_ms=item.duration_ms,
            confidence=item.confidence,
            bounding_boxes=item.bounding_boxes,
            detector_name=item.detector_name,
            rule_version="1.0.0",
            meta=meta,
            created_at=now,
        )
        db.add(event)
        created_events.append(item.event_id)

    await db.commit()
    return {"data": {"recorded_count": len(created_events), "event_ids": created_events}}


@router.post("/sessions/{session_id}/snapshots")
async def upload_analysis_snapshot(
    session_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
    snapshot_id: str = Form(...),
    event_id: Optional[str] = Form(None),
    video_timestamp_ms: Optional[int] = Form(None),
    capture_reason: str = Form("video_analysis_evidence"),
    file: UploadFile = File(...),
):
    """Upload representative JPEG snapshot evidence captured during video analysis."""
    session = await _get_authorized_session(session_id, actor, db)

    # Check for duplicate snapshot (idempotent)
    existing: Optional[Snapshot] = (
        await db.execute(
            select(Snapshot).where(Snapshot.snapshot_id == snapshot_id)
        )
    ).scalars().first()
    if existing and existing.storage_status == "uploaded":
        return {"data": {"snapshot_id": snapshot_id, "status": "already_uploaded"}}

    content = await file.read()
    if len(content) > settings.MAX_SNAPSHOT_SIZE_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", "Snapshot exceeds maximum permitted size.")

    checksum = hashlib.sha256(content).hexdigest()
    now = datetime.now(timezone.utc)
    base_epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    captured_dt = (
        base_epoch + timedelta(milliseconds=video_timestamp_ms)
        if video_timestamp_ms is not None
        else now
    )

    # Store locally under snapshot directory
    storage_dir = Path(settings.SNAPSHOT_LOCAL_DIR) / "video_analysis" / session_id
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / f"{snapshot_id}.jpg"
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)

    if existing:
        existing.storage_status = "uploaded"
        existing.storage_key = str(storage_path)
        existing.server_received_at = now
        existing.sha256 = checksum
        existing.size_bytes = len(content)
        snap = existing
    else:
        snap = Snapshot(
            snapshot_id=snapshot_id,
            video_analysis_session_id=session.video_analysis_session_id,
            attempt_id=None,
            event_id=event_id,
            capture_reason=capture_reason,
            client_captured_at=captured_dt,
            server_received_at=now,
            mime_type="image/jpeg",
            size_bytes=len(content),
            sha256=checksum,
            storage_status="uploaded",
            storage_key=str(storage_path),
            created_at=now,
        )
        db.add(snap)

    await db.commit()
    return {
        "data": {
            "snapshot_id": snap.snapshot_id,
            "status": "uploaded",
            "server_received_at": snap.server_received_at.isoformat(),
        }
    }


@router.post("/sessions/{session_id}/complete")
async def complete_analysis_session(
    session_id: str,
    body: CompleteSessionRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Mark video analysis as completed and store actual duration."""
    session = await _get_authorized_session(session_id, actor, db)
    session.analysis_status = body.analysis_status or "completed"
    if body.source_duration_ms is not None:
        session.source_duration_ms = body.source_duration_ms
    session.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(session)

    return {
        "data": {
            "video_analysis_session_id": session.video_analysis_session_id,
            "analysis_status": session.analysis_status,
            "source_duration_ms": session.source_duration_ms,
            "completed_at": session.completed_at.isoformat(),
        }
    }


@router.get("/sessions/{session_id}/pdf")
async def download_video_analysis_pdf(
    session_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Generate and stream a professional PDF report with embedded evidence images."""
    session = await _get_authorized_session(session_id, actor, db)

    creator: Optional[User] = (
        await db.execute(select(User).where(User.user_id == session.created_by_user_id))
    ).scalars().first()

    events = (
        await db.execute(
            select(ProctorEvent)
            .where(ProctorEvent.video_analysis_session_id == session_id)
            .order_by(ProctorEvent.client_started_at.asc())
        )
    ).scalars().all()

    snapshots = (
        await db.execute(
            select(Snapshot).where(Snapshot.video_analysis_session_id == session_id)
        )
    ).scalars().all()

    # Map snapshots by event_id
    by_event: dict[str, list] = {}
    for s in snapshots:
        if s.event_id:
            by_event.setdefault(s.event_id, []).append(s)

    event_rows = []
    counts: dict[str, int] = {}
    for e in events:
        if e.event_status != "confirmed":
            continue
        counts[e.event_type] = counts.get(e.event_type, 0) + 1
        meta = e.meta or {}
        v_ts = meta.get("video_timestamp_ms")
        v_time_str = _format_video_time(v_ts)
        end_time_str = _format_video_time((v_ts or 0) + (e.duration_ms or 0))

        if e.event_type not in EVIDENCE_TYPES:
            ev = {"state": "not_applicable"}
        else:
            snaps = sorted(by_event.get(e.event_id, []), key=lambda s: s.client_captured_at)
            if not snaps:
                msg = (
                    "Evidence could not be captured during playback."
                    if meta.get("evidence_unavailable")
                    else "No snapshot captured for this event."
                )
                ev = {"state": "unavailable", "message": msg}
            else:
                snap = snaps[0]
                data, state, msg = load_snapshot_bytes(snap)
                ev = {
                    "state": state,
                    "image_bytes": data,
                    "message": msg,
                    "captured": f"Video time {v_time_str}",
                    "snapshot_id": snap.snapshot_id,
                }

        event_rows.append({
            "label": e.event_type,
            "status": e.event_status,
            "start": f"Video time: {v_time_str}",
            "end": f"Video time: {end_time_str}",
            "duration_ms": e.duration_ms,
            "received": _fmt_dt(e.server_received_at or e.created_at),
            "confidence": float(e.confidence) if e.confidence is not None else None,
            "detail": f"Detector: {e.detector_name or 'MediaPipe'}",
            "evidence": ev,
        })

    pdf_data = {
        "title": "Recorded-Video Proctoring Analysis Report",
        "subtitle": f"Session ID: {session.video_analysis_session_id}",
        "info_rows": [
            ("Source Video File", session.source_filename),
            ("Video File Size", f"{session.source_size_bytes / (1024 * 1024):.2f} MB"),
            ("SHA-256 Checksum", session.source_sha256),
            ("Playback Duration", fmt_duration(session.source_duration_ms)),
            ("Analysis Status", session.analysis_status.upper()),
            ("Analyzed By", creator.full_name if creator else "Professor"),
            ("Session Started", _fmt_dt(session.started_at)),
            ("Session Completed", _fmt_dt(session.completed_at or session.created_at)),
            ("Pipeline Version", session.pipeline_version),
        ],
        "summary": sorted(counts.items()),
        "events": event_rows,
        "notes": [
            "All event start/end timestamps are video-relative, aligned directly to playback time.",
            "Inference was performed locally in the browser using MediaPipe Tasks Vision.",
            "Provisional candidate snapshots were captured at frame 1 and confirmed upon persistence.",
        ],
    }

    pdf_bytes = render_report_pdf(pdf_data)
    filename = f"video_analysis_report_{session_id[:8]}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/sessions/{session_id}")
async def delete_analysis_session(
    session_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a recorded-video analysis session and its associated data:
    - Session-specific proctoring events
    - Session-specific snapshot records and physical image files on disk
    - The session record itself
    Strictly authorized: session owner professor or administrator only.
    """
    session = await _get_authorized_session(session_id, actor, db)

    # 1. Disk cleanup: delete snapshot storage directory for this unique session
    storage_dir = Path(settings.SNAPSHOT_LOCAL_DIR) / "video_analysis" / session_id
    if storage_dir.exists() and storage_dir.is_dir():
        try:
            shutil.rmtree(storage_dir)
        except OSError as e:
            print(f"[VideoAnalysis] Warning: Failed to delete session storage directory {storage_dir}: {e}")

    # 2. Database records cleanup: delete snapshots, events, session
    await db.execute(
        delete(Snapshot).where(Snapshot.video_analysis_session_id == session_id)
    )
    await db.execute(
        delete(ProctorEvent).where(ProctorEvent.video_analysis_session_id == session_id)
    )
    await db.execute(
        delete(VideoAnalysisSession).where(VideoAnalysisSession.video_analysis_session_id == session_id)
    )

    # 3. Security audit trail
    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="video_analysis_session_deleted",
        target_type="video_analysis_session",
        target_id=session_id,
        result="success",
        meta={"source_filename": session.source_filename},
    )
    db.add(log)
    await db.commit()

    return {
        "data": {
            "session_id": session_id,
            "deleted": True,
            "message": "Video analysis session and all associated data permanently deleted.",
        }
    }

