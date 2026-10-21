"""Authentication and RBAC unit tests (no database required). Run from backend/: python -m pytest tests -q"""
from datetime import datetime, timezone, timedelta
import pytest
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.permissions import require_role, get_current_user
from app.core.errors import UnauthorizedError, ForbiddenError


def test_token_creation_and_claims():
    user_id = "user-1234-uuid"
    role = "student"
    extra = {"name": "Test Student", "usn": "1AB21CS001"}
    token = create_access_token(subject=user_id, role=role, extra=extra)

    payload = decode_access_token(token)
    assert payload["sub"] == user_id
    assert payload["role"] == role
    assert payload["name"] == "Test Student"
    assert payload["usn"] == "1AB21CS001"
    assert "exp" in payload


def test_refresh_token_claims():
    user_id = "user-refresh-uuid"
    token = create_refresh_token(subject=user_id)
    payload = decode_token(token)
    assert payload["sub"] == user_id
    assert payload["type"] == "refresh"
    # Access token decoder explicitly rejects non-access tokens
    assert decode_access_token(token) is None


def test_expired_token_rejected():
    user_id = "user-expired-uuid"
    token = create_access_token(
        subject=user_id,
        role="student",
        expires_delta=timedelta(seconds=-10),  # expired in past
    )
    assert decode_access_token(token) is None
    with pytest.raises(UnauthorizedError):
        get_current_user(token=token)


def test_invalid_token_rejected():
    assert decode_access_token("not.a.valid.jwt.token") is None
    with pytest.raises(UnauthorizedError):
        get_current_user(token="not.a.valid.jwt.token")


def test_role_authorization_permits_allowed_role():
    admin_guard = require_role("admin")
    prof_guard = require_role("professor", "admin")
    student_guard = require_role("student")

    # Admin payload
    admin_user = {"sub": "u1", "role": "admin"}
    assert admin_guard(admin_user) == admin_user
    assert prof_guard(admin_user) == admin_user

    # Professor payload
    prof_user = {"sub": "u2", "role": "professor"}
    assert prof_guard(prof_user) == prof_user

    # Student payload
    student_user = {"sub": "u3", "role": "student"}
    assert student_guard(student_user) == student_user


def test_role_authorization_blocks_unauthorized_role():
    admin_guard = require_role("admin")
    student_guard = require_role("student")

    student_user = {"sub": "u3", "role": "student"}
    with pytest.raises(ForbiddenError):
        admin_guard(student_user)

    prof_user = {"sub": "u2", "role": "professor"}
    with pytest.raises(ForbiddenError):
        student_guard(prof_user)


def test_usn_normalization_logic():
    from app.api.v1.users import _normalize_usn
    assert _normalize_usn(" 1ab21cs001 ") == "1AB21CS001"
    assert _normalize_usn(None) is None
    assert _normalize_usn("   ") is None


def test_auth_route_registration_and_methods():
    """Verify that auth endpoints are registered under /api/v1 prefix with exact methods."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Registered route is POST /api/v1/auth/login
    routes = {r.path: getattr(r, 'methods', set()) for r in app.routes}
    assert "/api/v1/auth/login" in routes
    assert "POST" in routes["/api/v1/auth/login"]
    assert "/api/v1/auth/logout" in routes
    assert "POST" in routes["/api/v1/auth/logout"]
    assert "/api/v1/auth/me" in routes
    assert "GET" in routes["/api/v1/auth/me"]

    # Root /auth/login is not registered and returns 404
    assert "/auth/login" not in routes
    r_unprefixed = client.post("/auth/login", json={"identifier": "admin", "password": "pass"})
    assert r_unprefixed.status_code == 404

    # GET /api/v1/auth/login returns 405 Method Not Allowed
    r_get = client.get("/api/v1/auth/login")
    assert r_get.status_code == 405

    # POST /api/v1/auth/login with empty JSON triggers validation (422) proving handler is reached
    r_post_empty = client.post("/api/v1/auth/login", json={})
    assert r_post_empty.status_code == 422

