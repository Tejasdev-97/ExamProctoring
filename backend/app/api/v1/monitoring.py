"""
ExamProctor.ai — Professor monitoring endpoints + WebSocket live updates.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models import Exam, ExamAttempt, ProctorEvent, Snapshot, User
from app.core.permissions import ProfessorUser, get_current_user
from app.core.errors import NotFoundError, ForbiddenError
from app.core.security import decode_access_token

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

# Active WebSocket connections keyed by exam_id -> list of websockets
_ws_connections: dict[str, list[WebSocket]] = {}


@router.get("/exams/{exam_id}/overview")
async def exam_overview(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Professor exam monitoring overview."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    # Count attempts by status
    attempt_counts = {}
    for status in ("authorized", "in_progress", "submitted", "submitted_local"):
        count = (await db.execute(
            select(func.count()).select_from(ExamAttempt).where(
                ExamAttempt.exam_id == exam_id,
                ExamAttempt.status == status,
            )
        )).scalar()
        attempt_counts[status] = count

    return {
        "data": {
            "exam_id": exam_id,
            "title": exam.title,
            "exam_code": exam.exam_code,
            "status": exam.status,
            "attempt_counts": attempt_counts,
        }
    }


@router.get("/exams/{exam_id}/attempts")
async def exam_attempts_monitoring(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Full attempt table for professor live monitoring."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    stmt = select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
    attempts = (await db.execute(stmt)).scalars().all()

    results = []
    for attempt in attempts:
        # Get student info
        user = (await db.execute(select(User).where(User.user_id == attempt.student_user_id))).scalars().first()

        # Count events by type
        event_counts = {}
        for evt_type in ("face_absent", "multiple_faces", "sustained_head_turn", "phone_detected", "camera_unavailable"):
            count = (await db.execute(
                select(func.count()).select_from(ProctorEvent).where(
                    ProctorEvent.attempt_id == attempt.attempt_id,
                    ProctorEvent.event_type == evt_type,
                    ProctorEvent.event_status == "confirmed",
                )
            )).scalar()
            event_counts[evt_type] = count

        results.append({
            "attempt_id": attempt.attempt_id,
            "student_name": user.full_name if user else "Unknown",
            "student_usn": user.usn_normalized if user else None,
            "attempt_number": attempt.attempt_number,
            "status": attempt.status,
            "client_started_at": attempt.client_started_at.isoformat() if attempt.client_started_at else None,
            "client_submitted_at": attempt.client_submitted_at.isoformat() if attempt.client_submitted_at else None,
            "last_server_contact_at": attempt.last_server_contact_at.isoformat() if attempt.last_server_contact_at else None,
            "last_accepted_sequence": attempt.last_accepted_sequence,
            "submission_received": attempt.submission_received,
            "event_counts": event_counts,
        })

    return {"data": results}


@router.get("/attempts/{attempt_id}/events")
async def attempt_events(
    attempt_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
    event_type: Optional[str] = Query(None),
):
    """Get events for a specific attempt."""
    stmt = select(ExamAttempt).where(ExamAttempt.attempt_id == attempt_id)
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    # Verify exam ownership
    exam_stmt = select(Exam).where(Exam.exam_id == attempt.exam_id)
    exam: Exam | None = (await db.execute(exam_stmt)).scalars().first()
    if exam and exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    stmt = select(ProctorEvent).where(ProctorEvent.attempt_id == attempt_id).order_by(ProctorEvent.client_started_at)
    if event_type:
        stmt = stmt.where(ProctorEvent.event_type == event_type)
    events = (await db.execute(stmt)).scalars().all()

    results = []
    for e in events:
        # Get snapshot count for this event
        snap_count = (await db.execute(
            select(func.count()).select_from(Snapshot).where(Snapshot.event_id == e.event_id)
        )).scalar()

        results.append({
            "event_id": e.event_id,
            "event_type": e.event_type,
            "event_status": e.event_status,
            "client_started_at": e.client_started_at.isoformat(),
            "client_ended_at": e.client_ended_at.isoformat() if e.client_ended_at else None,
            "server_received_at": e.server_received_at.isoformat() if e.server_received_at else None,
            "duration_ms": e.duration_ms,
            "confidence": float(e.confidence) if e.confidence else None,
            "bounding_boxes": e.bounding_boxes,
            "detector_name": e.detector_name,
            "snapshot_count": snap_count,
        })

    return {"data": results}


@router.websocket("/ws/exams/{exam_id}")
async def monitoring_websocket(
    websocket: WebSocket,
    exam_id: str,
):
    """WebSocket endpoint for live professor monitoring."""
    # Authenticate via token in query params (cookies not forwarded in WS)
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    user = decode_access_token(token)
    if not user or user.get("role") not in ("professor", "admin"):
        await websocket.close(code=4003)
        return

    await websocket.accept()

    if exam_id not in _ws_connections:
        _ws_connections[exam_id] = []
    _ws_connections[exam_id].append(websocket)

    try:
        while True:
            # Keep connection alive; updates are pushed by sync endpoints
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        if exam_id in _ws_connections:
            _ws_connections[exam_id] = [
                ws for ws in _ws_connections[exam_id] if ws != websocket
            ]


async def broadcast_monitoring_update(exam_id: str, payload: dict):
    """Push an update to all connected professor monitors for an exam."""
    import json
    if exam_id not in _ws_connections:
        return
    dead = []
    for ws in _ws_connections[exam_id]:
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.append(ws)
    _ws_connections[exam_id] = [ws for ws in _ws_connections[exam_id] if ws not in dead]
