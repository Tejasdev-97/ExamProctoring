/**
 * ExamProctor.ai — EvidenceModal
 * Enlarged modal for reviewing suspicious-activity snapshot evidence.
 * Autonomously retrieves binary JPEG bytes when opened from timeline metadata,
 * verifies SHA-256 cryptographic digest, preserves responsive layout,
 * and organizes forensic details in a clean disclosure section.
 */

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Clock, Copy, Check, ShieldCheck, RefreshCw, ChevronDown } from 'lucide-react';
import api from '../../services/api';

async function computeBlobSha256(blob) {
  const buf = await blob.arrayBuffer();
  const digestBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digestBuf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function EvidenceModal({ evidence, onClose }) {
  const [copied, setCopied] = useState(false);
  const [blobUrl, setBlobUrl] = useState(evidence?.blobUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [integrity, setIntegrity] = useState(evidence?.integrity || 'unverified');
  const [calculatedHash, setCalculatedHash] = useState(evidence?.calculatedHash || null);
  const [retryCounter, setRetryCounter] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    if (!evidence) return undefined;

    // If caller already provided a pre-fetched blobUrl (e.g. from gallery thumbnail), reuse it directly
    if (evidence.blobUrl) {
      setBlobUrl(evidence.blobUrl);
      setIntegrity(evidence.integrity || 'unverified');
      setCalculatedHash(evidence.calculatedHash || null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    // Check if the snapshot has completed server upload
    if (evidence.storage_status !== 'uploaded') {
      setIntegrity('pending');
      setBlobUrl(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    // Snapshot is uploaded but blobUrl was not pre-fetched (e.g. opened from timeline table)
    setLoading(true);
    setError(null);

    api.get(`/snapshots/${evidence.snapshot_id}/image`, { responseType: 'blob' })
      .then(async (res) => {
        if (!active) return;
        const blob = res.data;
        const hash = await computeBlobSha256(blob);
        if (!active) return;
        setCalculatedHash(hash);

        if (evidence.sha256) {
          if (hash.toLowerCase() === evidence.sha256.toLowerCase()) {
            setIntegrity('verified');
          } else {
            setIntegrity('mismatch');
          }
        } else {
          setIntegrity('unverified');
        }

        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoading(false);
        const status = err.response?.status;
        if (status === 404) {
          setError('Evidence image is not stored on the server.');
          setIntegrity('unavailable');
        } else if (status === 403) {
          setError('You are not authorized to view evidence for this attempt.');
          setIntegrity('unavailable');
        } else {
          setError(err.response?.data?.message || 'Failed to retrieve snapshot image.');
          setIntegrity('unavailable');
        }
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [evidence, retryCounter]);

  if (!evidence) return null;

  const handleCopyHash = () => {
    const hashToCopy = evidence.sha256 || calculatedHash;
    if (hashToCopy) {
      navigator.clipboard.writeText(hashToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fmtFull = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const displayHash = calculatedHash || evidence.sha256 || null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(16, 32, 74, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          border: 'var(--border-thin)',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: 'var(--border-thin)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-surface-alt)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h3
                id="evidence-modal-title"
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 800,
                  color: 'var(--color-text-heading)',
                  textTransform: 'capitalize',
                }}
              >
                Evidence Review: {evidence.capture_reason ? evidence.capture_reason.replace(/_/g, ' ') : 'Proctoring Event'}
              </h3>
              <span className={`badge ${
                integrity === 'verified' ? 'badge-green' :
                integrity === 'mismatch' ? 'badge-red' :
                integrity === 'pending' ? 'badge-yellow' : 'badge-blue'
              }`}>
                {integrity === 'verified' ? 'SHA-256 Verified' :
                 integrity === 'mismatch' ? 'Checksum Mismatch' :
                 integrity === 'pending' ? 'Pending Sync' :
                 integrity === 'unavailable' ? 'Unavailable' : 'Evidence Snapshot'}
              </span>
            </div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2, display: 'inline-block' }}>
              Snapshot ID: <code style={{ fontFamily: 'monospace' }}>{evidence.snapshot_id}</code>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="btn btn-secondary btn-sm"
            style={{ padding: '6px', borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {/* Main Image Frame */}
          <div
            style={{
              width: '100%',
              minHeight: '260px',
              maxHeight: 'min(560px, 60vh)',
              background: '#0a0f1d',
              borderRadius: 'var(--radius-md)',
              border: integrity === 'mismatch' ? '2px solid var(--color-red)' : '1px solid rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', color: '#94a3b8' }}>
                <span className="spinner spinner-lg" />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Loading evidence image & verifying SHA-256…</span>
              </div>
            ) : blobUrl ? (
              <img
                src={blobUrl}
                alt={evidence.capture_reason || 'Evidence'}
                style={{
                  maxWidth: '100%',
                  maxHeight: 'min(560px, 60vh)',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto',
                }}
              />
            ) : error ? (
              <div style={{ padding: 'var(--space-6)', color: 'var(--color-red)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                <AlertTriangle size={36} />
                <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRetryCounter((c) => c + 1)}
                  style={{ marginTop: 'var(--space-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <RefreshCw size={13} /> Retry Retrieval
                </button>
              </div>
            ) : evidence.storage_status === 'pending' || integrity === 'pending' ? (
              <div style={{ padding: 'var(--space-8)', color: '#94a3b8', textAlign: 'center' }}>
                <Clock size={36} style={{ margin: '0 auto var(--space-2)' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>Snapshot captured locally on student device.</p>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-xs)' }}>Pending background synchronization to server.</p>
              </div>
            ) : (
              <div style={{ padding: 'var(--space-8)', color: '#94a3b8', textAlign: 'center' }}>
                <AlertTriangle size={36} style={{ margin: '0 auto var(--space-2)' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>Snapshot image unavailable.</p>
              </div>
            )}
          </div>

          {/* Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              background: 'var(--color-surface-alt)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'var(--border-thin)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <div>
              <strong style={{ color: 'var(--color-text-heading)', display: 'block' }}>Captured At (Client Time)</strong>
              <span>{fmtFull(evidence.client_captured_at)}</span>
            </div>
            <div>
              <strong style={{ color: 'var(--color-text-heading)', display: 'block' }}>Storage Status</strong>
              <span className={`badge ${evidence.storage_status === 'uploaded' ? 'badge-green' : 'badge-yellow'}`}>
                {evidence.storage_status}
              </span>
            </div>
            {evidence.size_bytes && (
              <div>
                <strong style={{ color: 'var(--color-text-heading)', display: 'block' }}>Image Size</strong>
                <span>{(evidence.size_bytes / 1024).toFixed(1)} KB</span>
              </div>
            )}
            {evidence.event_id && (
              <div>
                <strong style={{ color: 'var(--color-text-heading)', display: 'block' }}>Linked Event ID</strong>
                <code style={{ fontSize: '11px' }}>{evidence.event_id.slice(0, 13)}…</code>
              </div>
            )}
          </div>

          {/* Collapsible Forensic Details Section */}
          <details
            style={{
              background: integrity === 'verified'
                ? 'var(--color-green-light)'
                : integrity === 'mismatch'
                ? 'var(--color-red-light)'
                : 'var(--color-surface-alt)',
              border: `1px solid ${
                integrity === 'verified' ? 'var(--color-green)' :
                integrity === 'mismatch' ? 'var(--color-red)' : 'var(--border-base)'
              }`,
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontWeight: 700,
                fontSize: 'var(--font-size-sm)',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {integrity === 'verified' ? (
                  <>
                    <ShieldCheck size={18} style={{ color: 'var(--color-green)' }} />
                    <span style={{ color: 'var(--color-green)' }}>Cryptographic Integrity: Verified SHA-256 Match</span>
                  </>
                ) : integrity === 'mismatch' ? (
                  <>
                    <AlertTriangle size={18} style={{ color: 'var(--color-red)' }} />
                    <span style={{ color: 'var(--color-red)' }}>Integrity Alert: Checksum Mismatch</span>
                  </>
                ) : (
                  <>
                    <Clock size={18} style={{ color: 'var(--color-text-secondary)' }} />
                    <span style={{ color: 'var(--color-text-secondary)' }}>Forensic Cryptographic Details</span>
                  </>
                )}
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View Hash <ChevronDown size={14} />
              </span>
            </summary>

            <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  Registered / Calculated SHA-256 Digest:
                </span>
                {displayHash && (
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '11px' }}
                  >
                    {copied ? <Check size={12} style={{ color: 'var(--color-green)' }} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy Hash'}
                  </button>
                )}
              </div>

              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  wordBreak: 'break-all',
                  background: 'rgba(255, 255, 255, 0.85)',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  color: 'var(--color-text-heading)',
                }}
              >
                {displayHash || 'Hash not available'}
              </div>

              {calculatedHash && evidence.sha256 && calculatedHash.toLowerCase() !== evidence.sha256.toLowerCase() && (
                <div style={{ fontSize: '11px', color: 'var(--color-red)', fontWeight: 600 }}>
                  Warning: Downloaded file hash ({calculatedHash.slice(0, 16)}…) does not match server registered hash ({evidence.sha256.slice(0, 16)}…).
                </div>
              )}
            </div>
          </details>

          {/* Neutral Legal/Proctoring Disclaimer */}
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.45,
              background: 'var(--color-surface)',
              borderLeft: '3px solid var(--color-blue)',
              padding: '6px 10px',
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            }}
          >
            <strong>Evidence Guidance:</strong> Automated detections represent observable camera conditions and require human review. A verified SHA-256 digest confirms that the downloaded bytes match the snapshot recorded at capture time. It does not determine student intent or independently prove misconduct.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: 'var(--border-thin)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--color-surface-alt)',
          }}
        >
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

