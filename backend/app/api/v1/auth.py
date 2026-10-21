"""
ExamProctor.ai — Authentication endpoints.
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/refresh
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import User, AuditLog
from app.core.security import verify_password, create_access_token, create_refresh_token
from app.core.errors import UnauthorizedError, AppError
from app.core.permissions import get_current_user
from app.schemas.schemas import LoginRequest, LoginResponse, UserOut, SessionOut
from app.core.config import settings
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])


def _usn_from_user(user: User) -> str | None:
    return user.usn_normalized if user.role == "student" else None


@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a user by USN/email + password."""
    # Find user by email or USN (case-insensitive USN)
    identifier = body.identifier.strip()
    stmt = select(User).where(
        (User.email == identifier) | (User.usn_normalized == identifier.upper())
    )
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Invalid credentials.")

    if user.account_status != "active":
        raise AppError(403, "ACCOUNT_INACTIVE", "This account is not active.")

    # Create tokens
    access_token = create_access_token(
        subject=user.user_id,
        role=user.role,
        extra={"name": user.full_name, "usn": user.usn_normalized},
    )
    refresh_token = create_refresh_token(subject=user.user_id)

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)

    # Audit log
    log = AuditLog(
        actor_user_id=user.user_id,
        action_type="user_login",
        target_type="user",
        target_id=user.user_id,
        result="success",
    )
    db.add(log)

    # Set httpOnly cookie (also return token for API clients)
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",
    )

    return {
        "data": {
            "user": UserOut(
                user_id=user.user_id,
                full_name=user.full_name,
                role=user.role,
                usn=_usn_from_user(user),
                usn_normalized=_usn_from_user(user),
                email=user.email,
                account_status=user.account_status,
                created_at=user.created_at,
            ),
            "session": SessionOut(expires_at=expires.isoformat()),
            "access_token": access_token,
        }
    }


@router.post("/logout", status_code=204)
async def logout(response: Response, _: dict = Depends(get_current_user)):
    """End authenticated session."""
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh")
    return None


@router.get("/me")
async def me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile."""
    stmt = select(User).where(User.user_id == current_user["sub"])
    result = await db.execute(stmt)
    user: User | None = result.scalars().first()
    if not user:
        raise UnauthorizedError("User not found.")

    return {
        "data": UserOut(
            user_id=user.user_id,
            full_name=user.full_name,
            role=user.role,
            usn=_usn_from_user(user),
            usn_normalized=_usn_from_user(user),
            email=user.email,
            account_status=user.account_status,
            created_at=user.created_at,
        )
    }
