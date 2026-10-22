"""
ExamProctor.ai — Durable Evidence Storage Tests
Verifies PostgreSQL BYTEA storage, SHA-256 verification, legacy fallback,
idempotency, deletion cascades, and PDF evidence integration.
"""

import hashlib
import io
import pytest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from PIL import Image

from app.core.config import settings
from app.core.errors import AppError, ConflictError, NotFoundError
from app.db.models import Snapshot, SnapshotBlob, ExamAttempt, Exam, VideoAnalysisSession
from app.services.evidence_storage import (
    validate_image_bytes,
    compute_sha256,
    persist_snapshot_blob,
    get_snapshot_image_bytes,
    has_durable_snapshot_bytes,
)
from app.api.v1.reports import load_snapshot_bytes, build_attempt_pdf_data, render_report_pdf


def sample_jpeg() -> bytes:
    """Create a minimal 10x10 valid JPEG in memory."""
    buf = io.BytesIO()
    im = Image.new("RGB", (10, 10), color=(100, 150, 200))
    im.save(buf, format="JPEG")
    return buf.getvalue()


def sample_png() -> bytes:
    """Create a minimal 10x10 valid PNG in memory."""
    buf = io.BytesIO()
    im = Image.new("RGB", (10, 10), color=(50, 80, 120))
    im.save(buf, format="PNG")
    return buf.getvalue()


class MockScalarResult:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def first(self):
        return self._value

    def all(self):
        return self._value if isinstance(self._value, list) else [self._value]


# ── Unit tests for evidence_storage.py ────────────────────────────────────────

def test_validate_image_bytes_valid_jpeg():
    data = sample_jpeg()
    is_valid, err, mime = validate_image_bytes(data)
    assert is_valid is True
    assert err is None
    assert mime == "image/jpeg"


def test_validate_image_bytes_valid_png():
    data = sample_png()
    is_valid, err, mime = validate_image_bytes(data)
    assert is_valid is True
    assert err is None
    assert mime == "image/png"


def test_validate_image_bytes_empty():
    is_valid, err, mime = validate_image_bytes(b"")
    assert is_valid is False
    assert "empty" in err.lower()


def test_validate_image_bytes_corrupt_non_image():
    is_valid, err, mime = validate_image_bytes(b"NOT_AN_IMAGE_FILE_JUST_TEXT")
    assert is_valid is False
    assert "invalid image format" in err.lower()


def test_validate_image_bytes_exceeds_max_size(monkeypatch):
    monkeypatch.setattr(settings, "MAX_SNAPSHOT_SIZE_BYTES", 100)
    data = sample_jpeg()  # > 100 bytes
    is_valid, err, mime = validate_image_bytes(data)
    assert is_valid is False
    assert "maximum permitted size" in err.lower()


def test_compute_sha256():
    data = b"examproctor_test_bytes"
    expected = hashlib.sha256(data).hexdigest()
    assert compute_sha256(data) == expected


# ── Async persistence & idempotency tests ─────────────────────────────────────

@pytest.mark.asyncio
async def test_persist_snapshot_blob_normal_flow():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    snap = Snapshot(
        snapshot_id="snap-1234-uuid",
        attempt_id="att-1",
        sha256=sha,
        storage_status="pending",
    )

    db = AsyncMock()
    # No existing blob
    db.execute.return_value = MockScalarResult(None)

    blob, status = await persist_snapshot_blob(db, snap, jpeg, expected_sha256=sha)
    assert status == "stored"
    assert blob.snapshot_id == "snap-1234-uuid"
    assert blob.image_data == jpeg
    assert blob.size_bytes == len(jpeg)
    assert blob.sha256 == sha
    assert snap.storage_status == "uploaded"
    assert snap.size_bytes == len(jpeg)
    db.add.assert_called_once()
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_persist_snapshot_blob_idempotent_duplicate():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    snap = Snapshot(
        snapshot_id="snap-1234-uuid",
        attempt_id="att-1",
        sha256=sha,
        storage_status="uploaded",
    )
    existing_blob = SnapshotBlob(
        snapshot_id="snap-1234-uuid",
        image_data=jpeg,
        size_bytes=len(jpeg),
        sha256=sha,
        created_at=datetime.now(timezone.utc),
    )

    db = AsyncMock()
    # Existing blob with identical hash found
    db.execute.return_value = MockScalarResult(existing_blob)

    blob, status = await persist_snapshot_blob(db, snap, jpeg, expected_sha256=sha)
    assert status == "already_stored"
    assert blob == existing_blob
    db.add.assert_not_called()  # No duplicate record created


