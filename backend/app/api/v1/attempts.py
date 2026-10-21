"""
ExamProctor.ai — Exam attempt authorization and management.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pydantic import BaseModel, Field
from app.db.session import get_db
from app.db.models import Exam, ExamAttempt, Question, Answer, User, RetakeGrant, AuditLog
from app.api.v1.exams import calculate_attempt_scores
from app.core.permissions import StudentUser, ProfessorUser, AnyUser
from app.core.errors import NotFoundError, ForbiddenError, ConflictError, AppError
from app.schemas.schemas import AuthorizeAttemptRequest, AttemptOut, SubmitAttemptRequest

router = APIRouter(prefix="/attempts", tags=["attempts"])


class ManualGradeRequest(BaseModel):
    question_id: str
    marks: float = Field(..., ge=0)
    comment: Optional[str] = None


class GrantRetakeRequest(BaseModel):
    reason: Optional[str] = None


@router.post("/authorize")
async def authorize_attempt(
    body: AuthorizeAttemptRequest,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create or return the authorized attempt for a student + exam code."""
    # Resolve exam code
    stmt = select(Exam).where(Exam.exam_code == body.exam_code)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam or exam.status == "draft":
        raise NotFoundError("Exam")

    if exam.status == "published":
        sched_time = f" Scheduled to begin on {exam.available_from.strftime('%d %B %Y at %I:%M %p')}." if exam.available_from else ""
        raise AppError(403, "EXAM_NOT_LIVE", f"This examination is not live yet. Your professor has not started it.{sched_time}")

    if exam.status == "closed":
        raise AppError(409, "EXAM_ENDED", "This examination has already ended. No new attempts are accepted.")

    if exam.status != "active":
        raise AppError(403, "NOT_ACTIVE", "This examination is not currently active.")

    # Check if student already has an in-progress or authorized attempt
    stmt = select(ExamAttempt).where(
        ExamAttempt.exam_id == exam.exam_id,
        ExamAttempt.student_user_id == actor["sub"],
        ExamAttempt.status.in_(["authorized", "in_progress"]),
    )
    existing: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if existing:
        return {"data": AttemptOut.model_validate(existing)}

    # Check for previously submitted attempt — require retake grant for another one
    stmt = select(ExamAttempt).where(
        ExamAttempt.exam_id == exam.exam_id,
        ExamAttempt.student_user_id == actor["sub"],
        ExamAttempt.status.in_(["submitted", "submitted_local"]),
    )
    submitted: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if submitted:
        # Check for a valid retake grant
        stmt = select(RetakeGrant).where(
            RetakeGrant.exam_id == exam.exam_id,
            RetakeGrant.student_user_id == actor["sub"],
            RetakeGrant.status == "granted",
        )
        grant: RetakeGrant | None = (await db.execute(stmt)).scalars().first()
        if not grant:
            raise ConflictError("You have already submitted this examination. A retake requires professor authorization.")
        attempt_num = submitted.attempt_number + 1
        prev_attempt_id = submitted.attempt_id
        # Mark grant consumed
        grant.status = "consumed"
        grant.consumed_at = datetime.now(timezone.utc)
    else:
        attempt_num = 1
        prev_attempt_id = None

    auth_id = str(uuid.uuid4())
    attempt = ExamAttempt(
        attempt_id=str(uuid.uuid4()),
        exam_id=exam.exam_id,
        student_user_id=actor["sub"],
        attempt_number=attempt_num,
        previous_attempt_id=prev_attempt_id,
        package_version=exam.question_package_version,
        status="authorized",
        authorization_id=auth_id,
        authorized_at=datetime.now(timezone.utc),
        last_accepted_sequence=0,
        submission_received=False,
    )
    db.add(attempt)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="attempt_authorized",
        target_type="exam_attempt",
        target_id=attempt.attempt_id,
        result="success",
        meta={"exam_id": exam.exam_id, "attempt_number": attempt_num},
    )
    db.add(log)
    await db.flush()

    if grant if submitted else False:
        grant.consumed_by_attempt_id = attempt.attempt_id

    return {"data": AttemptOut.model_validate(attempt)}


