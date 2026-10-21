"""
ExamProctor.ai — Security utilities
Password hashing and JWT token creation/verification.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from jose import JWTError, jwt
import bcrypt

from app.core.config import settings

BCRYPT_MAX_BYTES = 72

ALGORITHM = "HS256"


# ── Password ─────────────────────────────────────────────────────────────────

class PasswordTooLongError(ValueError):
    """bcrypt only uses the first 72 bytes; longer passwords are rejected, never truncated."""


def _encode(plain: str) -> bytes:
    data = plain.encode("utf-8")
    if len(data) > BCRYPT_MAX_BYTES:
        raise PasswordTooLongError(
            f"Password must be at most {BCRYPT_MAX_BYTES} bytes when UTF-8 encoded."
        )
    return data


def hash_password(plain: str) -> str:
    """Return a bcrypt ($2b$) hash. Raises PasswordTooLongError if > 72 bytes."""
    return bcrypt.hashpw(_encode(plain), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time verify. Over-long or malformed input returns False."""
    try:
        return bcrypt.checkpw(_encode(plain), hashed.encode("ascii"))
    except (PasswordTooLongError, ValueError):
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: str,
    role: str,
    extra: dict | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    if expires_delta is not None:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    payload = {
        "sub": subject,
        "role": role,
        "jti": str(uuid.uuid4()),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {
        "sub": subject,
        "jti": str(uuid.uuid4()),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises JWTError if invalid."""
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None
