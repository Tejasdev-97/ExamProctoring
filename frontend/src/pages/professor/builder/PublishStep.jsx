/** Step 4: Publish */
import { useState } from 'react';
import { CheckCircle, AlertTriangle, Copy } from 'lucide-react';
import api from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

export default function PublishStep({ exam, onPublished, onBack }) {
  const toast   = useToast();
  const [loading, setLoading] = useState(false);

  const handlePublish = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/exams/${exam.exam_id}/publish`);
      onPublished(data.data);
    } catch (err) {
      toast(err?.response?.data?.error?.message || 'Could not publish exam.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (exam.exam_code) {
      navigator.clipboard.writeText(exam.exam_code);
      toast('Exam code copied!', 'success');
    }
  };

  if (exam.status === 'published') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-6)', textAlign: 'center' }}>
        <CheckCircle size={56} style={{ color: 'var(--color-green)' }} />
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-text-heading)' }}>
          Examination Published!
        </h2>
        <div style={{ background: 'var(--color-blue-light)', border: 'var(--border-thick)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-8) var(--space-10)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-secondary)' }}>Exam Code</div>
          <div style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--color-blue-deep)', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}>
            {exam.exam_code}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={copyCode} id="btn-copy-code">
            <Copy size={14} /> Copy code
          </button>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)' }}>
          Share this 6-digit code with your students. They will enter it on the exam entry page.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-heading)' }}>
        Publish Examination
      </h2>

      <div className="alert alert-warning">
        <AlertTriangle size={16} />
        <span>
          Once published, the exam will be accessible to students via a 6-digit code.
          Question content cannot be changed after publishing without creating a new package version.
        </span>
      </div>

      <div className="card-sm">
        {[
          ['Title',    exam.title],
          ['Duration', `${Math.floor((exam.duration_seconds || 0) / 60)} minutes`],
          ['Status',   exam.status],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-border-light)' }}>
            <span style={{ fontWeight: 700, minWidth: 80, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{label}</span>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back</button>
        <button id="btn-publish-exam" className="btn btn-orange" onClick={handlePublish} disabled={loading}>
          {loading ? 'Publishing…' : 'Publish Exam →'}
        </button>
      </div>
    </div>
  );
}
