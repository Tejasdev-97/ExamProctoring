/** Step 3: Proctoring Config */
import { useState } from 'react';
import api from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

export default function ProctoringStep({ exam, onSaved, onBack }) {
  const toast = useToast();
  const cfg = exam?.proctoring_config || {};
  const [form, setForm] = useState({
    face_absence_grace_ms:       cfg.face_absence_grace_ms       ?? 5000,
    multiple_faces_grace_ms:     cfg.multiple_faces_grace_ms     ?? 2000,
    sustained_head_turn_ms:      cfg.sustained_head_turn_ms      ?? 3000,
    phone_detection_threshold:   cfg.phone_detection_threshold   ?? 0.65,
    phone_confirm_ms:            cfg.phone_confirm_ms            ?? 1000,
    head_turn_yaw_threshold:     cfg.head_turn_yaw_threshold     ?? 30,
    head_turn_pitch_threshold:   cfg.head_turn_pitch_threshold   ?? 30,
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const sliders = [
    { key: 'face_absence_grace_ms',     label: 'Face absence grace period (ms)', min: 1000, max: 15000, step: 500 },
    { key: 'multiple_faces_grace_ms',   label: 'Multiple faces grace period (ms)', min: 500, max: 10000, step: 500 },
    { key: 'sustained_head_turn_ms',    label: 'Sustained head turn threshold (ms)', min: 1000, max: 10000, step: 500 },
    { key: 'phone_confirm_ms',          label: 'Phone confirmation duration (ms)', min: 200, max: 5000, step: 100 },
    { key: 'head_turn_yaw_threshold',   label: 'Head turn yaw threshold (°)', min: 10, max: 60, step: 5 },
    { key: 'head_turn_pitch_threshold', label: 'Head turn pitch threshold (°)', min: 10, max: 60, step: 5 },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/exams/${exam.exam_id}`, { proctoring_config: form });
      onSaved(data.data);
    } catch {
      toast('Failed to save proctoring config.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
        Proctoring Configuration
      </h2>

      <div className="alert alert-info">
        These thresholds control when the system creates a monitoring event.
        Lower grace periods increase sensitivity. Higher thresholds reduce false alarms.
        All events are reviewed by a human before any determination is made.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {sliders.map(({ key, label, min, max, step }) => (
          <div key={key} className="form-group">
            <label className="form-label">
              {label}: <strong>{form[key]}</strong>
            </label>
            <input type="range" min={min} max={max} step={step} value={form[key]}
              onChange={(e) => set(key, Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-blue)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              <span>{min}</span><span>{max}</span>
            </div>
          </div>
        ))}
        <div className="form-group">
          <label className="form-label">
            Phone detection confidence threshold: <strong>{form.phone_detection_threshold}</strong>
          </label>
          <input type="range" min={0.3} max={0.95} step={0.05}
            value={form.phone_detection_threshold}
            onChange={(e) => set('phone_detection_threshold', Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-blue)' }} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button id="btn-save-proctoring" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save & Continue →'}
        </button>
      </div>
    </div>
  );
}