@router.post("/{attempt_id}/start")
async def start_attempt(
    attempt_id: str,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Record server-side start time for an attempt."""
    stmt = select(ExamAttempt).where(
        ExamAttempt.attempt_id == attempt_id,
        ExamAttempt.student_user_id == actor["sub"],
    )
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")
    if attempt.status not in ("authorized", "in_progress"):
        raise AppError(409, "INVALID_STATE", "Attempt cannot be started in its current state.")

    now = datetime.now(timezone.utc)
    if not attempt.server_started_at:
        attempt.server_started_at = now
    attempt.status = "in_progress"
    attempt.last_server_contact_at = now

    return {"data": {"attempt_id": attempt_id, "server_started_at": now.isoformat()}}


async def reconcile_attempt_submission_state(db: AsyncSession, attempt: ExamAttempt) -> bool:
    """Ensure attempt status is authoritatively reconciled if submission_finalize was accepted."""
    if attempt and attempt.status != "submitted":
        from app.db.models import SyncOperation
        stmt = select(SyncOperation).where(
            SyncOperation.attempt_id == attempt.attempt_id,
            SyncOperation.operation_type == "submission_finalize",
            SyncOperation.processing_status == "accepted",
        )
        fin_op: SyncOperation | None = (await db.execute(stmt)).scalars().first()
        if fin_op:
            attempt.status = "submitted"
            attempt.submission_received = True
            attempt.final_sequence = fin_op.sequence_number
            attempt.submission_operation_id = fin_op.operation_id
            now = fin_op.server_received_at or fin_op.client_created_at or datetime.now(timezone.utc)
            if fin_op.payload and fin_op.payload.get("client_submitted_at"):
                try:
                    attempt.client_submitted_at = datetime.fromisoformat(
                        fin_op.payload["client_submitted_at"].replace("Z", "+00:00")
                    )
                except Exception:
                    attempt.client_submitted_at = now
            else:
                attempt.client_submitted_at = now
            if not attempt.server_submitted_at:
                attempt.server_submitted_at = now
            try:
                await db.flush()
            except Exception:
                pass
            return True
    return False


@router.get("/my-attempts")
async def list_my_attempts(
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """List all examination attempts belonging strictly to the authenticated student."""
    stmt = (
        select(ExamAttempt, Exam.title.label("exam_title"), Exam.duration_seconds.label("duration_seconds"))
        .join(Exam, Exam.exam_id == ExamAttempt.exam_id, isouter=True)
        .where(ExamAttempt.student_user_id == actor["sub"])
        .order_by(ExamAttempt.authorized_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    results = []
    for attempt, title, duration in rows:
        await reconcile_attempt_submission_state(db, attempt)
        data = AttemptOut.model_validate(attempt).model_dump()
        data["exam_title"] = title
        data["duration_seconds"] = duration
        results.append(data)
    return {"data": results}


@router.get("/{attempt_id}")
async def get_attempt(
    attempt_id: str,
    actor: AnyUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve attempt details. Students see only their own."""
    stmt = select(ExamAttempt).where(ExamAttempt.attempt_id == attempt_id)
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    if actor["role"] == "student" and attempt.student_user_id != actor["sub"]:
        raise ForbiddenError()

    await reconcile_attempt_submission_state(db, attempt)
    return {"data": AttemptOut.model_validate(attempt)}


@router.post("/{attempt_id}/finalize")
async def finalize_attempt(
    attempt_id: str,
    body: SubmitAttemptRequest,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Finalize (submit) an attempt. Idempotent by submission_operation_id."""
    stmt = select(ExamAttempt).where(
        ExamAttempt.attempt_id == attempt_id,
        ExamAttempt.student_user_id == actor["sub"],
    )
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    await reconcile_attempt_submission_state(db, attempt)

    # Idempotent: if already submitted, return existing result
    if attempt.submission_received or attempt.status == "submitted":
        return {
            "data": {
                "attempt_id": attempt_id,
                "status": attempt.status,
                "server_submitted_at": attempt.server_submitted_at.isoformat() if attempt.server_submitted_at else None,
                "already_received": True,
            }
        }

    if attempt.status not in ("in_progress", "submitted_local", "authorized"):
        raise AppError(409, "INVALID_STATE", "Attempt cannot be finalized in its current state.")

    # The boundary must be consistent: every operation up to final_sequence (including the
    # queued submission_finalize operation) must already have been accepted, in order.
    if body.final_sequence < 1 or attempt.last_accepted_sequence < body.final_sequence:
        raise AppError(
            409, "SEQUENCE_INCOMPLETE",
            f"Operations up to sequence {body.final_sequence} have not all been received "
            f"(server has {attempt.last_accepted_sequence}). Sync pending operations first.",
        )
    from app.db.models import SyncOperation
    marker = (await db.execute(
        select(SyncOperation).where(
            SyncOperation.operation_id == body.submission_operation_id,
            SyncOperation.attempt_id == attempt_id,
            SyncOperation.operation_type == "submission_finalize",
            SyncOperation.processing_status == "accepted",
            SyncOperation.sequence_number == body.final_sequence,
        )
    )).scalars().first()
    if not marker:
        raise AppError(409, "SUBMISSION_MARKER_MISSING",
                       "Submission operation has not been received at the stated final sequence.")
    rejected_count = (await db.execute(
        select(func.count()).select_from(SyncOperation).where(
            SyncOperation.attempt_id == attempt_id,
            SyncOperation.processing_status == "rejected",
        )
    )).scalar() or 0

    now = datetime.now(timezone.utc)
    attempt.status = "submitted"
    attempt.submission_operation_id = body.submission_operation_id
    attempt.final_sequence = body.final_sequence
    attempt.client_submitted_at = datetime.fromisoformat(body.client_submitted_at.replace("Z", "+00:00"))
    attempt.server_submitted_at = now
    attempt.last_server_contact_at = now
    attempt.submission_received = True

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="attempt_submitted",
        target_type="exam_attempt",
        target_id=attempt_id,
        result="success",
        meta={"final_sequence": body.final_sequence, "rejected_operations": rejected_count},
    )
    db.add(log)

    return {
        "data": {
            "attempt_id": attempt_id,
            "status": attempt.status,
            "server_submitted_at": now.isoformat(),
            "already_received": False,
            "rejected_operations": rejected_count,
        }
    }


@router.get("/exam/{exam_id}")
async def list_exam_attempts(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """List all attempts for an exam. Professor only."""
    from app.db.models import User
    stmt = select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
    attempts = (await db.execute(stmt)).scalars().all()

    results = []
    for a in attempts:
        await reconcile_attempt_submission_state(db, a)
        user_stmt = select(User).where(User.user_id == a.student_user_id)
        user = (await db.execute(user_stmt)).scalars().first()
        results.append({
            **AttemptOut.model_validate(a).model_dump(),
            "student_name": user.full_name if user else "Unknown",
            "student_usn": user.usn_normalized if user else None,
        })

    return {"data": results}


@router.get("/{attempt_id}/evaluation")
async def get_attempt_evaluation(
    attempt_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full evaluation breakdown for a student attempt."""
    attempt = (await db.execute(select(ExamAttempt).where(ExamAttempt.attempt_id == attempt_id))).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    await reconcile_attempt_submission_state(db, attempt)

    exam = (await db.execute(select(Exam).where(Exam.exam_id == attempt.exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    student = (await db.execute(select(User).where(User.user_id == attempt.student_user_id))).scalars().first()
    questions = (await db.execute(select(Question).where(Question.exam_id == exam.exam_id).order_by(Question.question_number))).scalars().all()
    answers = (await db.execute(select(Answer).where(Answer.attempt_id == attempt_id))).scalars().all()

    scores = calculate_attempt_scores(questions, answers)

    return {
        "data": {
            "attempt_id": attempt.attempt_id,
            "attempt_number": attempt.attempt_number,
            "status": attempt.status,
            "student": {
                "user_id": student.user_id if student else attempt.student_user_id,
                "name": student.full_name if student else "Unknown Student",
                "usn": student.usn_normalized if student else "—",
                "email": student.email if student else None,
            },
            "exam": {
                "exam_id": exam.exam_id,
                "title": exam.title,
                "exam_code": exam.exam_code,
            },
            "evaluation": scores,
            "started_at": attempt.server_started_at.isoformat() if attempt.server_started_at else None,
            "submitted_at": attempt.client_submitted_at.isoformat() if attempt.client_submitted_at else (attempt.server_submitted_at.isoformat() if attempt.server_submitted_at else None),
        }
    }


@router.post("/{attempt_id}/grade")
async def grade_attempt_question(
    attempt_id: str,
    body: ManualGradeRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Manually assign or adjust marks for a question in a student attempt."""
    attempt = (await db.execute(select(ExamAttempt).where(ExamAttempt.attempt_id == attempt_id))).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    exam = (await db.execute(select(Exam).where(Exam.exam_id == attempt.exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    question = (await db.execute(select(Question).where(Question.question_id == body.question_id, Question.exam_id == exam.exam_id))).scalars().first()
    if not question:
        raise NotFoundError("Question")

    q_max = float(question.marks)
    if body.marks < 0 or body.marks > q_max:
        raise AppError(422, "INVALID_MARKS", f"Marks must be between 0 and maximum marks ({q_max}).")

    ans_stmt = select(Answer).where(Answer.attempt_id == attempt_id, Answer.question_id == body.question_id)
    answer = (await db.execute(ans_stmt)).scalars().first()

    old_marks = None
    if not answer:
        answer = Answer(
            answer_id=str(uuid.uuid4()),
            attempt_id=attempt_id,
            question_id=body.question_id,
            answer_value={"manual_marks": body.marks, "grading_comment": body.comment},
            answered_at=datetime.now(timezone.utc),
        )
        db.add(answer)
    else:
        current_val = dict(answer.answer_value or {})
        old_marks = current_val.get("manual_marks")
        current_val["manual_marks"] = body.marks
        if body.comment is not None:
            current_val["grading_comment"] = body.comment
        answer.answer_value = current_val
        answer.answered_at = datetime.now(timezone.utc)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="manual_grading",
        target_type="exam_attempt",
        target_id=attempt_id,
        result="success",
        meta={
            "exam_id": exam.exam_id,
            "student_user_id": attempt.student_user_id,
            "question_id": body.question_id,
            "question_number": question.question_number,
            "previous_marks": old_marks,
            "new_marks": body.marks,
            "comment": body.comment,
        },
    )
    db.add(log)
    await db.commit()

    questions = (await db.execute(select(Question).where(Question.exam_id == exam.exam_id).order_by(Question.question_number))).scalars().all()
    answers = (await db.execute(select(Answer).where(Answer.attempt_id == attempt_id))).scalars().all()
    scores = calculate_attempt_scores(questions, answers)

    return {"data": {"attempt_id": attempt_id, "evaluation": scores}}


@router.post("/{attempt_id}/grant-retake")
async def grant_retake(
    attempt_id: str,
    body: GrantRetakeRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Grant an additional attempt to a student who has submitted or completed."""
    attempt = (await db.execute(select(ExamAttempt).where(ExamAttempt.attempt_id == attempt_id))).scalars().first()
    if not attempt:
        raise NotFoundError("Attempt")

    exam = (await db.execute(select(Exam).where(Exam.exam_id == attempt.exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    existing = (await db.execute(select(RetakeGrant).where(
        RetakeGrant.exam_id == exam.exam_id,
        RetakeGrant.student_user_id == attempt.student_user_id,
        RetakeGrant.status == "granted",
    ))).scalars().first()

    if existing:
        return {"data": {"message": "A retake authorization is already active for this student.", "retake_grant_id": existing.retake_grant_id}}

    grant = RetakeGrant(
        retake_grant_id=str(uuid.uuid4()),
        exam_id=exam.exam_id,
        student_user_id=attempt.student_user_id,
        previous_attempt_id=attempt_id,
        granted_by_user_id=actor["sub"],
        reason=body.reason or "Authorized retake by professor.",
        status="granted",
    )
    db.add(grant)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="retake_granted",
        target_type="exam_attempt",
        target_id=attempt_id,
        result="success",
        meta={
            "exam_id": exam.exam_id,
            "student_user_id": attempt.student_user_id,
            "reason": body.reason,
            "attempt_number": attempt.attempt_number,
        },
    )
    db.add(log)
    await db.commit()

    return {"data": {"message": "Retake successfully authorized.", "retake_grant_id": grant.retake_grant_id}}
