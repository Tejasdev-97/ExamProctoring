"""
ExamProctor.ai — Pydantic schemas for request/response validation.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr, field_validator, model_validator
import uuid


# ── Common ────────────────────────────────────────────────────────────────────

class ResponseMeta(BaseModel):
    request_id: str = ""
    next_cursor: Optional[str] = None
    has_more: bool = False


class DataResponse(BaseModel):
    data: Any
    meta: ResponseMeta = ResponseMeta()


class PaginatedResponse(BaseModel):
    data: List[Any]
    meta: ResponseMeta = ResponseMeta()


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str
    password: str


class UserOut(BaseModel):
    user_id: str
    full_name: str
    role: str
    usn: Optional[str] = None
    usn_normalized: Optional[str] = None
    email: Optional[str] = None
    account_status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    expires_at: str


class LoginResponse(BaseModel):
    user: UserOut
    session: SessionOut
    access_token: str


# ── Users ─────────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    full_name: str
    email: Optional[str] = None
    role: str
    usn: Optional[str] = None
    password: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in ("admin", "professor", "student"):
            raise ValueError("role must be admin, professor, or student")
        return v

    @model_validator(mode="after")
    def check_student_has_usn(self) -> CreateUserRequest:
        if self.role == "student" and not self.usn:
            raise ValueError("USN is required for student accounts")
        return self


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    account_status: Optional[str] = None
    role: Optional[str] = None


# ── Exams ─────────────────────────────────────────────────────────────────────

class ProctoringConfig(BaseModel):
    face_absence_grace_ms: int = 5000
    multiple_faces_grace_ms: int = 2000
    sustained_head_turn_ms: int = 3000
    phone_detection_threshold: float = 0.65
    phone_confirm_ms: int = 1000
    head_turn_yaw_threshold: float = 30.0
    head_turn_pitch_threshold: float = 30.0
    live_sampling_interval_ms: int = 500
    video_sampling_interval_ms: int = 125


class CreateExamRequest(BaseModel):
    title: str
    description: Optional[str] = None
    instructions: str = ""
    duration_seconds: int
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    allow_offline_continuation: bool = True
    allow_question_navigation: bool = True
    proctoring_config: Optional[ProctoringConfig] = None

    @field_validator("duration_seconds")
    @classmethod
    def positive_duration(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("duration_seconds must be positive")
        return v


class UpdateExamRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    duration_seconds: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    allow_offline_continuation: Optional[bool] = None
    allow_question_navigation: Optional[bool] = None
    proctoring_config: Optional[ProctoringConfig] = None


class ExamOut(BaseModel):
    exam_id: str
    title: str
    description: Optional[str]
    instructions: str
    exam_code: Optional[str]
    status: str
    duration_seconds: int
    allow_offline_continuation: bool
    allow_question_navigation: bool
    proctoring_config: Dict[str, Any]
    question_package_version: int
    created_at: datetime
    published_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ExamCodeResolveRequest(BaseModel):
    exam_code: str

    @field_validator("exam_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v.isdigit() or len(v) != 6:
            raise ValueError("exam_code must be exactly 6 digits")
        return v


# ── Questions ─────────────────────────────────────────────────────────────────

class AnswerKey(BaseModel):
    correct_option: Optional[str] = None


class CreateQuestionRequest(BaseModel):
    question_number: int
    question_type: str
    question_text: str
    options: Optional[Dict[str, str]] = None
    marks: float
    answer_key: Optional[AnswerKey] = None

    @field_validator("question_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("mcq", "short_answer"):
            raise ValueError("question_type must be mcq or short_answer")
        return v

    @model_validator(mode="after")
    def check_mcq_options(self) -> CreateQuestionRequest:
        if self.question_type == "mcq" and not self.options:
            raise ValueError("MCQ questions require options")
        return self


class QuestionOut(BaseModel):
    question_id: str
    exam_id: str
    question_number: int
    question_type: str
    question_text: str
    options: Optional[Dict[str, str]]
    marks: float
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}


class QuestionStudentOut(BaseModel):
    """Question without answer key for student packages."""
    question_id: str
    question_number: int
    question_type: str
    question_text: str
    options: Optional[Dict[str, str]]
    marks: float
    version: int

    model_config = {"from_attributes": True}


# ── Exam Package ──────────────────────────────────────────────────────────────

class ExamPackageOut(BaseModel):
    exam_id: str
    attempt_id: str
    title: str
    instructions: str
    duration_seconds: int
    allow_offline_continuation: bool
    allow_question_navigation: bool
    proctoring_config: Dict[str, Any]
    question_package_version: int
    questions: List[QuestionStudentOut]
    package_integrity: str
    authorized_at: str


# ── Attempts ──────────────────────────────────────────────────────────────────

class AuthorizeAttemptRequest(BaseModel):
    exam_code: str


class AttemptOut(BaseModel):
    attempt_id: str
    exam_id: str
    student_user_id: str
    attempt_number: int
    status: str
    authorized_at: datetime
    client_started_at: Optional[datetime]
    server_started_at: Optional[datetime]
    client_submitted_at: Optional[datetime]
    server_submitted_at: Optional[datetime]
    last_server_contact_at: Optional[datetime]
    last_accepted_sequence: int
    submission_received: bool

    model_config = {"from_attributes": True}


# ── Sync Operations ───────────────────────────────────────────────────────────

class SyncOperationPayload(BaseModel):
    operation_id: str
    attempt_id: str
    sequence_number: int
    operation_type: str
    entity_id: str
    payload_hash: str
    payload: Dict[str, Any]
    client_created_at: str


class SyncBatchRequest(BaseModel):
    operations: List[SyncOperationPayload]

    @field_validator("operations")
    @classmethod
    def validate_batch_size(cls, v):
        if len(v) > 50:
            raise ValueError("Batch size must not exceed 50 operations")
        return v


class OperationResult(BaseModel):
    operation_id: str
    status: str
    sequence_number: int
    error: Optional[str] = None
    retryable: bool = False


class SyncBatchResponse(BaseModel):
    attempt_id: str
    last_accepted_sequence: int
    results: List[OperationResult]


# ── Snapshots ─────────────────────────────────────────────────────────────────

class SnapshotMetadataRequest(BaseModel):
    snapshot_id: str
    attempt_id: str
    event_id: Optional[str] = None
    capture_reason: str
    client_captured_at: str
    mime_type: str = "image/jpeg"
    size_bytes: int
    sha256: str
    width: Optional[int] = None
    height: Optional[int] = None


class SnapshotOut(BaseModel):
    snapshot_id: str
    attempt_id: Optional[str]
    event_id: Optional[str]
    capture_reason: str
    client_captured_at: datetime
    storage_status: str
    size_bytes: int
    sha256: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Submission ────────────────────────────────────────────────────────────────

class SubmitAttemptRequest(BaseModel):
    submission_operation_id: str
    final_sequence: int
    client_submitted_at: str


# ── Reports ───────────────────────────────────────────────────────────────────

class EventSummary(BaseModel):
    event_type: str
    count: int
    confirmed_count: int


class AttemptReportOut(BaseModel):
    attempt_id: str
    exam_title: str
    student_name: str
    student_usn: Optional[str]
    attempt_number: int
    status: str
    authorized_at: datetime
    client_started_at: Optional[datetime]
    client_submitted_at: Optional[datetime]
    server_submitted_at: Optional[datetime]
    last_accepted_sequence: int
    submission_received: bool
    event_summaries: List[EventSummary]

    model_config = {"from_attributes": True}


# ── Retakes ───────────────────────────────────────────────────────────────────

class RetakeGrantRequest(BaseModel):
    student_user_id: str
    exam_id: str
    previous_attempt_id: Optional[str] = None
    reason: Optional[str] = None


# ── Settings ──────────────────────────────────────────────────────────────────

class SettingOut(BaseModel):
    setting_key: str
    setting_value: Any
    description: Optional[str]
    version: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class UpdateSettingRequest(BaseModel):
    setting_value: Any
    description: Optional[str] = None
