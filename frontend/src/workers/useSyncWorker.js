/**
 * ExamProctor.ai — Sync Worker
 * Drives background synchronization of the outbox to the backend.
 * Runs on the main thread via setInterval (Web Worker upgrade is future work).
 *
 * Invariants:
 *  - One sync run per attempt at a time (module-level mutex, shared by every hook instance).
 *  - Operations are sent in sequence order, with the ORIGINAL operation_id.
 *  - payload_hash is recomputed from the stored payload at send time (canonical JSON), so
 *    operations queued by an older build with an incorrect hash are repaired, not lost.
 *  - A failed batch NEVER deletes or skips operations; they stay pending/retrying.
 *  - Sequence gaps are reconciled against GET /sync/status/{attempt}; a genuinely missing
 *    local operation is reported, never skipped.
 *  - Finalization is requested ONLY after every earlier operation (including the queued
 *    submission_finalize op) is acknowledged. The local attempt becomes 'submitted'
 *    (server-confirmed) ONLY after the server confirms.
 *  - Snapshot delivery is independent of event batches, durable and retryable. A snapshot is
 *    only uploaded after its event_upsert operation has been acknowledged.
 *  - Cleanup removes only acknowledged data.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../services/api';
import {
  getAllUnsyncedOperations, markOperationsSynced, markOperationFailed, markOperationRejected,
  acknowledgeThroughSequence, countUnacknowledged, getOperation, getOperationForEntity,
  getOperationsForEntity, getOutboxStats,
  hashPayload, pruneOldSyncedOperations,
} from '../storage/outbox';
import { snapshotRepo, attemptRepo, examPackageRepo } from '../storage/repositories';
import {
  classifyResults, planGapReconciliation, classifySyncError, describeSubmissionState,
} from './syncPlan';

const SYNC_INTERVAL_MS = 3000;
const MAX_BATCH_SIZE   = 10;
const MAX_BATCHES_PER_RUN = 20;
const BASE_BACKOFF_MS  = 2000;
const MAX_BACKOFF_MS   = 60000;

const running = new Set(); // attempt ids currently syncing (shared mutex)

async function sendBatch(attemptId, batch) {
  const ops = [];
  for (const op of batch) {
    ops.push({
      operation_id:      op.operation_id,
      attempt_id:        op.attempt_id,
      sequence_number:   op.sequence_number,
      operation_type:    op.operation_type,
      entity_id:         op.entity_id,
      payload_hash:      await hashPayload(op.payload), // recomputed from stored payload
      payload:           op.payload,
      client_created_at: op.created_at,
    });
  }
  const { data } = await api.post('/sync/operations', { operations: ops });
  return data.data;
}

async function reconcileGap(attemptId) {
  const { data } = await api.get(`/sync/status/${attemptId}`);
  const serverLast = data.data.last_accepted_sequence ?? 0;
  const unacked = (await getAllUnsyncedOperations(attemptId)).map((o) => o.sequence_number);
  const plan = planGapReconciliation(serverLast, unacked);
  if (plan.action === 'ack_local') {
    await acknowledgeThroughSequence(attemptId, plan.through);
    return { progress: true };
  }
  if (plan.action === 'missing') {
    return { progress: false, reason: `Operation ${plan.expected} is missing locally (queue starts at ${plan.lowest}). Not skipping.` };
  }
  return { progress: false, reason: 'Sequence gap could not be reconciled yet.' };
}

async function deliverSnapshots(attemptId) {
  const snaps = await snapshotRepo.getUndelivered(attemptId);
  for (const snap of snaps) {
    if (!snap.blob) continue;
    // Only deliver once the owning event has been acknowledged by the server.
    if (snap.event_id) {
      const evOps = await getOperationsForEntity(attemptId, 'event_upsert', snap.event_id);
      if (evOps.length > 0) {
        // If there are outbox ops for this event, ensure at least one has been acknowledged.
        const anySynced = evOps.some((op) => op.status === 'synced');
        if (!anySynced) {
          // Event upsert is still pending/retrying in outbox; wait until server acknowledges it.
          continue;
        }
      }
      // If evOps.length === 0, the operation was pruned from outbox after sync or synced in a prior session.
      // We proceed with metadata upload. If the server does not have the event yet,
      // it will return 409 EVENT_NOT_RECEIVED which we catch safely below.
    }
    await snapshotRepo.updateStatus(snap.snapshot_id, 'uploading');
    try {
      await api.post('/snapshots/metadata', {
        snapshot_id:        snap.snapshot_id,
        attempt_id:         snap.attempt_id,
        event_id:           snap.event_id,
        capture_reason:     snap.capture_reason,
        client_captured_at: snap.client_captured_at,
        mime_type:          'image/jpeg',
        size_bytes:         snap.size_bytes,
        sha256:             snap.sha256,
        width:              snap.width,
        height:             snap.height,
      });
      const formData = new FormData();
      formData.append('file', snap.blob, `${snap.snapshot_id}.jpg`);
      await api.post(`/snapshots/${snap.snapshot_id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Acknowledged by the server — persist the acknowledgement locally.
      await snapshotRepo.updateStatus(snap.snapshot_id, 'uploaded', { uploaded_at: new Date().toISOString(), last_error: null });
    } catch (e) {
      // Stay retryable: never abandon unacknowledged evidence.
      const isEventPending = e?.response?.status === 409 &&
        (e?.response?.data?.code === 'EVENT_NOT_RECEIVED' || e?.response?.data?.detail?.includes('Event has not been synchronized'));

      const prev = await snapshotRepo.get(snap.snapshot_id);
      await snapshotRepo.updateStatus(snap.snapshot_id, 'failed', {
        retry_count: (prev?.retry_count || 0) + 1,
        last_error: isEventPending ? 'Event awaiting server sync' : (e.response?.data?.message || e.message),
      });
      if (e?.response?.status === 401) throw e; // stop; auth must be restored
    }
  }
}

async function maybeFinalize(attemptId) {
  const attempt = await attemptRepo.get(attemptId);
  if (!attempt || attempt.status !== 'submitted_local' || !attempt.submission_operation_id) return null;

  const finalOp = await getOperation(attempt.submission_operation_id);
  if (!finalOp) return { state: 'error', message: 'Submission operation missing from local queue.' };
  // Ordering guarantee: the finalize op is last; it is only acknowledged once all earlier ops are.
  if (finalOp.status !== 'synced' || (await countUnacknowledged(attemptId)) > 0) return { state: 'waiting' };

  const { data } = await api.post(`/attempts/${attemptId}/finalize`, {
    submission_operation_id: attempt.submission_operation_id,
    final_sequence: finalOp.sequence_number, // the real boundary (not a timestamp)
    client_submitted_at: attempt.client_submitted_at,
  });
  await attemptRepo.markServerSubmitted(attemptId, { serverSubmittedAt: data?.data?.server_submitted_at });
  return { state: 'confirmed' };
}

/** Selective, acknowledgement-aware cleanup. Never touches unacknowledged data. */
async function cleanupIfSafe(attemptId) {
  const attempt = await attemptRepo.get(attemptId);
  if (!attempt || attempt.status !== 'submitted') return;
  if ((await countUnacknowledged(attemptId)) > 0) return;
  if ((await snapshotRepo.getUndelivered(attemptId)).length > 0) return;
  await snapshotRepo.releaseAcknowledgedBlobs(attemptId);
  await examPackageRepo.remove(attemptId);
  await pruneOldSyncedOperations();
}

