"""Sync protocol unit tests (no database). Run from backend/:  python -m pytest tests -q"""
from app.api.v1.sync import _canonical_payload_hash

# Reference payloads whose hashes are ALSO asserted by the frontend test suite
# (frontend/tests/canonicalJson.test.js) — both sides must agree byte-for-byte.
ANSWER = {
    "question_id": "q1",
    "answer_value": {"selected_option": "B"},
    "revision": 2,
    "client_updated_at": "2026-01-01T00:00:00.000Z",
}
EVENT = {
    "event_id": "e",
    "metadata": {"yaw": 12.3457, "bbox": [1, 2.5, 3, 4], "z": None},
    "duration_ms": 3000,
    "t": "caf\u00e9 \u4e2d \U0001F600",
    "b": True,
}


def test_backend_hash_matches_frontend_reference_values():
    assert _canonical_payload_hash(ANSWER) == "8409077903cfd92681d630c3a1738993e3ca73c408af09fde0dc7356f32c9ff0"
    assert _canonical_payload_hash(EVENT) == "246d5f27e5f68fbe0ae08d99950b45dadab981dd7dc5219665d5d59881281a7e"


def test_hash_is_key_order_independent():
    a = {"b": 1, "a": {"d": 2, "c": 3}}
    b = {"a": {"c": 3, "d": 2}, "b": 1}
    assert _canonical_payload_hash(a) == _canonical_payload_hash(b)


def test_operation_result_defaults_not_retryable():
    from app.schemas.schemas import OperationResult
    r = OperationResult(operation_id="x", status="accepted", sequence_number=1)
    assert r.retryable is False
    assert OperationResult(operation_id="x", status="rejected", sequence_number=1, retryable=True).retryable is True


import pytest
from unittest.mock import AsyncMock, MagicMock
from app.api.v1.attempts import reconcile_attempt_submission_state


@pytest.mark.asyncio
async def test_reconcile_attempt_submission_state():
    attempt = MagicMock(attempt_id="att-1", status="in_progress", submission_received=False)
    fin_op = MagicMock(
        sequence_number=42,
        operation_id="op-finalize",
        server_received_at=None,
        client_created_at=None,
        payload={"client_submitted_at": "2026-10-21T10:00:00Z"},
    )
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.first.return_value = fin_op
    db.execute.return_value = result_mock

    reconciled = await reconcile_attempt_submission_state(db, attempt)
    assert reconciled is True
    assert attempt.status == "submitted"
    assert attempt.submission_received is True
    assert attempt.final_sequence == 42
    assert attempt.submission_operation_id == "op-finalize"

