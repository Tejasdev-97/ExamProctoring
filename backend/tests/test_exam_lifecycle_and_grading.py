"""
ExamProctor.ai — Exam lifecycle, scoring engine, and retake unit tests.
No database connection required. Run with: python -m pytest tests -q
"""

import pytest
from types import SimpleNamespace as NS
from app.api.v1.exams import calculate_attempt_scores


def test_calculate_attempt_scores_all_mcqs_correct():
    q1 = NS(question_id="q1", question_number=1, question_type="mcq", question_text="What is 2+2?",
            marks=5.0, options={"A": "3", "B": "4"}, answer_key={"correct_option": "B"})
    q2 = NS(question_id="q2", question_number=2, question_type="mcq", question_text="What is capital of France?",
            marks=5.0, options={"A": "Paris", "B": "Rome"}, answer_key={"correct_option": "A"})

    ans1 = NS(question_id="q1", answer_value={"selected_option": "B"})
    ans2 = NS(question_id="q2", answer_value={"selected_option": "A"})

    scores = calculate_attempt_scores([q1, q2], [ans1, ans2])
    assert scores["marks_obtained"] == 10.0
    assert scores["max_marks"] == 10.0
    assert scores["grading_status"] == "graded"
    assert scores["graded_count"] == 2


def test_calculate_attempt_scores_mcq_incorrect():
    q1 = NS(question_id="q1", question_number=1, question_type="mcq", question_text="What is 2+2?",
            marks=5.0, options={"A": "3", "B": "4"}, answer_key={"correct_option": "B"})
    ans1 = NS(question_id="q1", answer_value={"selected_option": "A"})

    scores = calculate_attempt_scores([q1], [ans1])
    assert scores["marks_obtained"] == 0.0
    assert scores["max_marks"] == 5.0
    assert scores["grading_status"] == "graded"


def test_calculate_attempt_scores_manual_marks_override():
    q1 = NS(question_id="q1", question_number=1, question_type="mcq", question_text="What is 2+2?",
            marks=5.0, options={"A": "3", "B": "4"}, answer_key={"correct_option": "B"})
    # Student chose A (normally 0), but professor awarded 3.5 manual marks
    ans1 = NS(question_id="q1", answer_value={"selected_option": "A", "manual_marks": 3.5, "grading_comment": "Partial credit awarded"})

    scores = calculate_attempt_scores([q1], [ans1])
    assert scores["marks_obtained"] == 3.5
    assert scores["max_marks"] == 5.0
    assert scores["grading_status"] == "graded"
    assert scores["questions"][0]["comment"] == "Partial credit awarded"


def test_calculate_attempt_scores_short_answer_ungraded():
    q1 = NS(question_id="q1", question_number=1, question_type="short_answer", question_text="Describe TCP handshake",
            marks=10.0, options=None, answer_key=None)
    ans1 = NS(question_id="q1", answer_value={"text": "SYN, SYN-ACK, ACK"})

    # Without manual marks, short answer is ungraded
    scores = calculate_attempt_scores([q1], [ans1])
    assert scores["marks_obtained"] == 0.0
    assert scores["max_marks"] == 10.0
    assert scores["grading_status"] == "ungraded"
    assert scores["graded_count"] == 0

    # With manual marks applied
    ans1_graded = NS(question_id="q1", answer_value={"text": "SYN, SYN-ACK, ACK", "manual_marks": 9.0})
    scores_graded = calculate_attempt_scores([q1], [ans1_graded])
    assert scores_graded["marks_obtained"] == 9.0
    assert scores_graded["grading_status"] == "graded"
    assert scores_graded["graded_count"] == 1


def test_calculate_attempt_scores_partial_grading():
    q1 = NS(question_id="q1", question_number=1, question_type="mcq", question_text="Q1",
            marks=5.0, options={"A": "1", "B": "2"}, answer_key={"correct_option": "A"})
    q2 = NS(question_id="q2", question_number=2, question_type="short_answer", question_text="Q2",
            marks=5.0, options=None, answer_key=None)

    ans1 = NS(question_id="q1", answer_value={"selected_option": "A"})
    ans2 = NS(question_id="q2", answer_value={"text": "My answer"})

    scores = calculate_attempt_scores([q1, q2], [ans1, ans2])
    assert scores["marks_obtained"] == 5.0
    assert scores["max_marks"] == 10.0
    assert scores["grading_status"] == "partially_graded"
    assert scores["graded_count"] == 1
    assert scores["total_questions"] == 2


def test_answer_key_correction_impact():
    # If key was initially A, student scored 0 for answering B
    q1_old = NS(question_id="q1", question_number=1, question_type="mcq", question_text="Q1",
                marks=5.0, options={"A": "Old", "B": "New"}, answer_key={"correct_option": "A"})
    ans = NS(question_id="q1", answer_value={"selected_option": "B"})

    old_scores = calculate_attempt_scores([q1_old], [ans])
    assert old_scores["marks_obtained"] == 0.0

    # After professor corrects key to B
    q1_new = NS(question_id="q1", question_number=1, question_type="mcq", question_text="Q1",
                marks=5.0, options={"A": "Old", "B": "New"}, answer_key={"correct_option": "B"})
    new_scores = calculate_attempt_scores([q1_new], [ans])
    assert new_scores["marks_obtained"] == 5.0


