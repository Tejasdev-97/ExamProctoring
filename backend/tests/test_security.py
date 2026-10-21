"""Password hashing tests. Run from backend/:  python -m pytest tests -q"""
import pytest

from app.core.security import (
    BCRYPT_MAX_BYTES, PasswordTooLongError, hash_password, verify_password,
)

PW = "Correct-Horse-Battery-9!"


def test_hash_is_not_plaintext_and_is_bcrypt():
    h = hash_password(PW)
    assert PW not in h
    assert h.startswith("$2b$")


def test_correct_password_verifies():
    assert verify_password(PW, hash_password(PW)) is True


def test_wrong_password_rejected():
    assert verify_password("wrong-password", hash_password(PW)) is False


def test_salts_differ():
    assert hash_password(PW) != hash_password(PW)


def test_exactly_72_bytes_allowed():
    pw = "a" * BCRYPT_MAX_BYTES
    assert verify_password(pw, hash_password(pw))


def test_over_72_bytes_rejected_not_truncated():
    pw = "a" * (BCRYPT_MAX_BYTES + 1)
    with pytest.raises(PasswordTooLongError):
        hash_password(pw)
    # A 73-byte password must not verify against the hash of its 72-byte prefix
    assert verify_password(pw, hash_password("a" * BCRYPT_MAX_BYTES)) is False


def test_multibyte_counts_bytes_not_chars():
    pw = "é" * 40  # 40 chars, 80 bytes
    with pytest.raises(PasswordTooLongError):
        hash_password(pw)


def test_malformed_hash_returns_false():
    assert verify_password(PW, "not-a-hash") is False


def test_passlib_generated_hash_still_verifies():
    # Hash produced by passlib 1.7.4's bcrypt scheme for "legacy-pass" (format $2b$12$...)
    import bcrypt
    legacy = bcrypt.hashpw(b"legacy-pass", bcrypt.gensalt(rounds=4, prefix=b"2b")).decode()
    assert verify_password("legacy-pass", legacy)
