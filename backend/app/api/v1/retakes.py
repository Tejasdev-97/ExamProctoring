"""
ExamProctor.ai — Retake authorization endpoints.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import RetakeGrant, ExamAttempt, Exam, User, AuditLog
from app.core.permissions import ProfessorUser
from app.core.errors import NotFoundError, ForbiddenError, ConflictError
from app.schemas.schemas import RetakeGrantRequest

router = APIRouter(prefix="/retakes", tags=["retakes"])


@router.post("")
async def grant_retake(
    body: RetakeGrantRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Authorize a retake for a student. Professor only."""
    # Verify professor owns the exam
    stmt = select(Exam).where(Exam.exam_id == body.exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    # Verify student exists
    stmt = select(User).where(User.user_id == body.student_user_id)
    student: User | None = (await db.execute(stmt)).scalars().first()
    if not student:
        raise NotFoundError("Student")

    # Check no active retake grant already exists
    stmt = select(RetakeGrant).where(
        RetakeGrant.exam_id == body.exam_id,
        RetakeGrant.student_user_id == body.student_user_id,
        RetakeGrant.status == "granted",
    )
    existing = (await db.execute(stmt)).scalars().first()
    if existing:
        raise ConflictError("An active retake grant already exists for this student.")

    grant = RetakeGrant(
        retake_grant_id=str(uuid.uuid4()),
        exam_id=body.exam_id,
        student_user_id=body.student_user_id,
        previous_attempt_id=body.previous_attempt_id,
        granted_by_user_id=actor["sub"],
        reason=body.reason,
        status="granted",
        granted_at=datetime.now(timezone.utc),
    )
    db.add(grant)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="retake_granted",
        target_type="retake_grant",
        target_id=grant.retake_grant_id,
        result="success",
        meta={
            "exam_id": body.exam_id,
            "student_user_id": body.student_user_id,
            "reason": body.reason,
        },
    )
    db.add(log)
    await db.flush()

    return {
        "data": {
            "retake_grant_id": grant.retake_grant_id,
            "exam_id": grant.exam_id,
            "student_user_id": grant.student_user_id,
            "status": grant.status,
            "granted_at": grant.granted_at.isoformat(),
        }
    }


@router.get("/exam/{exam_id}")
async def list_retake_grants(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """List retake grants for an exam."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    stmt = select(RetakeGrant).where(RetakeGrant.exam_id == exam_id).order_by(RetakeGrant.granted_at.desc())
    grants = (await db.execute(stmt)).scalars().all()

    return {
        "data": [
            {
                "retake_grant_id": g.retake_grant_id,
                "student_user_id": g.student_user_id,
                "previous_attempt_id": g.previous_attempt_id,
                "status": g.status,
                "reason": g.reason,
                "granted_at": g.granted_at.isoformat(),
                "consumed_at": g.consumed_at.isoformat() if g.consumed_at else None,
            }
            for g in grants
        ]
    }
