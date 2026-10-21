/**
 * ExamProctor.ai — SyncRecoveryPanel
 * Authoritative Offline Evidence Recovery Dashboard.
 * Displays real-time counts of locally persisted answers, proctoring events, and snapshot images,
 * and provides a safe retry trigger for pending evidence.
 */

import { useState } from 'react';
import {
  Wifi, WifiOff, RefreshCw, CheckCircle, AlertTriangle,
  Clock, Shield, Database, Send, X, FileText, Camera,
} from 'lucide-react';

export default function SyncRecoveryPanel({
  attemptId,
  syncStatus,
  syncDetail,
  submissionState,
  syncNow,
  isOpen,
  onClose,
}) {
  const [retrying, setRetrying] = useState(false);
  const isOnline = navigator.onLine;

  if (!isOpen) return null;

  const handleRetry = async () => {
    if (!syncNow || retrying || !isOnline) return;
    setRetrying(true);
    try {
      await syncNow();
    } finally {
      setTimeout(() => setRetrying(false), 800);
    }
  };

  const snapStats = syncDetail?.snapshotStats || { local: 0, uploading: 0, uploaded: 0, failed: 0, total: 0 };
  const outboxStats = syncDetail?.outboxStats || { pendingAnswers: 0, pendingEvents: 0, syncedOps: 0, failedOps: 0, total: 0 };
  const pendingSnapshotsCount = (snapStats.local || 0) + (snapStats.uploading || 0) + (snapStats.failed || 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-panel-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(16, 32, 74, 0.7)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          border: 'var(--border-thin)',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: 'var(--border-thin)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface-alt)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Database size={20} style={{ color: 'var(--color-blue)' }} />
            <div>
              <h3
                id="sync-panel-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 700,
                  color: 'var(--color-text-heading)',
                }}
              >
                Offline Evidence & Sync Dashboard
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                Attempt: <code style={{ fontFamily: 'monospace' }}>{attemptId ? attemptId.slice(0, 13) : '—'}…</code>
              </span>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ padding: '6px', borderRadius: '50%' }}
              aria-label="Close sync recovery dashboard"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Content */}
        <div
          style={{
            padding: 'var(--space-4)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Network & Live State Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              background: isOnline ? 'var(--color-green-light)' : 'var(--color-orange-light)',
              border: `1px solid ${isOnline ? 'var(--color-green)' : 'var(--color-orange)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {isOnline ? (
                <Wifi size={18} style={{ color: 'var(--color-green)' }} />
              ) : (
                <WifiOff size={18} style={{ color: 'var(--color-orange)' }} />
              )}
              <div>
                <strong style={{ color: 'var(--color-text-heading)', fontSize: 'var(--font-size-sm)' }}>
                  {isOnline ? 'Internet Connected' : 'Offline Mode Active'}
                </strong>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  {isOnline
                    ? 'All local evidence automatically synchronizes with server'
                    : 'Evidence is safely stored locally in IndexedDB and will sync when reconnected'}
                </p>
              </div>
            </div>
            <span
              className={`badge ${['synced', 'confirmed'].includes(submissionState?.key) ? 'badge-green' : syncStatus === 'error' ? 'badge-red' : 'badge-yellow'}`}
            >
              {syncStatus}
            </span>
          </div>

          {/* Sync Queues Breakdown Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {/* Student Answers Queue */}
            <div
              style={{
                background: 'var(--color-surface-alt)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: 'var(--border-thin)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={16} style={{ color: 'var(--color-blue)' }} />
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-heading)' }}>
                  Student Answers
                </strong>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pending sync:</span>
                  <strong>{outboxStats.pendingAnswers}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Synced ops:</span>
                  <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{outboxStats.syncedOps}</span>
                </div>
              </div>
            </div>

            {/* Evidence Snapshots Queue */}
            <div
              style={{
                background: 'var(--color-surface-alt)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: 'var(--border-thin)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Camera size={16} style={{ color: 'var(--color-orange)' }} />
                <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-heading)' }}>
                  Suspicious Snapshots
                </strong>
              </div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Server confirmed:</span>
                  <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{snapStats.uploaded || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Awaiting sync:</span>
                  <strong style={{ color: pendingSnapshotsCount > 0 ? 'var(--color-orange)' : 'inherit' }}>
                    {pendingSnapshotsCount}
                  </strong>
                </div>
                {snapStats.failed > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-red)' }}>
                    <span>Upload retrying:</span>
                    <strong>{snapStats.failed}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Submission Lifecycle Status */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: 'var(--border-thin)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
            }}
          >
            <strong style={{ color: 'var(--color-text-heading)', display: 'block', marginBottom: 4 }}>
              Submission State
            </strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`badge ${['submitted', 'confirmed'].includes(submissionState?.key) ? 'badge-green' : 'badge-yellow'}`}>
                {submissionState?.key || 'in_progress'}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {submissionState?.label || 'Exam in progress on this device'}
              </span>
            </div>
            {syncDetail?.message && (
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--color-red)' }}>
                {syncDetail.message}
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderTop: 'var(--border-thin)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface-alt)',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            Sync cycle automatically runs every 3 seconds
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRetry}
              disabled={retrying || !isOnline}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={retrying ? 'spinner' : ''} />
              {retrying ? 'Synchronizing…' : 'Retry Pending Evidence'}
            </button>
            {onClose && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
