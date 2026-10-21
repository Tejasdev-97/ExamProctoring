/**
 * ExamProctor.ai — Active Exam Session Page
 *
 * Layout (PRD §11):
 *   ┌─────────────┬──────────────────────────────┬──────────┐
 *   │  Left panel │   Question area               │ Camera   │
 *   │  (nav +     │   (question text + answer)    │ panel    │
 *   │   timer)    │                               │ + events │
 *   └─────────────┴──────────────────────────────┴──────────┘
 *
 * Data flow:
 *   Answer typed → answerRepo.upsert() → enqueueOperation() → syncWorker uploads
 *   CV event     → eventRepo.save()    → enqueueOperation() → syncWorker uploads
 *   Submit       → attemptRepo.markLocallySubmitted() → enqueueOperation(finalize)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Send, X, Camera, Maximize2, Minimize2 } from 'lucide-react';

import { examPackageRepo, attemptRepo, answerRepo } from '../../storage/repositories';
import { enqueueOperation, getOperationForEntity } from '../../storage/outbox';
import { useProctoring } from '../../proctoring/useProctoring';
import { useSyncWorker } from '../../workers/useSyncWorker';
import SyncRecoveryPanel from '../../components/sync/SyncRecoveryPanel';
import styles from './ExamSessionPage.module.css';

// ── Countdown Timer ───────────────────────────────────────────────────────
// Driven by a PERSISTED absolute deadline (not tick counts): reloads and suspended/
// throttled tabs recompute the remaining time from the wall clock instead of resetting.
function CountdownTimer({ deadlineMs, onExpire }) {
  const calc = () => Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(calc);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setRemaining(r);
      if (r <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [deadlineMs]);

  const hours   = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const pad     = (n) => String(n).padStart(2, '0');
  const isLow   = remaining < 300; // 5 min warning
  const isCrit  = remaining < 60;

  return (
    <div
      className={`${styles.timer} ${isLow ? styles.timerLow : ''} ${isCrit ? styles.timerCrit : ''}`}
      role="timer"
      aria-live="polite"
      aria-label={`Time remaining: ${hours ? pad(hours) + ':' : ''}${pad(minutes)}:${pad(seconds)}`}
    >
      {hours > 0 && <><span>{pad(hours)}</span><span className={styles.timerColon}>:</span></>}
      <span>{pad(minutes)}</span>
      <span className={styles.timerColon}>:</span>
      <span>{pad(seconds)}</span>
    </div>
  );
}

// ── Warning Card ──────────────────────────────────────────────────────────
function WarningCard({ warning, onDismiss }) {
  const critical = ['multiple_faces', 'phone_detected'].includes(warning.type);
  return (
    <div className={`warning-card ${critical ? 'warning-card-critical' : ''} ${styles.warnCard}`}>
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
        {warning.message}
      </span>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => onDismiss(warning.id)}
        aria-label="Dismiss warning"
        style={{ padding: '2px 6px', minWidth: 0, flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── MCQ Answer ────────────────────────────────────────────────────────────
function McqAnswer({ question, savedAnswer, onChange }) {
  const selected = savedAnswer?.answer_value?.selected_option || null;
  return (
    <div className={styles.mcqOptions}>
      {Object.entries(question.options || {}).map(([key, text]) => (
        <label
          key={key}
          htmlFor={`opt-${question.question_id}-${key}`}
          className={`${styles.mcqOption} ${selected === key ? styles.mcqSelected : ''}`}
        >
          <input
            type="radio"
            id={`opt-${question.question_id}-${key}`}
            name={`q-${question.question_id}`}
            value={key}
            checked={selected === key}
            onChange={() => onChange({ selected_option: key })}
          />
          <span className={styles.mcqKey}>{key}</span>
          <span className={styles.mcqText}>{text}</span>
        </label>
      ))}
    </div>
  );
}

// ── Short Answer ──────────────────────────────────────────────────────────
function ShortAnswer({ question, savedAnswer, onChange }) {
  const text = savedAnswer?.answer_value?.text || '';
  return (
    <textarea
      id={`sa-${question.question_id}`}
      className={`form-textarea ${styles.shortAnswerArea}`}
      placeholder="Type your answer here…"
      value={text}
      onChange={(e) => onChange({ text: e.target.value })}
      rows={6}
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function ExamSessionPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);

  const [pkg, setPkg] = useState(null);           // exam package
  const [attempt, setAttempt] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});     // questionId → {answer_value, revision, operation_id}
  const [savingQ, setSavingQ] = useState(null);   // questionId being saved
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [deadlineMs, setDeadlineMs] = useState(null);
  const submittingRef = useRef(false);

  // CV proctoring
  const { cameraState, activeWarnings, eventCount, dismissWarning, flushEvents, storageWarning, stopCamera } = useProctoring({
    videoRef,
    attemptId,
    proctoringConfig: pkg?.proctoring_config,
    enabled: !submitted,
  });

  // Background sync (ordered operations, durable evidence, server-confirmed submission)
  const { syncStatus, syncDetail, syncNow, submissionState } = useSyncWorker(attemptId);
  const [showSyncPanel, setShowSyncPanel] = useState(false);

  // Escape collapses the enlarged camera (the exam itself keeps running underneath)
  useEffect(() => {
    if (!cameraExpanded) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setCameraExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cameraExpanded]);

  // Load exam package and attempt
  useEffect(() => {
    (async () => {
      const [localPkg, localAttempt] = await Promise.all([
        examPackageRepo.get(attemptId),
        attemptRepo.get(attemptId),
      ]);
      setPkg(localPkg);
      setAttempt(localAttempt);

      if (localAttempt?.status === 'submitted' || localAttempt?.status === 'submitted_local') {
        stopCamera();
        setSubmitted(true);
      }

      // Persisted absolute deadline: computed once from the recorded start, then reused on
      // every reload so the timer can neither reset nor be extended by reloading.
      if (localPkg && localAttempt) {
        let dl = localAttempt.deadline_at ? Date.parse(localAttempt.deadline_at) : NaN;
        if (!Number.isFinite(dl)) {
          const startIso = localAttempt.server_started_at || localAttempt.client_started_at || new Date().toISOString();
          dl = Date.parse(startIso) + (localPkg.duration_seconds || 0) * 1000;
          await attemptRepo.patch(attemptId, {
            client_started_at: localAttempt.client_started_at || startIso,
            deadline_at: new Date(dl).toISOString(),
          });
        }
        setDeadlineMs(dl);
      }

      // Load saved answers
      const { answerRepo: ar } = await import('../../storage/repositories');
      const saved = await ar.getAll(attemptId);
      const map = {};
      saved.forEach((a) => { map[a.question_id] = a; });
      setAnswers(map);
    })();
  }, [attemptId]);

  const currentQuestion = pkg?.questions?.[currentIndex];
  const totalQuestions  = pkg?.questions?.length || 0;

  // Save answer locally then enqueue for sync
  const handleAnswerChange = useCallback(async (answerValue) => {
    if (!currentQuestion) return;
    const qId = currentQuestion.question_id;
    setSavingQ(qId);

    const saved = await answerRepo.upsert({
      attemptId,
      questionId: qId,
      answerValue,
    });

    // Enqueue outbox operation
    await enqueueOperation({
      operationId:   saved.operation_id,
      attemptId,
      operationType: 'answer_upsert',
      entityId:      qId,
      payload: {
        question_id:      qId,
        answer_value:     answerValue,
        revision:         saved.revision,
        client_updated_at: saved.updated_at,
      },
    });

    setAnswers((prev) => ({ ...prev, [qId]: saved }));
    setSavingQ(null);
  }, [attemptId, currentQuestion]);

  // Navigate questions
  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < totalQuestions) setCurrentIndex(idx);
  }, [totalQuestions]);

  // Submit exam: durable local commit only. Server confirmation comes later from the
  // sync worker, strictly after every earlier operation has been acknowledged.
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return; // repeated clicks / timer + click
    submittingRef.current = true;
    setSubmitLoading(true);
    try {
      const current = await attemptRepo.get(attemptId);
      if (current && (current.status === 'submitted' || current.status === 'submitted_local')) {
        stopCamera();
        setSubmitted(true);
        setShowSubmitModal(false);
        return;
      }

      // Close active episodes and wait until their event operations are queued, so they
      // precede the finalize operation in sequence order.
      await flushEvents();

      // Stop camera tracks and frame loop immediately upon submission
      stopCamera();

      // Idempotent across crashes between enqueue and local commit: reuse an existing
      // finalize operation instead of creating a second submission.
      const prior = await getOperationForEntity(attemptId, 'submission_finalize', attemptId);
      const clientSubmittedAt = prior?.payload?.client_submitted_at || new Date().toISOString();
      const submissionOpId = prior?.operation_id || uuidv4();
      const record = prior || await enqueueOperation({
        operationId:   submissionOpId,
        attemptId,
        operationType: 'submission_finalize',
        entityId:      attemptId,
        payload: {
          submission_operation_id: submissionOpId,
          client_submitted_at:     clientSubmittedAt,
        },
      });

      await attemptRepo.markLocallySubmitted(attemptId, {
        submissionOperationId: submissionOpId,
        finalSequence: record.sequence_number, // the real operation sequence boundary
        clientSubmittedAt,
      });

      setSubmitted(true);
      setShowSubmitModal(false);
    } catch (err) {
      console.error('Submission error', err);
      submittingRef.current = false; // allow a retry; nothing was lost
    } finally {
      setSubmitLoading(false);
    }
  }, [attemptId, flushEvents, stopCamera]);

  // ── Submission confirmation screen ────────────────────────────────────
  if (submitted) {
    return (
      <div className={styles.submittedScreen}>
        <div className={styles.submittedCard}>
          <CheckCircle size={56} style={{ color: 'var(--color-green)' }} />
          <h1>Examination Submitted</h1>
          <p>
            Your submission is saved on this device. It is only final once the server
            confirms it; this happens automatically when you are connected.
          </p>
          <div className={styles.submittedMeta}>
            <span>Attempt ID:</span>
            <code>{attemptId.slice(0, 8)}…</code>
          </div>
          {submissionState.key.startsWith('confirmed') ? (
            <div className="alert alert-success" role="status">
              <CheckCircle size={16} />
              {submissionState.label}
            </div>
          ) : (
            <div className="alert alert-warning" role="status">
              <AlertTriangle size={16} />
              {submissionState.label}
            </div>
          )}
          <button className="btn btn-primary" onClick={() => navigate('/student')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className={styles.loadingScreen}>
        <div className="spinner spinner-lg" />
        <p>Loading exam…</p>
      </div>
    );
  }

  // ── Answered count ────────────────────────────────────────────────────
  const answeredCount = pkg.questions.filter(
    (q) => answers[q.question_id]?.answer_value
  ).length;

  return (
    <div className={styles.shell}>
      {/* ── Left panel: nav + timer ── */}
      <aside className={styles.leftPanel}>
        <div className={styles.examMeta}>
          <div className={styles.examTitle}>{pkg.title}</div>
          <div className={styles.examProgress}>
            {answeredCount}/{totalQuestions} answered
          </div>
        </div>

        {/* Timer */}
        {deadlineMs && (
          <CountdownTimer
            deadlineMs={deadlineMs}
            onExpire={handleSubmit /* time is up: commit the submission */}
          />
        )}

        {/* Question navigator */}
        <div className={styles.qNavGrid}>
          {pkg.questions.map((q, i) => {
            const isAnswered = !!answers[q.question_id]?.answer_value;
            const isCurrent  = i === currentIndex;
            return (
              <button
                key={q.question_id}
                id={`btn-qnav-${i + 1}`}
                className={`${styles.qNavBtn}
                  ${isCurrent  ? styles.qNavCurrent  : ''}
                  ${isAnswered ? styles.qNavAnswered : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Question ${i + 1}${isAnswered ? ' (answered)' : ''}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Submit button */}
        <button
          id="btn-submit-exam"
          className="btn btn-orange w-full"
          onClick={() => setShowSubmitModal(true)}
        >
          <Send size={16} /> Submit Exam
        </button>
      </aside>

      {/* ── Main question area ── */}
      <main className={styles.questionArea} role="main">
        {currentQuestion && (
          <>
            <div className={styles.questionHeader}>
              <span className="badge badge-blue">
                Q{currentQuestion.question_number}
              </span>
              <span className={styles.questionMarks}>
                {currentQuestion.marks} mark{currentQuestion.marks !== 1 ? 's' : ''}
              </span>
              {savingQ === currentQuestion.question_id && (
                <span className={styles.savingIndicator}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Saving…
                </span>
              )}
            </div>

            <div className={styles.questionText}>
              {currentQuestion.question_text}
            </div>

            <div className={styles.answerArea}>
              {currentQuestion.question_type === 'mcq' ? (
                <McqAnswer
                  question={currentQuestion}
                  savedAnswer={answers[currentQuestion.question_id]}
                  onChange={handleAnswerChange}
                />
              ) : (
                <ShortAnswer
                  question={currentQuestion}
                  savedAnswer={answers[currentQuestion.question_id]}
                  onChange={handleAnswerChange}
                />
              )}
            </div>

            {/* Navigation */}
            {pkg.allow_question_navigation && (
              <div className={styles.navButtons}>
                <button
                  className="btn btn-secondary"
                  onClick={() => goTo(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  id="btn-prev-question"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className={styles.qCounter}>
                  {currentIndex + 1} / {totalQuestions}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => goTo(currentIndex + 1)}
                  disabled={currentIndex === totalQuestions - 1}
                  id="btn-next-question"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Right panel: camera + warnings ── */}
      <aside className={`${styles.rightPanel} ${cameraExpanded ? styles.rightPanelRaised : ''}`}>
        {/* Camera feed. The SAME <video> element/stream is only restyled when expanded. */}
        {cameraExpanded && (
          <div className={styles.cameraBackdrop} onClick={() => setCameraExpanded(false)} aria-hidden="true" />
        )}
        <div className={styles.cameraSlot}>
          <div
            className={`${styles.cameraBox} ${cameraExpanded ? styles.cameraBoxExpanded : ''}`}
            role={cameraExpanded ? 'dialog' : undefined}
            aria-label={cameraExpanded ? 'Enlarged camera preview' : undefined}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={styles.cameraVideo}
            />
            <div className={styles.cameraStatus}>
              <span
                className={styles.cameraStatusDot}
                style={{
                  background: cameraState === 'active'
                    ? 'var(--color-green)'
                    : 'var(--color-red)',
                }}
              />
              <span>{cameraState === 'active' ? 'Camera active' : cameraState}</span>
            </div>
            <button
              type="button"
              id="btn-toggle-camera-size"
              className={styles.cameraExpandBtn}
              onClick={() => setCameraExpanded((v) => !v)}
              aria-label={cameraExpanded ? 'Collapse camera preview' : 'Enlarge camera preview'}
              aria-expanded={cameraExpanded}
            >
              {cameraExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {/* Sync / submission status (never shows green until the server has acknowledged) */}
        <div
          className={styles.syncRow}
          role="status"
          aria-live="polite"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowSyncPanel(true)}
          title="Click to view offline evidence & recovery dashboard"
        >
          <span className={styles.syncLabel}>Sync</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`badge ${['synced', 'confirmed', 'confirmed_evidence_pending'].includes(submissionState.key) ? 'badge-green' : syncStatus === 'error' || syncStatus === 'auth_expired' ? 'badge-red' : 'badge-orange'}`}>
              {syncStatus === 'auth_expired' ? 'sign-in needed' : syncStatus === 'idle' ? 'starting' : syncStatus}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ padding: '2px 6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => { e.stopPropagation(); setShowSyncPanel(true); }}
            >
              Queue
            </button>
          </div>
        </div>
        <div className={styles.syncDetail}>{submissionState.label}</div>
        {storageWarning && (
          <div className="alert alert-warning" role="alert">
            <AlertTriangle size={16} /> {storageWarning}
          </div>
        )}

        {/* Active warnings */}
        <div className={`${styles.warningsList} ${cameraExpanded ? styles.warningsAboveOverlay : ''}`}>
          {activeWarnings.map((w) => (
            <WarningCard key={w.id} warning={w} onDismiss={dismissWarning} />
          ))}
        </div>

        {/* Event summary */}
        {Object.keys(eventCount).length > 0 && (
          <div className={styles.eventSummary}>
            <div className={styles.eventSummaryTitle}>Events recorded</div>
            {Object.entries(eventCount).map(([type, count]) => (
              <div key={type} className={styles.eventSummaryRow}>
                <span>{type.replace(/_/g, ' ')}</span>
                <span className="badge badge-orange">{count}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Submit confirmation modal ── */}
      {showSubmitModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h2 style={{ fontSize: 'var(--font-size-xl)' }}>Submit Examination?</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSubmitModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                You have answered <strong>{answeredCount}</strong> of{' '}
                <strong>{totalQuestions}</strong> questions.
              </p>
              <p style={{ marginTop: 'var(--space-3)' }}>
                Once submitted, you cannot change your answers. Your answers
                are saved locally and will be uploaded automatically.
              </p>
              {answeredCount < totalQuestions && (
                <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
                  <AlertTriangle size={16} />
                  <span>
                    {totalQuestions - answeredCount} question(s) are unanswered.
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
                id="btn-cancel-submit"
              >
                Continue exam
              </button>
              <button
                id="btn-confirm-submit"
                className="btn btn-orange"
                onClick={handleSubmit}
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <><span className="spinner" style={{ width: 16, height: 16 }} /> Submitting…</>
                ) : (
                  <><Send size={16} /> Submit now</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Evidence & Sync Recovery Dashboard */}
      <SyncRecoveryPanel
        attemptId={attemptId}
        syncStatus={syncStatus}
        syncDetail={syncDetail}
        submissionState={submissionState}
        syncNow={syncNow}
        isOpen={showSyncPanel}
        onClose={() => setShowSyncPanel(false)}
      />
    </div>
  );
}
