/**
 * ExamProctor.ai — Sync Outbox
 * Manages the ordered, idempotent operation queue that drives
 * local-first synchronization with the backend.
 *
 * Rules:
 *  - Sequence numbers are assigned atomically per attempt.
 *  - Stable operation_id survives retries.
 *  - Payload hash (SHA-256) computed from canonical JSON.
 *  - Only one pending operation is dispatched at a time per attempt.
 */

import db from './db';
import { canonicalJson } from './canonicalJson';

/** Compute SHA-256 hex of a canonical JSON payload (identical to the backend). */
export async function hashPayload(payload) {
  const canonical = canonicalJson(payload);
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Atomically increment and return the next sequence number for an attempt.
 * Uses an IDB transaction to prevent race conditions.
 */
export async function getNextSequenceNumber(attemptId) {
  return await db.transaction('rw', db.sequenceCounters, async () => {
    const row = await db.sequenceCounters.get(attemptId);
    const next = (row?.last_sequence ?? 0) + 1;
    await db.sequenceCounters.put({ attempt_id: attemptId, last_sequence: next });
    return next;
  });
}

/**
 * Enqueue a single operation into the sync outbox.
 * The operation_id must be stable (caller-generated UUID).
 */
export async function enqueueOperation({
  operationId,
  attemptId,
  operationType,
  entityId,
  payload,
}) {
  const payloadHash = await hashPayload(payload);

  // Sequence allocation and outbox insert share ONE transaction so a crash can
  // never leave a consumed sequence number without its operation (a gap).
  return await db.transaction('rw', db.sequenceCounters, db.syncOutbox, async () => {
    // Idempotent: re-enqueueing the same operation_id returns the original.
    const existing = await db.syncOutbox.where('operation_id').equals(operationId).first();
    if (existing) return existing;

    const row = await db.sequenceCounters.get(attemptId);
    const sequenceNumber = (row?.last_sequence ?? 0) + 1;
    await db.sequenceCounters.put({ attempt_id: attemptId, last_sequence: sequenceNumber });

    const record = {
      operation_id: operationId,
      attempt_id: attemptId,
      sequence_number: sequenceNumber,
      operation_type: operationType,
      entity_id: entityId,
      payload_hash: payloadHash,
      payload,
      status: 'pending',
      retry_count: 0,
      created_at: new Date().toISOString(),
      last_attempted_at: null,
    };
    await db.syncOutbox.add(record);
    return record;
  });
}

/** Look up a single outbox operation by its stable operation_id. */
export async function getOperation(operationId) {
  return db.syncOutbox.where('operation_id').equals(operationId).first();
}

/** Find the outbox operation for an entity (e.g. the event_upsert of an event). */
export async function getOperationForEntity(attemptId, operationType, entityId) {
  return db.syncOutbox
    .where('attempt_id').equals(attemptId)
    .filter((op) => op.operation_type === operationType && op.entity_id === entityId)
    .first();
}

/** Find all outbox operations for an entity (handles multi-phase event updates like start and end). */
export async function getOperationsForEntity(attemptId, operationType, entityId) {
  return db.syncOutbox
    .where('attempt_id').equals(attemptId)
    .filter((op) => op.operation_type === operationType && op.entity_id === entityId)
    .toArray();
}

/** Permanently rejected by the server (recorded, not silently skipped). */
export async function markOperationRejected(operationId, error) {
  await db.syncOutbox.where('operation_id').equals(operationId).modify({
    status: 'rejected',
    last_error: error || 'rejected',
    last_attempted_at: new Date().toISOString(),
  });
}

/**
 * Server state says every sequence <= lastAcceptedSequence was processed.
 * Mark matching local operations as acknowledged (covers lost responses where
 * the server committed but the client never saw the acknowledgement).
 */
export async function acknowledgeThroughSequence(attemptId, lastAcceptedSequence) {
  if (!lastAcceptedSequence) return 0;
  return db.syncOutbox
    .where('attempt_id').equals(attemptId)
    .filter((op) => op.sequence_number <= lastAcceptedSequence && op.status !== 'synced' && op.status !== 'rejected')
    .modify({ status: 'synced', synced_at: new Date().toISOString(), acked_by: 'server_status' });
}

/** Count operations that are not yet acknowledged. */
export async function countUnacknowledged(attemptId) {
  return db.syncOutbox
    .where('attempt_id').equals(attemptId)
    .filter((op) => op.status !== 'synced' && op.status !== 'rejected')
    .count();
}

/** Return all pending operations for an attempt, ordered by sequence. */
export async function getPendingOperations(attemptId) {
  return await db.syncOutbox
    .where('attempt_id')
    .equals(attemptId)
    .filter((op) => op.status === 'pending' || op.status === 'retrying')
    .toArray()
    .then((ops) => ops.sort((a, b) => a.sequence_number - b.sequence_number));
}

/** Mark operations as synced after server acceptance. */
export async function markOperationsSynced(operationIds) {
  await db.syncOutbox
    .where('operation_id')
    .anyOf(operationIds)
    .modify({ status: 'synced', synced_at: new Date().toISOString() });
}

/** Mark an operation as failed so it can be retried. */
export async function markOperationFailed(operationId, error) {
  await db.syncOutbox
    .where('operation_id')
    .equals(operationId)
    .modify((op) => {
      op.status = 'retrying';
      op.retry_count = (op.retry_count || 0) + 1;
      op.last_attempted_at = new Date().toISOString();
      op.last_error = error;
    });
}

/** Return all unsynced operations (pending + retrying) sorted by sequence. */
export async function getAllUnsyncedOperations(attemptId) {
  const ops = await db.syncOutbox
    .where('attempt_id')
    .equals(attemptId)
    .filter((op) => op.status !== 'synced' && op.status !== 'rejected')
    .toArray();
  return ops.sort((a, b) => a.sequence_number - b.sequence_number);
}

/** Clear synced operations older than 24h to prevent IndexedDB bloat. */
export async function pruneOldSyncedOperations() {
  const cutoff = new Date(Date.now() - 86400 * 1000).toISOString();
  await db.syncOutbox
    .where('status')
    .equals('synced')
    .filter((op) => op.synced_at < cutoff)
    .delete();
}

/** Return detailed queue breakdown for offline recovery dashboard. */
export async function getOutboxStats(attemptId) {
  const all = await db.syncOutbox.where('attempt_id').equals(attemptId).toArray();
  const pendingAnswers = all.filter((o) => o.operation_type === 'answer_upsert' && o.status !== 'synced' && o.status !== 'rejected').length;
  const pendingEvents = all.filter((o) => o.operation_type === 'event_upsert' && o.status !== 'synced' && o.status !== 'rejected').length;
  const syncedOps = all.filter((o) => o.status === 'synced').length;
  const failedOps = all.filter((o) => o.status === 'retrying' || o.status === 'rejected').length;
  return {
    pendingAnswers,
    pendingEvents,
    syncedOps,
    failedOps,
    total: all.length,
  };
}
