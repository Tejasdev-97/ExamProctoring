/**
 * ExamProctor.ai — Sync planning (pure logic, no browser/Dexie dependencies).
 * Kept separate so it can be unit-tested with plain Node.
 */

/**
 * Classify the per-operation results returned by POST /sync/operations.
 *
 * - accepted        -> acknowledged, safe to mark synced
 * - rejected        -> permanently rejected by the server (recorded; not retried)
 * - rejected+retryable (e.g. payload hash mismatch) -> keep pending, retry later
 * - sequence_gap    -> server expects a different sequence; reconcile via /sync/status
 *
 * Results for operation_ids that were not part of the batch are ignored.
 */
export function classifyResults(batch, results = []) {
  const inBatch = new Set(batch.map((b) => b.operation_id));
  const out = { acceptedIds: [], rejected: [], retryable: [], gap: false };
  for (const r of results) {
    if (!inBatch.has(r.operation_id)) continue;
    if (r.status === 'accepted') out.acceptedIds.push(r.operation_id);
    else if (r.status === 'sequence_gap') out.gap = true;
    else if (r.status === 'rejected' && r.retryable) out.retryable.push({ id: r.operation_id, error: r.error });
    else if (r.status === 'rejected') out.rejected.push({ id: r.operation_id, error: r.error });
  }
  return out;
}

/**
 * Decide what a sequence gap means given the server's last accepted sequence
 * and the local unacknowledged operations (sorted ascending).
 *
 *  - 'ack_local'  : server is ahead of our local acks (lost response) -> acknowledge through it
 *  - 'missing'    : local queue starts AFTER the server's next expected number; an operation
 *                   is genuinely missing locally and must NOT be skipped
 *  - 'stalled'    : nothing to reconcile (avoids infinite loops)
 */
export function planGapReconciliation(serverLastAccepted, unackedSortedSeqs) {
  if (!unackedSortedSeqs.length) return { action: 'stalled' };
  const lowest = unackedSortedSeqs[0];
  if (lowest <= serverLastAccepted) return { action: 'ack_local', through: serverLastAccepted };
  if (lowest > serverLastAccepted + 1) return { action: 'missing', expected: serverLastAccepted + 1, lowest };
  return { action: 'stalled' };
}

/** Map an axios-like error to a recoverable sync state. */
export function classifySyncError(err) {
  const status = err?.response?.status;
  if (status === 401) return { status: 'auth_expired', message: 'Session expired. Sign in again; your data is saved on this device.' };
  if (!err?.response) return { status: 'error', message: 'Server unreachable. Will retry automatically.' };
  if (status >= 500) return { status: 'error', message: `Server error (${status}). Will retry automatically.` };
  return { status: 'error', message: err?.response?.data?.error?.message || `Request failed (${status}).` };
}

/**
 * Student-facing description of where an attempt stands. Never reports
 * "confirmed" unless the server confirmed finalization.
 */
export function describeSubmissionState({ attemptStatus, unacknowledged = 0, undeliveredSnapshots = 0, lastError = null, online = true }) {
  if (attemptStatus === 'submitted') {
    return undeliveredSnapshots > 0
      ? { key: 'confirmed_evidence_pending', label: 'Submission confirmed by server — evidence still uploading' }
      : { key: 'confirmed', label: 'Submission confirmed by server' };
  }
  if (attemptStatus === 'submitted_local') {
    if (!online) return { key: 'queued_offline', label: 'Submission saved on this device — waiting for connection' };
    if (lastError) return { key: 'sync_failed', label: 'Submission saved locally — sync temporarily failed, retrying' };
    return { key: 'queued', label: unacknowledged > 0 ? `Submission queued — ${unacknowledged} item(s) awaiting server` : 'Submission queued — awaiting server confirmation' };
  }
  if (!online) return { key: 'local_only', label: 'Working offline — answers saved on this device' };
  if (lastError) return { key: 'sync_failed', label: 'Answers saved locally — sync temporarily failed, retrying' };
  return unacknowledged > 0
    ? { key: 'pending', label: `Answers saved locally — ${unacknowledged} item(s) syncing` }
    : { key: 'synced', label: 'All answers synced with server' };
}
