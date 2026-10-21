/**
 * ExamProctor.ai — Exam Entry Page
 * Student enters a 6-digit exam code to resolve and authorize an attempt.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Info, ArrowRight, Loader } from 'lucide-react';
import api from '../../services/api';
import { attemptRepo } from '../../storage/repositories';
import { useToast } from '../../contexts/ToastContext';
import styles from './ExamEntryPage.module.css';

export default function ExamEntryPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [resolved, setResolved] = useState(null);   // exam preview
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authorizing, setAuthorizing] = useState(false);

  const handleCodeInput = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(val);
    setResolved(null);
    setError('');
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter a 6-digit exam code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/exams/resolve-code', { exam_code: code });
      setResolved(data.data);
    } catch (err) {
      const msg = err?.response?.data?.error?.message;
      setError(
        err?.response?.status === 404
          ? 'No active exam found with that code. Double-check with your professor.'
          : msg || 'Unable to resolve exam code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!resolved) return;
    setAuthorizing(true);
    try {
      const { data } = await api.post('/attempts/authorize', { exam_code: code });
      const attempt = data.data;

      // Save to local store
      await attemptRepo.save({
        ...attempt,
        exam_title: resolved.title,
        duration_seconds: resolved.duration_seconds,
      });

      toast('Exam authorized! Proceeding to readiness check.', 'success');
      navigate(`/student/readiness/${attempt.attempt_id}`);
    } catch (err) {
      const msg = err?.response?.data?.error?.message;
      setError(msg || 'Could not authorize this exam. Please try again.');
    } finally {
      setAuthorizing(false);
    }
  };

  const dur = resolved
    ? `${Math.floor(resolved.duration_seconds / 60)} minutes`
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.iconWrap}><Hash size={26} /></div>
          <div>
            <h1 className={styles.title}>Enter Exam Code</h1>
            <p className={styles.sub}>
              Enter the 6-digit code provided by your professor.
            </p>
          </div>
        </div>

        {/* Code form */}
        <form onSubmit={handleResolve} className={styles.form} noValidate>
          <div className="form-group">
            <label htmlFor="exam-code-input" className="form-label">
              Exam Code
            </label>
            <input
              id="exam-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              className={`form-input ${styles.codeInput} ${error ? 'error' : ''}`}
              placeholder="000000"
              value={code}
              onChange={handleCodeInput}
              maxLength={6}
              autoFocus
              required
            />
            {error && <p className="form-error">{error}</p>}
          </div>

          <button
            id="btn-resolve-code"
            type="submit"
            className="btn btn-secondary w-full"
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <><Loader size={16} className="animate-spin" /> Checking…</>
            ) : (
              <>Look up exam</>
            )}
          </button>
        </form>

        {/* Exam preview */}
        {resolved && (
          <div className={styles.preview}>
            <div className={styles.previewHeader}>
              <span className={`badge ${resolved.is_live ? 'badge-green' : resolved.status === 'published' ? 'badge-yellow' : 'badge-orange'}`}>
                {resolved.is_live ? 'Exam Live' : resolved.status === 'published' ? 'Scheduled' : 'Ended'}
              </span>
            </div>
            <h2 className={styles.examTitle}>{resolved.title}</h2>
            {resolved.instructions && (
              <div className={styles.instructions}>
                <Info size={14} />
                <span>{resolved.instructions}</span>
              </div>
            )}

            {/* Scheduled warning if not live yet */}
            {!resolved.is_live && (
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1.5px solid var(--color-orange)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  color: 'var(--color-text-heading)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ color: 'var(--color-orange)', fontWeight: 700 }}>
                  {resolved.message || 'This examination is not live yet. Your professor has not started it.'}
                </div>
                {resolved.scheduled_at && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    Scheduled start: {new Date(resolved.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} (IST)
                  </div>
                )}
              </div>
            )}

            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Duration</span>
                <span className={styles.metaValue}>{dur}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Status</span>
                <span className={styles.metaValue}>
                  {resolved.is_live ? 'Active / Live' : resolved.status === 'published' ? 'Scheduled (Not live)' : 'Ended'}
                </span>
              </div>
            </div>

            <button
              id="btn-authorize-exam"
              className="btn btn-primary btn-lg w-full"
              onClick={handleAuthorize}
              disabled={authorizing || !resolved.is_live}
              title={!resolved.is_live ? 'Waiting for professor to start the examination' : 'Proceed to Readiness Check'}
            >
              {authorizing ? (
                <><Loader size={16} className="animate-spin" /> Authorizing…</>
              ) : !resolved.is_live ? (
                <>Examination Not Live Yet</>
              ) : (
                <>Proceed to Readiness Check <ArrowRight size={16} /></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
