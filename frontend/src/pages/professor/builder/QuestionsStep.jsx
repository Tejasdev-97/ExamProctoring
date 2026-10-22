/**
 * Step 2: Questions — add questions manually or import from Excel.
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Upload, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

function QuestionRow({ q, index, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-4)', background: 'var(--color-surface)', border: 'var(--border-thin)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
      <span style={{ minWidth: 28, height: 28, background: 'var(--color-text-heading)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-xs)', fontWeight: 700, flexShrink: 0 }}>{index + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 'var(--space-1)' }}>{q.question_text}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'flex', gap: 'var(--space-3)' }}>
          <span className={`badge ${q.question_type === 'mcq' ? 'badge-blue' : 'badge-orange'}`}>{q.question_type}</span>
          <span>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <button className="btn btn-danger btn-sm" onClick={() => onDelete(q.question_id)} aria-label="Delete question"
        id={`btn-del-q-${q.question_id?.slice(0, 8)}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function QuestionsStep({ exam, onNext, onBack }) {
  const toast   = useToast();
  const fileRef = useRef(null);

  const [questions, setQuestions]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting]     = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const [form, setForm] = useState({ question_type: 'mcq', question_text: '', marks: 1, options: { A: '', B: '', C: '', D: '' }, correct_option: 'A' });

  useEffect(() => {
    api.get(`/exams/${exam.exam_id}/questions`)
      .then(({ data }) => setQuestions(data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [exam.exam_id]);

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        question_number: questions.length + 1,
        question_type: form.question_type,
        question_text: form.question_text,
        marks: form.marks,
        ...(form.question_type === 'mcq' && {
          options: form.options,
          answer_key: { correct_option: form.correct_option },
        }),
      };
      const { data } = await api.post(`/exams/${exam.exam_id}/questions`, payload);
      setQuestions((prev) => [...prev, data.data]);
      setShowForm(false);
      setForm({ question_type: 'mcq', question_text: '', marks: 1, options: { A: '', B: '', C: '', D: '' }, correct_option: 'A' });
      toast('Question added.', 'success');
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Failed to add question.', 'error');
    }
  };

  const handleDelete = async (qId) => {
    try {
      await api.delete(`/exams/${exam.exam_id}/questions/${qId}`);
      setQuestions((prev) => prev.filter((q) => q.question_id !== qId));
    } catch { toast('Could not delete question.', 'error'); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/exams/${exam.exam_id}/questions/import-preview`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportPreview(data.data);
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Import failed.', 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    try {
      await api.post(`/exams/${exam.exam_id}/questions/import-confirm?import_id=${importPreview.import_id}`);
      toast(`Imported ${importPreview.valid_question_count} questions.`, 'success');
      const { data } = await api.get(`/exams/${exam.exam_id}/questions`);
      setQuestions(data.data || []);
      setImportPreview(null);
    } catch { toast('Confirm import failed.', 'error'); }
  };

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await api.get(`/exams/${exam.exam_id}/questions/template`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'questions_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Template download failed.', 'error');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
          Questions ({questions.length})
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={downloadTemplate}
            disabled={downloadingTemplate}
            id="btn-download-template"
          >
            <Download size={14} /> {downloadingTemplate ? 'Downloading…' : 'Template'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={importing} id="btn-import-excel">
            <Upload size={14} /> {importing ? 'Importing…' : 'Import Excel'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm((v) => !v)} id="btn-add-question">
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>

      {/* Import preview */}
      {importPreview && (
        <div style={{ background: 'var(--color-blue-panel)', border: 'var(--border-base)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <strong>Import Preview: {importPreview.valid_question_count} valid / {importPreview.invalid_row_count} invalid</strong>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setImportPreview(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirmImport} id="btn-confirm-import">
                <CheckCircle size={14} /> Confirm Import
              </button>
            </div>
          </div>
          {importPreview.errors.length > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: 'var(--space-3)' }}>
              <AlertTriangle size={14} />
              <span>{importPreview.invalid_row_count} row(s) have errors and will be skipped.</span>
            </div>
          )}
        </div>
      )}

      {/* Add question form */}
      {showForm && (
        <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', background: 'var(--color-blue-panel)', border: 'var(--border-base)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Question Type</label>
              <select className="form-select" value={form.question_type} onChange={(e) => setForm((f) => ({ ...f, question_type: e.target.value }))}>
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="short_answer">Short Answer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Marks</label>
              <input type="number" className="form-input" value={form.marks} min={0.5} step={0.5}
                onChange={(e) => setForm((f) => ({ ...f, marks: parseFloat(e.target.value) }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Question Text *</label>
            <textarea className="form-textarea" value={form.question_text} required rows={3}
              onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
              placeholder="Enter question text…" />
          </div>

          {form.question_type === 'mcq' && (
            <>
              {['A', 'B', 'C', 'D'].map((k) => (
                <div key={k} className="form-group">
                  <label className="form-label">Option {k}</label>
                  <input className="form-input" value={form.options[k]}
                    onChange={(e) => setForm((f) => ({ ...f, options: { ...f.options, [k]: e.target.value } }))}
                    placeholder={`Option ${k}`} required={k === 'A' || k === 'B'} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Correct Answer</label>
                <select className="form-select" value={form.correct_option}
                  onChange={(e) => setForm((f) => ({ ...f, correct_option: e.target.value }))}>
                  {['A', 'B', 'C', 'D'].map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" id="btn-save-question">Save Question</button>
          </div>
        </form>
      )}

      {/* Question list */}
      <div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
            No questions yet. Add them manually or import from Excel.
          </div>
        ) : (
          questions.map((q, i) => (
            <QuestionRow key={q.question_id} q={q} index={i} onDelete={handleDelete} />
          ))
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 'var(--space-4)', borderTop: 'var(--border-thin)' }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button id="btn-questions-next" className="btn btn-primary" onClick={onNext}
          disabled={questions.length === 0}>
          Continue → ({questions.length} question{questions.length !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}
