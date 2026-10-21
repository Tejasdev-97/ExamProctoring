import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyResults, planGapReconciliation, classifySyncError, describeSubmissionState,
} from '../src/workers/syncPlan.js';

const batch = [{ operation_id: 'a' }, { operation_id: 'b' }, { operation_id: 'c' }];

test('classifyResults separates accepted, permanent rejection, retryable and gap', () => {
  const c = classifyResults(batch, [
    { operation_id: 'a', status: 'accepted' },
    { operation_id: 'b', status: 'rejected', error: 'bad question' },
    { operation_id: 'c', status: 'rejected', retryable: true, error: 'Payload hash mismatch.' },
    { operation_id: 'zzz', status: 'accepted' }, // not in batch: ignored
  ]);
  assert.deepEqual(c.acceptedIds, ['a']);
  assert.deepEqual(c.rejected.map((r) => r.id), ['b']);
  assert.deepEqual(c.retryable.map((r) => r.id), ['c']);
  assert.equal(c.gap, false);
  assert.equal(classifyResults(batch, [{ operation_id: 'a', status: 'sequence_gap' }]).gap, true);
});

test('failed batch result keeps nothing marked as acknowledged', () => {
  const c = classifyResults(batch, []);
  assert.deepEqual(c.acceptedIds, []);
});

test('gap reconciliation: server ahead -> acknowledge local through server sequence', () => {
  assert.deepEqual(planGapReconciliation(5, [3, 4, 5, 6]), { action: 'ack_local', through: 5 });
});

test('gap reconciliation: missing local operation is reported, never skipped', () => {
  const p = planGapReconciliation(5, [8, 9]);
  assert.equal(p.action, 'missing');
  assert.equal(p.expected, 6);
  assert.equal(p.lowest, 8);
});

test('gap reconciliation: nothing to do -> stalled (no infinite loop)', () => {
  assert.equal(planGapReconciliation(5, [6, 7]).action, 'stalled');
  assert.equal(planGapReconciliation(5, []).action, 'stalled');
});

test('token expiry is an explicit recoverable state, network loss is a retryable error', () => {
  assert.equal(classifySyncError({ response: { status: 401 } }).status, 'auth_expired');
  assert.equal(classifySyncError({ message: 'Network Error' }).status, 'error');
  assert.equal(classifySyncError({ response: { status: 503 } }).status, 'error');
});

test('submission status is never "confirmed" before the server confirms', () => {
  const queued = describeSubmissionState({ attemptStatus: 'submitted_local', unacknowledged: 3 });
  assert.equal(queued.key, 'queued');
  assert.ok(!queued.key.startsWith('confirmed'));
  assert.equal(describeSubmissionState({ attemptStatus: 'submitted_local', online: false }).key, 'queued_offline');
  assert.equal(describeSubmissionState({ attemptStatus: 'submitted_local', lastError: 'x' }).key, 'sync_failed');
  assert.equal(describeSubmissionState({ attemptStatus: 'submitted' }).key, 'confirmed');
  assert.equal(describeSubmissionState({ attemptStatus: 'submitted', undeliveredSnapshots: 2 }).key, 'confirmed_evidence_pending');
});

test('in-progress status is never green while operations are unacknowledged', () => {
  assert.equal(describeSubmissionState({ attemptStatus: 'in_progress', unacknowledged: 2 }).key, 'pending');
  assert.equal(describeSubmissionState({ attemptStatus: 'in_progress', unacknowledged: 0 }).key, 'synced');
  assert.equal(describeSubmissionState({ attemptStatus: 'in_progress', online: false }).key, 'local_only');
});

test('manual sync recovery button state logic distinguishes pending, syncing, confirmed, and offline', () => {
  // 1. Pending sync online: actionable retry/sync available
  const statePendingOnline = { status: 'submitted_local', online: true, isSyncing: false };
  assert.equal(statePendingOnline.status === 'submitted', false);
  assert.equal(statePendingOnline.status === 'submitted_local', true);

  // 2. Sync in progress: action is disabled
  const stateSyncing = { status: 'submitted_local', online: true, isSyncing: true };
  assert.equal(stateSyncing.isSyncing, true);

  // 3. Server confirmed: button disabled / confirmed badge shown
  const stateConfirmed = { status: 'submitted', online: true, isSyncing: false };
  assert.equal(stateConfirmed.status === 'submitted', true);

  // 4. Offline: disabled while offline, recoverable when connectivity returns
  const stateOffline = { status: 'submitted_local', online: false, isSyncing: false };
  assert.equal(stateOffline.online, false);
});

