/**
 * ExamProctor.ai — Camera Readiness Check Page
 * Verifies webcam access and downloads the exam package before starting.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, CheckCircle, XCircle, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { examPackageRepo, attemptRepo } from '../../storage/repositories';
import { useToast } from '../../contexts/ToastContext';
import styles from './ReadinessPage.module.css';

const CHECK_STATES = {
  pending:  { icon: null,          label: 'Checking…' },
  pass:     { icon: CheckCircle,   label: 'Ready',    color: 'var(--color-green)' },
  fail:     { icon: XCircle,       label: 'Failed',   color: 'var(--color-red)' },
  warning:  { icon: AlertTriangle, label: 'Warning',  color: 'var(--color-orange)' },
};

function CheckRow({ label, state, detail }) {
  const cfg = CHECK_STATES[state] || CHECK_STATES.pending;
  const Icon = cfg.icon;
  return (
    <div className={styles.checkRow}>
      <div className={styles.checkLabel}>{label}</div>
      <div className={styles.checkStatus} style={{ color: cfg.color }}>
        {!Icon
          ? <span className="spinner" style={{ width: 18, height: 18 }} />
          : <Icon size={18} strokeWidth={2.5} />}
        <span>{cfg.label}</span>
      </div>
      {detail && <div className={styles.checkDetail}>{detail}</div>}
    </div>
  );
}

export default function ReadinessPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [checks, setChecks] = useState({
    camera:   'pending',
    package:  'pending',
    storage:  'pending',
  });
  const [details, setDetails] = useState({});
  const [canStart, setCanStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState(null);

  const setCheck = useCallback((key, state, detail = null) => {
    setChecks((prev) => ({ ...prev, [key]: state }));
    if (detail) setDetails((prev) => ({ ...prev, [key]: detail }));
  }, []);

  // Run readiness checks
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Load attempt
      const localAttempt = await attemptRepo.get(attemptId);
      if (!cancelled) setAttempt(localAttempt);

      // 2. Camera check
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCheck('camera', 'pass', 'Webcam detected and accessible.');
      } catch (err) {
        setCheck('camera', 'fail', `Camera unavailable: ${err.message}`);
      }

      // 3. Exam package download
      try {
        // Check if already cached locally
        const cached = await examPackageRepo.get(attemptId);
        if (cached) {
          setCheck('package', 'pass', `Package cached (${cached.questions?.length || 0} questions).`);
        } else {
          const { data } = await api.get(
            `/exams/${localAttempt?.exam_id}/package?attempt_id=${attemptId}`
          );
          await examPackageRepo.save({ attempt_id: attemptId, ...data.data });
          setCheck('package', 'pass',
            `Downloaded ${data.data.questions?.length || 0} questions.`);
        }
      } catch (err) {
        setCheck('package', 'fail', 'Could not download exam package. Check your connection.');
      }

      // 4. Storage quota check
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const { usage, quota } = await navigator.storage.estimate();
          const usedMB = Math.round(usage / 1024 / 1024);
          const quotaMB = Math.round(quota / 1024 / 1024);
          const pct = Math.round((usage / quota) * 100);
          if (pct > 90) {
            setCheck('storage', 'warning',
              `Storage ${pct}% used (${usedMB}/${quotaMB} MB). Consider freeing space.`);
          } else {
            setCheck('storage', 'pass', `${quotaMB - usedMB} MB available.`);
          }
        } else {
          setCheck('storage', 'pass', 'Storage API not available — proceeding anyway.');
        }
      } catch {
        setCheck('storage', 'warning', 'Could not estimate storage quota.');
      }
    })();

    return () => {
      cancelled = true;
      // Don't stop the stream here — keep it alive for the exam
    };
  }, [attemptId, setCheck]);

  // Determine if all critical checks pass
  useEffect(() => {
    const crit = ['camera', 'package'];
    const allDone = Object.values(checks).every((s) => s !== 'pending');
    const critPassed = crit.every((k) => checks[k] === 'pass');
    if (allDone && critPassed) setCanStart(true);
  }, [checks]);

  const handleStart = async () => {
    setStarting(true);
    try {
      // Tell backend the exam has started
      await api.post(`/attempts/${attemptId}/start`);
      // Update local attempt status
      await attemptRepo.updateStatus(attemptId, 'in_progress');
      toast('Exam started. Good luck!', 'success');
      navigate(`/student/exam/${attemptId}`);
    } catch (err) {
      // Even if server call fails, allow local start (offline-first)
      await attemptRepo.updateStatus(attemptId, 'in_progress');
      toast('Starting in offline mode. Your answers will sync when connected.', 'warning', 6000);
      navigate(`/student/exam/${attemptId}`);
    }
  };

  const retryAll = () => {
    setChecks({ camera: 'pending', package: 'pending', storage: 'pending' });
    setDetails({});
    setCanStart(false);
    // Cleanup existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Re-run effect by forcing remount
    window.location.reload();
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Left — video preview */}
        <div className={styles.cameraPanel}>
          <div className={styles.cameraBorder}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.video}
            />
            {checks.camera !== 'pass' && (
              <div className={styles.cameraOverlay}>
                <Camera size={40} />
                <span>Camera preview will appear here</span>
              </div>
            )}
          </div>
          <p className={styles.cameraHint}>
            Position yourself so your face is clearly visible and centred.
          </p>
        </div>

        {/* Right — checks + actions */}
        <div className={styles.rightPanel}>
          <div className={styles.header}>
            <h1 className={styles.title}>Readiness Check</h1>
            {attempt && (
              <p className={styles.sub}>{attempt.exam_title || 'Examination'}</p>
            )}
          </div>

          <div className={styles.checklist}>
            <CheckRow
              label="Webcam access"
              state={checks.camera}
              detail={details.camera}
            />
            <CheckRow
              label="Exam package"
              state={checks.package}
              detail={details.package}
            />
            <CheckRow
              label="Local storage"
              state={checks.storage}
              detail={details.storage}
            />
          </div>

          {/* Exam Rules & Continuity Guidelines (Phase 10) */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: 'var(--border-thin)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              fontSize: 'var(--font-size-xs)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-heading)' }}>
              Examination Instructions & Proctoring Rules
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              <div style={{ background: 'var(--color-surface-alt)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Duration: </span>
                <strong style={{ color: 'var(--color-text-heading)' }}>
                  {attempt?.duration_seconds ? `${Math.floor(attempt.duration_seconds / 60)} minutes` : 'Standard'}
                </strong>
              </div>
              <div style={{ background: 'var(--color-surface-alt)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Questions: </span>
                <strong style={{ color: 'var(--color-text-heading)' }}>
                  {details.package ? details.package.replace(/Downloaded |Package cached \(|\) questions\./g, '') : 'Ready'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--color-text-main)' }}>
              <div>
                <strong>• Camera & Proctoring:</strong> Maintain clear face visibility. Algorithms observe candidate conditions (face absence, multiple faces, head turns, phone presence). Automated flags do not equal cheating; all events require human assessor review.
              </div>
              <div>
                <strong>• Fullscreen Requirement:</strong> The examination runs in fullscreen. Exiting fullscreen or switching applications will be logged as an observable proctoring event.
              </div>
              <div>
                <strong>• Offline Continuity:</strong> If your network disconnects, your examination continues locally. Answers are saved safely on your device and will synchronize automatically once reconnected. Do not panic or close the browser.
              </div>
              <div>
                <strong>• Submission:</strong> Once finished, click Submit Examination. Your answers will be saved locally first, then confirmed by the server.
              </div>
            </div>
          </div>

          {!canStart &&
            Object.values(checks).every((s) => s !== 'pending') && (
            <div className="alert alert-error">
              <XCircle size={16} />
              <span>
                One or more critical checks failed. Resolve the issues above
                before starting your examination.
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className="btn btn-secondary"
              onClick={retryAll}
              id="btn-retry-checks"
            >
              <RefreshCw size={16} /> Retry checks
            </button>
            <button
              id="btn-start-exam"
              className="btn btn-primary btn-lg"
              disabled={!canStart || starting}
              onClick={handleStart}
            >
              {starting ? (
                <><span className="spinner" style={{ width: 18, height: 18 }} /> Starting…</>
              ) : (
                <>Start Examination <ArrowRight size={16} /></>
              )}
            </button>
          </div>

          <div className={styles.notice}>
            <AlertTriangle size={14} />
            <span>
              Your webcam feed will be monitored throughout the examination.
              This is an observational process — all events are reviewed by
              a human before any determination is made.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
