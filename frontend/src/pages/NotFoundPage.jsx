/**
 * ExamProctor.ai — 404 Not Found Page
 */

import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-page-bg)',
      padding: 'var(--space-8)',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: 'var(--border-thick)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-12) var(--space-16)',
        maxWidth: 500,
        textAlign: 'center',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-5)',
      }}>
        <div style={{
          fontSize: '6rem',
          fontWeight: 800,
          color: 'var(--color-blue)',
          lineHeight: 1,
          letterSpacing: '-0.05em',
        }}>
          404
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-text-heading)', fontWeight: 700 }}>
          Page not found
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', fontWeight: 500 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)} id="btn-go-back">
            <ArrowLeft size={16} /> Go back
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/')} id="btn-go-home">
            <Home size={16} /> Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
