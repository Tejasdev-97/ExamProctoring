/**
 * ExamProctor.ai — Local storage repositories
 * Thin wrappers over Dexie for all local stores.
 * All writes must be atomic (IDB transaction scoped).
 */

import db from './db';
import { v4 as uuidv4 } from 'uuid';

// ── Exam packages ─────────────────────────────────────────────────────────

export const examPackageRepo = {
  async save(pkg) {
    await db.examPackages.put({
      ...pkg,
      downloaded_at: new Date().toISOString(),
    });
  },

  async get(attemptId) {
    return db.examPackages.get(attemptId);
  },

  async remove(attemptId) {
    await db.examPackages.delete(attemptId);
  },
};

// ── Attempts ──────────────────────────────────────────────────────────────

export const attemptRepo = {
  async save(attempt) {
    await db.attempts.put(attempt);
  },

  async get(attemptId) {
    return db.attempts.get(attemptId);
  },

  async getAll() {
    return db.attempts.toArray();
  },

  async getAllForStudent(studentUserId) {
    if (!studentUserId) return [];
    return db.attempts.where('student_user_id').equals(studentUserId).toArray();
  },

  async updateStatus(attemptId, status) {
    await db.attempts.update(attemptId, { status });
  },

  /** Atomic partial update of arbitrary attempt fields. */
  async patch(attemptId, fields) {
    await db.attempts.update(attemptId, fields);
  },

  async markLocallySubmitted(attemptId, { submissionOperationId, finalSequence, clientSubmittedAt }) {
    await db.attempts.update(attemptId, {
      status: 'submitted_local',
      submission_operation_id: submissionOperationId,
      final_sequence: finalSequence,
      client_submitted_at: clientSubmittedAt,
    });
  },

  /** Only called after the server genuinely confirmed finalization. */
  async markServerSubmitted(attemptId, { serverSubmittedAt }) {
    await db.attempts.update(attemptId, {
      status: 'submitted',
      server_submitted_at: serverSubmittedAt || new Date().toISOString(),
      server_confirmed: true,
    });
  },

  /** Attempts that are committed locally but not yet confirmed by the server. */
  async getAwaitingServerConfirmation() {
    return db.attempts.where('status').equals('submitted_local').toArray();
  },
};

// ── Answers ───────────────────────────────────────────────────────────────

export const answerRepo = {
  /**
   * Upsert an answer. Always saves locally first.
   * Returns the saved answer record.
   */
  async upsert({ attemptId, questionId, answerValue, revision = 1 }) {
    const existing = await db.answers.get([attemptId, questionId]);
    const newRevision = existing ? existing.revision + 1 : revision;

    const record = {
      attempt_id: attemptId,
      question_id: questionId,
      answer_value: answerValue,
      revision: newRevision,
      updated_at: new Date().toISOString(),
      last_synced_at: null,
      operation_id: uuidv4(), // stable ID for the outbox operation
    };

    await db.answers.put(record);
    return record;
  },

  async get(attemptId, questionId) {
    return db.answers.get([attemptId, questionId]);
  },

  async getAll(attemptId) {
    return db.answers.where('attempt_id').equals(attemptId).toArray();
  },

  async markSynced(attemptId, questionId) {
    await db.answers.update([attemptId, questionId], {
      last_synced_at: new Date().toISOString(),
    });
  },
};

// ── Proctoring events ──────────────────────────────────────────────────────

export const eventRepo = {
  async save(event) {
    await db.proctorEvents.put(event);
  },

  async get(eventId) {
    return db.proctorEvents.get(eventId);
  },

  async getAll(attemptId) {
    return db.proctorEvents.where('attempt_id').equals(attemptId).toArray();
  },

  async update(eventId, updates) {
    await db.proctorEvents.update(eventId, updates);
  },
};

// ── Snapshots ─────────────────────────────────────────────────────────────

export const snapshotRepo = {
  async save(snapshot) {
    await db.snapshots.put(snapshot);
  },

  async get(snapshotId) {
    return db.snapshots.get(snapshotId);
  },

  async getAll(attemptId) {
    return db.snapshots.where('attempt_id').equals(attemptId).toArray();
  },

  async getForEvent(eventId) {
    return db.snapshots.where('event_id').equals(eventId).toArray();
  },

  async updateStatus(snapshotId, status, extra = {}) {
    await db.snapshots.update(snapshotId, {
      storage_status: status,
      updated_at: new Date().toISOString(),
      ...extra,
    });
  },

  /**
   * Snapshots that still need delivery: confirmed evidence not yet acknowledged.
   * 'provisional' (candidate not yet confirmed) and 'uploaded' are excluded.
   * 'uploading' is included so an upload interrupted by reload/crash is retried
   * (server upload is idempotent by snapshot_id).
   */
  async getUndelivered(attemptId) {
    return db.snapshots
      .where('attempt_id').equals(attemptId)
      .filter((s) => ['local', 'uploading', 'failed'].includes(s.storage_status))
      .toArray();
  },

  async getProvisionalForEvent(eventId) {
    return db.snapshots
      .where('event_id').equals(eventId)
      .filter((s) => s.storage_status === 'provisional')
      .toArray();
  },

  /** Remove a snapshot that was never confirmed as evidence (rejected candidate). */
  async discardProvisional(snapshotId) {
    const s = await db.snapshots.get(snapshotId);
    if (s && s.storage_status === 'provisional') await db.snapshots.delete(snapshotId);
  },

  /**
   * Reclaim storage: drop the Blob of snapshots the server has acknowledged.
   * Keeps the metadata row (audit trail). Never touches undelivered snapshots.
   */
  async releaseAcknowledgedBlobs(attemptId) {
    return db.snapshots
      .where('attempt_id').equals(attemptId)
      .filter((s) => s.storage_status === 'uploaded' && s.blob)
      .modify((s) => { s.blob = null; s.blob_released_at = new Date().toISOString(); });
  },

  /**
   * Return snapshot count breakdowns for offline recovery and sync indicators.
   */
  async getStats(attemptId) {
    const snaps = await db.snapshots.where('attempt_id').equals(attemptId).toArray();
    const stats = { local: 0, uploading: 0, uploaded: 0, failed: 0, provisional: 0, total: snaps.length };
    for (const s of snaps) {
      if (stats[s.storage_status] !== undefined) {
        stats[s.storage_status]++;
      }
    }
    return stats;
  },
};
