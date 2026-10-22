"""
Tests for question template download, authentication, and Excel import compatibility.
"""
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta
import openpyxl
import pytest
from starlette.testclient import TestClient

from app.main import app
from app.api.v1.questions import download_template, _resolve_template_path, _parse_excel_workbook
from app.core.errors import AppError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.permissions import _extract_token, get_current_user
from app.core.security import create_access_token
from app.db.models import Exam


@pytest.fixture
def mock_exam():
    return Exam(
        exam_id="exam-123",
        owner_user_id="prof-1",
        title="Sample Exam",
        status="draft",
    )


@pytest.mark.asyncio
async def test_download_template_endpoint_authorized_owner(mock_exam):
    # 1. Verify template path resolves to existing file
    template_path = _resolve_template_path()
    assert template_path.is_file(), f"Template not found at {template_path}"
    assert template_path.name == "questions_template.xlsx"

    # 2. Invoke download endpoint with mock db and owner professor
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = mock_exam
    db.execute.return_value = result_mock

    response = await download_template("exam-123", actor, db)

    assert response.status_code == 200
    assert response.media_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "attachment; filename=questions_template.xlsx" in response.headers.get("content-disposition", "")
    assert Path(response.path).is_file()

    # 3. Verify workbook structure and headers
    wb = openpyxl.load_workbook(response.path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    expected_headers = (
        "question_type",
        "question_text",
        "marks",
        "option_a",
        "option_b",
        "option_c",
        "option_d",
        "correct_option",
    )
    assert rows[0] == expected_headers

    # 4. Verify question counts and types
    data_rows = rows[1:]
    assert len(data_rows) == 6

    mcqs = [r for r in data_rows if r[0] == "mcq"]
    short_answers = [r for r in data_rows if r[0] == "short_answer"]
    assert len(mcqs) == 4
    assert len(short_answers) == 2

    # Verify specific content
    assert mcqs[0][1] == "What is the national animal of India?"
    assert mcqs[0][2] == 1
    assert mcqs[0][7] == "B"

    assert mcqs[1][1] == "What is the national bird of India?"
    assert mcqs[1][7] == "A"

    assert mcqs[2][1] == "What is the national flower of India?"
    assert mcqs[2][7] == "B"

    assert mcqs[3][1] == "What is the national anthem of India?"
    assert mcqs[3][7] == "C"

    assert short_answers[0][1] == "What is the capital of India?"
    assert short_answers[0][2] == 2
    assert all(col is None for col in short_answers[0][3:8])

    assert short_answers[1][1] == "Name the national flag's three colours, excluding the Ashoka Chakra."
    assert short_answers[1][2] == 2
    assert all(col is None for col in short_answers[1][3:8])

    # 5. Verify workbook compatibility with _parse_excel_workbook
    with open(response.path, "rb") as f:
        content = f.read()

    questions, errors = _parse_excel_workbook(content)
    assert len(questions) == 6
    assert len(errors) == 0
    assert all(len(q["validation_errors"]) == 0 for q in questions)


@pytest.mark.asyncio
async def test_download_template_endpoint_authorized_admin(mock_exam):
    actor = {"sub": "admin-1", "role": "admin"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = mock_exam
    db.execute.return_value = result_mock

    response = await download_template("exam-123", actor, db)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_download_template_endpoint_forbidden_other_professor(mock_exam):
    actor = {"sub": "prof-2", "role": "professor"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = mock_exam
    db.execute.return_value = result_mock

    with pytest.raises(ForbiddenError):
        await download_template("exam-123", actor, db)


@pytest.mark.asyncio
async def test_download_template_endpoint_exam_not_found():
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = result_mock

    with pytest.raises(NotFoundError):
        await download_template("nonexistent-exam", actor, db)


@pytest.mark.asyncio
async def test_download_template_missing_file(monkeypatch, mock_exam):
    from app.api.v1 import questions

    monkeypatch.setattr(questions, "_resolve_template_path", lambda: Path("/nonexistent/questions_template.xlsx"))
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = mock_exam
    db.execute.return_value = result_mock

    with pytest.raises(AppError) as exc_info:
        await download_template("exam-123", actor, db)

    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "TEMPLATE_NOT_FOUND"


def test_token_extraction_mechanisms():
    # 1. Bearer token
    creds = MagicMock(credentials="token-bearer")
    assert _extract_token(credentials=creds) == "token-bearer"

    # 2. Cookie
    assert _extract_token(credentials=None, access_token="token-cookie") == "token-cookie"

    # 3. Query param token
    assert _extract_token(credentials=None, access_token=None, token="token-query") == "token-query"

    # 4. Query param access_token
    assert _extract_token(credentials=None, access_token=None, token=None, access_token_query="token-param") == "token-param"

    # 5. Missing token
    assert _extract_token(credentials=None, access_token=None, token=None, access_token_query=None) is None


def test_download_route_authentication_via_client():
    client = TestClient(app, raise_server_exceptions=False)

    # 1. Direct unauthenticated request -> returns 401 Unauthorized
    resp = client.get("/api/v1/exams/any-exam/questions/template")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"

    # 2. Expired token -> returns 401 Unauthorized
    expired_token = create_access_token(
        subject="prof-1",
        role="professor",
        expires_delta=timedelta(minutes=-10),
    )
    resp_expired = client.get(
        "/api/v1/exams/any-exam/questions/template",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp_expired.status_code == 401
    assert resp_expired.json()["error"]["code"] == "UNAUTHORIZED"

    # 3. Query param token with expired token -> returns 401 Unauthorized
    resp_q_expired = client.get(f"/api/v1/exams/any-exam/questions/template?token={expired_token}")
    assert resp_q_expired.status_code == 401
    assert resp_q_expired.json()["error"]["code"] == "UNAUTHORIZED"
