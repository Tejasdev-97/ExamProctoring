"""
ExamProctor.ai — User administration endpoints.
Restricted to admin role unless documented otherwise.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_, not_
import uuid

from pydantic import BaseModel, Field
from app.db.session import get_db
from app.db.models import (
    User, AuditLog, Exam, ExamAttempt, RetakeGrant,
    VideoAnalysisSession, SystemSetting,
)
from app.core.security import hash_password
from app.core.permissions import AdminUser, AnyUser
from app.core.errors import NotFoundError, ConflictError, ForbiddenError, ValidationError, AppError
from app.schemas.schemas import CreateUserRequest, UpdateUserRequest, UserOut
import secrets
import string

router = APIRouter(prefix="/users", tags=["users"])


class ResetPasswordRequest(BaseModel):
    new_password: Optional[str] = None


def _generate_temp_password(length: int = 16) -> str:
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _normalize_usn(usn: str | None) -> str | None:
    if not usn or not usn.strip():
        return None
    return usn.strip().upper()


@router.post("", status_code=201)
async def create_user(
    body: CreateUserRequest,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user account. Admin only."""
    # Normalize USN for students
    usn = _normalize_usn(body.usn) if body.usn else None

    # Check USN uniqueness for students
    if usn:
        stmt = select(User).where(User.usn_normalized == usn)
        existing = (await db.execute(stmt)).scalars().first()
        if existing:
            raise ConflictError(f"A student with USN {usn} already exists.")

    # Check email uniqueness
    if body.email:
        stmt = select(User).where(User.email == body.email)
        existing = (await db.execute(stmt)).scalars().first()
        if existing:
            raise ConflictError("An account with that email already exists.")

    # Hash password (or generate a temp one)
    password = body.password or _generate_temp_password()
    try:
        pwd_hash = hash_password(password)
    except ValueError as e:
        raise ValidationError(str(e))

    user = User(
        user_id=str(uuid.uuid4()),
        full_name=body.full_name,
        email=body.email,
        role=body.role,
        usn_normalized=usn,
        password_hash=pwd_hash,
        account_status="active",
        created_by_user_id=actor["sub"],
    )
    db.add(user)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="user_created",
        target_type="user",
        target_id=user.user_id,
        result="success",
        meta={"role": body.role},
    )
    db.add(log)

    await db.flush()
    return {
        "data": UserOut(
            user_id=user.user_id,
            full_name=user.full_name,
            role=user.role,
            usn=user.usn_normalized,
            usn_normalized=user.usn_normalized,
            email=user.email,
            account_status=user.account_status,
            created_at=user.created_at,
        ),
        "meta": {"temp_password_set": body.password is None},
    }


@router.get("")
async def list_users(
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
    role: str | None = Query(None),
    account_status: str | None = Query(None),
    limit: int = Query(50, le=200),
    cursor: str | None = Query(None),
):
    """List user accounts. Admin only."""
    stmt = select(User).where(not_(User.full_name.startswith("[Deleted"))).order_by(User.created_at.desc()).limit(limit)
    if role:
        stmt = stmt.where(User.role == role)
    if account_status:
        stmt = stmt.where(User.account_status == account_status)

    result = await db.execute(stmt)
    users = result.scalars().all()

    return {
        "data": [
            UserOut(
                user_id=u.user_id,
                full_name=u.full_name,
                role=u.role,
                usn=u.usn_normalized,
                usn_normalized=u.usn_normalized,
                email=u.email,
                account_status=u.account_status,
                created_at=u.created_at,
            )
            for u in users
        ],
        "meta": {"has_more": len(users) == limit, "next_cursor": None},
    }


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve a user record. Admin only."""
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")

    return {
        "data": UserOut(
            user_id=user.user_id,
            full_name=user.full_name,
            role=user.role,
            usn=user.usn_normalized,
            usn_normalized=user.usn_normalized,
            email=user.email,
            account_status=user.account_status,
            created_at=user.created_at,
        )
    }


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Update permitted user fields. Admin only."""
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.email is not None:
        user.email = body.email
    if body.account_status is not None:
        user.account_status = body.account_status
    if body.role is not None:
        # Log role changes
        old_role = user.role
        user.role = body.role
        log = AuditLog(
            actor_user_id=actor["sub"],
            action_type="user_role_changed",
            target_type="user",
            target_id=user_id,
            result="success",
            meta={"old_role": old_role, "new_role": body.role},
        )
        db.add(log)

    return {
        "data": UserOut(
            user_id=user.user_id,
            full_name=user.full_name,
            role=user.role,
            usn=user.usn_normalized,
            usn_normalized=user.usn_normalized,
            email=user.email,
            account_status=user.account_status,
            created_at=user.created_at,
        )
    }


