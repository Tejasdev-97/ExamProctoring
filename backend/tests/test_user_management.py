"""
ExamProctor.ai — User Management: Password Reset & Safe Account Deletion Unit Tests.
No live database connection required. Run with: python -m pytest tests -q
"""

import pytest
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, MagicMock
from app.api.v1.users import credential_reset, delete_user, ResetPasswordRequest
from app.core.security import hash_password, verify_password
from app.core.errors import AppError, NotFoundError


def make_mock_result(first_item=None, scalar_val=0):
    m = MagicMock()
    m.scalars.return_value.first.return_value = first_item
    m.scalar.return_value = scalar_val
    return m


@pytest.mark.asyncio
async def test_password_reset_with_admin_provided_password():
    user = NS(user_id="u-target", full_name="John Doe", role="student", password_hash=hash_password("OldPassword123!"))
    actor = {"sub": "u-admin", "role": "admin"}

    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=user)

    req = ResetPasswordRequest(new_password="NewSecurePassword456!")
    result = await credential_reset(user_id="u-target", actor=actor, body=req, db=mock_db)

    assert result["data"]["user_id"] == "u-target"
    assert "temp_password" not in result["data"]
    # Previous password fails
    assert not verify_password("OldPassword123!", user.password_hash)
    # New password succeeds
    assert verify_password("NewSecurePassword456!", user.password_hash)

    # Check audit log added without password in plaintext
    mock_db.add.assert_called_once()
    audit_entry = mock_db.add.call_args[0][0]
    assert audit_entry.action_type == "credential_reset"
    assert audit_entry.actor_user_id == "u-admin"
    assert audit_entry.target_id == "u-target"
    assert "NewSecurePassword456!" not in str(audit_entry.meta)


@pytest.mark.asyncio
async def test_password_reset_too_short_rejected():
    user = NS(user_id="u-target", full_name="John Doe", role="student", password_hash=hash_password("OldPassword123!"))
    actor = {"sub": "u-admin", "role": "admin"}

    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=user)

    req = ResetPasswordRequest(new_password="short")
    with pytest.raises(AppError) as exc:
        await credential_reset(user_id="u-target", actor=actor, body=req, db=mock_db)
    assert exc.value.status_code == 422
    assert "at least 8 characters" in exc.value.message


@pytest.mark.asyncio
async def test_password_reset_admin_self_reset():
    admin = NS(user_id="u-admin", full_name="Admin Self", role="admin", password_hash=hash_password("OldAdminPwd123!"))
    actor = {"sub": "u-admin", "role": "admin"}

    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=admin)

    req = ResetPasswordRequest(new_password="NewAdminPassword789!")
    result = await credential_reset(user_id="u-admin", actor=actor, body=req, db=mock_db)

    assert result["data"]["user_id"] == "u-admin"
    assert verify_password("NewAdminPassword789!", admin.password_hash)

    audit_entry = mock_db.add.call_args[0][0]
    assert audit_entry.meta["is_self_reset"] is True


@pytest.mark.asyncio
async def test_password_reset_admin_resets_another_admin():
    target_admin = NS(user_id="u-admin-2", full_name="Second Admin", role="admin", password_hash=hash_password("OldAdmin2!"))
    actor = {"sub": "u-admin-1", "role": "admin"}

    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=target_admin)

    req = ResetPasswordRequest(new_password="Admin2ResetPassword!")
    result = await credential_reset(user_id="u-admin-2", actor=actor, body=req, db=mock_db)

    assert result["data"]["user_id"] == "u-admin-2"
    assert verify_password("Admin2ResetPassword!", target_admin.password_hash)


@pytest.mark.asyncio
async def test_password_reset_generates_temp_when_no_body():
    user = NS(user_id="u-target", full_name="John Doe", role="student", password_hash=hash_password("OldPassword123!"))
    actor = {"sub": "u-admin", "role": "admin"}

    mock_db = AsyncMock()
    mock_db.execute.return_value = make_mock_result(first_item=user)

    result = await credential_reset(user_id="u-target", actor=actor, body=None, db=mock_db)
    temp_pwd = result["data"]["temp_password"]
    assert len(temp_pwd) >= 16
    assert verify_password(temp_pwd, user.password_hash)


@pytest.mark.asyncio
async def test_delete_user_self_deletion_blocked():
    actor = {"sub": "u-admin", "role": "admin"}
    mock_db = AsyncMock()

    with pytest.raises(AppError) as exc:
        await delete_user(user_id="u-admin", actor=actor, db=mock_db)
    assert exc.value.status_code == 400
    assert "cannot delete your own account" in exc.value.message


@pytest.mark.asyncio
async def test_delete_user_last_admin_blocked():
    actor = {"sub": "u-admin-1", "role": "admin"}
    target_admin = NS(user_id="u-admin-2", full_name="Second Admin", role="admin", account_status="active")

    mock_db = AsyncMock()

    def mock_exec(stmt):
        s = str(stmt)
        if "WHERE users.user_id =" in s:
            return make_mock_result(first_item=target_admin)
        else:
            return make_mock_result(scalar_val=1)

    mock_db.execute.side_effect = mock_exec

    with pytest.raises(AppError) as exc:
        await delete_user(user_id="u-admin-2", actor=actor, db=mock_db)
    assert exc.value.status_code == 400
    assert "last remaining active System Administrator" in exc.value.message


@pytest.mark.asyncio
async def test_delete_user_with_academic_records_anonymizes():
    actor = {"sub": "u-admin-1", "role": "admin"}
    student = NS(user_id="u-student-1", full_name="Student Bob", role="student", email="bob@test.com", usn_normalized="1AB21CS099", password_hash="hash", account_status="active")

    mock_db = AsyncMock()

    def mock_exec(stmt):
        s = str(stmt)
        if "WHERE users.user_id =" in s:
            return make_mock_result(first_item=student)
        elif "exam_attempts" in s:
            return make_mock_result(scalar_val=2)
        else:
            return make_mock_result(scalar_val=0)

    mock_db.execute.side_effect = mock_exec

    res = await delete_user(user_id="u-student-1", actor=actor, db=mock_db)
    assert res["data"]["deletion_type"] == "anonymized_preserved"
    # User was anonymized
    assert student.full_name.startswith("[Deleted User")
    assert student.email is None
    assert student.usn_normalized is None
    assert student.password_hash is None
    assert student.account_status == "locked"
    # Not hard-deleted
    mock_db.delete.assert_not_called()
    mock_db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_delete_user_without_records_hard_deletes():
    actor = {"sub": "u-admin-1", "role": "admin"}
    user = NS(user_id="u-fresh-1", full_name="Fresh User", role="student", email="fresh@test.com", usn_normalized="1AB21CS100", password_hash="hash", account_status="active")

    mock_db = AsyncMock()

    def mock_exec(stmt):
        s = str(stmt)
        if "WHERE users.user_id =" in s:
            return make_mock_result(first_item=user)
        else:
            return make_mock_result(scalar_val=0)

    mock_db.execute.side_effect = mock_exec

    res = await delete_user(user_id="u-fresh-1", actor=actor, db=mock_db)
    assert res["data"]["deletion_type"] == "hard_deleted"
    mock_db.delete.assert_called_once_with(user)
    mock_db.commit.assert_called_once()
