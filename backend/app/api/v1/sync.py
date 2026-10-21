"""
ExamProctor.ai — Synchronization ingestion endpoint.
Implements ordered, idempotent operation processing with sequence validation.

Protocol notes (see docs/sync-protocol.md):
- Operations of one attempt are accepted strictly in sequence (no gaps).
- Re-delivery of an accepted operation_id returns "accepted" again (idempotent).
- A payload-hash mismatch is NOT recorded as a permanent rejection: it is reported as
  rejected with retryable=true and the sequence does not advance, so a corrected retry with the
  same operation_id is processed normally.
- A permanently invalid operation (e.g. unknown question) is recorded as "rejected", and the
  sequence advances past it so one bad operation cannot block the whole attempt forever. The
  rejection is explicit and visible in the response and in sync_operations.
- Operations after the final submission boundary are rejected.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import ExamAttempt, SyncOperation, Answer, ProctorEvent, Question
from app.core.permissions import StudentUser
from app.core.errors import NotFoundError, ForbiddenError, ConflictError, AppError
from app.schemas.schemas import SyncBatchRequest, SyncBatchResponse, OperationResult

router = APIRouter(prefix="/sync", tags=["sync"])


def _canonical_payload_hash(payload: dict) -> str:
    """Calculate SHA-256 of canonicalized payload."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _process_answer_upsert(
    db: AsyncSession, attempt: ExamAttempt, payload: dict, operation_id: str
) -> None:
    """Create or update a student answer."""
    question_id = payload["question_id"]
    answer_value = payload["answer_value"]
    revision = payload.get("revision", 1)
    client_updated_at = datetime.fromisoformat(payload["client_updated_at"].replace("Z", "+00:00"))

    # Verify question belongs to this exam
    stmt = select(Question).where(
        Question.question_id == question_id,
        Question.exam_id == attempt.exam_id,
    )
    question: Question | None = (await db.execute(stmt)).scalars().first()
    if not question:
        raise AppError(422, "INVALID_QUESTION", f"Question {question_id} not found in this exam.")

    # Upsert answer
    stmt = select(Answer).where(
        Answer.attempt_id == attempt.attempt_id,
        Answer.question_id == question_id,
    )
    existing: Answer | None = (await db.execute(stmt)).scalars().first()

    if existing:
        # Only apply if revision is higher (last-write wins by revision)
        if revision >= existing.revision:
            existing.answer_value = answer_value
            existing.revision = revision
            existing.last_operation_id = operation_id
            existing.client_updated_at = client_updated_at
            existing.server_updated_at = datetime.now(timezone.utc)
    else:
        answer = Answer(
            answer_id=str(uuid.uuid4()),
            attempt_id=attempt.attempt_id,
            question_id=question_id,
            answer_value=answer_value,
            revision=revision,
            last_operation_id=operation_id,
            client_updated_at=client_updated_at,
            server_updated_at=datetime.now(timezone.utc),
        )
        db.add(answer)