@router.post("/{user_id}/deactivate", status_code=204)
async def deactivate_user(
    user_id: str,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Deactivate an account. Admin only."""
    from datetime import datetime, timezone
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")
    if user.user_id == actor["sub"]:
        raise ForbiddenError("You cannot deactivate your own account.")

    user.account_status = "inactive"
    user.deactivated_at = datetime.now(timezone.utc)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="user_deactivated",
        target_type="user",
        target_id=user_id,
        result="success",
    )
    db.add(log)
    return None


@router.post("/{user_id}/activate", status_code=204)
async def activate_user(
    user_id: str,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Reactivate an account. Admin only."""
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")

    user.account_status = "active"
    user.deactivated_at = None

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="user_activated",
        target_type="user",
        target_id=user_id,
        result="success",
    )
    db.add(log)
    return None


@router.post("/{user_id}/reset-credentials")
@router.post("/{user_id}/credential-reset")
async def credential_reset(
    user_id: str,
    actor: AdminUser,
    body: Optional[ResetPasswordRequest] = None,
    db: AsyncSession = Depends(get_db),
):
    """Reset a user's password. Admin only. Supports both admin-provided and generated temporary passwords."""
    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")

    is_temp = False
    if body and body.new_password is not None:
        if len(body.new_password) < 8:
            raise AppError(422, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters long.")
        pwd = body.new_password
    else:
        pwd = _generate_temp_password()
        is_temp = True

    user.password_hash = hash_password(pwd)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="credential_reset",
        target_type="user",
        target_id=user_id,
        result="success",
        meta={
            "is_self_reset": user_id == actor["sub"],
            "temp_password_generated": is_temp,
            "target_role": user.role,
        },
    )
    db.add(log)

    resp_data = {
        "user_id": user_id,
        "message": "Password reset successfully.",
    }
    if is_temp:
        resp_data["temp_password"] = pwd
        resp_data["message"] = "Temporary password generated. Deliver it securely and require the user to change it."

    return {"data": resp_data}


@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a user account safely according to data retention rules. Admin only."""
    if user_id == actor["sub"]:
        raise AppError(400, "CANNOT_DELETE_SELF", "You cannot delete your own account.")

    stmt = select(User).where(User.user_id == user_id)
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise NotFoundError("User")

    if user.role == "admin":
        active_admins = (await db.execute(
            select(func.count()).select_from(User).where(
                User.role == "admin",
                User.account_status == "active",
                not_(User.full_name.startswith("[Deleted")),
            )
        )).scalar() or 0
        if active_admins <= 1:
            raise AppError(400, "CANNOT_DELETE_LAST_ADMIN", "Cannot delete the last remaining active System Administrator.")

    # Check dependencies across tables
    has_exams = ((await db.execute(select(func.count()).select_from(Exam).where(Exam.owner_user_id == user_id))).scalar() or 0) > 0
    has_attempts = ((await db.execute(select(func.count()).select_from(ExamAttempt).where(ExamAttempt.student_user_id == user_id))).scalar() or 0) > 0
    has_retakes = ((await db.execute(select(func.count()).select_from(RetakeGrant).where(or_(RetakeGrant.student_user_id == user_id, RetakeGrant.granted_by_user_id == user_id)))).scalar() or 0) > 0
    has_video_sessions = ((await db.execute(select(func.count()).select_from(VideoAnalysisSession).where(VideoAnalysisSession.created_by_user_id == user_id))).scalar() or 0) > 0

    has_academic_records = has_exams or has_attempts or has_retakes or has_video_sessions

    if has_academic_records:
        deletion_type = "anonymized_preserved"
        user.full_name = f"[Deleted User {user.user_id[:8]}]"
        user.email = None
        user.usn_normalized = None
        user.password_hash = None
        user.account_status = "locked"
        user.deactivated_at = datetime.now(timezone.utc)
    else:
        deletion_type = "hard_deleted"
        await db.execute(update(User).where(User.created_by_user_id == user_id).values(created_by_user_id=None))
        await db.execute(update(SystemSetting).where(SystemSetting.updated_by_user_id == user_id).values(updated_by_user_id=None))
        await db.execute(update(AuditLog).where(AuditLog.actor_user_id == user_id).values(actor_user_id=None))
        await db.delete(user)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="user_deleted",
        target_type="user",
        target_id=user_id,
        result="success",
        meta={
            "deletion_type": deletion_type,
            "target_role": user.role,
            "has_academic_records": has_academic_records,
        },
    )
    db.add(log)
    await db.commit()

    return {
        "data": {
            "user_id": user_id,
            "deletion_type": deletion_type,
            "message": "User account successfully deleted.",
        }
    }
