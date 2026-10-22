"""
ExamProctor.ai — Role-based permission enforcement.
FastAPI dependencies that verify authenticated user roles.
"""

from typing import Annotated
from fastapi import Depends, Cookie, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.security import decode_access_token
from app.core.errors import UnauthorizedError, ForbiddenError

security = HTTPBearer(auto_error=False)


def _extract_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    access_token: str | None = Cookie(default=None),
    token: str | None = Query(default=None),
    access_token_query: str | None = Query(default=None, alias="access_token"),
) -> str | None:
    """Extract token from Bearer header, httpOnly cookie, or query parameter."""
    if credentials:
        return credentials.credentials
    if access_token:
        return access_token
    return token or access_token_query


def get_current_user(
    token: str | None = Depends(_extract_token),
) -> dict:
    """Dependency: return decoded JWT payload or raise 401."""
    if not token:
        raise UnauthorizedError()
    payload = decode_access_token(token)
    if not payload:
        raise UnauthorizedError("Token is invalid or expired.")
    return payload


def require_role(*roles: str):
    """Factory: FastAPI dependency that enforces one of the given roles."""

    def _check(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise ForbiddenError(
                f"This action requires one of the following roles: {', '.join(roles)}."
            )
        return user

    return _check


# Convenience role dependencies
require_admin = require_role("admin")
require_professor = require_role("professor", "admin")
require_student = require_role("student")
require_any = require_role("admin", "professor", "student")

# Type aliases for DI
CurrentUser = Annotated[dict, Depends(get_current_user)]
AdminUser = Annotated[dict, Depends(require_admin)]
ProfessorUser = Annotated[dict, Depends(require_professor)]
StudentUser = Annotated[dict, Depends(require_student)]
AnyUser = Annotated[dict, Depends(require_any)]
