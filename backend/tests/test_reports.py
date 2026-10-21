"""Report generation tests (no database required). Run from backend/:  python -m pytest tests -q"""
import hashlib
import io
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from PIL import Image
from reportlab import rl_config

from app.api.v1 import reports
from app.api.v1.reports import build_attempt_pdf_data, render_report_pdf, fmt_duration


@pytest.fixture(autouse=True)
def _uncompressed_pdf(monkeypatch):
    # Uncompressed content streams let us assert on the text actually written to the PDF.
    monkeypatch.setattr(rl_config, "pageCompression", 0)


def jpeg_bytes(color=(200, 30, 30), size=(160, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


T0 = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
ATTEMPT = NS(attempt_id="a" * 36, attempt_number=1, status="submitted", client_started_at=T0,
             client_submitted_at=T0 + timedelta(hours=1), server_submitted_at=T0 + timedelta(hours=1),
             submission_received=True, last_accepted_sequence=12)
EXAM = NS(title="Physics Midterm")
STUDENT = NS(full_name="Test Student", usn_normalized="1AB21CS001")


def ev(eid, etype="phone_detected", start=0, dur=5000, status="confirmed", meta=None):
    s = T0 + timedelta(seconds=start)
    return NS(event_id=eid, event_type=etype, event_status=status, client_started_at=s,
              client_ended_at=s + timedelta(milliseconds=dur or 0) if dur is not None else None,
              server_received_at=s + timedelta(seconds=9), duration_ms=dur, confidence=0.91, meta=meta)


def snap(sid, eid, data, attempt_id=ATTEMPT.attempt_id, status="uploaded", at=0, sha=None):
    return NS(snapshot_id=sid, attempt_id=attempt_id, event_id=eid, storage_status=status,
              client_captured_at=T0 + timedelta(seconds=at), sha256=sha or hashlib.sha256(data).hexdigest(),
              _data=data)


@pytest.fixture
def stub_storage(monkeypatch):
    def fake_load(s):
        if s.storage_status != "uploaded":
            return None, "pending", f"Evidence upload not completed (status: {s.storage_status})."
        if s._data is None:
            return None, "file_missing", "Evidence file is unavailable on the server."
        if hashlib.sha256(s._data).hexdigest() != s.sha256:
            return None, "corrupt", "Evidence file failed its integrity check (checksum mismatch)."
        return s._data, "image", ""
    monkeypatch.setattr(reports, "load_snapshot_bytes", fake_load)


def image_count(pdf: bytes) -> int:
    return pdf.count(b"/Subtype /Image")


def build(events, snaps):
    return render_report_pdf(build_attempt_pdf_data(ATTEMPT, EXAM, STUDENT, events, snaps))


def test_valid_pdf_with_real_image_and_event_metadata(stub_storage):
    pdf = build([ev("e1")], [snap("s1" + "0" * 34, "e1", jpeg_bytes())])
    assert pdf.startswith(b"%PDF-") and pdf.rstrip().endswith(b"%%EOF")
    assert image_count(pdf) == 1                      # real JPEG embedded, not just text
    for word in (b"Physics", b"Midterm", b"Phone", b"Detected", b"5.0", b"Server"):
        assert word in pdf


def test_multiple_event_images_one_per_event(stub_storage):
    events = [ev("e1", start=0), ev("e2", "multiple_faces", start=60, dur=3000)]
    snaps = [snap("s" * 36, "e1", jpeg_bytes((255, 0, 0))), snap("t" * 36, "e2", jpeg_bytes((0, 0, 255)))]
    assert image_count(build(events, snaps)) == 2


def test_separate_episodes_have_own_duration_and_image(stub_storage):
    events = [ev("e1", start=0, dur=5000), ev("e2", start=300, dur=2000)]
    snaps = [snap("s" * 36, "e1", jpeg_bytes((1, 2, 3))), snap("t" * 36, "e2", jpeg_bytes((9, 8, 7)))]
    pdf = build(events, snaps)
    assert image_count(pdf) == 2
    assert b"5.0" in pdf and b"2.0" in pdf


def test_missing_snapshot_is_reported_honestly_not_fabricated(stub_storage):
    pdf = build([ev("e1")], [])
    assert image_count(pdf) == 0
    assert b"No snapshot has been received" in pdf.replace(b"\n", b" ") or b"received" in pdf


def test_device_could_not_capture_is_distinguished(stub_storage):
    pdf = build([ev("e1", meta={"evidence_unavailable": True})], [])
    assert image_count(pdf) == 0
    assert b"captured" in pdf


def test_pending_upload_is_distinguished_from_missing(stub_storage):
    pdf = build([ev("e1")], [snap("s" * 36, "e1", jpeg_bytes(), status="failed")])
    assert image_count(pdf) == 0
    assert b"pending" in pdf.lower()


def test_invalid_image_data_is_handled_gracefully(stub_storage):
    garbage = b"this is definitely not a jpeg"
    pdf = build([ev("e1")], [snap("s" * 36, "e1", garbage)])
    assert pdf.startswith(b"%PDF-")
    assert image_count(pdf) == 0
    assert b"unreadable" in pdf


def test_corrupt_checksum_is_rejected(stub_storage):
    good = jpeg_bytes()
    pdf = build([ev("e1")], [snap("s" * 36, "e1", good, sha="0" * 64)])
    assert image_count(pdf) == 0
    assert b"integrity" in pdf


def test_evidence_of_another_attempt_is_never_included(stub_storage):
    other = snap("s" * 36, "e1", jpeg_bytes(), attempt_id="b" * 36)
    assert image_count(build([ev("e1")], [other])) == 0


def test_rejected_candidates_are_not_reported_as_violations(stub_storage):
    pdf = build([ev("e1", status="rejected"), ev("e2", status="candidate")], [])
    assert b"No monitoring events recorded" in pdf.replace(b"\n", b" ") or b"recorded" in pdf


def test_report_with_no_events(stub_storage):
    pdf = build([], [])
    assert pdf.startswith(b"%PDF-") and image_count(pdf) == 0
    assert b"Important" in pdf  # disclaimer present


def test_duration_formatting_never_invents_values():
    assert fmt_duration(None) == "-"
    assert fmt_duration(0) == "instant"
    assert fmt_duration(450) == "450 ms"
    assert fmt_duration(5000) == "5.0 s"


def test_load_snapshot_bytes_path_traversal_guard(tmp_path, monkeypatch):
    from app.api.v1 import snapshots
    from app.core.config import settings
    base = tmp_path / "snaps"
    base.mkdir()
    inside = base / "x.jpg"
    inside.write_bytes(jpeg_bytes())
    outside = tmp_path / "secret.jpg"
    outside.write_bytes(jpeg_bytes())
    monkeypatch.setattr(settings, "SNAPSHOT_LOCAL_DIR", str(base))
    ok = NS(storage_key=str(inside), storage_status="uploaded")
    bad = NS(storage_key=str(outside), storage_status="uploaded")
    pending = NS(storage_key=str(inside), storage_status="pending")
    assert snapshots.resolve_snapshot_path(ok) == inside.resolve()
    assert snapshots.resolve_snapshot_path(bad) is None          # outside the snapshot dir
    assert snapshots.resolve_snapshot_path(pending) is None      # not acknowledged yet