from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from app.api.v1.attempts import list_my_attempts


@pytest.mark.asyncio
async def test_list_my_attempts_student_isolation():
    t0 = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    attempt1 = NS(
        attempt_id="att-1",
        exam_id="ex-1",
        student_user_id="student-A",
        attempt_number=1,
        status="submitted",
        authorized_at=t0,
        client_started_at=t0,
        server_started_at=t0,
        client_submitted_at=t0,
        server_submitted_at=t0,
        last_server_contact_at=t0,
        last_accepted_sequence=5,
        submission_received=True,
    )
    actor = {"sub": "student-A", "role": "student"}
    mock_db = AsyncMock()
    mock_result = MagicMock()
    # Mock returns tuple of (attempt, exam_title, duration_seconds)
    mock_result.all.return_value = [(attempt1, "Computer Networks", 3600)]
    mock_db.execute.return_value = mock_result

    res = await list_my_attempts(actor=actor, db=mock_db)
    assert len(res["data"]) == 1
    assert res["data"][0]["attempt_id"] == "att-1"
    assert res["data"][0]["student_user_id"] == "student-A"
    assert res["data"][0]["exam_title"] == "Computer Networks"
    assert res["data"][0]["duration_seconds"] == 3600


@pytest.mark.asyncio
async def test_authorize_attempt_multiple_attempts_selects_highest_and_consumes_grant():
    from app.api.v1.attempts import authorize_attempt
    from app.schemas.schemas import AuthorizeAttemptRequest
    from app.db.models import Exam, ExamAttempt, RetakeGrant

    exam = Exam(
        exam_id="ex-1",
        owner_user_id="prof-1",
        title="Internet of Things",
        exam_code="480223",
        duration_seconds=1800,
        status="active",
        question_package_version=1,
    )

    # Student has previously submitted attempt 3
    submitted_att3 = ExamAttempt(
        attempt_id="att-3",
        exam_id="ex-1",
        student_user_id="student-A",
        attempt_number=3,
        status="submitted",
        package_version=1,
        authorization_id="auth-prev",
        authorized_at=datetime.now(timezone.utc),
        last_accepted_sequence=10,
        submission_received=True,
    )

    grant = RetakeGrant(
        retake_grant_id="grant-1",
        exam_id="ex-1",
        student_user_id="student-A",
        granted_by_user_id="prof-1",
        status="granted",
    )

    actor = {"sub": "student-A", "role": "student"}
    body = AuthorizeAttemptRequest(exam_code="480223")

    # Mock execute results:
    # 1. exam lookup -> exam
    # 2. existing in-progress -> None
    # 3. submitted lookup -> submitted_att3
    # 4. retake grant lookup -> grant
    res1, res2, res3, res4 = MagicMock(), MagicMock(), MagicMock(), MagicMock()
    res1.scalars.return_value.first.return_value = exam
    res2.scalars.return_value.first.return_value = None
    res3.scalars.return_value.first.return_value = submitted_att3
    res4.scalars.return_value.first.return_value = grant

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [res1, res2, res3, res4]

    result = await authorize_attempt(body=body, actor=actor, db=mock_db)

    # Verify attempt_number incremented from 3 to 4 (not duplicate 3)
    assert result["data"].attempt_number == 4
    assert result["data"].status == "authorized"
    assert result["data"].student_user_id == "student-A"
    assert result["data"].exam_id == "ex-1"

    # Verify grant was consumed and assigned the new attempt_id
    assert grant.status == "consumed"
    assert grant.consumed_at is not None
    assert grant.consumed_by_attempt_id == result["data"].attempt_id

    # Verify the submitted attempt query used order_by descending
    submitted_query = mock_db.execute.call_args_list[2][0][0]
    assert len(submitted_query._order_by_clauses) > 0


@pytest.mark.asyncio
async def test_authorize_attempt_submitted_without_grant_raises_conflict():
    from app.api.v1.attempts import authorize_attempt
    from app.schemas.schemas import AuthorizeAttemptRequest
    from app.core.errors import ConflictError
    from app.db.models import Exam, ExamAttempt

    exam = Exam(
        exam_id="ex-1",
        owner_user_id="prof-1",
        title="Internet of Things",
        exam_code="480223",
        duration_seconds=1800,
        status="active",
        question_package_version=1,
    )
    submitted_att1 = ExamAttempt(
        attempt_id="att-1",
        exam_id="ex-1",
        student_user_id="student-A",
        attempt_number=1,
        status="submitted",
        package_version=1,
        authorization_id="auth-prev",
        authorized_at=datetime.now(timezone.utc),
        last_accepted_sequence=5,
        submission_received=True,
    )

    actor = {"sub": "student-A", "role": "student"}
    body = AuthorizeAttemptRequest(exam_code="480223")

    res1, res2, res3, res4 = MagicMock(), MagicMock(), MagicMock(), MagicMock()
    res1.scalars.return_value.first.return_value = exam
    res2.scalars.return_value.first.return_value = None
    res3.scalars.return_value.first.return_value = submitted_att1
    res4.scalars.return_value.first.return_value = None  # No active grant

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [res1, res2, res3, res4]

    with pytest.raises(ConflictError) as exc_info:
        await authorize_attempt(body=body, actor=actor, db=mock_db)

    assert "retake requires professor authorization" in str(exc_info.value.message)


