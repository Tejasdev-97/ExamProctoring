/**
 * ExamProctor.ai — Live Exam Monitor Page (Professor)
 * Polls every 5 seconds and provides a WebSocket upgrade path.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw, FileText, UserCheck, AlertTriangle, Clock } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

function StatusBadge({ status }) {
  const m = {
    authorized:      'badge-blue',
    in_progress:     'badge-orange',
    submitted_local: 'badge-yellow',
    submitted:       'badge-green',
  };
  return <span className={`badge ${m[status] || 'badge-blue'}`}>{status.replace(/_/g, ' ')}</span>;
}

function SyncIndicator({ seq }) {
  return (
    <span title={`Last accepted sequence: ${seq}`} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
      seq {seq}
    </span>
  );
}

export default function ExamMonitorPage() {
  const { examId }  = useParams();
  const navigate    = useNavigate();
  const toast       = useToast();

  const [exam, setExam]         = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [examRes, attRes] = await Promise.all([
        api.get(`/exams/${examId}`),
        api.get(`/monitoring/exams/${examId}/attempts`),
      ]);
      setExam(examRes.data.data);
      setAttempts(attRes.data.data || []);
      setLastRefresh(new Date());
    } catch (err) {
      toast('Could not refresh monitor data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [examId, toast]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  const counts = {
    total:     attempts.length,
    active:    attempts.filter((a) => a.status === 'in_progress').length,
    submitted: attempts.filter((a) => ['submitted', 'submitted_local'].includes(a.status)).length,
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner spinner-lg" /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-text-heading)', letterSpacing: '-0.02em' }}>
            Live Monitor
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginTop: 'var(--space-1)' }}>
            {exam?.title} &nbsp;·&nbsp; Code: <code style={{ background: 'var(--color-blue-light)', padding: '2px 8px', borderRadius: 4, fontWeight: 800 }}>{exam?.exam_code}</code>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              Refreshed {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={fetchData} id="btn-refresh-monitor">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
        {[
          { label: 'Total', value: counts.total, color: 'var(--color-blue)' },
          { label: 'Active', value: counts.active, color: 'var(--color-orange)' },
          { label: 'Submitted', value: counts.submitted, color: 'var(--color-green)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--color-surface)', border: 'var(--border-base)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', textAlign: 'center', boxShadow: `4px 4px 0 ${color}` }}>
            <div style={{ fontSize: 'var(--font-size-4xl)', fontWeight: 800, color: 'var(--color-text-heading)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 'var(--space-2)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Attempts table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>USN</th>
              <th>Attempt #</th>
              <th>Status</th>
              <th>Sync Seq</th>
              <th>Face Absent</th>
              <th>Multi Face</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  No student attempts yet.
                </td>
              </tr>
            ) : (
              attempts.map((a) => (
                <tr key={a.attempt_id}>
                  <td style={{ fontWeight: 600 }}>{a.student_name}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{a.student_usn || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{a.attempt_number}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td><SyncIndicator seq={a.last_accepted_sequence} /></td>
                  <td>
                    {a.event_counts?.face_absent > 0
                      ? <span className="badge badge-red">{a.event_counts.face_absent}</span>
                      : <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>0</span>}
                  </td>
                  <td>
                    {a.event_counts?.multiple_faces > 0
                      ? <span className="badge badge-orange">{a.event_counts.multiple_faces}</span>
                      : <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>0</span>}
                  </td>
                  <td>
                    {a.event_counts?.phone_detected > 0
                      ? <span className="badge badge-red">{a.event_counts.phone_detected}</span>
                      : <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)', fontWeight: 500 }}>0</span>}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/professor/attempts/${a.attempt_id}/review`)}
                      id={`btn-review-${a.attempt_id.slice(0, 8)}`}
                    >
                      <FileText size={12} /> Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
