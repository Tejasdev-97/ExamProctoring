"""
ExamProctor.ai — Examination management endpoints.
Professors create, configure, and publish examinations.
"""

import random
import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
import io
import shutil
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

from app.db.session import get_db
from app.db.models import (
    Exam, Question, ExamAttempt, Answer, ProctorEvent, Snapshot,
    SyncOperation, RetakeGrant, User, AuditLog, SystemSetting,
)
from app.core.config import settings
from app.core.permissions import ProfessorUser, StudentUser, AnyUser
from app.core.errors import NotFoundError, ConflictError, ForbiddenError, AppError
from app.schemas.schemas import (
    CreateExamRequest, UpdateExamRequest, ExamOut,
    ExamCodeResolveRequest, ExamPackageOut, QuestionStudentOut,
)

router = APIRouter(prefix="/exams", tags=["exams"])


def _generate_exam_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _exam_to_out(exam: Exam) -> ExamOut:
    return ExamOut(
        exam_id=exam.exam_id,
        title=exam.title,
        description=exam.description,
        instructions=exam.instructions,
        exam_code=exam.exam_code,
        status=exam.status,
        duration_seconds=exam.duration_seconds,
        allow_offline_continuation=exam.allow_offline_continuation,
        allow_question_navigation=exam.allow_question_navigation,
        proctoring_config=exam.proctoring_config or {},
        question_package_version=exam.question_package_version,
        created_at=exam.created_at,
        published_at=exam.published_at,
    )


