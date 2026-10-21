/**
 * ExamProctor.ai — System Settings Page (Admin)
 */

import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

const SETTING_LABELS = {
  face_absence_grace_ms:       { label: 'Face Absence Grace Period (ms)', type: 'number', min: 500, max: 15000, step: 500, default: 5000 },
  multiple_faces_grace_ms:     { label: 'Multiple Faces Grace Period (ms)', type: 'number', min: 500, max: 10000, step: 500, default: 2000 },
  sustained_head_turn_ms:      { label: 'Sustained Head Turn Threshold (ms)', type: 'number', min: 1000, max: 10000, step: 500, default: 3000 },
  phone_detection_threshold:   { label: 'Phone Detection Confidence Threshold', type: 'number', min: 0.3, max: 0.95, step: 0.05, default: 0.65 },
  phone_confirm_ms:            { label: 'Phone Event Confirmation Duration (ms)', type: 'number', min: 200, max: 5000, step: 100, default: 1000 },
  head_turn_yaw_threshold:     { label: 'Head Turn Yaw Threshold (°)', type: 'number', min: 10, max: 60, step: 5, default: 30.0 },
  head_turn_pitch_threshold:   { label: 'Head Turn Pitch Threshold (°)', type: 'number', min: 10, max: 60, step: 5, default: 30.0 },
  live_sampling_interval_ms:   { label: 'Live Monitoring Frame Interval (ms)', type: 'number', min: 200, max: 2000, step: 50, default: 500 },
  video_sampling_interval_ms:  { label: 'Recorded Video Frame Interval (ms)', type: 'number', min: 50, max: 500, step: 25, default: 125 },
  max_snapshot_size_bytes:     { label: 'Max Snapshot Size (bytes)', type: 'number', min: 1024, max: 10485760, step: 102400, default: 5242880 },
  offline_continuation_default:{ label: 'Default Offline Continuation', type: 'boolean', default: true },
};

export default function SystemSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState({});

  const loadSettings = () => {
    setLoading(true);
    api.get('/settings')
      .then(({ data }) => {
        const map = {};
        (data.data || []).forEach((s) => { map[s.setting_key] = s; });
        setSettings(map);
      })
      .catch((err) => {
        console.error(err);
        toast('Failed to load system settings.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (key, value) => {
    const meta = SETTING_LABELS[key];
    const valToSend = (value === '' || value === undefined || (typeof value === 'number' && isNaN(value)))
      ? (meta?.default ?? meta?.min)
      : value;
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const { data } = await api.put(`/settings/${key}`, { setting_value: valToSend });
      setSettings((prev) => ({ ...prev, [key]: { ...data.data, _dirty: false } }));
      toast(`Setting "${key}" saved.`, 'success');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
      toast(`Failed to save "${key}": ${msg}`, 'error');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const updateLocal = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], setting_value: value, _dirty: true },
    }));
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner spinner-lg" /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, color: 'var(--color-text-heading)', letterSpacing: '-0.02em' }}>
          System Settings
        </h1>
        <button
          className="btn btn-secondary btn-sm"
          onClick={loadSettings}
          title="Reload settings from server"
          id="btn-refresh-settings"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="alert alert-info">
        Changes to proctoring thresholds apply to newly created exams that use the default config.
        Existing exams use their own stored proctoring configuration.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {Object.entries(SETTING_LABELS).map(([key, meta]) => {
          const setting = settings[key];
          const rawValue = setting?.setting_value;
          const value = (rawValue !== undefined && rawValue !== null) ? rawValue : meta.default;
          const isDirty = setting?._dirty;

          return (
            <div key={key} style={{ background: 'var(--color-surface)', border: 'var(--border-base)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-heading)' }}>{meta.label}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'monospace', color: 'var(--color-text-secondary)', marginTop: 2 }}>{key}</div>
                </div>
                {isDirty && (
                  <button
                    id={`btn-save-setting-${key}`}
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSave(key, value)}
                    disabled={saving[key]}
                  >
                    {saving[key] ? <><RefreshCw size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save</>}
                  </button>
                )}
              </div>

              {meta.type === 'boolean' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!value}
                    onChange={(e) => updateLocal(key, e.target.checked)}
                    id={`setting-${key}`}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', fontWeight: 500 }}>
                    {value ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <input
                    id={`setting-${key}`}
                    type="number"
                    className="form-input"
                    value={value !== '' && value !== undefined && !isNaN(value) ? value : meta.default}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value);
                      updateLocal(key, isNaN(num) ? '' : num);
                    }}
                    style={{ maxWidth: 180 }}
                  />
                  <div style={{ flex: 1 }}>
                    <input
                      type="range"
                      min={meta.min} max={meta.max} step={meta.step}
                      value={typeof value === 'number' && !isNaN(value) ? value : meta.default}
                      onChange={(e) => {
                        const num = parseFloat(e.target.value);
                        updateLocal(key, isNaN(num) ? meta.default : num);
                      }}
                      style={{ width: '100%', accentColor: 'var(--color-blue)' }}
                    />
                  </div>
                </div>
              )}

              {setting?.description && (
                <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  {setting.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
