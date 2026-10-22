"""
Tests for question template download and Excel import compatibility.
"""
from pathlib import Path
import openpyxl
import pytest

from app.api.v1.questions import download_template, _resolve_template_path, _parse_excel_workbook
from app.core.errors import AppError


@pytest.mark.asyncio
async def test_download_template_endpoint():
    # 1. Verify template path resolves to existing file
    template_path = _resolve_template_path()
    assert template_path.is_file(), f"Template not found at {template_path}"
    assert template_path.name == "questions_template.xlsx"

    # 2. Invoke download endpoint
    actor = {"sub": "prof-1", "role": "professor"}
    response = await download_template("exam-123", actor)

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
async def test_download_template_missing_file(monkeypatch):
    from app.api.v1 import questions

    monkeypatch.setattr(questions, "_resolve_template_path", lambda: Path("/nonexistent/questions_template.xlsx"))
    actor = {"sub": "prof-1", "role": "professor"}

    with pytest.raises(AppError) as exc_info:
        await download_template("exam-123", actor)

    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "TEMPLATE_NOT_FOUND"