/**
 * Run one complete synchronization pass for an attempt.
 * Returns { status, message, unacknowledged, undeliveredSnapshots, attemptStatus }.
 */
export async function syncAttempt(attemptId) {
  if (!attemptId) return { status: 'idle' };
  if (running.has(attemptId)) return { status: 'syncing' };
  running.add(attemptId);
  let result = { status: 'synced', message: null };
  try {
    if (!navigator.onLine) {
      result = { status: 'offline', message: 'No connection. Everything is saved on this device.' };
    } else {
      // 1) Ordered operations
      for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
        const pending = await getAllUnsyncedOperations(attemptId);
        if (!pending.length) break;
        const batch = pending.slice(0, MAX_BATCH_SIZE);

        let resp;
        try {
          resp = await sendBatch(attemptId, batch);
        } catch (err) {
          for (const op of batch) await markOperationFailed(op.operation_id, err.message);
          throw err;
        }

        const c = classifyResults(batch, resp.results);
        if (c.acceptedIds.length) await markOperationsSynced(c.acceptedIds);
        for (const r of c.rejected) await markOperationRejected(r.id, r.error);
        for (const r of c.retryable) await markOperationFailed(r.id, r.error);

        if (c.gap) {
          const rec = await reconcileGap(attemptId);
          if (!rec.progress) { result = { status: 'error', message: rec.reason }; break; }
          continue; // progress was made; resend the remainder
        }
        if (c.retryable.length) { result = { status: 'error', message: 'Server could not verify an operation; will retry.' }; break; }
      }

      // 2) Evidence delivery (independent of event batches; failures stay retryable)
      if (result.status !== 'error') {
        await deliverSnapshots(attemptId);
      }

      // 3) Finalization, strictly after ordered operations are acknowledged
      if (result.status !== 'error') {
        const fin = await maybeFinalize(attemptId);
        if (fin?.state === 'error') result = { status: 'error', message: fin.message };
      }

      // 4) Cleanup of acknowledged data only
      await cleanupIfSafe(attemptId);
    }
  } catch (err) {
    result = classifySyncError(err);
  } finally {
    running.delete(attemptId);
  }

  const attempt = await attemptRepo.get(attemptId);
  const unacknowledged = await countUnacknowledged(attemptId);
  const undeliveredSnapshots = (await snapshotRepo.getUndelivered(attemptId)).length;
  if (result.status === 'synced' && (unacknowledged > 0 || attempt?.status === 'submitted_local')) {
    result.status = 'pending';
  }
  if (attempt?.status === 'submitted_local' && result.status !== 'offline') {
    await attemptRepo.patch(attemptId, { last_sync_error: result.status === 'error' || result.status === 'auth_expired' ? result.message : null });
  }
  return { ...result, unacknowledged, undeliveredSnapshots, attemptStatus: attempt?.status };
}

