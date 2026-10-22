/**
 * ExamProctor.ai — Attempt Review & Manual Evaluation Page (Professor)
 * Shows full event timeline, snapshots, student answers, manual marks adjustment,
 * MCQ answer-key correction, retake authorization, and PDF download.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, ArrowLeft, AlertTriangle, CheckCircle, Camera, Award,
  RotateCcw, Edit3, Save, Check, RefreshCw, HelpCircle, Eye, ShieldCheck, Monitor,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import SnapshotThumbnail from '../../components/evidence/SnapshotThumbnail';
import EvidenceModal from '../../components/evidence/EvidenceModal';

function EventTypeLabel({ type }) {
  const labels = {
    face_absent:         { cls: 'badge-orange', text: 'Face Absent' },
    multiple_faces:      { cls: 'badge-red',    text: 'Multiple Faces' },
    sustained_head_turn: { cls: 'badge-yellow', text: 'Head Turn' },
    phone_detected:      { cls: 'badge-red',    text: 'Phone Detected' },
    camera_unavailable:  { cls: 'badge-orange', text: 'Camera Down' },
    page_hidden:         { cls: 'badge-yellow', text: 'Tab Hidden' },
    fullscreen_exit:     { cls: 'badge-yellow', text: 'Fullscreen Exit' },
  };
  const { cls, text } = labels[type] || { cls: 'badge-blue', text: type };
  return <span className={`badge ${cls}`}>{text}</span>;
}

function fmtDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtDT(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString();
}

export default function AttemptReviewPage() {
  const { attemptId } = useParams();
  const navigate      = useNavigate();
  const toast         = useToast();

  const [activeTab, setActiveTab] = useState('answers'); // 'answers' | 'proctoring'
  const [report, setReport]       = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [dlLoading, setDlLoading] = useState(false);
  const [grantingRetake, setGrantingRetake] = useState(false);

  // Manual grading state: { [qId]: { marks: number, comment: string, saving: boolean } }
  const [gradeInputs, setGradeInputs] = useState({});

  // Answer key correction modal
  const [correctKeyModal, setCorrectKeyModal] = useState(null); // { question_id, question_number, current_key, new_key }
  const [correctingKey, setCorrectingKey] = useState(false);

  // Evidence snapshot review modal
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, evalRes] = await Promise.allSettled([
        api.get(`/reports/attempts/${attemptId}`),
        api.get(`/attempts/${attemptId}/evaluation`),
      ]);

      if (repRes.status === 'fulfilled') {
        setReport(repRes.value.data?.data);
      }
      if (evalRes.status === 'fulfilled') {
        const evalData = evalRes.value.data?.data;
        setEvaluation(evalData);

        // Pre-fill grade inputs
        const initialInputs = {};
        (evalData?.evaluation?.questions || []).forEach((q) => {
          initialInputs[q.question_id] = {
            marks: q.awarded_marks !== null ? q.awarded_marks : 0,
            comment: q.comment || '',
            saving: false,
          };
        });
        setGradeInputs(initialInputs);
      }
    } catch (err) {
      toast('Could not load attempt details.', 'error');
    } finally {
      setLoading(false);
    }
  }, [attemptId, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const downloadPdf = async () => {
    setDlLoading(true);
    try {
      const res = await api.get(`/reports/attempts/${attemptId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url;
      a.download = `examproctor_report_${attemptId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('PDF download failed.', 'error');
    } finally {
      setDlLoading(false);
    }
  };

  const handleGrantRetake = async () => {
    if (!window.confirm('Authorize a retake for this student? This preserves the current attempt and grading.')) {
      return;
    }
    setGrantingRetake(true);
    try {
      const { data } = await api.post(`/attempts/${attemptId}/grant-retake`, {
        reason: 'Authorized retake by professor from review page.',
      });
      toast(data.data?.message || 'Retake authorized.', 'success');
      loadAll();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to authorize retake.', 'error');
    } finally {
      setGrantingRetake(false);
    }
  };

  const handleSaveGrade = async (qId, maxMarks) => {
    const input = gradeInputs[qId];
    if (!input) return;

    const val = parseFloat(input.marks);
    if (isNaN(val) || val < 0 || val > maxMarks) {
      toast(`Marks must be between 0 and maximum marks (${maxMarks}).`, 'error');
      return;
    }

    setGradeInputs((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], saving: true },
    }));

    try {
      const { data } = await api.post(`/attempts/${attemptId}/grade`, {
        question_id: qId,
        marks: val,
        comment: input.comment || undefined,
      });

      toast('Marks updated and saved to audit history.', 'success');
      if (data.data?.evaluation) {
        setEvaluation((prev) => ({
          ...prev,
          evaluation: data.data.evaluation,
        }));
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to save marks.', 'error');
    } finally {
      setGradeInputs((prev) => ({
        ...prev,
        [qId]: { ...prev[qId], saving: false },
      }));
    }
  };

  const handleConfirmCorrectKey = async () => {
    if (!correctKeyModal || !correctKeyModal.new_key) return;
    setCorrectingKey(true);
    try {
      const examId = evaluation?.exam?.exam_id;
      await api.post(`/exams/${examId}/correct-answer-key`, {
        question_id: correctKeyModal.question_id,
        new_correct_option: correctKeyModal.new_key,
      });
      toast('Answer key corrected and scores recalculated.', 'success');
      setCorrectKeyModal(null);
      loadAll();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to correct answer key.', 'error');
    } finally {
      setCorrectingKey(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  const examTitle = evaluation?.exam?.title || report?.exam_title || 'Examination';
  const studentName = evaluation?.student?.name || report?.student_name || 'Student';
  const studentUsn = evaluation?.student?.usn || report?.student_usn || '—';
  const totalScore = evaluation?.evaluation?.marks_obtained ?? 0;
  const maxScore = evaluation?.evaluation?.max_marks ?? 0;
  const gradingStatus = evaluation?.evaluation?.grading_status || 'ungraded';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1040, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(-1)}
            style={{ marginBottom: 'var(--space-2)' }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
          <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-text-heading)', letterSpacing: '-0.02em' }}>
            Attempt Evaluation & Review
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontWeight: 600, marginTop: 'var(--space-1)' }}>
            {examTitle} &nbsp;|&nbsp; {studentName} ({studentUsn})
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleGrantRetake}
            disabled={grantingRetake}
            style={{ color: 'var(--color-blue)', border: '1.5px solid var(--color-blue)' }}
            title="Authorize student to retake this exam"
          >
            <RotateCcw size={15} />
            {grantingRetake ? 'Granting…' : 'Grant Retake'}
          </button>

          <button
            id="btn-download-pdf"
            className="btn btn-primary btn-sm"
            onClick={downloadPdf}
            disabled={dlLoading}
          >
            <FileText size={15} />
            {dlLoading ? 'Generating…' : 'Download PDF Report'}
          </button>
        </div>
      </div>

      {/* Summary Score Card */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)', background: 'var(--color-surface)', border: 'var(--border-base)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Student
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
              {studentName}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
              USN: {studentUsn}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Attempt #
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
              #{evaluation?.attempt_number || report?.attempt_number || 1}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Attempt Status
            </div>
            <span className="badge badge-blue">
              {evaluation?.status?.toUpperCase() || report?.status?.toUpperCase()}
            </span>
          </div>

          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Grading Status
            </div>
            <span className={`badge ${gradingStatus === 'graded' ? 'badge-green' : gradingStatus === 'partially_graded' ? 'badge-yellow' : 'badge-orange'}`}>
              {gradingStatus.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total Marks Obtained
          </div>
          <div style={{ fontSize: 'var(--font-size-4xl)', fontWeight: 800, color: 'var(--color-blue-deep)', lineHeight: 1 }}>
            {totalScore.toFixed(1)} <span style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-text-secondary)' }}>/ {maxScore.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: 'var(--border-base)', paddingBottom: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('answers')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: activeTab === 'answers' ? 'var(--color-blue)' : 'transparent',
            color: activeTab === 'answers' ? '#FFFFFF' : 'var(--color-text-heading)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <Award size={16} />
          Student Answers & Evaluation ({evaluation?.evaluation?.questions?.length || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proctoring')}
          style={{
            padding: 'var(--space-2) var(--space-4)',
            background: activeTab === 'proctoring' ? 'var(--color-blue)' : 'transparent',
            color: activeTab === 'proctoring' ? '#FFFFFF' : 'var(--color-text-heading)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <Camera size={16} />
          Proctoring & Evidence Timeline ({report?.events?.length || 0})
        </button>
      </div>

      {/* TAB 1: Answers & Evaluation */}
      {activeTab === 'answers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {(!evaluation?.evaluation?.questions || evaluation.evaluation.questions.length === 0) ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
              No answers or question records available for this attempt.
            </div>
          ) : (
            evaluation.evaluation.questions.map((q) => {
              const input = gradeInputs[q.question_id] || { marks: q.awarded_marks || 0, comment: '', saving: false };

              return (
                <div key={q.question_id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', border: 'var(--border-base)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontWeight: 800, fontSize: 'var(--font-size-base)', color: 'var(--color-blue-deep)' }}>
                        Q{q.question_number}.
                      </span>
                      <span className="badge badge-blue">
                        {q.question_type.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Max Marks: {q.marks}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {q.is_graded ? (
                        <span className="badge badge-green">
                          Awarded: {q.awarded_marks} / {q.marks}
                        </span>
                      ) : (
                        <span className="badge badge-orange">
                          Needs Manual Grading
                        </span>
                      )}

                      {q.question_type === 'mcq' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCorrectKeyModal({
                            question_id: q.question_id,
                            question_number: q.question_number,
                            current_key: q.correct_option,
                            new_key: q.correct_option || '',
                          })}
                          style={{ fontSize: '11px', color: 'var(--color-blue)' }}
                          title="Correct the answer key if it was configured incorrectly"
                        >
                          <Edit3 size={13} /> Correct Answer Key
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-heading)' }}>
                    {q.question_text}
                  </div>

                  {/* MCQ Options Display */}
                  {q.question_type === 'mcq' && q.options && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
                      {Object.entries(q.options).map(([optKey, optVal]) => {
                        const isStudent = String(q.student_answer).trim().toUpperCase() === optKey.toUpperCase();
                        const isCorrect = String(q.correct_option).trim().toUpperCase() === optKey.toUpperCase();

                        let bg = 'var(--color-surface)';
                        let border = 'var(--border-thin)';
                        if (isCorrect) {
                          bg = '#F0FDF4';
                          border = '2px solid var(--color-green)';
                        }
                        if (isStudent && !isCorrect) {
                          bg = '#FEF2F2';
                          border = '2px solid var(--color-red)';
                        }

                        return (
                          <div
                            key={optKey}
                            style={{
                              padding: 'var(--space-2) var(--space-3)',
                              borderRadius: 'var(--radius-sm)',
                              background: bg,
                              border,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-heading)' }}>
                              <strong>{optKey}:</strong> {optVal}
                            </span>
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                              {isStudent && (
                                <span className="badge badge-blue">Student Selected</span>
                              )}
                              {isCorrect && (
                                <span className="badge badge-green">Correct Answer</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer / Text Display */}
                  {q.question_type !== 'mcq' && (
                    <div style={{ margin: 'var(--space-2) 0' }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--space-1)' }}>
                        Student Submitted Answer:
                      </div>
                      <div
                        style={{
                          background: 'var(--color-surface-alt)',
                          border: 'var(--border-thin)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-3)',
                          fontSize: 'var(--font-size-sm)',
                          color: 'var(--color-text-main)',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit',
                        }}
                      >
                        {q.student_answer ? q.student_answer : <em style={{ color: 'var(--color-text-secondary)' }}>No answer submitted</em>}
                      </div>
                    </div>
                  )}

                  {/* Manual Mark Adjustment Controls */}
                  <div
                    style={{
                      background: 'var(--color-surface-alt)',
                      borderTop: 'var(--border-thin)',
                      padding: 'var(--space-3)',
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
                        Awarded Marks:
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max={q.marks}
                        value={input.marks}
                        onChange={(e) => {
                          const v = e.target.value;
                          setGradeInputs((prev) => ({
                            ...prev,
                            [q.question_id]: { ...prev[q.question_id], marks: v },
                          }));
                        }}
                        style={{
                          width: '90px',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'var(--border-base)',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 700,
                          color: 'var(--color-text-main)',
                        }}
                      />
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        / {q.marks}
                      </span>

                      <input
                        type="text"
                        placeholder="Evaluation comment or grading reason"
                        value={input.comment}
                        onChange={(e) => {
                          const c = e.target.value;
                          setGradeInputs((prev) => ({
                            ...prev,
                            [q.question_id]: { ...prev[q.question_id], comment: c },
                          }));
                        }}
                        style={{
                          width: '260px',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'var(--border-thin)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-main)',
                        }}
                      />
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSaveGrade(q.question_id, q.marks)}
                      disabled={input.saving}
                      title="Save manual mark and comment"
                    >
                      <Save size={14} />
                      {input.saving ? 'Saving…' : 'Save Grade'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Proctoring Events & Snapshots */}
      {activeTab === 'proctoring' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Human review disclaimer */}
          <div className="alert alert-warning">
            <AlertTriangle size={16} />
            <span>
              <strong>Human Review Required:</strong> The events below represent automated camera
              observations only. They do not constitute proof of misconduct. All events must be
              reviewed by a human assessor before any action is taken.
            </span>
          </div>

          {/* Event summary */}
          {report?.event_summaries?.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)', marginBottom: 'var(--space-4)' }}>
                Event Summary
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                {report.event_summaries.map((s) => (
                  <div key={s.event_type} style={{ background: 'var(--color-surface-alt)', border: 'var(--border-thin)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <EventTypeLabel type={s.event_type} />
                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-heading)', lineHeight: 1 }}>{s.total}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Total</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-red)', lineHeight: 1 }}>{s.confirmed}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Confirmed</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event timeline */}
          <div className="card">
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)', marginBottom: 'var(--space-4)' }}>
              Event Timeline ({report?.events?.length || 0})
            </h2>
            {!report?.events?.length ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                <CheckCircle size={32} style={{ margin: '0 auto var(--space-3)', color: 'var(--color-green)' }} />
                No monitoring events recorded for this attempt.
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                      <th>Confidence</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.events.map((e) => {
                      const evSnap = report.snapshots?.find((s) => s.event_id === e.event_id);
                      return (
                        <tr key={e.event_id}>
                          <td><EventTypeLabel type={e.event_type} /></td>
                          <td>
                            <span className={`badge ${e.event_status === 'confirmed' ? 'badge-red' : 'badge-yellow'}`}>
                              {e.event_status}
                            </span>
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            {fmtDT(e.client_started_at)}
                          </td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                            {fmtDT(e.client_ended_at)}
                          </td>
                          <td style={{ fontWeight: 600 }}>{fmtDuration(e.duration_ms)}</td>
                          <td style={{ fontWeight: 500 }}>
                            {e.confidence ? `${(e.confidence * 100).toFixed(0)}%` : '—'}
                          </td>
                          <td>
                            {evSnap ? (
                              <button
                                type="button"
                                className={`btn ${evSnap.capture_reason?.startsWith('screen') ? 'btn-outline-primary' : 'btn-secondary'} btn-sm`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '11px' }}
                                onClick={() => setSelectedEvidence(evSnap)}
                                title={evSnap.capture_reason?.startsWith('screen') ? 'Inspect screen snapshot evidence' : 'Inspect camera snapshot evidence'}
                              >
                                {evSnap.capture_reason?.startsWith('screen') ? <Monitor size={12} /> : <Camera size={12} />}
                                {evSnap.capture_reason?.startsWith('screen') ? 'View Screen Snapshot' : 'View Snapshot'}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Evidence Snapshots */}
          {report?.snapshots?.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)', margin: 0 }}>
                  Evidence Snapshots ({report.snapshots.length})
                </h2>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  Client-side SHA-256 integrity verification performed upon retrieval
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 'var(--space-3)' }}>
                {report.snapshots.map((s) => (
                  <SnapshotThumbnail
                    key={s.snapshot_id}
                    snapshot={s}
                    onOpenViewer={(ev) => setSelectedEvidence(ev)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: MCQ Answer Key Correction */}
      {correctKeyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16, 32, 74, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              border: 'var(--border-base)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              width: '100%',
              maxWidth: '500px',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-text-heading)' }}>
              Correct MCQ Answer Key — Question #{correctKeyModal.question_number}
            </h3>

            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Updating this answer key will automatically recalculate student scores across all attempts
              and record a permanent revision entry in the security audit history.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                Current Correct Key: <strong>{correctKeyModal.current_key || 'None'}</strong>
              </span>

              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                New Correct Option (e.g. A, B, C, D):
              </label>
              <input
                type="text"
                maxLength={4}
                value={correctKeyModal.new_key}
                onChange={(e) => setCorrectKeyModal((prev) => ({ ...prev, new_key: e.target.value.toUpperCase() }))}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  border: 'var(--border-base)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 700,
                  width: '100px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setCorrectKeyModal(null)}
                disabled={correctingKey}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmCorrectKey}
                disabled={correctingKey || !correctKeyModal.new_key}
              >
                {correctingKey ? 'Recalculating…' : 'Save & Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Evidence Snapshot Viewer with SHA-256 Verification */}
      {selectedEvidence && (
        <EvidenceModal
          evidence={selectedEvidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </div>
  );
}