async def _process_event_upsert(
    db: AsyncSession, attempt: ExamAttempt, payload: dict, operation_id: str
) -> None:
    """Create or update a proctoring event."""
    event_id = payload["event_id"]
    client_started_at = datetime.fromisoformat(payload["client_started_at"].replace("Z", "+00:00"))

    # Check if event already exists (idempotency)
    stmt = select(ProctorEvent).where(ProctorEvent.event_id == event_id)
    existing: ProctorEvent | None = (await db.execute(stmt)).scalars().first()

    now = datetime.now(timezone.utc)

    if existing:
        # An event id may only ever be updated by the attempt that owns it.
        if existing.attempt_id != attempt.attempt_id:
            raise AppError(403, "EVENT_ATTEMPT_MISMATCH", "Event belongs to a different attempt.")
        # Update end time and status if event is being resolved
        if payload.get("client_ended_at"):
            existing.client_ended_at = datetime.fromisoformat(
                payload["client_ended_at"].replace("Z", "+00:00")
            )
        if payload.get("duration_ms") is not None:
            existing.duration_ms = payload["duration_ms"]
        if payload.get("event_status"):
            existing.event_status = payload["event_status"]
        existing.server_received_at = now
    else:
        event = ProctorEvent(
            event_id=event_id,
            attempt_id=attempt.attempt_id,
            event_type=payload["event_type"],
            event_status=payload.get("event_status", "confirmed"),
            client_started_at=client_started_at,
            client_ended_at=datetime.fromisoformat(
                payload["client_ended_at"].replace("Z", "+00:00")
            ) if payload.get("client_ended_at") else None,
            server_received_at=now,
            duration_ms=payload.get("duration_ms"),
            confidence=payload.get("confidence"),
            bounding_boxes=payload.get("bounding_boxes"),
            detector_name=payload.get("detector_name"),
            detector_version=payload.get("detector_version"),
            rule_version=payload.get("rule_version"),
            meta=payload.get("metadata"),
        )
        db.add(event)


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _new_sync_op(op, attempt_id: str, status: str, meta: dict | None = None) -> SyncOperation:
    return SyncOperation(
        operation_id=op.operation_id,
        attempt_id=attempt_id,
        sequence_number=op.sequence_number,
        operation_type=op.operation_type,
        entity_id=op.entity_id,
        payload_hash=op.payload_hash,
        payload=op.payload,
        client_created_at=_parse_ts(op.client_created_at),
        processing_status=status,
        result_metadata=meta,
    )


