"""
ExamProctor.ai — Question management + Excel import endpoints.
"""

import io
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Exam, Question, AuditLog
from app.core.permissions import ProfessorUser
from app.core.errors import NotFoundError, ForbiddenError, AppError
from app.schemas.schemas import CreateQuestionRequest, QuestionOut
from app.core.config import settings

router = APIRouter(tags=["questions"])

# In-memory import preview cache (keyed by import_id; production would use Redis/DB)
_import_previews: dict = {}


def _check_professor_owns_exam(exam: Exam, actor: dict):
    if exam.owner_user_id != actor["sub"] and actor["role"] != "admin":
        raise ForbiddenError("You do not own this exam.")


@router.post("/exams/{exam_id}/questions", status_code=201)
async def create_question(
    exam_id: str,
    body: CreateQuestionRequest,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a question for an exam."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    _check_professor_owns_exam(exam, actor)

    if exam.status not in ("draft",):
        raise AppError(409, "INVALID_STATE", "Questions can only be added to draft exams.")

    q = Question(
        question_id=str(uuid.uuid4()),
        exam_id=exam_id,
        question_number=body.question_number,
        question_type=body.question_type,
        question_text=body.question_text,
        options=body.options,
        marks=body.marks,
        answer_key=body.answer_key.model_dump() if body.answer_key else None,
        version=1,
    )
    db.add(q)
    await db.flush()
    return {"data": QuestionOut(
        question_id=q.question_id,
        exam_id=q.exam_id,
        question_number=q.question_number,
        question_type=q.question_type,
        question_text=q.question_text,
        options=q.options,
        marks=float(q.marks),
        version=q.version,
        created_at=q.created_at,
    )}


@router.get("/exams/{exam_id}/questions")
async def list_questions(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve questions for authorized professor management."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    _check_professor_owns_exam(exam, actor)

    stmt = select(Question).where(Question.exam_id == exam_id).order_by(Question.question_number)
    questions = (await db.execute(stmt)).scalars().all()

    return {
        "data": [
            QuestionOut(
                question_id=q.question_id,
                exam_id=q.exam_id,
                question_number=q.question_number,
                question_type=q.question_type,
                question_text=q.question_text,
                options=q.options,
                marks=float(q.marks),
                version=q.version,
                created_at=q.created_at,
            )
            for q in questions
        ]
    }


@router.delete("/exams/{exam_id}/questions/{question_id}", status_code=204)
async def delete_question(
    exam_id: str,
    question_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a question from a draft exam."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    _check_professor_owns_exam(exam, actor)
    if exam.status != "draft":
        raise AppError(409, "INVALID_STATE", "Questions can only be deleted from draft exams.")

    stmt = select(Question).where(Question.question_id == question_id, Question.exam_id == exam_id)
    q: Question | None = (await db.execute(stmt)).scalars().first()
    if not q:
        raise NotFoundError("Question")

    await db.delete(q)
    return None


# ── Excel import ──────────────────────────────────────────────────────────────

def _parse_excel_workbook(file_bytes: bytes) -> tuple[list, list]:
    """Parse an Excel workbook. Returns (valid_rows, error_rows)."""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    REQUIRED_HEADERS = {"question_type", "question_text", "marks"}
    headers = []
    questions = []
    errors = []

    for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
        if row_idx == 1:
            headers = [str(c).strip().lower() if c else "" for c in row]
            missing = REQUIRED_HEADERS - set(headers)
            if missing:
                errors.append({
                    "row_number": 1,
                    "field": "header",
                    "code": "MISSING_COLUMNS",
                    "message": f"Missing required columns: {', '.join(missing)}",
                })
            continue

        # Skip empty rows
        if all(c is None for c in row):
            continue

        row_data = dict(zip(headers, row))

        q_errors = []
        q_type = str(row_data.get("question_type", "")).strip().lower()
        q_text = str(row_data.get("question_text", "")).strip()
        marks_raw = row_data.get("marks")

        if not q_text:
            q_errors.append({"field": "question_text", "code": "MISSING_QUESTION_TEXT", "message": "Question text is required."})
        if q_type not in ("mcq", "short_answer"):
            q_errors.append({"field": "question_type", "code": "INVALID_QUESTION_TYPE", "message": "question_type must be mcq or short_answer."})

        marks = None
        try:
            marks = float(marks_raw)
            if marks < 0:
                raise ValueError()
        except (TypeError, ValueError):
            q_errors.append({"field": "marks", "code": "INVALID_MARKS", "message": "marks must be a non-negative number."})

        options = None
        answer_key = None
        if q_type == "mcq":
            opt_a = str(row_data.get("option_a", "") or "").strip()
            opt_b = str(row_data.get("option_b", "") or "").strip()
            opt_c = str(row_data.get("option_c", "") or "").strip()
            opt_d = str(row_data.get("option_d", "") or "").strip()
            correct = str(row_data.get("correct_option", "") or "").strip().upper()

            if not opt_a or not opt_b:
                q_errors.append({"field": "options", "code": "MISSING_OPTIONS", "message": "MCQ questions require at least option_a and option_b."})
            else:
                options = {k: v for k, v in {"A": opt_a, "B": opt_b, "C": opt_c, "D": opt_d}.items() if v}

            if correct not in ("A", "B", "C", "D"):
                q_errors.append({"field": "correct_option", "code": "INVALID_CORRECT_OPTION", "message": "correct_option must be A, B, C, or D."})
            else:
                answer_key = {"correct_option": correct}

        q_record = {
            "row_number": row_idx,
            "question_number": len(questions) + 1,
            "question_type": q_type,
            "question_text": q_text,
            "options": options,
            "marks": marks,
            "answer_key": answer_key,
            "validation_errors": q_errors,
        }

        if q_errors:
            errors.append({"row_number": row_idx, "errors": q_errors})
        questions.append(q_record)

    return questions, errors


@router.post("/exams/{exam_id}/questions/import-preview")
async def import_preview(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    """Upload Excel workbook, validate, return preview."""
    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam:
        raise NotFoundError("Exam")
    _check_professor_owns_exam(exam, actor)

    if not file.filename.endswith((".xlsx", ".xls")):
        raise AppError(415, "UNSUPPORTED_FORMAT", "Only .xlsx and .xls files are supported.")

    content = await file.read()
    if len(content) > settings.MAX_EXCEL_SIZE_BYTES:
        raise AppError(413, "FILE_TOO_LARGE", "File exceeds maximum size limit.")

    try:
        questions, errors = _parse_excel_workbook(content)
    except Exception as e:
        raise AppError(422, "PARSE_ERROR", f"Could not parse workbook: {str(e)}")

    import_id = str(uuid.uuid4())
    _import_previews[import_id] = {
        "exam_id": exam_id,
        "questions": questions,
        "actor_id": actor["sub"],
    }

    valid_count = sum(1 for q in questions if not q["validation_errors"])
    invalid_count = sum(1 for q in questions if q["validation_errors"])

    return {
        "data": {
            "import_id": import_id,
            "total_rows": len(questions),
            "valid_question_count": valid_count,
            "invalid_row_count": invalid_count,
            "questions": questions,
            "errors": errors,
        }
    }


@router.post("/exams/{exam_id}/questions/import-confirm")
async def import_confirm(
    exam_id: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
    import_id: str = None,
):
    """Confirm a previously previewed import. Persists only valid rows."""
    if not import_id or import_id not in _import_previews:
        raise AppError(404, "IMPORT_NOT_FOUND", "Import preview not found. Run import-preview first.")

    preview = _import_previews[import_id]
    if preview["exam_id"] != exam_id or preview["actor_id"] != actor["sub"]:
        raise ForbiddenError("This import preview does not belong to you.")

    stmt = select(Exam).where(Exam.exam_id == exam_id)
    exam: Exam | None = (await db.execute(stmt)).scalars().first()
    if not exam or exam.status != "draft":
        raise AppError(409, "INVALID_STATE", "Import can only be confirmed for draft exams.")

    # Get current max question number
    stmt = select(Question).where(Question.exam_id == exam_id).order_by(Question.question_number.desc()).limit(1)
    last_q = (await db.execute(stmt)).scalars().first()
    next_num = (last_q.question_number + 1) if last_q else 1

    created = 0
    for q_data in preview["questions"]:
        if q_data["validation_errors"]:
            continue  # Skip invalid rows
        q = Question(
            question_id=str(uuid.uuid4()),
            exam_id=exam_id,
            question_number=next_num,
            question_type=q_data["question_type"],
            question_text=q_data["question_text"],
            options=q_data["options"],
            marks=q_data["marks"],
            answer_key=q_data["answer_key"],
            version=1,
        )
        db.add(q)
        next_num += 1
        created += 1

    del _import_previews[import_id]
    await db.flush()

    return {"data": {"imported_count": created, "skipped_invalid": len(preview["questions"]) - created}}


@router.get("/exams/{exam_id}/questions/template")
async def download_template(
    exam_id: str,
    actor: ProfessorUser,
):
    """Return Excel template for question import."""
    import openpyxl
    from fastapi.responses import StreamingResponse

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Questions"
    headers = ["question_type", "question_text", "marks", "option_a", "option_b", "option_c", "option_d", "correct_option"]
    ws.append(headers)
    ws.append(["mcq", "Which protocol resolves domain names?", 1, "HTTP", "DNS", "FTP", "SMTP", "B"])
    ws.append(["short_answer", "Explain the OSI model.", 5, "", "", "", "", ""])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=questions_template.xlsx"},
    )
