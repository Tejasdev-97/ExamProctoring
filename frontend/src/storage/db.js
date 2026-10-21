/**
 * ExamProctor.ai — Dexie.js (IndexedDB) database definition
 * Defines all local stores required for offline-first exam execution.
 * Version history is append-only; never drop/rename a store in a migration.
 */

import Dexie from 'dexie';

const db = new Dexie('ExamProctorAI');

db.version(1).stores({
  // ── Local exam packages downloaded before exam start ──────────────────
  examPackages:
    'attempt_id, exam_id, downloaded_at',

  // ── Active and past attempts ──────────────────────────────────────────
  attempts:
    'attempt_id, exam_id, student_user_id, status, authorized_at',

  // ── Student answers (keyed by attempt+question for quick upsert) ──────
  answers:
    '[attempt_id+question_id], attempt_id, question_id, revision, last_synced_at',

  // ── Proctoring events ─────────────────────────────────────────────────
  proctorEvents:
    'event_id, attempt_id, event_type, event_status, client_started_at',

  // ── Evidence snapshots (binary stored as Blob) ────────────────────────
  snapshots:
    'snapshot_id, attempt_id, event_id, capture_reason, storage_status, client_captured_at',

  // ── Outbox: ordered sync operations awaiting upload ───────────────────
  syncOutbox:
    '++id, operation_id, attempt_id, sequence_number, operation_type, status, created_at',

  // ── Outbox sequence counter (one row per attempt_id) ──────────────────
  sequenceCounters:
    'attempt_id',

  // ── Upload tracking for snapshot binaries ────────────────────────────
  snapshotUploads:
    'snapshot_id, attempt_id, status, retry_count',

  // ── User session cache ────────────────────────────────────────────────
  session:
    'user_id, role',
});

export default db;