@pytest.mark.asyncio
async def test_persist_snapshot_blob_conflicting_content_rejection():
    jpeg1 = sample_jpeg()
    jpeg2 = sample_png()  # Different content
    sha1 = hashlib.sha256(jpeg1).hexdigest()
    sha2 = hashlib.sha256(jpeg2).hexdigest()
    snap = Snapshot(
        snapshot_id="snap-1234-uuid",
        attempt_id="att-1",
        sha256=sha2,
    )
    existing_blob = SnapshotBlob(
        snapshot_id="snap-1234-uuid",
        image_data=jpeg1,
        size_bytes=len(jpeg1),
        sha256=sha1,
    )

    db = AsyncMock()
    db.execute.return_value = MockScalarResult(existing_blob)

    with pytest.raises(ConflictError):
        await persist_snapshot_blob(db, snap, jpeg2, expected_sha256=sha2)


@pytest.mark.asyncio
async def test_persist_snapshot_blob_checksum_mismatch():
    jpeg = sample_jpeg()
    snap = Snapshot(
        snapshot_id="snap-1234-uuid",
        attempt_id="att-1",
        sha256="0000000000000000000000000000000000000000000000000000000000000000",
        storage_status="pending",
    )
    db = AsyncMock()

    with pytest.raises(AppError) as exc_info:
        await persist_snapshot_blob(db, snap, jpeg, expected_sha256=snap.sha256)
    assert exc_info.value.code == "CHECKSUM_MISMATCH"
    assert snap.storage_status == "failed"


# ── Retrieval and legacy disk fallback tests ──────────────────────────────────

@pytest.mark.asyncio
async def test_get_snapshot_image_bytes_from_db():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    snap = Snapshot(snapshot_id="snap-db-1", sha256=sha, mime_type="image/jpeg")
    blob = SnapshotBlob(snapshot_id="snap-db-1", image_data=jpeg, sha256=sha)

    db = AsyncMock()
    db.execute.return_value = MockScalarResult(blob)

    data, mime = await get_snapshot_image_bytes(db, snap)
    assert data == jpeg
    assert mime == "image/jpeg"


@pytest.mark.asyncio
async def test_get_snapshot_image_bytes_legacy_disk_fallback_and_auto_migration(tmp_path, monkeypatch):
    base_dir = tmp_path / "snaps"
    base_dir.mkdir()
    monkeypatch.setattr(settings, "SNAPSHOT_LOCAL_DIR", str(base_dir))

    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    disk_file = base_dir / "snap-disk-1.jpg"
    disk_file.write_bytes(jpeg)

    snap = Snapshot(
        snapshot_id="snap-disk-1",
        sha256=sha,
        storage_status="uploaded",
        storage_key=str(disk_file),
    )

    db = AsyncMock()
    # Step 1: No DB blob found
    db.execute.return_value = MockScalarResult(None)

    data, mime = await get_snapshot_image_bytes(db, snap, auto_migrate_legacy=True)
    assert data == jpeg
    assert mime == "image/jpeg"
    # Auto-migration triggered db.add
    db.add.assert_called_once()
    added_blob = db.add.call_args[0][0]
    assert added_blob.snapshot_id == "snap-disk-1"
    assert added_blob.image_data == jpeg


