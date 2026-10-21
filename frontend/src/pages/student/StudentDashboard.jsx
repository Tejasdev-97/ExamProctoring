/**
 * ExamProctor.ai — Student Dashboard
 * Shows recent attempts and the Enter Exam shortcut.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, Clock, CheckCircle, AlertCircle, ArrowRight, Plus, Check, RefreshCw, WifiOff } from 'lucide-react';
import { attemptRepo } from '../../storage/repositories';
import { useBackgroundSync, syncAttempt } from '../../workers/useSyncWorker';
import api from '../../services/api';
import styles from './StudentDashboard.module.css';

function StatusBadge({ status }) {
  const map = {
    authorized:      { cls: 'badge-blue',   label: 'Ready to start' },
    in_progress:     { cls: 'badge-orange',  label: 'In progress' },
    submitted_local: { cls: 'badge-yellow',  label: 'Saved on device — awaiting server confirmation' },
    submitted:       { cls: 'badge-green',   label: 'Submitted — server confirmed' },
    expired:         { cls: 'badge-red',     label: 'Expired' },
  };
  const { cls, label } = map[status] || { cls: 'badge-blue', label: status };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function AttemptCard({ attempt, onResume, onSync, isSyncing, syncError }) {
  const dur = attempt.duration_seconds
    ? `${Math.floor(attempt.duration_seconds / 60)} min`
    : '—';

  const isServerConfirmed = attempt.status === 'submitted';
  const isPendingSync = attempt.status === 'submitted_local';
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className={styles.attemptCard}>
      <div className={styles.attemptHeader}>
        <div>
          <div className={styles.attemptTitle}>{attempt.exam_title || 'Examination'}</div>
          <div className={styles.attemptMeta}>
            Attempt #{attempt.attempt_number} &nbsp;·&nbsp; {dur}
          </div>
        </div>
        <StatusBadge status={attempt.status} />
      </div>

      {syncError && isPendingSync && (
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-red)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
          {syncError}
        </div>
      )}

      <div className={styles.attemptFooter}>
        <span className={styles.attemptDate}>
          {attempt.authorized_at
            ? new Date(attempt.authorized_at).toLocaleString()
            : '—'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {(attempt.status === 'authorized' || attempt.status === 'in_progress') && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onResume(attempt.attempt_id)}
              id={`btn-resume-${attempt.attempt_id.slice(0, 8)}`}
            >
              Resume <ArrowRight size={14} />
            </button>
          )}

          {/* Green brutalist-style Manual Sync button for recovery */}
          {(isPendingSync || isServerConfirmed) && (
            <button
              className="btn btn-success btn-sm"
              id={`btn-sync-${attempt.attempt_id.slice(0, 8)}`}
              disabled={isServerConfirmed || isSyncing || !isOnline}
              onClick={() => onSync(attempt.attempt_id)}
              title={
                isServerConfirmed
                  ? 'Attempt is server confirmed'
                  : !isOnline
                  ? 'Internet connection required to synchronize'
                  : 'Synchronize pending attempt with server'
              }
              style={{
                opacity: isServerConfirmed ? 0.6 : 1,
                cursor: isServerConfirmed ? 'default' : (!isOnline || isSyncing ? 'not-allowed' : 'pointer'),
              }}
            >
              {isSyncing ? (
                <>
                  <RefreshCw size={13} className="animate-spin" /> Syncing…
                </>
              ) : isServerConfirmed ? (
                <>
                  <Check size={13} /> Synced
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff size={13} /> Offline
                </>
              ) : (
                <>
                  <RefreshCw size={13} /> Sync Now
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLocal = useCallback(async () => {
    if (!user?.user_id) return;
    try {
      // 1. Load local attempts for this specific student only (offline-capable isolation)
      const local = await attemptRepo.getAllForStudent(user.user_id);
      const attemptMap = new Map();
      local.forEach((a) => attemptMap.set(a.attempt_id, a));

      // 2. Refresh from authoritative server endpoint if online
      try {
        const { data } = await api.get('/attempts/my-attempts');
        const serverAttempts = data.data || [];
        for (const sa of serverAttempts) {
          const existing = attemptMap.get(sa.attempt_id);
          // Preserve local unconfirmed status if synchronization is still pending locally
          const status = (existing?.status === 'submitted_local' && sa.status !== 'submitted')
            ? 'submitted_local'
            : sa.status;

          const merged = {
            ...existing,
            ...sa,
            status,
            student_user_id: user.user_id,
          };
          attemptMap.set(sa.attempt_id, merged);
          // Update local Dexie store with server data without overwriting unsynced local fields
          await attemptRepo.save(merged);
        }
      } catch (err) {
        // Offline or network error: gracefully rely on local IndexedDB records
        console.warn('Network sync for student attempts unavailable; using local cache.', err?.message);
      }

      const isolated = Array.from(attemptMap.values()).filter(
        (a) => a.student_user_id === user.user_id
      );

      setAttempts(isolated.sort((a, b) =>
        new Date(b.authorized_at || 0) - new Date(a.authorized_at || 0)
      ));
    } catch (e) {
      console.error('Failed to load student attempts', e);
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => { loadLocal(); }, [loadLocal]);

  // Keep synchronizing queued submissions/evidence even though the exam page is closed;
  // refresh the list so "awaiting server confirmation" becomes "server confirmed" truthfully.
  useBackgroundSync(loadLocal);

  const [syncingMap, setSyncingMap] = useState({});
  const [syncErrors, setSyncErrors] = useState({});

  const handleManualSync = async (attemptId) => {
    if (!navigator.onLine) {
      setSyncErrors((prev) => ({ ...prev, [attemptId]: 'Internet connection required to synchronize.' }));
      return;
    }
    setSyncingMap((prev) => ({ ...prev, [attemptId]: true }));
    setSyncErrors((prev) => ({ ...prev, [attemptId]: null }));
    try {
      const res = await syncAttempt(attemptId);
      if (res.status === 'error' || res.status === 'auth_expired') {
        setSyncErrors((prev) => ({
          ...prev,
          [attemptId]: res.message || 'Synchronization encountered an error; retryable.',
        }));
      } else {
        setSyncErrors((prev) => ({ ...prev, [attemptId]: null }));
      }
      await loadLocal();
    } catch (err) {
      setSyncErrors((prev) => ({
        ...prev,
        [attemptId]: err.message || 'Sync failed. Local data preserved.',
      }));
    } finally {
      setSyncingMap((prev) => ({ ...prev, [attemptId]: false }));
    }
  };

  const stats = {
    total: attempts.length,
    submitted: attempts.filter((a) => a.status === 'submitted').length,
    active: attempts.filter(
      (a) => a.status === 'authorized' || a.status === 'in_progress'
    ).length,
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>
            Hello, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className={styles.usn}>USN: {user?.usn || '—'}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/student/enter-exam')}
          id="btn-enter-exam"
        >
          <Plus size={16} /> Enter Exam
        </button>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.statBlue}`}>
          <BookOpen size={22} />
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total Attempts</div>
        </div>
        <div className={`${styles.statCard} ${styles.statOrange}`}>
          <Clock size={22} />
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        <div className={`${styles.statCard} ${styles.statGreen}`}>
          <CheckCircle size={22} />
          <div className={styles.statValue}>{stats.submitted}</div>
          <div className={styles.statLabel}>Submitted</div>
        </div>
      </div>

      {/* Attempts list */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your Examination Attempts</h2>

        {loading ? (
          <div className={styles.centerMsg}><div className="spinner" /></div>
        ) : attempts.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertCircle size={40} />
            <h3>No attempts yet</h3>
            <p>Enter an exam code from your professor to get started.</p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/student/enter-exam')}
            >
              Enter Exam Code
            </button>
          </div>
        ) : (
          <div className={styles.attemptsList}>
            {attempts.map((a) => (
              <AttemptCard
                key={a.attempt_id}
                attempt={a}
                onResume={(id) => {
                  if (a.status === 'authorized') {
                    navigate(`/student/readiness/${id}`);
                  } else {
                    navigate(`/student/exam/${id}`);
                  }
                }}
                onSync={handleManualSync}
                isSyncing={!!syncingMap[a.attempt_id]}
                syncError={syncErrors[a.attempt_id]}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