@router.post("", status_code=201)
async def create_exam(
    body: CreateExamRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Create an examination draft."""
    if body.proctoring_config:
        config = body.proctoring_config.model_dump()
    else:
        stmt = select(SystemSetting)
        settings_rows = (await db.execute(stmt)).scalars().all()
        db_settings = {s.setting_key: s.setting_value for s in settings_rows}

        config = {
            "face_absence_grace_ms": db_settings.get("face_absence_grace_ms", 5000),
            "multiple_faces_grace_ms": db_settings.get("multiple_faces_grace_ms", 2000),
            "sustained_head_turn_ms": db_settings.get("sustained_head_turn_ms", 3000),
            "phone_detection_threshold": db_settings.get("phone_detection_threshold", 0.65),
            "phone_confirm_ms": db_settings.get("phone_confirm_ms", 1000),
            "head_turn_yaw_threshold": db_settings.get("head_turn_yaw_threshold", 30.0),
            "head_turn_pitch_threshold": db_settings.get("head_turn_pitch_threshold", 30.0),
            "live_sampling_interval_ms": db_settings.get("live_sampling_interval_ms", 500),
            "video_sampling_interval_ms": db_settings.get("video_sampling_interval_ms", 125),
        }

    exam = Exam(
        exam_id=str(uuid.uuid4()),
        owner_user_id=actor["sub"],
        title=body.title,
        description=body.description,
        instructions=body.instructions,
        duration_seconds=body.duration_seconds,
        available_from=body.available_from,
        available_until=body.available_until,
        allow_offline_continuation=body.allow_offline_continuation,
        allow_question_navigation=body.allow_question_navigation,
        proctoring_config=config,
        status="draft",
        question_package_version=1,
        created_at=datetime.now(timezone.utc),
    )
    db.add(exam)
    await db.flush()
    return {"data": _exam_to_out(exam)}


@router.get("")
async def list_exams(
    actor: AnyUser,
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    """List examinations for the current user."""
    stmt = select(Exam).order_by(Exam.created_at.desc()).limit(limit)

    if actor["role"] == "professor":
        stmt = stmt.where(Exam.owner_user_id == actor["sub"])
    elif actor["role"] == "student":
        # Students only see published exams they are eligible for
        stmt = stmt.where(Exam.status == "published")
    # Admins see all

    if status:
        stmt = stmt.where(Exam.status == status)

    result = await db.execute(stmt)
    exams = result.scalars().all()
    return {"data": [_exam_to_out(e) for e in exams], "meta": {"has_more": False}}


@router.get("/{exam_id}")
async def get_exam(
    exam_id: str,
    actor: AnyUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve permitted examination metadata."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    result = await db.execute(stmt)
    exam: Exam | None = result.scalars().first()
    if not exam:
        raise NotFoundError("Exam")

    # Students must not access draft/archived exams
    if actor["role"] == "student" and exam.status not in ("published", "active"):
        raise NotFoundError("Exam")

    # Professors can only see their own exams
    if actor["role"] == "professor" and exam.owner_user_id != actor["sub"]:
        raise ForbiddenError("You do not own this exam.")

    return {"data": _exam_to_out(exam)}


@router.patch("/{exam_id}")
async def update_exam(
    exam_id: str,
    body: UpdateExamRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Update an editable examination."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    result = await db.execute(stmt)
    exam: Exam | None = result.scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()
    if exam.status not in ("draft",):
        raise AppError(409, "INVALID_STATE", "Only draft examinations can be edited freely.")

    if body.title is not None:
        exam.title = body.title
    if body.description is not None:
        exam.description = body.description
    if body.instructions is not None:
        exam.instructions = body.instructions
    if body.duration_seconds is not None:
        exam.duration_seconds = body.duration_seconds
    if body.available_from is not None:
        exam.available_from = body.available_from
    if body.available_until is not None:
        exam.available_until = body.available_until
    if body.allow_offline_continuation is not None:
        exam.allow_offline_continuation = body.allow_offline_continuation
    if body.allow_question_navigation is not None:
        exam.allow_question_navigation = body.allow_question_navigation
    if body.proctoring_config is not None:
        exam.proctoring_config = body.proctoring_config.model_dump()

    return {"data": _exam_to_out(exam)}


@router.post("/{exam_id}/publish")
async def publish_exam(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Publish an examination and assign a six-digit code."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    result = await db.execute(stmt)
    exam: Exam | None = result.scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()
    if exam.status != "draft":
        raise AppError(409, "INVALID_STATE", "Only draft examinations can be published.")

    # Verify at least one question exists
    q_count = (await db.execute(
        select(func.count()).select_from(Question).where(Question.exam_id == exam_id)
    )).scalar()
    if not q_count:
        raise AppError(422, "NO_QUESTIONS", "Add at least one question before publishing.")

    # Generate unique 6-digit code
    for _ in range(20):  # max attempts to find unique code
        code = _generate_exam_code()
        exists = (await db.execute(
            select(Exam).where(Exam.exam_code == code, Exam.status == "published")
        )).scalars().first()
        if not exists:
            break
    else:
        raise AppError(500, "CODE_COLLISION", "Could not generate unique exam code.")

    exam.status = "published"
    exam.exam_code = code
    exam.published_at = datetime.now(timezone.utc)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="exam_published",
        target_type="exam",
        target_id=exam_id,
        result="success",
        meta={"exam_code": code},
    )
    db.add(log)

    return {
        "data": {
            "exam_id": exam.exam_id,
            "status": exam.status,
            "question_package_version": exam.question_package_version,
            "exam_code": exam.exam_code,
            "published_at": exam.published_at.isoformat(),
        }
    }


class RestartExamRequest(BaseModel):
    new_duration_seconds: Optional[int] = Field(None, gt=0)
    available_until: Optional[datetime] = None


class CorrectAnswerKeyRequest(BaseModel):
    question_id: str
    new_correct_option: str


def calculate_attempt_scores(questions: list[Question], answers: list[Answer]) -> dict:
    answers_by_q = {a.question_id: a for a in answers}
    total_marks_obtained = 0.0
    total_max_marks = 0.0
    graded_count = 0
    total_questions = len(questions)

    q_details = []
    for q in questions:
        q_max = float(q.marks)
        total_max_marks += q_max
        ans = answers_by_q.get(q.question_id)
        ans_val = (ans.answer_value or {}) if ans else {}

        selected_opt = ans_val.get("selected_option")
        text_ans = ans_val.get("text") or ans_val.get("answer")
        correct_opt = (q.answer_key or {}).get("correct_option") if q.answer_key else None

        if "manual_marks" in ans_val and ans_val["manual_marks"] is not None:
            awarded = float(ans_val["manual_marks"])
            is_graded = True
        elif q.question_type == "mcq" and correct_opt and selected_opt:
            awarded = q_max if str(selected_opt).strip().upper() == str(correct_opt).strip().upper() else 0.0
            is_graded = True
        elif q.question_type == "mcq" and not selected_opt:
            awarded = 0.0
            is_graded = True
        else:
            awarded = 0.0
            is_graded = False

        if is_graded:
            graded_count += 1
            total_marks_obtained += awarded

        q_details.append({
            "question_id": q.question_id,
            "question_number": q.question_number,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "marks": q_max,
            "student_answer": selected_opt if q.question_type == "mcq" else text_ans,
            "correct_option": correct_opt,
            "awarded_marks": awarded if is_graded else None,
            "is_graded": is_graded,
            "comment": ans_val.get("grading_comment"),
        })

    grading_status = (
        "graded" if graded_count == total_questions else
        "partially_graded" if graded_count > 0 else
        "ungraded"
    )

    return {
        "marks_obtained": total_marks_obtained,
        "max_marks": total_max_marks,
        "graded_count": graded_count,
        "total_questions": total_questions,
        "grading_status": grading_status,
        "questions": q_details,
    }


@router.post("/{exam_id}/go-live")
async def start_exam_live(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Make an examination active/live so eligible students can take it."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    if exam.status == "active":
        raise AppError(409, "ALREADY_LIVE", "This examination is already live.")
    if exam.status == "closed":
        raise AppError(409, "ALREADY_ENDED", "This examination has already ended. Use restart instead.")

    # Ensure questions exist
    q_count = (await db.execute(select(func.count()).select_from(Question).where(Question.exam_id == exam_id))).scalar()
    if not q_count:
        raise AppError(422, "NO_QUESTIONS", "Add at least one question before making the examination live.")

    # If no exam code yet, generate one
    if not exam.exam_code:
        for _ in range(20):
            code = _generate_exam_code()
            exists = (await db.execute(select(Exam).where(Exam.exam_code == code))).scalars().first()
            if not exists:
                exam.exam_code = code
                break

    exam.status = "active"
    if not exam.published_at:
        exam.published_at = datetime.now(timezone.utc)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="exam_started",
        target_type="exam",
        target_id=exam_id,
        result="success",
        meta={"exam_code": exam.exam_code},
    )
    db.add(log)
    await db.commit()

    return {"data": _exam_to_out(exam)}


@router.post("/{exam_id}/close")
async def close_exam(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """End an active examination. Closes submission of new answers."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    if exam.status == "closed":
        raise AppError(409, "ALREADY_ENDED", "This examination has already ended.")
    if exam.status in ("draft", "published"):
        raise AppError(409, "NOT_LIVE", "Only live examinations can be ended.")

    exam.status = "closed"
    exam.closed_at = datetime.now(timezone.utc)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="exam_closed",
        target_type="exam",
        target_id=exam_id,
        result="success",
    )
    db.add(log)
    await db.commit()

    return {"data": _exam_to_out(exam)}


