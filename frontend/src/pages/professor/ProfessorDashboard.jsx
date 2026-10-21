/**
 * ExamProctor.ai — Professor Dashboard
 * Complete lifecycle controls, safe typed deletion, results export, and submissions review.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, BookOpen, Users, BarChart3, Eye, Play, Square, RotateCcw,
  Trash2, Download, CheckCircle, AlertTriangle, X, FileSpreadsheet,
  FileText, Award, RefreshCw, PenLine, Clock,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import styles from './ProfessorDashboard.module.css';

function ExamCard({
  exam,
  onMonitor,
  onEdit,
  onGoLive,
  onEndExam,
  onOpenRestart,
  onOpenDelete,
  onOpenExport,
  onOpenSubmissions,
}) {
  const statusColors = {
    draft: 'badge-blue',
    published: 'badge-yellow',
    active: 'badge-green',
    closed: 'badge-orange',
    archived: 'badge-yellow',
  };

  const isLive = exam.status === 'active';
  const isDraft = exam.status === 'draft';
  const isPublished = exam.status === 'published';
  const isClosed = exam.status === 'closed';

  return (
    <div className={styles.examCard}>
      <div className={styles.examCardHeader}>
        <div>
          <div className={styles.examCardTitle}>{exam.title}</div>
          <div className={styles.examCardMeta}>
            {exam.exam_code ? (
              <span className={styles.codeChip}>{exam.exam_code}</span>
            ) : (
              <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                Code generated on go-live
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={13} /> {Math.floor(exam.duration_seconds / 60)} min
            </span>
            {exam.available_from && (
              <span>Scheduled: {new Date(exam.available_from).toLocaleString()}</span>
            )}
          </div>
        </div>
        <span className={`badge ${statusColors[exam.status] || 'badge-blue'}`}>
          {isLive ? 'LIVE' : isClosed ? 'ENDED' : isPublished ? 'SCHEDULED' : exam.status.toUpperCase()}
        </span>
      </div>

      <div className={styles.examCardFooter}>
        <span className={styles.examCardDate}>
          {exam.published_at
            ? `Published ${new Date(exam.published_at).toLocaleDateString()}`
            : `Created ${new Date(exam.created_at).toLocaleDateString()}`}
        </span>

        <div className={styles.examCardActions}>
          {/* Edit action */}
          <button
            className="btn btn-sm btn-edit"
            onClick={() => onEdit(exam.exam_id)}
            disabled={isLive}
            title={isLive ? 'Cannot edit an active examination.' : 'Edit examination'}
            id={`btn-edit-${exam.exam_id.slice(0, 8)}`}
          >
            <PenLine size={13} />
            <span>Edit</span>
          </button>

          {/* Go Live / Start action */}
          {(isDraft || isPublished) && (
            <button
              className="btn btn-sm btn-amber"
              onClick={() => onGoLive(exam.exam_id)}
              id={`btn-golive-${exam.exam_id.slice(0, 8)}`}
              title="Activate examination and allow students to take it"
            >
              <Play size={13} />
              <span>Go Live</span>
            </button>
          )}

          {/* Monitor action */}
          {(isLive || isClosed || isPublished) && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onMonitor(exam.exam_id)}
              id={`btn-monitor-${exam.exam_id.slice(0, 8)}`}
              title="Live proctoring monitoring"
            >
              <Eye size={13} />
              <span>Monitor</span>
            </button>
          )}

          {/* End Examination action */}
          {isLive && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onEndExam(exam.exam_id)}
              id={`btn-end-${exam.exam_id.slice(0, 8)}`}
              title="End the examination session"
            >
              <Square size={13} />
              <span>End Exam</span>
            </button>
          )}

          {/* Restart Examination action */}
          {isClosed && (
            <button
              className="btn btn-sm btn-amber"
              onClick={() => onOpenRestart(exam)}
              id={`btn-restart-${exam.exam_id.slice(0, 8)}`}
              title="Restart ended examination session"
            >
              <RotateCcw size={13} />
              <span>Restart</span>
            </button>
          )}

          {/* Submissions & Evaluation action */}
          {!isDraft && (
            <button
              className="btn btn-sm btn-violet"
              onClick={() => onOpenSubmissions(exam)}
              id={`btn-submissions-${exam.exam_id.slice(0, 8)}`}
              title="View student attempts and manual grading"
            >
              <Users size={13} />
              <span>Submissions</span>
            </button>
          )}

          {/* Download Results action */}
          {!isDraft && (
            <button
              className="btn btn-sm btn-green"
              onClick={() => onOpenExport(exam)}
              id={`btn-results-${exam.exam_id.slice(0, 8)}`}
              title="Download official examination results"
            >
              <BarChart3 size={13} />
              <span>Results</span>
            </button>
          )}

          {/* Delete action */}
          <button
            className="btn btn-sm btn-danger"
            disabled={isLive}
            title={isLive ? 'Cannot delete a live examination. End the examination before deleting it.' : 'Safely delete examination'}
            onClick={() => onOpenDelete(exam)}
            id={`btn-delete-${exam.exam_id.slice(0, 8)}`}
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfessorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [deleteModalExam, setDeleteModalExam] = useState(null);
  const [deleteTypedText, setDeleteTypedText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [restartModalExam, setRestartModalExam] = useState(null);
  const [restartDurationMin, setRestartDurationMin] = useState(60);
  const [restarting, setRestarting] = useState(false);

  const [exportModalExam, setExportModalExam] = useState(null);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exporting, setExporting] = useState(false);

  const [submissionsModalExam, setSubmissionsModalExam] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [grantingRetakeId, setGrantingRetakeId] = useState(null);

  const loadExams = useCallback(() => {
    setLoading(true);
    api.get('/exams')
      .then(({ data }) => setExams(data.data || []))
      .catch((err) => {
        console.error(err);
        toast('Failed to load examinations', 'error');
      })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Go live handler
  const handleGoLive = async (examId) => {
    try {
      await api.post(`/exams/${examId}/go-live`);
      toast('Examination is now LIVE for students.', 'success');
      loadExams();
    } catch (err) {
      toast(err.response?.data?.message || 'Could not make examination live.', 'error');
    }
  };

  // End exam handler
  const handleEndExam = async (examId) => {
    if (!window.confirm('Are you sure you want to end this active examination? New responses will be closed.')) {
      return;
    }
    try {
      await api.post(`/exams/${examId}/close`);
      toast('Examination ended successfully.', 'success');
      loadExams();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to end examination.', 'error');
    }
  };

  // Restart modal confirm
  const handleConfirmRestart = async () => {
    if (!restartModalExam) return;
    setRestarting(true);
    try {
      await api.post(`/exams/${restartModalExam.exam_id}/restart`, {
        new_duration_seconds: restartDurationMin > 0 ? restartDurationMin * 60 : undefined,
      });
      toast('Examination restarted and live.', 'success');
      setRestartModalExam(null);
      loadExams();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to restart examination.', 'error');
    } finally {
      setRestarting(false);
    }
  };

  // Safe typed delete confirm
  const handleConfirmDelete = async () => {
    if (!deleteModalExam || deleteTypedText !== 'delete') return;
    setDeleting(true);
    try {
      await api.delete(`/exams/${deleteModalExam.exam_id}`);
      toast(`Examination "${deleteModalExam.title}" deleted safely.`, 'success');
      setDeleteModalExam(null);
      setDeleteTypedText('');
      loadExams();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to delete examination.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Results download
  const handleDownloadResults = async () => {
    if (!exportModalExam) return;
    setExporting(true);
    try {
      const res = await api.get(
        `/exams/${exportModalExam.exam_id}/results/export?format=${exportFormat}`,
        { responseType: 'blob' }
      );
      const ext = exportFormat === 'excel' ? 'xlsx' : 'pdf';
      const safeCode = exportModalExam.exam_code || exportModalExam.exam_id.slice(0, 8);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam_results_${safeCode}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModalExam(null);
      toast('Export downloaded successfully.', 'success');
    } catch (err) {
      toast('Failed to download examination results.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Submissions modal loader
  const handleOpenSubmissions = async (exam) => {
    setSubmissionsModalExam(exam);
    setLoadingSubmissions(true);
    try {
      const { data } = await api.get(`/exams/${exam.exam_id}/results`);
      setSubmissionsList(data.data?.results || []);
    } catch (err) {
      toast('Failed to load student submissions.', 'error');
      setSubmissionsList([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Grant retake
  const handleGrantRetake = async (attemptId, studentName) => {
    if (!window.confirm(`Authorize retake for ${studentName}? This preserves their initial attempt and allows a new attempt.`)) {
      return;
    }
    setGrantingRetakeId(attemptId);
    try {
      const { data } = await api.post(`/attempts/${attemptId}/grant-retake`, {
        reason: 'Authorized retake by professor.',
      });
      toast(data.data?.message || 'Retake authorized.', 'success');
      if (submissionsModalExam) {
        handleOpenSubmissions(submissionsModalExam);
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Could not authorize retake.', 'error');
    } finally {
      setGrantingRetakeId(null);
    }
  };

  const stats = {
    total: exams.length,
    live: exams.filter((e) => e.status === 'active').length,
    scheduled: exams.filter((e) => e.status === 'published').length,
    draft: exams.filter((e) => e.status === 'draft').length,
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>Professor Dashboard</h1>
          <p className={styles.sub}>Welcome back, {user?.full_name}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/professor/exams/new')}
          id="btn-new-exam"
        >
          <Plus size={16} /> New Exam
        </button>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        {[
          { label: 'Total Exams', value: stats.total, icon: BookOpen, cls: styles.statBlue },
          { label: 'Live Active', value: stats.live, icon: Play, cls: styles.statGreen },
          { label: 'Scheduled', value: stats.scheduled, icon: BarChart3, cls: styles.statOrange },
          { label: 'Drafts', value: stats.draft, icon: Users, cls: styles.statBlue },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className={`${styles.statCard} ${cls}`}>
            <Icon size={22} />
            <div className={styles.statValue}>{value}</div>
            <div className={styles.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Exam list */}
      <section className={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className={styles.sectionTitle}>Your Examinations</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={loadExams}
            disabled={loading}
            title="Refresh examination list"
          >
            <RefreshCw size={14} className={loading ? 'spinner' : ''} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        ) : exams.length === 0 ? (
          <div className={styles.emptyState}>
            <BookOpen size={40} />
            <h3>No examinations yet</h3>
            <p>Create your first exam and publish it to students.</p>
            <button className="btn btn-primary" onClick={() => navigate('/professor/exams/new')}>
              Create Exam
            </button>
          </div>
        ) : (
          <div className={styles.examList}>
            {exams.map((exam) => (
              <ExamCard
                key={exam.exam_id}
                exam={exam}
                onMonitor={(id) => navigate(`/professor/exams/${id}/monitor`)}
                onEdit={(id) => navigate(`/professor/exams/${id}/edit`)}
                onGoLive={handleGoLive}
                onEndExam={handleEndExam}
                onOpenRestart={(e) => {
                  setRestartModalExam(e);
                  setRestartDurationMin(Math.floor(e.duration_seconds / 60) || 60);
                }}
                onOpenDelete={(e) => {
                  setDeleteModalExam(e);
                  setDeleteTypedText('');
                }}
                onOpenExport={(e) => setExportModalExam(e)}
                onOpenSubmissions={handleOpenSubmissions}
              />
            ))}
          </div>
        )}
      </section>

      {/* MODAL: Safe Typed Delete Confirmation */}
      {deleteModalExam && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>
              <Trash2 size={20} style={{ color: 'var(--color-red)' }} />
              Permanent Examination Deletion
            </div>
            <p className={styles.modalSubtitle}>
              Target: <strong>{deleteModalExam.title}</strong> (Code: {deleteModalExam.exam_code || '—'})
            </p>

            <div className={styles.dangerAlert}>
              <AlertTriangle size={18} />
              <div>
                <strong>Warning:</strong> This permanently deletes all associated questions,
                student attempts, answers, proctoring events, and snapshot files. A security audit record of this deletion will be preserved.
              </div>
            </div>

            <div className={styles.modalBody}>
              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                To confirm permanent deletion, type <strong style={{ color: 'var(--color-red)' }}>delete</strong> below:
              </label>
              <input
                type="text"
                className={styles.typedInput}
                value={deleteTypedText}
                onChange={(e) => setDeleteTypedText(e.target.value)}
                placeholder="type 'delete' to enable confirmation"
                autoFocus
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteModalExam(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{
                  background: deleteTypedText === 'delete' ? 'var(--color-red)' : undefined,
                  borderColor: deleteTypedText === 'delete' ? 'var(--color-red)' : undefined,
                }}
                disabled={deleteTypedText !== 'delete' || deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Restart Examination Session */}
      {restartModalExam && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>
              <RotateCcw size={20} style={{ color: 'var(--color-blue)' }} />
              Restart Examination Session
            </div>
            <p className={styles.modalSubtitle}>
              Exam: <strong>{restartModalExam.title}</strong>
            </p>

            <div className={styles.modalBody}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Restarting transitions the examination back into an active/live state. Previous submissions remain intact.
                Students with unsubmitted attempts can continue. You can configure a new session duration below.
              </p>
              <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                Session Duration (Minutes):
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                className={styles.typedInput}
                value={restartDurationMin}
                onChange={(e) => setRestartDurationMin(parseInt(e.target.value, 10) || 0)}
              />
            </div>

            <div className={styles.modalFooter}>
              <button
                className="btn btn-ghost"
                onClick={() => setRestartModalExam(null)}
                disabled={restarting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleConfirmRestart}
                disabled={restarting || restartDurationMin <= 0}
              >
                {restarting ? 'Restarting…' : 'Confirm & Go Live'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Download Results (PDF or Excel) */}
      {exportModalExam && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalTitle}>
              <Download size={20} style={{ color: 'var(--color-blue)' }} />
              Export Examination Results
            </div>
            <p className={styles.modalSubtitle}>
              Exam: <strong>{exportModalExam.title}</strong> (Code: {exportModalExam.exam_code || '—'})
            </p>

            <div className={styles.modalBody}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Select official export format with full marks breakdown, student USNs, and attempt counts:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => setExportFormat('pdf')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-4)',
                    background: exportFormat === 'pdf' ? 'var(--color-blue-light)' : 'var(--color-surface)',
                    border: exportFormat === 'pdf' ? '2px solid var(--color-blue)' : 'var(--border-thin)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <FileText size={28} style={{ color: 'var(--color-blue)' }} />
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-heading)' }}>
                    Official PDF Report
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Print-ready A4 table
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('excel')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-4)',
                    background: exportFormat === 'excel' ? 'var(--color-blue-light)' : 'var(--color-surface)',
                    border: exportFormat === 'excel' ? '2px solid var(--color-blue)' : 'var(--border-thin)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <FileSpreadsheet size={28} style={{ color: 'var(--color-green)' }} />
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-heading)' }}>
                    Excel (.xlsx)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Structured spreadsheet
                  </span>
                </button>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className="btn btn-ghost"
                onClick={() => setExportModalExam(null)}
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDownloadResults}
                disabled={exporting}
              >
                {exporting ? 'Generating…' : `Download ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Submissions & Manual Evaluation List */}
      {submissionsModalExam && (
        <div className={styles.modalBackdrop}>
          <div className={`${styles.modalContent} ${styles.modalWide}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className={styles.modalTitle}>
                  <Award size={20} style={{ color: 'var(--color-blue)' }} />
                  Student Submissions & Evaluation
                </div>
                <p className={styles.modalSubtitle}>
                  Exam: <strong>{submissionsModalExam.title}</strong> (Code: {submissionsModalExam.exam_code || '—'})
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSubmissionsModalExam(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {loadingSubmissions ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                  <div className="spinner" />
                </div>
              ) : submissionsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                  No student submissions recorded for this examination yet.
                </div>
              ) : (
                <div className={styles.submissionsTableWrapper}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>No.</th>
                        <th>Student Name</th>
                        <th>USN</th>
                        <th>Attempt #</th>
                        <th>Marks</th>
                        <th>Grading</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissionsList.map((sub) => (
                        <tr key={sub.attempt_id}>
                          <td>{sub.no}</td>
                          <td style={{ fontWeight: 600 }}>{sub.student_name}</td>
                          <td style={{ fontFamily: 'monospace' }}>{sub.usn}</td>
                          <td>Attempt #{sub.attempt_number}</td>
                          <td style={{ fontWeight: 700, color: 'var(--color-blue-deep)' }}>
                            {sub.marks_obtained} / {sub.max_marks}
                          </td>
                          <td>
                            <span className={`badge ${sub.grading_status === 'graded' ? 'badge-green' : sub.grading_status === 'partially_graded' ? 'badge-yellow' : 'badge-orange'}`}>
                              {sub.grading_status?.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-blue">
                              {sub.status?.toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setSubmissionsModalExam(null);
                                  navigate(`/professor/attempts/${sub.attempt_id}/review`);
                                }}
                                title="Review answers and proctoring report"
                              >
                                <FileText size={13} />
                                <span>Review & Grade</span>
                              </button>
                              <button
                                className="btn btn-sm btn-green"
                                disabled={grantingRetakeId === sub.attempt_id}
                                onClick={() => handleGrantRetake(sub.attempt_id, sub.student_name)}
                                title="Authorize a retake attempt for this student"
                              >
                                <RotateCcw size={13} />
                                <span>{grantingRetakeId === sub.attempt_id ? 'Granting…' : 'Grant Retake'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button
                className="btn btn-primary"
                onClick={() => setSubmissionsModalExam(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