/** Live status for one attempt (used by the exam page). */
export function useSyncWorker(attemptId) {
  const [syncStatus, setSyncStatus] = useState('idle'); // idle|syncing|synced|pending|error|offline|auth_expired
  const [detail, setDetail] = useState({
    unacknowledged: 0,
    undeliveredSnapshots: 0,
    message: null,
    attemptStatus: null,
    snapshotStats: { local: 0, uploading: 0, uploaded: 0, failed: 0, total: 0 },
    outboxStats: { pendingAnswers: 0, pendingEvents: 0, syncedOps: 0, failedOps: 0, total: 0 },
  });
  const backoff = useRef(BASE_BACKOFF_MS);
  const nextAllowed = useRef(0);

  const runSyncCycle = useCallback(async () => {
    if (!attemptId) return;
    if (Date.now() < nextAllowed.current) return;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      const [snapStats, outboxStats] = await Promise.all([
        snapshotRepo.getStats(attemptId),
        getOutboxStats(attemptId),
      ]);
      setDetail((prev) => ({
        ...prev,
        snapshotStats: snapStats,
        outboxStats: outboxStats,
      }));
      return;
    }
    const res = await syncAttempt(attemptId);
    if (res.status === 'syncing' || res.status === 'idle') return;
    const [snapStats, outboxStats] = await Promise.all([
      snapshotRepo.getStats(attemptId),
      getOutboxStats(attemptId),
    ]);
    setSyncStatus(res.status);
    setDetail({
      unacknowledged: res.unacknowledged ?? 0,
      undeliveredSnapshots: res.undeliveredSnapshots ?? 0,
      message: res.message ?? null,
      attemptStatus: res.attemptStatus ?? null,
      snapshotStats: snapStats,
      outboxStats: outboxStats,
    });
    if (res.status === 'error' || res.status === 'auth_expired') {
      backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF_MS);
      nextAllowed.current = Date.now() + backoff.current;
    } else {
      backoff.current = BASE_BACKOFF_MS;
      nextAllowed.current = 0;
    }
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return undefined;
    runSyncCycle();
    const id = setInterval(runSyncCycle, SYNC_INTERVAL_MS);
    const onOnline  = () => { backoff.current = BASE_BACKOFF_MS; nextAllowed.current = 0; runSyncCycle(); };
    const onOffline = () => setSyncStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [attemptId, runSyncCycle]);

  return {
    syncStatus,
    syncDetail: detail,
    syncNow: runSyncCycle,
    submissionState: describeSubmissionState({
      attemptStatus: detail.attemptStatus,
      unacknowledged: detail.unacknowledged,
      undeliveredSnapshots: detail.undeliveredSnapshots,
      lastError: syncStatus === 'error' || syncStatus === 'auth_expired' ? detail.message : null,
      online: syncStatus !== 'offline',
    }),
  };
}

/**
 * Keeps syncing every attempt that still has unacknowledged work, regardless of
 * which page is open (e.g. after the student leaves the exam screen).
 * Calls onUpdate() after each pass so dashboards can refresh.
 */
export function useBackgroundSync(onUpdate) {
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || !navigator.onLine) return;
      const all = await attemptRepo.getAll();
      for (const a of all) {
        if (cancelled) return;
        const needs = a.status === 'submitted_local' ||
          (a.status !== 'submitted' && (await countUnacknowledged(a.attempt_id)) > 0) ||
          (await snapshotRepo.getUndelivered(a.attempt_id)).length > 0;
        if (needs) await syncAttempt(a.attempt_id);
      }
      if (!cancelled) onUpdate?.();
    };
    tick();
    const id = setInterval(tick, SYNC_INTERVAL_MS * 2);
    const onOnline = () => tick();
    window.addEventListener('online', onOnline);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('online', onOnline); };
  }, [onUpdate]);
}
