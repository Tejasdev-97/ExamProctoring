/** Step 1: Exam Details */
import { useState } from 'react';
import api from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

export default function ExamDetailsStep({ exam, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title:       exam?.title       || '',
    description: exam?.description || '',
    instructions:exam?.instructions|| '',
    duration_seconds: exam?.duration_seconds || 1800,
    allow_offline_continuation: exam?.allow_offline_continuation ?? true,
    allow_question_navigation:  exam?.allow_question_navigation  ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required.';
    if (form.duration_seconds < 60) e.duration = 'Duration must be at least 1 minute.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      let saved;
      if (exam?.exam_id) {
        const { data } = await api.patch(`/exams/${exam.exam_id}`, payload);
        saved = data.data;
      } else {
        const { data } = await api.post('/exams', payload);
        saved = data.data;
      }
      onSaved(saved);
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Failed to save exam.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
        Examination Details
      </h2>

      <div className="form-group">
        <label className="form-label" htmlFor="exam-title">Exam Title *</label>
        <input id="exam-title" className={`form-input ${errors.title ? 'error' : ''}`}
          value={form.title} onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Computer Networks Internal Assessment" />
        {errors.title && <p className="form-error">{errors.title}</p>}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="exam-desc">Description</label>
        <input id="exam-desc" className="form-input" value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Brief description (optional)" />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="exam-instr">Instructions for students</label>
        <textarea id="exam-instr" className="form-textarea" value={form.instructions}
          onChange={(e) => set('instructions', e.target.value)}
          placeholder="Read all questions carefully before answering." rows={4} />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="exam-duration">Duration (minutes) *</label>
        <input id="exam-duration" type="number" className={`form-input ${errors.duration ? 'error' : ''}`}
          value={Math.floor(form.duration_seconds / 60)}
          onChange={(e) => set('duration_seconds', parseInt(e.target.value || '0', 10) * 60)}
          min={1} max={360} />
        {errors.duration && <p className="form-error">{errors.duration}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {[
          { key: 'allow_offline_continuation', label: 'Allow offline continuation', hint: 'Students can continue if internet drops.' },
          { key: 'allow_question_navigation',  label: 'Allow question navigation',  hint: 'Students can move between questions freely.' },
        ].map(({ key, label, hint }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer', padding: 'var(--space-3)', background: 'var(--color-blue-panel)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
            <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)}
              id={`chk-${key}`} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{label}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>{hint}</div>
            </div>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button id="btn-save-details" type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : 'Save & Continue →'}
        </button>
      </div>
    </form>
  );
}
