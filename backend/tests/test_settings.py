"""
ExamProctor.ai — System settings and proctoring defaults test suite.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.v1.settings import upsert_setting, list_settings, get_setting, SETTING_VALIDATIONS
from app.api.v1.exams import create_exam
from app.schemas.schemas import UpdateSettingRequest, CreateExamRequest
from app.core.errors import BadRequestError, NotFoundError


@pytest.mark.asyncio
async def test_upsert_setting_valid_phone_threshold():
    actor = {"sub": "admin-1", "role": "admin"}
    db = AsyncMock()
    # Mock select query returning existing=None
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = result_mock

    body = UpdateSettingRequest(setting_value=0.55, description="Updated phone threshold")
    res = await upsert_setting("phone_detection_threshold", body, actor, db)

    assert res["data"].setting_key == "phone_detection_threshold"
    assert res["data"].setting_value == 0.55
    db.add.assert_called()


@pytest.mark.asyncio
async def test_upsert_setting_rejects_out_of_bounds_phone_threshold():
    actor = {"sub": "admin-1", "role": "admin"}
    db = AsyncMock()

    # Below min (0.3)
    body_low = UpdateSettingRequest(setting_value=0.15)
    with pytest.raises(BadRequestError) as exc_info:
        await upsert_setting("phone_detection_threshold", body_low, actor, db)
    assert "cannot be less than 0.3" in str(exc_info.value)

    # Above max (0.95)
    body_high = UpdateSettingRequest(setting_value=0.99)
    with pytest.raises(BadRequestError) as exc_info2:
        await upsert_setting("phone_detection_threshold", body_high, actor, db)
    assert "cannot be greater than 0.95" in str(exc_info2.value)


@pytest.mark.asyncio
async def test_upsert_setting_rejects_invalid_type():
    actor = {"sub": "admin-1", "role": "admin"}
    db = AsyncMock()

    body = UpdateSettingRequest(setting_value="invalid_string")
    with pytest.raises(BadRequestError) as exc:
        await upsert_setting("phone_detection_threshold", body, actor, db)
    assert "must be a number" in str(exc.value)

    body_bool = UpdateSettingRequest(setting_value=True)
    with pytest.raises(BadRequestError) as exc2:
        await upsert_setting("phone_detection_threshold", body_bool, actor, db)
    assert "must be a number" in str(exc2.value)


@pytest.mark.asyncio
async def test_create_exam_inherits_system_settings_defaults():
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()

    # Mock system settings query
    setting1 = MagicMock(setting_key="phone_detection_threshold", setting_value=0.50)
    setting2 = MagicMock(setting_key="face_absence_grace_ms", setting_value=4000)
    setting3 = MagicMock(setting_key="phone_confirm_ms", setting_value=800)

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [setting1, setting2, setting3]
    db.execute.return_value = result_mock

    body = CreateExamRequest(
        title="Midterm Exam",
        duration_seconds=3600,
        instructions="Complete all questions",
        proctoring_config=None,  # Not provided, must inherit
    )

    res = await create_exam(body, actor, db)
    exam_out = res["data"]

    assert exam_out.proctoring_config["phone_detection_threshold"] == 0.50
    assert exam_out.proctoring_config["face_absence_grace_ms"] == 4000
    assert exam_out.proctoring_config["phone_confirm_ms"] == 800


@pytest.mark.asyncio
async def test_list_settings_returns_all_eleven_defaults():
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()
    # Empty DB
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute.return_value = result_mock

    res = await list_settings(actor, db)
    settings = res["data"]
    assert len(settings) == 11
    keys = {s.setting_key for s in settings}
    expected = {
        "face_absence_grace_ms",
        "multiple_faces_grace_ms",
        "sustained_head_turn_ms",
        "phone_detection_threshold",
        "phone_confirm_ms",
        "head_turn_yaw_threshold",
        "head_turn_pitch_threshold",
        "live_sampling_interval_ms",
        "video_sampling_interval_ms",
        "max_snapshot_size_bytes",
        "offline_continuation_default",
    }
    assert keys == expected


@pytest.mark.asyncio
async def test_get_setting_auto_populates_missing():
    actor = {"sub": "prof-1", "role": "professor"}
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = None
    db.execute.return_value = result_mock

    res = await get_setting("phone_confirm_ms", actor, db)
    assert res["data"].setting_key == "phone_confirm_ms"
    assert res["data"].setting_value == 1000

