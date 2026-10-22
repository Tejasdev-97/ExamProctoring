"""
ExamProctor.ai — ORM Models
All PostgreSQL table definitions following data-model.md.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, BigInteger, Column, DateTime, Enum, ForeignKey,
    Integer, LargeBinary, Numeric, String, Text, UniqueConstraint, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


# ── Enum values ───────────────────────────────────────────────────────────────

USER_ROLES = ("admin", "professor", "student")
ACCOUNT_STATUSES = ("active", "inactive", "locked")
EXAM_STATUSES = ("draft", "published", "active", "closed", "archived")
ATTEMPT_STATUSES = ("authorized", "in_progress", "submitted_local", "submitted", "expired", "cancelled")
EVENT_TYPES = (
    "face_absent", "multiple_faces", "sustained_head_turn", "phone_detected",
    "camera_unavailable", "camera_quality_warning", "fullscreen_exit",
    "page_hidden", "model_unavailable",
)
EVENT_STATUSES = ("candidate", "confirmed", "resolved", "inconclusive")
SNAPSHOT_STATUSES = ("local", "pending", "uploading", "uploaded", "failed")
SYNC_OP_TYPES = ("answer_upsert", "event_upsert", "submission_finalize", "attempt_state_update")
SYNC_OP_STATUSES = ("received", "accepted", "rejected")
RETAKE_STATUSES = ("granted", "consumed", "revoked", "expired")
ANALYSIS_STATUSES = ("queued", "processing", "completed", "failed", "cancelled")


# ── Users ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    full_name = Column(String(200), nullable=False)
    email = Column(String(320), nullable=True)
    password_hash = Column(Text, nullable=True)
    role = Column(String(20), nullable=False)
    usn_normalized = Column(String(50), nullable=True)
    account_status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)
    created_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("usn_normalized", name="uq_users_usn_normalized"),
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("role IN ('admin','professor','student')", name="ck_users_role"),
        CheckConstraint("account_status IN ('active','inactive','locked')", name="ck_users_status"),
    )

    exams = relationship("Exam", back_populates="owner", foreign_keys="Exam.owner_user_id")
    attempts = relationship("ExamAttempt", back_populates="student")


# ── Exams ─────────────────────────────────────────────────────────────────────

class Exam(Base):
    __tablename__ = "exams"

    exam_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    owner_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=False)
    title = Column(String(250), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=False, default="")
    exam_code = Column(String(6), nullable=True)
    status = Column(String(30), nullable=False, default="draft")
    duration_seconds = Column(Integer, nullable=False)
    available_from = Column(DateTime(timezone=True), nullable=True)
    available_until = Column(DateTime(timezone=True), nullable=True)
    allow_offline_continuation = Column(Boolean, nullable=False, default=True)
    allow_question_navigation = Column(Boolean, nullable=False, default=True)
    proctoring_config = Column(JSONB, nullable=False, default=dict)
    question_package_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)
    published_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("exam_code", name="uq_exams_code"),
        CheckConstraint("status IN ('draft','published','active','closed','archived')", name="ck_exams_status"),
        CheckConstraint("duration_seconds > 0", name="ck_exams_duration"),
    )

    owner = relationship("User", back_populates="exams", foreign_keys=[owner_user_id])
    questions = relationship("Question", back_populates="exam", cascade="all, delete-orphan")
    attempts = relationship("ExamAttempt", back_populates="exam")


# ── Questions ─────────────────────────────────────────────────────────────────

class Question(Base):
    __tablename__ = "questions"

    question_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    exam_id = Column(UUID(as_uuid=False), ForeignKey("exams.exam_id", ondelete="CASCADE"), nullable=False)
    question_number = Column(Integer, nullable=False)
    question_type = Column(String(30), nullable=False)
    question_text = Column(Text, nullable=False)
    options = Column(JSONB, nullable=True)
    marks = Column(Numeric(8, 2), nullable=False)
    answer_key = Column(JSONB, nullable=True)
    grading_metadata = Column(JSONB, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("exam_id", "question_number", name="uq_questions_exam_number"),
        CheckConstraint("question_type IN ('mcq','short_answer')", name="ck_questions_type"),
        CheckConstraint("marks >= 0", name="ck_questions_marks"),
    )

    exam = relationship("Exam", back_populates="questions")


# ── Exam Attempts ─────────────────────────────────────────────────────────────

class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    attempt_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    exam_id = Column(UUID(as_uuid=False), ForeignKey("exams.exam_id"), nullable=False)
    student_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=False)
    attempt_number = Column(Integer, nullable=False, default=1)
    previous_attempt_id = Column(UUID(as_uuid=False), nullable=True)
    package_version = Column(Integer, nullable=False, default=1)
    status = Column(String(30), nullable=False, default="authorized")
    authorization_id = Column(UUID(as_uuid=False), nullable=True)
    authorized_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    client_started_at = Column(DateTime(timezone=True), nullable=True)
    server_started_at = Column(DateTime(timezone=True), nullable=True)
    client_submitted_at = Column(DateTime(timezone=True), nullable=True)
    server_submitted_at = Column(DateTime(timezone=True), nullable=True)
    last_server_contact_at = Column(DateTime(timezone=True), nullable=True)
    last_accepted_sequence = Column(BigInteger, nullable=False, default=0)
    final_sequence = Column(BigInteger, nullable=True)
    submission_operation_id = Column(UUID(as_uuid=False), nullable=True)
    submission_received = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("exam_id", "student_user_id", "attempt_number", name="uq_attempts_exam_student_num"),
    )

    exam = relationship("Exam", back_populates="attempts")
    student = relationship("User", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")
    events = relationship("ProctorEvent", back_populates="attempt", cascade="all, delete-orphan")
    snapshots = relationship("Snapshot", back_populates="attempt")
    sync_ops = relationship("SyncOperation", back_populates="attempt")


# ── Answers ───────────────────────────────────────────────────────────────────

class Answer(Base):
    __tablename__ = "answers"

    answer_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    attempt_id = Column(UUID(as_uuid=False), ForeignKey("exam_attempts.attempt_id"), nullable=False)
    question_id = Column(UUID(as_uuid=False), ForeignKey("questions.question_id"), nullable=False)
    answer_value = Column(JSONB, nullable=False)
    revision = Column(Integer, nullable=False, default=1)
    last_operation_id = Column(UUID(as_uuid=False), nullable=False)
    client_updated_at = Column(DateTime(timezone=True), nullable=False)
    server_updated_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_answers_attempt_question"),
    )

    attempt = relationship("ExamAttempt", back_populates="answers")
    question = relationship("Question")


# ── Proctoring Events ─────────────────────────────────────────────────────────

class ProctorEvent(Base):
    __tablename__ = "proctor_events"

    event_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    attempt_id = Column(UUID(as_uuid=False), ForeignKey("exam_attempts.attempt_id"), nullable=True)
    video_analysis_session_id = Column(UUID(as_uuid=False), ForeignKey("video_analysis_sessions.video_analysis_session_id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    event_status = Column(String(30), nullable=False, default="confirmed")
    client_started_at = Column(DateTime(timezone=True), nullable=False)
    client_ended_at = Column(DateTime(timezone=True), nullable=True)
    server_received_at = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(BigInteger, nullable=True)
    confidence = Column(Numeric(6, 5), nullable=True)
    bounding_boxes = Column(JSONB, nullable=True)
    detector_name = Column(String(100), nullable=True)
    detector_version = Column(String(100), nullable=True)
    rule_version = Column(String(100), nullable=True)
    meta = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    attempt = relationship("ExamAttempt", back_populates="events")
    video_session = relationship("VideoAnalysisSession", back_populates="events")
    snapshots = relationship("Snapshot", back_populates="event")


# ── Snapshots ─────────────────────────────────────────────────────────────────

class Snapshot(Base):
    __tablename__ = "snapshots"

    snapshot_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    attempt_id = Column(UUID(as_uuid=False), ForeignKey("exam_attempts.attempt_id"), nullable=True)
    video_analysis_session_id = Column(UUID(as_uuid=False), ForeignKey("video_analysis_sessions.video_analysis_session_id"), nullable=True)
    event_id = Column(UUID(as_uuid=False), ForeignKey("proctor_events.event_id"), nullable=True)
    capture_reason = Column(String(50), nullable=False)
    client_captured_at = Column(DateTime(timezone=True), nullable=False)
    server_received_at = Column(DateTime(timezone=True), nullable=True)
    mime_type = Column(String(100), nullable=False, default="image/jpeg")
    size_bytes = Column(BigInteger, nullable=False)
    sha256 = Column(String(64), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    storage_status = Column(String(30), nullable=False, default="local")
    storage_key = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    attempt = relationship("ExamAttempt", back_populates="snapshots")
    video_session = relationship("VideoAnalysisSession", back_populates="snapshots")
    event = relationship("ProctorEvent", back_populates="snapshots")
    blob = relationship("SnapshotBlob", back_populates="snapshot", uselist=False, cascade="all, delete-orphan")


class SnapshotBlob(Base):
    __tablename__ = "snapshot_blobs"

    snapshot_id = Column(
        UUID(as_uuid=False),
        ForeignKey("snapshots.snapshot_id", ondelete="CASCADE"),
        primary_key=True,
    )
    image_data = Column(LargeBinary, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    sha256 = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    snapshot = relationship("Snapshot", back_populates="blob")


# ── Sync Operations ───────────────────────────────────────────────────────────

class SyncOperation(Base):
    __tablename__ = "sync_operations"

    operation_id = Column(UUID(as_uuid=False), primary_key=True)
    attempt_id = Column(UUID(as_uuid=False), ForeignKey("exam_attempts.attempt_id"), nullable=False)
    sequence_number = Column(BigInteger, nullable=False)
    operation_type = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=False), nullable=False)
    payload_hash = Column(String(64), nullable=False)
    payload = Column(JSONB, nullable=False)
    client_created_at = Column(DateTime(timezone=True), nullable=False)
    server_received_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    processing_status = Column(String(30), nullable=False, default="received")
    result_metadata = Column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("attempt_id", "sequence_number", name="uq_sync_ops_attempt_seq"),
    )

    attempt = relationship("ExamAttempt", back_populates="sync_ops")


# ── Retake Grants ─────────────────────────────────────────────────────────────

class RetakeGrant(Base):
    __tablename__ = "retake_grants"

    retake_grant_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    exam_id = Column(UUID(as_uuid=False), ForeignKey("exams.exam_id"), nullable=False)
    student_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=False)
    previous_attempt_id = Column(UUID(as_uuid=False), nullable=True)
    granted_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=False)
    reason = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="granted")
    granted_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    consumed_by_attempt_id = Column(UUID(as_uuid=False), nullable=True)

    __table_args__ = (
        CheckConstraint("status IN ('granted','consumed','revoked','expired')", name="ck_retakes_status"),
    )


# ── System Settings ───────────────────────────────────────────────────────────

class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    setting_key = Column(String(150), nullable=False, unique=True)
    setting_value = Column(JSONB, nullable=False)
    description = Column(Text, nullable=True)
    updated_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)


# ── Audit Logs ────────────────────────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_log_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    actor_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=True)
    action_type = Column(String(100), nullable=False)
    target_type = Column(String(100), nullable=True)
    target_id = Column(UUID(as_uuid=False), nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    result = Column(String(30), nullable=False)
    meta = Column("metadata", JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint("result IN ('success','failure','partial')", name="ck_audit_result"),
    )


# ── Video Analysis Sessions ───────────────────────────────────────────────────

class VideoAnalysisSession(Base):
    __tablename__ = "video_analysis_sessions"

    video_analysis_session_id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    created_by_user_id = Column(UUID(as_uuid=False), ForeignKey("users.user_id"), nullable=False)
    source_filename = Column(String(255), nullable=False)
    source_size_bytes = Column(BigInteger, nullable=False)
    source_sha256 = Column(String(64), nullable=False)
    source_duration_ms = Column(BigInteger, nullable=True)
    analysis_status = Column(String(30), nullable=False, default="queued")
    pipeline_version = Column(String(100), nullable=False, default="1.0.0")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    __table_args__ = (
        CheckConstraint("analysis_status IN ('queued','processing','completed','failed','cancelled')", name="ck_vas_status"),
    )

    events = relationship("ProctorEvent", back_populates="video_session")
    snapshots = relationship("Snapshot", back_populates="video_session")
