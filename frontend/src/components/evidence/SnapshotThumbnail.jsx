/**
 * ExamProctor.ai — SnapshotThumbnail
 * Authenticated evidence snapshot display with client-side SHA-256 integrity verification.
 * Fetches binary JPEG bytes via authenticated API, calculates SHA-256 digest,
 * compares against server registered hash, and renders image with state badges.
 */

import { useState, useEffect } from 'react';
import { Camera, CheckCircle, AlertTriangle, AlertCircle, Clock, Maximize2 } from 'lucide-react';
import api from '../../services/api';

async function computeBlobSha256(blob) {
  const buf = await blob.arrayBuffer();
  const digestBuf = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(digestBuf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function SnapshotThumbnail({
  snapshot,
  onOpenViewer,
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [integrity, setIntegrity] = useState('unverified'); // 'verified' | 'mismatch' | 'unverified' | 'pending' | 'unavailable'
  const [calculatedHash, setCalculatedHash] = useState(null);

  useEffect(() => {
    let active = true;
    let createdUrl = null;

    if (!snapshot) return undefined;

    if (snapshot.storage_status !== 'uploaded') {
      setIntegrity('pending');
      setBlobUrl(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    api.get(`/snapshots/${snapshot.snapshot_id}/image`, { responseType: 'blob' })
      .then(async (res) => {
        if (!active) return;
        const blob = res.data;
        const hash = await computeBlobSha256(blob);
        if (!active) return;
        setCalculatedHash(hash);

        if (snapshot.sha256) {
          if (hash.toLowerCase() === snapshot.sha256.toLowerCase()) {
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
          setError('Image not stored on server');
          setIntegrity('unavailable');
        } else if (status === 403) {
          setError('Access not authorized');
          setIntegrity('unavailable');
        } else {
          setError(err.response?.data?.message || 'Failed to load image');
          setIntegrity('unavailable');
        }
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [snapshot]);

  const handleOpen = () => {
    if (onOpenViewer) {
      onOpenViewer({
        ...snapshot,
        blobUrl,
        integrity,
        calculatedHash,
      });
    }
  };

  const fmtCaptureTime = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: integrity === 'mismatch' ? '2px solid var(--color-red)' : 'var(--border-thin)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Thumbnail Frame */}
      <div
        style={{
          width: '100%',
          aspectRatio: '4/3',
          background: 'var(--color-surface-alt)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span className="spinner" style={{ width: 22, height: 22 }} />
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Loading evidence…</span>
          </div>
        ) : blobUrl ? (
          <img
            src={blobUrl}
            alt={snapshot.capture_reason || 'Evidence snapshot'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              cursor: 'pointer',
            }}
            onClick={handleOpen}
          />
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-2)',
              color: 'var(--color-text-secondary)',
              fontSize: '11px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {integrity === 'pending' ? (
              <>
                <Clock size={20} style={{ color: 'var(--color-orange)' }} />
                <span>Sync pending</span>
              </>
            ) : (
              <>
                <Camera size={20} style={{ color: 'var(--color-text-secondary)' }} />
                <span>{error || 'Image unavailable'}</span>
              </>
            )}
          </div>
        )}

        {blobUrl && (
          <button
            type="button"
            onClick={handleOpen}
            title="Enlarge snapshot"
            aria-label="Enlarge snapshot"
            style={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              background: 'rgba(16, 32, 74, 0.85)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>

      {/* Capture Reason & Time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-heading)' }}>
          {snapshot.capture_reason?.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>
          {fmtCaptureTime(snapshot.client_captured_at)}
        </span>
      </div>

      {/* Integrity & Status Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <span className={`badge ${snapshot.storage_status === 'uploaded' ? 'badge-green' : snapshot.storage_status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
          {snapshot.storage_status}
        </span>

        {integrity === 'verified' && (
          <span
            className="badge badge-green"
            title={`SHA-256 verified: ${snapshot.sha256?.slice(0, 12)}…`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <CheckCircle size={10} /> SHA-256 Verified
          </span>
        )}

        {integrity === 'mismatch' && (
          <span
            className="badge badge-red"
            title="Cryptographic checksum mismatch! Local image bytes do not match registered hash."
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <AlertTriangle size={10} /> Checksum Mismatch
          </span>
        )}

        {integrity === 'pending' && (
          <span
            className="badge badge-yellow"
            title="Snapshot is stored locally and waiting for server sync"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            <Clock size={10} /> Sync Pending
          </span>
        )}
      </div>
    </div>
  );
}