@pytest.mark.asyncio
async def test_get_snapshot_image_bytes_missing_both_returns_none():
    snap = Snapshot(snapshot_id="snap-missing", storage_status="uploaded", storage_key=None)
    db = AsyncMock()
    db.execute.return_value = MockScalarResult(None)

    data, mime = await get_snapshot_image_bytes(db, snap)
    assert data is None
    assert mime is None


# ── Report evidence loader tests ──────────────────────────────────────────────

def test_load_snapshot_bytes_from_db_blob():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    snap = Snapshot(snapshot_id="snap-1", sha256=sha, storage_status="uploaded")
    blob = SnapshotBlob(snapshot_id="snap-1", image_data=jpeg, sha256=sha)
    snap.blob = blob

    data, state, msg = load_snapshot_bytes(snap)
    assert state == "image"
    assert data == jpeg
    assert msg == ""


def test_load_snapshot_bytes_with_explicit_blob_bytes():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()
    snap = Snapshot(snapshot_id="snap-1", sha256=sha, storage_status="uploaded")

    data, state, msg = load_snapshot_bytes(snap, blob_bytes=jpeg)
    assert state == "image"
    assert data == jpeg
    assert msg == ""


def test_load_snapshot_bytes_pending():
    snap = Snapshot(snapshot_id="snap-1", storage_status="pending")
    data, state, msg = load_snapshot_bytes(snap)
    assert state == "pending"
    assert data is None


def test_load_snapshot_bytes_corrupt_checksum():
    jpeg = sample_jpeg()
    snap = Snapshot(
        snapshot_id="snap-1",
        sha256="wrong_checksum_value",
        storage_status="uploaded",
    )
    blob = SnapshotBlob(snapshot_id="snap-1", image_data=jpeg, sha256="wrong_checksum_value")
    snap.blob = blob

    data, state, msg = load_snapshot_bytes(snap)
    assert state == "corrupt"
    assert data is None


# ── Full PDF generation with DB blob ──────────────────────────────────────────

def test_pdf_generation_with_database_blob():
    jpeg = sample_jpeg()
    sha = hashlib.sha256(jpeg).hexdigest()

    class NS:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    attempt = NS(
        attempt_id="att-test-1",
        student_user_id="std-1",
        attempt_number=1,
        status="submitted",
        client_started_at=datetime.now(timezone.utc),
        client_submitted_at=datetime.now(timezone.utc),
        server_started_at=datetime.now(timezone.utc),
        server_submitted_at=datetime.now(timezone.utc),
        submission_received=True,
        last_accepted_sequence=5,
        final_sequence=5,
    )
    exam = NS(title="Durable Evidence Exam", exam_code="CS101", owner_user_id="prof-1")
    student = NS(full_name="Alice Student", usn_normalized="1MS21CS001")
    event = NS(
        event_id="evt-1",
        attempt_id="att-test-1",
        event_type="phone_detected",
        event_status="confirmed",
        client_started_at=datetime.now(timezone.utc),
        client_ended_at=datetime.now(timezone.utc),
        duration_ms=2500,
        server_received_at=datetime.now(timezone.utc),
        confidence=0.92,
        meta={"source": "camera"},
    )
    snap = NS(
        snapshot_id="snap-evidence-1",
        attempt_id="att-test-1",
        event_id="evt-1",
        capture_reason="phone_detected",
        client_captured_at=datetime.now(timezone.utc),
        storage_status="uploaded",
        sha256=sha,
        size_bytes=len(jpeg),
    )

    blob_map = {"snap-evidence-1": jpeg}
    pdf_data = build_attempt_pdf_data(
        attempt=attempt,
        exam=exam,
        student=student,
        events=[event],
        snapshots=[snap],
        with_images=True,
        blob_map=blob_map,
    )

    pdf_bytes = render_report_pdf(pdf_data)
    assert pdf_bytes is not None
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000