@router.post("/operations")
async def ingest_operations(
    body: SyncBatchRequest,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """
    Ingest a batch of ordered sync operations.

    Enforces:
    - Operation ownership.
    - Sequence ordering (monotonically increasing, no gaps).
    - Idempotent re-delivery.
    - Payload hash verification.
    """
    if not body.operations:
        return {"data": {"results": []}}

    # All operations must belong to the same attempt
    attempt_ids = {op.attempt_id for op in body.operations}
    if len(attempt_ids) > 1:
        raise AppError(400, "MIXED_ATTEMPTS", "All operations in a batch must share one attempt_id.")

    attempt_id = body.operations[0].attempt_id

    # Verify attempt ownership
    stmt = select(ExamAttempt).where(
        ExamAttempt.attempt_id == attempt_id,
        ExamAttempt.student_user_id == actor["sub"],
    )
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise ForbiddenError("Attempt not found or not authorized.")

    # Sort operations by sequence number
    ops = sorted(body.operations, key=lambda o: o.sequence_number)

    results = []
    last_accepted_sequence = attempt.last_accepted_sequence

    for op in ops:
        # Idempotency: has this operation_id been processed before?
        stmt = select(SyncOperation).where(SyncOperation.operation_id == op.operation_id)
        existing_op: SyncOperation | None = (await db.execute(stmt)).scalars().first()

        if existing_op:
            if existing_op.attempt_id != attempt_id:
                results.append(OperationResult(
                    operation_id=op.operation_id, status="rejected",
                    sequence_number=op.sequence_number,
                    error="operation_id belongs to a different attempt.",
                ))
                break
            if existing_op.processing_status == "accepted":
                # Return original result
                results.append(OperationResult(
                    operation_id=op.operation_id,
                    status="accepted",
                    sequence_number=op.sequence_number,
                ))
                continue
            elif (
                existing_op.processing_status == "rejected"
                and (existing_op.result_metadata or {}).get("error") == "payload_hash_mismatch"
            ):
                # Legacy row written by an older build that recorded hash mismatches as
                # permanent. A mismatch is retryable, so release the row and reprocess.
                await db.delete(existing_op)
                await db.flush()
            elif existing_op.processing_status == "rejected":
                results.append(OperationResult(
                    operation_id=op.operation_id,
                    status="rejected",
                    sequence_number=op.sequence_number,
                    error="Operation was previously rejected.",
                ))
                continue

        # Validate sequence gap
        expected_next = last_accepted_sequence + 1
        if op.sequence_number != expected_next:
            results.append(OperationResult(
                operation_id=op.operation_id,
                status="sequence_gap",
                sequence_number=op.sequence_number,
                error=f"Expected sequence {expected_next}, received {op.sequence_number}.",
            ))
            # Stop processing further operations in this batch
            break

        # Operations beyond the final submission boundary are not accepted.
        if attempt.submission_received and attempt.final_sequence is not None \
                and op.sequence_number > attempt.final_sequence:
            db.add(_new_sync_op(op, attempt_id, "rejected", {"error": "after_final_sequence"}))
            last_accepted_sequence = op.sequence_number
            attempt.last_accepted_sequence = last_accepted_sequence
            results.append(OperationResult(
                operation_id=op.operation_id, status="rejected",
                sequence_number=op.sequence_number,
                error="Operation is after the final submission boundary.",
            ))
            continue

        # Verify payload hash. NOT recorded permanently: the client may retry with the
        # same operation_id; the sequence does not advance.
        calculated_hash = _canonical_payload_hash(op.payload)
        if calculated_hash != op.payload_hash:
            results.append(OperationResult(
                operation_id=op.operation_id,
                status="rejected",
                sequence_number=op.sequence_number,
                error="Payload hash mismatch.",
                retryable=True,
            ))
            break

        # Process the operation inside a savepoint so a failure leaves no partial writes.
        try:
            async with db.begin_nested():
                if op.operation_type == "answer_upsert":
                    await _process_answer_upsert(db, attempt, op.payload, op.operation_id)
                elif op.operation_type == "event_upsert":
                    await _process_event_upsert(db, attempt, op.payload, op.operation_id)
                elif op.operation_type == "submission_finalize":
                    now = datetime.now(timezone.utc)
                    attempt.status = "submitted"
                    attempt.submission_received = True
                    attempt.final_sequence = op.sequence_number
                    attempt.submission_operation_id = op.payload.get("submission_operation_id") or op.operation_id
                    if op.payload.get("client_submitted_at"):
                        try:
                            attempt.client_submitted_at = datetime.fromisoformat(
                                op.payload["client_submitted_at"].replace("Z", "+00:00")
                            )
                        except Exception:
                            attempt.client_submitted_at = now
                    else:
                        attempt.client_submitted_at = now
                    attempt.server_submitted_at = now
                elif op.operation_type == "attempt_state_update":
                    pass
                db.add(_new_sync_op(op, attempt_id, "accepted"))

            last_accepted_sequence = op.sequence_number
            attempt.last_accepted_sequence = last_accepted_sequence
            attempt.last_server_contact_at = datetime.now(timezone.utc)

            results.append(OperationResult(
                operation_id=op.operation_id,
                status="accepted",
                sequence_number=op.sequence_number,
            ))

        except Exception as e:  # permanently invalid operation: record it, advance past it
            db.add(_new_sync_op(op, attempt_id, "rejected", {"error": str(e)}))
            last_accepted_sequence = op.sequence_number
            attempt.last_accepted_sequence = last_accepted_sequence
            results.append(OperationResult(
                operation_id=op.operation_id,
                status="rejected",
                sequence_number=op.sequence_number,
                error=str(e),
            ))

    return {
        "data": SyncBatchResponse(
            attempt_id=attempt_id,
            last_accepted_sequence=last_accepted_sequence,
            results=results,
        )
    }


@router.get("/status/{attempt_id}")
async def sync_status(
    attempt_id: str,
    actor: StudentUser,
    db: AsyncSession = Depends(get_db),
):
    """Return the current server sync state for an attempt."""
    stmt = select(ExamAttempt).where(
        ExamAttempt.attempt_id == attempt_id,
        ExamAttempt.student_user_id == actor["sub"],
    )
    attempt: ExamAttempt | None = (await db.execute(stmt)).scalars().first()
    if not attempt:
        raise ForbiddenError("Attempt not found.")

    return {
        "data": {
            "attempt_id": attempt_id,
            "last_accepted_sequence": attempt.last_accepted_sequence,
            "submission_received": attempt.submission_received,
            "last_server_contact_at": attempt.last_server_contact_at.isoformat() if attempt.last_server_contact_at else None,
        }
    }
