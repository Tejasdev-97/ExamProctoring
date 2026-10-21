"""
ExamProctor.ai — Video Analysis Unit Tests
Verifies video timestamp formatting, session PDF data assembly, and pure logic.
"""

from app.api.v1.video_analysis import _format_video_time
from app.api.v1.reports import render_report_pdf


def test_video_timestamp_formatting():
    assert _format_video_time(0) == "00:00:00.000"
    assert _format_video_time(1500) == "00:00:01.500"
    assert _format_video_time(65432) == "00:01:05.432"
    assert _format_video_time(3661500) == "01:01:01.500"
    assert _format_video_time(None) == "00:00:00.000"


def test_video_analysis_pdf_render():
    pdf_data = {
        "title": "Recorded-Video Proctoring Analysis Report",
        "subtitle": "Session ID: test-session-uuid-1234",
        "info_rows": [
            ("Source Video File", "sample_exam_proctor.mp4"),
            ("Video File Size", "14.25 MB"),
            ("SHA-256 Checksum", "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"),
            ("Playback Duration", "54.2 s"),
            ("Analysis Status", "COMPLETED"),
            ("Analyzed By", "Professor Tests"),
            ("Pipeline Version", "1.0.0"),
        ],
        "summary": [
            ("phone_detected", 1),
            ("multiple_faces", 1),
            ("face_absent", 0),
        ],
        "events": [
            {
                "label": "phone_detected",
                "status": "confirmed",
                "start": "Video time: 00:00:12.300",
                "end": "Video time: 00:00:15.800",
                "duration_ms": 3500,
                "received": "2026-10-19 10:00:00",
                "confidence": 0.88,
                "detail": "Detector: MediaPipe Tasks Vision",
                "evidence": {
                    "state": "unavailable",
                    "message": "No snapshot captured for this event.",
                },
            },
            {
                "label": "multiple_faces",
                "status": "confirmed",
                "start": "Video time: 00:00:25.000",
                "end": "Video time: 00:00:28.200",
                "duration_ms": 3200,
                "received": "2026-10-19 10:00:15",
                "confidence": 0.94,
                "detail": "Detector: MediaPipe Tasks Vision",
                "evidence": {
                    "state": "unavailable",
                    "message": "Evidence could not be captured during playback.",
                },
            },
        ],
        "notes": [
            "All event start/end timestamps are video-relative, aligned directly to playback time.",
            "Inference was performed locally in the browser using MediaPipe Tasks Vision.",
        ],
    }

    pdf_bytes = render_report_pdf(pdf_data)
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000


import pytest
from unittest.mock import AsyncMock, MagicMock
from types import SimpleNamespace as NS
from app.api.v1.video_analysis import delete_analysis_session
from app.core.errors import ForbiddenError, NotFoundError


def make_mock_result(first_item=None):
    m = MagicMock()
    m.scalars.return_value.first.return_value = first_item
    return m


@pytest.mark.asyncio
async def test_delete_analysis_session_authorized():
    session = NS(
        video_analysis_session_id="sess-1234",
        created_by_user_id="prof-1",
        source_filename="test_video.mp4",
    )
    actor = {"sub": "prof-1", "role": "professor"}
    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=session)

    res = await delete_analysis_session(session_id="sess-1234", actor=actor, db=mock_db)
    assert res["data"]["deleted"] is True
    assert res["data"]["session_id"] == "sess-1234"
    mock_db.add.assert_called_once()
    audit_entry = mock_db.add.call_args[0][0]
    assert audit_entry.action_type == "video_analysis_session_deleted"
    assert audit_entry.target_id == "sess-1234"


@pytest.mark.asyncio
async def test_delete_analysis_session_forbidden_for_other_user():
    session = NS(
        video_analysis_session_id="sess-1234",
        created_by_user_id="prof-1",
        source_filename="test_video.mp4",
    )
    # Different professor trying to delete someone else's session
    actor = {"sub": "prof-2", "role": "professor"}
    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=session)

    with pytest.raises(ForbiddenError):
        await delete_analysis_session(session_id="sess-1234", actor=actor, db=mock_db)


@pytest.mark.asyncio
async def test_delete_analysis_session_not_found():
    actor = {"sub": "prof-1", "role": "professor"}
    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=None)

    with pytest.raises(NotFoundError):
        await delete_analysis_session(session_id="sess-missing", actor=actor, db=mock_db)