@router.post("/{exam_id}/restart")
async def restart_exam(
    exam_id: str,
    body: RestartExamRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Restart an ended examination session with optional updated duration."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    if exam.status != "closed":
        raise AppError(409, "NOT_CLOSED", "Only ended examinations can be restarted.")

    exam.status = "active"
    if body.new_duration_seconds:
        exam.duration_seconds = body.new_duration_seconds
    if body.available_until:
        exam.available_until = body.available_until

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="exam_restarted",
        target_type="exam",
        target_id=exam_id,
        result="success",
        meta={"duration_seconds": exam.duration_seconds},
    )
    db.add(log)
    await db.commit()

    return {"data": _exam_to_out(exam)}


@router.delete("/{exam_id}")
async def delete_exam(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Safely delete an examination and its associated operational records."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError("Not authorized to delete this examination.")

    if exam.status == "active":
        raise AppError(409, "CANNOT_DELETE_LIVE", "Cannot delete a live examination. End the examination before deleting it.")

    # 1. Collect all attempts
    attempts = (await db.execute(select(ExamAttempt).where(ExamAttempt.exam_id == exam_id))).scalars().all()
    attempt_ids = [a.attempt_id for a in attempts]

    # 2. Cleanup snapshot files on filesystem
    base_snapshot_dir = Path(settings.SNAPSHOT_LOCAL_DIR)
    for att_id in attempt_ids:
        att_snap_dir = base_snapshot_dir / att_id
        if att_snap_dir.is_dir():
            try:
                shutil.rmtree(att_snap_dir)
            except OSError:
                pass

    # 3. Cascade delete database records
    if attempt_ids:
        snap_ids = (await db.execute(select(Snapshot.snapshot_id).where(Snapshot.attempt_id.in_(attempt_ids)))).scalars().all()
        if snap_ids:
            from app.db.models import SnapshotBlob
            await db.execute(delete(SnapshotBlob).where(SnapshotBlob.snapshot_id.in_(snap_ids)))
        await db.execute(delete(Snapshot).where(Snapshot.attempt_id.in_(attempt_ids)))
        await db.execute(delete(ProctorEvent).where(ProctorEvent.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Answer).where(Answer.attempt_id.in_(attempt_ids)))
        await db.execute(delete(SyncOperation).where(SyncOperation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(ExamAttempt).where(ExamAttempt.attempt_id.in_(attempt_ids)))

    await db.execute(delete(RetakeGrant).where(RetakeGrant.exam_id == exam_id))
    await db.execute(delete(Question).where(Question.exam_id == exam_id))
    await db.execute(delete(Exam).where(Exam.exam_id == exam_id))

    # 4. Minimal security audit log
    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="exam_deleted",
        target_type="exam",
        target_id=exam_id,
        result="success",
        meta={"title": exam.title, "exam_code": exam.exam_code},
    )
    db.add(log)
    await db.commit()

    return {"data": {"deleted": True, "exam_id": exam_id, "title": exam.title}}


@router.get("/{exam_id}/results")
async def get_exam_results(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Get list of student attempt results with calculated marks."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    questions = (await db.execute(select(Question).where(Question.exam_id == exam_id).order_by(Question.question_number))).scalars().all()
    attempts = (await db.execute(select(ExamAttempt).where(ExamAttempt.exam_id == exam_id).order_by(ExamAttempt.created_at.asc()))).scalars().all()

    student_ids = {a.student_user_id for a in attempts}
    students = {}
    if student_ids:
        s_rows = (await db.execute(select(User).where(User.user_id.in_(student_ids)))).scalars().all()
        students = {s.user_id: s for s in s_rows}

    results = []
    for idx, att in enumerate(attempts, start=1):
        answers = (await db.execute(select(Answer).where(Answer.attempt_id == att.attempt_id))).scalars().all()
        score_info = calculate_attempt_scores(questions, answers)
        student = students.get(att.student_user_id)

        results.append({
            "no": idx,
            "attempt_id": att.attempt_id,
            "attempt_number": att.attempt_number,
            "student_name": student.full_name if student else "Unknown Student",
            "usn": student.usn_normalized if student else "—",
            "marks_obtained": score_info["marks_obtained"],
            "max_marks": score_info["max_marks"],
            "grading_status": score_info["grading_status"],
            "status": att.status,
            "submitted_at": att.client_submitted_at.isoformat() if att.client_submitted_at else None,
        })

    return {"data": {"exam_title": exam.title, "exam_code": exam.exam_code, "results": results}}


@router.get("/{exam_id}/results/export")
async def export_exam_results(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
    format: str = Query("pdf", pattern="^(pdf|excel)$"),
):
    """Export examination results to PDF or Excel (.xlsx)."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    questions = (await db.execute(select(Question).where(Question.exam_id == exam_id).order_by(Question.question_number))).scalars().all()
    attempts = (await db.execute(select(ExamAttempt).where(ExamAttempt.exam_id == exam_id).order_by(ExamAttempt.created_at.asc()))).scalars().all()

    student_ids = {a.student_user_id for a in attempts}
    students = {}
    if student_ids:
        s_rows = (await db.execute(select(User).where(User.user_id.in_(student_ids)))).scalars().all()
        students = {s.user_id: s for s in s_rows}

    records = []
    for idx, att in enumerate(attempts, start=1):
        answers = (await db.execute(select(Answer).where(Answer.attempt_id == att.attempt_id))).scalars().all()
        score_info = calculate_attempt_scores(questions, answers)
        student = students.get(att.student_user_id)

        records.append({
            "no": idx,
            "name": student.full_name if student else "Unknown",
            "usn": student.usn_normalized or "—",
            "marks": f"{score_info['marks_obtained']:.1f}",
            "max_marks": f"{score_info['max_marks']:.1f}",
            "attempt": str(att.attempt_number),
            "status": att.status.upper(),
        })

    safe_code = exam.exam_code or exam_id[:8]

    if format == "excel":
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Exam Results"

        # Title rows
        ws.append(["ExamProctor.ai — Official Examination Results"])
        ws.append([f"Exam: {exam.title} (Code: {exam.exam_code or '—'})"])
        ws.append([f"Export Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"])
        ws.append([])

        headers = ["No.", "Student Name", "USN", "Marks Obtained", "Maximum Marks", "Attempt #", "Status"]
        ws.append(headers)

        header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="172554", end_color="172554", fill_type="solid")

        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=5, column=col_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for r in records:
            ws.append([r["no"], r["name"], r["usn"], float(r["marks"]), float(r["max_marks"]), int(r["attempt"]), r["status"]])

        # Adjust column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        out_io = io.BytesIO()
        wb.save(out_io)
        out_io.seek(0)
        return StreamingResponse(
            out_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="exam_results_{safe_code}.xlsx"'},
        )

    # PDF format using ReportLab
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5*cm, bottomMargin=1.5*cm, leftMargin=1.5*cm, rightMargin=1.5*cm)
    styles = getSampleStyleSheet()
    navy = colors.HexColor("#172554")
    blue_light = colors.HexColor("#DCEBFF")

    title_style = ParagraphStyle("Title", parent=styles["Title"], textColor=navy, fontSize=18, spaceAfter=4)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], textColor=navy, fontSize=9, leading=12)

    story = [
        Paragraph("ExamProctor.ai — Official Examination Results", title_style),
        Paragraph(f"<b>Exam:</b> {exam.title} &nbsp;|&nbsp; <b>Code:</b> {exam.exam_code or '—'} &nbsp;|&nbsp; <b>Total Candidates:</b> {len(records)}", body_style),
        Spacer(1, 0.3*cm),
        HRFlowable(width="100%", thickness=1.5, color=navy),
        Spacer(1, 0.4*cm),
    ]

    table_data = [["No.", "Student Name", "USN", "Marks Obtained", "Maximum Marks", "Attempt", "Status"]]
    for r in records:
        table_data.append([str(r["no"]), r["name"], r["usn"], r["marks"], r["max_marks"], r["attempt"], r["status"]])

    t = Table(table_data, colWidths=[1.2*cm, 5.0*cm, 3.2*cm, 2.5*cm, 2.5*cm, 1.8*cm, 2.3*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (1, 1), (1, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.5, navy),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, blue_light]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    doc.build(story)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="exam_results_{safe_code}.pdf"'},
    )


@router.post("/{exam_id}/correct-answer-key")
async def correct_answer_key(
    exam_id: str,
    body: CorrectAnswerKeyRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Correct the answer key for an MCQ question and recalculate student scores."""
    exam = (await db.execute(select(Exam).where(Exam.exam_id == exam_id))).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError()

    question = (await db.execute(select(Question).where(Question.question_id == body.question_id, Question.exam_id == exam_id))).scalars().first()
    if not question:
        raise NotFoundError("Question")

    prev_key = (question.answer_key or {}).get("correct_option")
    question.answer_key = {"correct_option": body.new_correct_option.strip().upper()}

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="answer_key_corrected",
        target_type="question",
        target_id=question.question_id,
        result="success",
        meta={
            "exam_id": exam_id,
            "question_number": question.question_number,
            "previous_key": prev_key,
            "new_key": body.new_correct_option.strip().upper(),
        },
    )
    db.add(log)
    await db.commit()

    return {"data": {"question_id": question.question_id, "new_correct_option": body.new_correct_option.strip().upper()}}


@router.post("/resolve-code")
async def resolve_code(
    body: ExamCodeResolveRequest,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Resolve a 6-digit exam code with live-state checking."""
    stmt = select(Exam).where(Exam.exam_code == body.exam_code)
    result = await db.execute(stmt)
    exam: Exam | None = result.scalars().first()
    if not exam or exam.status == "draft":
        raise NotFoundError("Exam")

    is_live = exam.status == "active"
    available = is_live

    msg = None
    if exam.status == "published":
        sched_time = f" Scheduled for {exam.available_from.strftime('%d %B %Y at %I:%M %p')}" if exam.available_from else ""
        msg = f"This examination is not live yet. Your professor has not started it.{sched_time}"
    elif exam.status == "closed":
        msg = "This examination has already ended."

    return {
        "data": {
            "exam_id": exam.exam_id,
            "title": exam.title,
            "instructions": exam.instructions,
            "duration_seconds": exam.duration_seconds,
            "status": exam.status,
            "is_live": is_live,
            "available": available,
            "scheduled_at": exam.available_from.isoformat() if exam.available_from else None,
            "message": msg,
        }
    }


@router.get("/{exam_id}/package")
async def get_exam_package(
    exam_id: str,
    attempt_id: str,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Download the student examination package for an authorized attempt."""
    # Verify attempt belongs to this student and exam
    stmt = select(ExamAttempt).where(
        ExamAttempt.attempt_id == attempt_id,
        ExamAttempt.exam_id == exam_id,
        ExamAttempt.student_user_id == actor["sub"],
        ExamAttempt.status.in_(["authorized", "in_progress"]),
    )
    result = await db.execute(stmt)
    attempt: ExamAttempt | None = result.scalars().first()
    if not attempt:
        raise ForbiddenError("Attempt not authorized.")

    # Get exam
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")

    # Get questions WITHOUT answer keys
    stmt = select(Question).where(Question.exam_id == exam_id).order_by(Question.question_number)
    questions = (await db.execute(stmt)).scalars().all()

    questions_out = [
        QuestionStudentOut(
            question_id=q.question_id,
            question_number=q.question_number,
            question_type=q.question_type,
            question_text=q.question_text,
            options=q.options,
            marks=float(q.marks),
            version=q.version,
        )
        for q in questions
    ]

    # Generate package integrity hash
    pkg_data = json.dumps({
        "exam_id": exam_id,
        "attempt_id": attempt_id,
        "package_version": exam.question_package_version,
        "question_count": len(questions),
    }, sort_keys=True)
    integrity = hashlib.sha256(pkg_data.encode()).hexdigest()

    return {
        "data": ExamPackageOut(
            exam_id=exam_id,
            attempt_id=attempt_id,
            title=exam.title,
            instructions=exam.instructions,
            duration_seconds=exam.duration_seconds,
            allow_offline_continuation=exam.allow_offline_continuation,
            allow_question_navigation=exam.allow_question_navigation,
            proctoring_config=exam.proctoring_config or {},
            question_package_version=exam.question_package_version,
            questions=questions_out,
            package_integrity=integrity,
            authorized_at=attempt.authorized_at.isoformat(),
        )
    }
