/**
 * ExamProctor.ai — Recorded-Video Analysis Page
 * Allows professors to upload exam video recordings, perform browser-local CV inference
 * with frame sampling and video-relative timestamps, preview detected events and snapshots,
 * and download verified ReportLab PDF reports.
 */

import React, { useState, useRef, useEffect, useCallback, Component } from 'react';
import {
  Upload, Play, Pause, RotateCcw, AlertTriangle,
  Smartphone, Users, UserX, Download, Eye, CheckCircle2,
  Activity, ChevronDown, ChevronUp, RefreshCw, Check,
  Trash2, X
} from 'lucide-react';
import api from '../../services/api';
import { FrameDetectors } from '../../proctoring/frameDetectors';
import { CVEventEngine } from '../../proctoring/cvEventEngine';
import styles from './VideoAnalysisPage.module.css';

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB limit
const SAMPLE_INTERVAL_MS = 125; // ~8 FPS sampling

/**
 * Targeted Error Boundary to isolate rendering exceptions
 * so that a failure in one section (e.g. timeline or history) does not crash the entire page.
 */
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[SectionErrorBoundary: ${this.props.name || 'Component'}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorBoundaryFallback} role="alert">
          <div>
            <strong>Unable to render {this.props.name || 'this section'}:</strong>
            <span style={{ marginLeft: 6 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function formatMs(ms) {
  if (ms == null || isNaN(ms)) return '00:00:00.000';
  const totalSec = Math.max(0, ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

async function computeSha256(file) {
  const buffer = await file.arrayBuffer(); // Full source file SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function VideoAnalysisPage() {
  const [file, setFile] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Select a video file to begin analysis.');
  const [activeCondition, setActiveCondition] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [events, setEvents] = useState([]);
  const [snapshots, setSnapshots] = useState({}); // eventId -> base64 dataUrl
  const [pastSessions, setPastSessions] = useState([]);

  // Deletion Modal State
  const [deleteTargetSession, setDeleteTargetSession] = useState(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState(null);

  // Structured Diagnostics
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState({
    sampleCount: 0,
    videoTimestampMs: 0,
    frameDimensions: '0x0',
    inferenceExecuted: false,
    faceCount: null,
    hasLandmarks: false,
    yaw: null,
    pitch: null,
    phoneStatus: 'idle',
    phoneCandidates: [],
    candidateEvents: [],
    confirmedEventsCount: 0,
    lastError: null,
    skipReason: null,
  });

  const [activeCandidate, setActiveCandidate] = useState(null);
  const [systemConfig, setSystemConfig] = useState(null);
  const sessionConfigRef = useRef(null);
  const isInferringRef = useRef(false);
  const lastSampleTsRef = useRef(-1);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorsRef = useRef(null);
  const engineRef = useRef(null);
  const sampleTimerRef = useRef(null);
  const provisionalSnapRef = useRef({}); // evtId -> { snap, timestampMs, type }
  const eventsRef = useRef([]); // Ref for immediate synchronous access
  const snapshotsRef = useRef({});
  const sessionIdRef = useRef(null);
  const sampleCountRef = useRef(0);

  // Load past sessions and system settings on mount
  useEffect(() => {
    loadPastSessions();
    api.get('/settings')
      .then(({ data }) => {
        const map = {};
        (data.data || []).forEach((s) => { map[s.setting_key] = s.setting_value; });
        setSystemConfig(map);
      })
      .catch((err) => console.warn('[VideoAnalysis] Could not load system settings:', err.message));

    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (detectorsRef.current) detectorsRef.current.close();
      if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    };
  }, []);

  const loadPastSessions = async () => {
    try {
      const res = await api.get('/video-analysis/sessions');
      setPastSessions(res.data?.data || []);
    } catch (err) {
      console.warn('[VideoAnalysis] Failed to load past sessions:', err.message);
    }
  };

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setError(`File exceeds the maximum 500 MB limit (${(selected.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
    if (!validTypes.includes(selected.type) && !/\.(mp4|webm|mov|m4v)$/i.test(selected.name)) {
      setError('Please select a valid video file (.mp4, .webm, or .mov).');
      return;
    }

    // Clean up previous run
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);

    setError(null);
    setFile(selected);
    setEvents([]);
    eventsRef.current = [];
    setSnapshots({});
    snapshotsRef.current = {};
    setSessionId(null);
    sessionIdRef.current = null;
    setIsCompleted(false);
    setActiveCondition(null);
    setAnalyzing(false);
    sampleCountRef.current = 0;

    const url = URL.createObjectURL(selected);
    setVideoUrl(url);

    try {
      const sha = await computeSha256(selected);
      setFileMeta({
        name: selected.name,
        sizeMb: (selected.size / (1024 * 1024)).toFixed(2),
        type: selected.type || 'video/mp4',
        sha256: sha,
      });
      setStatusMessage('Video loaded. Click "Start Analysis" to initialize detector.');
    } catch (err) {
      setError('Failed to read file: ' + err.message);
    }
  };

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvasRef.current = canvas;
    }
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  const handleStartAnalysis = async () => {
    if (!file || !videoRef.current) return;
    setError(null);
    setStatusMessage('Loading MediaPipe vision models...');

    try {
      // Capture frozen effective configuration for this analysis session
      const effectivePhoneThreshold = (typeof systemConfig?.phone_detection_threshold === 'number')
        ? systemConfig.phone_detection_threshold
        : 0.65;
      const effectivePhoneConfirmMs = (typeof systemConfig?.phone_confirm_ms === 'number')
        ? systemConfig.phone_confirm_ms
        : 1000;
      const effectiveFaceAbsenceMs = (typeof systemConfig?.face_absence_grace_ms === 'number')
        ? systemConfig.face_absence_grace_ms
        : 3000;
      const effectiveMultiFaceMs = (typeof systemConfig?.multiple_faces_grace_ms === 'number')
        ? systemConfig.multiple_faces_grace_ms
        : 2000;
      const effectiveHeadTurnMs = (typeof systemConfig?.sustained_head_turn_ms === 'number')
        ? systemConfig.sustained_head_turn_ms
        : 3000;
      const effectiveSamplingInterval = (typeof systemConfig?.video_sampling_interval_ms === 'number')
        ? systemConfig.video_sampling_interval_ms
        : SAMPLE_INTERVAL_MS;

      sessionConfigRef.current = {
        phone_detection_threshold: effectivePhoneThreshold,
        phone_confirm_ms: effectivePhoneConfirmMs,
        face_absence_grace_ms: effectiveFaceAbsenceMs,
        multiple_faces_grace_ms: effectiveMultiFaceMs,
        sustained_head_turn_ms: effectiveHeadTurnMs,
        video_sampling_interval_ms: effectiveSamplingInterval,
      };

      if (!detectorsRef.current) {
        detectorsRef.current = new FrameDetectors({ phoneThreshold: effectivePhoneThreshold });
        await detectorsRef.current.load();
      } else {
        detectorsRef.current.reset();
        detectorsRef.current.setPhoneThreshold(effectivePhoneThreshold);
      }
      setModelsReady(true);

      // Create video analysis session on backend
      const durationMs = Math.round((videoRef.current.duration || 0) * 1000);
      const sessionRes = await api.post('/video-analysis/sessions', {
        source_filename: file.name,
        source_size_bytes: file.size,
        source_sha256: fileMeta.sha256,
        source_duration_ms: durationMs > 0 ? durationMs : null,
      });
      const newSessionId = sessionRes.data?.data?.video_analysis_session_id;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;

      // Initialize engine with video-relative monotonic and wall clock
      const videoClock = () => {
        const v = videoRef.current;
        const ms = v ? Math.round(v.currentTime * 1000) : 0;
        return { wall: ms, mono: ms };
      };

      engineRef.current = new CVEventEngine(
        sessionConfigRef.current,
        (event) => {
          // Normalize event fields (guard against inconsistent property naming)
          const evtType = event.event_type || event.type || 'unknown_event';
          const evtId = event.event_id || event.eventId || crypto.randomUUID();
          const evtDuration = event.duration_ms ?? event.durationMs ?? 0;
          const evtTs = event.video_timestamp_ms ?? event.firstWall ?? (
            event.client_started_at ? new Date(event.client_started_at).getTime() :
            Math.round((videoRef.current?.currentTime || 0) * 1000)
          );

          if (event.phase === 'candidate') {
            // Immediate evidence capture keyed by unique evtId
            const snap = captureFrame();
            if (snap) {
              provisionalSnapRef.current[evtId] = {
                snap,
                timestampMs: evtTs,
                type: evtType,
              };
            }
            setActiveCandidate({ id: evtId, type: evtType, timestampMs: evtTs });
          } else if (event.phase === 'start') {
            setActiveCondition(evtType);
          } else if (event.phase === 'end') {
            setActiveCondition(null);
            setActiveCandidate((c) => (c?.id === evtId ? null : c));
            const recordedEvent = {
              event_id: evtId,
              event_type: evtType,
              event_status: 'confirmed',
              video_timestamp_ms: Math.max(0, evtTs),
              duration_ms: Math.max(0, evtDuration),
              confidence: typeof event.metadata?.confidence === 'number' ? event.metadata.confidence : null,
              bounding_boxes: event.metadata?.bbox ? [event.metadata.bbox] : null,
              detector_name: 'MediaPipe Tasks Vision',
              metadata: event.metadata || {},
            };

            // Update synchronously in ref and React state
            eventsRef.current = [...eventsRef.current, recordedEvent];
            setEvents([...eventsRef.current]);

            // Promote candidate snapshot for this exact event ID if present
            const prov = provisionalSnapRef.current[evtId];
            if (prov?.snap) {
              snapshotsRef.current[recordedEvent.event_id] = {
                dataUrl: prov.snap,
                timestampMs: prov.timestampMs,
              };
              setSnapshots({ ...snapshotsRef.current });
              delete provisionalSnapRef.current[evtId];
            }
          } else if (event.phase === 'rejected') {
            setActiveCandidate((c) => (c?.id === evtId ? null : c));
            delete provisionalSnapRef.current[evtId];
          }
        },
        { clock: videoClock }
      );

      setAnalyzing(true);
      setStatusMessage('Analysis running. Playback in progress...');
      videoRef.current.play();

      // Start frame sampling loop with configured sampling interval
      if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = setInterval(sampleAndDetect, effectiveSamplingInterval);
    } catch (err) {
      setError('Analysis initialization failed: ' + (err.response?.data?.message || err.message));
      setStatusMessage('Initialization failed.');
    }
  };

  const sampleAndDetect = async () => {
    if (isInferringRef.current) return;
    const video = videoRef.current;
    if (!video || video.paused || video.ended || !detectorsRef.current || !engineRef.current) {
      return;
    }

    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      setDiagData((prev) => ({ ...prev, skipReason: 'Video element not ready or zero dimensions' }));
      return;
    }

    isInferringRef.current = true;
    try {
      const vTs = Math.round(video.currentTime * 1000);
      if (vTs === lastSampleTsRef.current && video.currentTime !== 0) {
        return;
      }
      lastSampleTsRef.current = vTs;

      sampleCountRef.current += 1;
      const currentSample = sampleCountRef.current;

      const res = await detectorsRef.current.detect(video, vTs);

      // Pass detection signals to the event engine
      engineRef.current.processFrame({
        faceCount: res.faceCount,
        headYaw: res.yaw,
        headPitch: res.pitch,
        phoneDetections: res.phones || [],
      });

      // Update structured diagnostic state (throttled to UI updates)
      if (currentSample % 4 === 0 || res.phones?.length > 0 || (res.faceCount !== 1 && res.faceCount !== null)) {
        setDiagData({
          sampleCount: currentSample,
          videoTimestampMs: vTs,
          frameDimensions: `${video.videoWidth}x${video.videoHeight}`,
          inferenceExecuted: true,
          faceCount: res.faceCount,
          hasLandmarks: !!res.hasLandmarks,
          yaw: res.yaw != null ? Number(res.yaw.toFixed(1)) : null,
          pitch: res.pitch != null ? Number(res.pitch.toFixed(1)) : null,
          phoneStatus: detectorsRef.current.status.object,
          phoneCandidates: (res.phoneCandidates || []).map((p) => ({
            confidence: Number(p.confidence.toFixed(3)),
            bbox: p.bbox,
          })),
          candidateEvents: Object.keys(provisionalSnapRef.current),
          confirmedEventsCount: eventsRef.current.length,
          lastError: res.faceError || res.objectError || null,
          skipReason: null,
        });
      }

      // Console diagnostic throttled: every ~16 frames (2s) or whenever an anomaly is detected
      if (import.meta.env.DEV && (currentSample % 16 === 0 || res.phones?.length > 0 || res.faceCount !== 1)) {
        console.debug('[VideoAnalysis Diagnostics]', {
          sessionId: sessionIdRef.current,
          vTs,
          dims: `${video.videoWidth}x${video.videoHeight}`,
          faces: res.faceCount,
          landmarks: res.hasLandmarks,
          yaw: res.yaw != null ? res.yaw.toFixed(1) : null,
          pitch: res.pitch != null ? res.pitch.toFixed(1) : null,
          phones: res.phones?.map((p) => p.confidence.toFixed(2)),
          candidates: Object.keys(provisionalSnapRef.current),
          confirmed: eventsRef.current.length,
        });
      }
    } catch (err) {
      console.warn('[VideoAnalysis] Frame sampling exception:', err.message);
      setDiagData((prev) => ({ ...prev, lastError: err.message }));
    } finally {
      isInferringRef.current = false;
    }
  };

  const handleVideoEnded = async () => {
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }

    // Flush any remaining active episodes using existing method safely
    if (engineRef.current) {
      if (typeof engineRef.current.flushActiveEvents === 'function') {
        engineRef.current.flushActiveEvents();
      } else if (typeof engineRef.current.flush === 'function') {
        engineRef.current.flush();
      }
    }

    setActiveCondition(null);
    setAnalyzing(false);
    setStatusMessage('Playback completed. Finalizing session...');
    await saveSessionResults();
  };

  const saveSessionResults = async () => {
    const curSessionId = sessionIdRef.current;
    if (!curSessionId || isCompleted || isSaving) return;
    setIsSaving(true);

    try {
      const currentEvents = [...eventsRef.current];
      const currentSnaps = { ...snapshotsRef.current };

      // 1. Record events on backend
      if (currentEvents.length > 0) {
        await api.post(`/video-analysis/sessions/${curSessionId}/events`, {
          events: currentEvents.map((e) => ({
            event_id: e.event_id,
            event_type: e.event_type,
            event_status: e.event_status || 'confirmed',
            video_timestamp_ms: Math.max(0, e.video_timestamp_ms || 0),
            duration_ms: Math.max(0, e.duration_ms || 0),
            confidence: e.confidence,
            bounding_boxes: e.bounding_boxes,
            detector_name: e.detector_name || 'MediaPipe Tasks Vision',
            metadata: e.metadata || {},
          })),
        });
      }

      // 2. Upload snapshot evidence
      for (const [evtId, snapObj] of Object.entries(currentSnaps)) {
        try {
          const dataUrl = typeof snapObj === 'string' ? snapObj : snapObj.dataUrl;
          const tsMs = typeof snapObj === 'object' ? snapObj.timestampMs : null;
          if (!dataUrl) continue;

          const blob = await (await fetch(dataUrl)).blob();
          const formData = new FormData();
          formData.append('snapshot_id', crypto.randomUUID());
          formData.append('event_id', evtId);
          formData.append('capture_reason', 'video_analysis_evidence');
          if (tsMs != null) formData.append('video_timestamp_ms', String(tsMs));
          formData.append('file', blob, 'evidence.jpg');

          await api.post(`/video-analysis/sessions/${curSessionId}/snapshots`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (snapErr) {
          console.warn(`[VideoAnalysis] Snapshot upload failed for event ${evtId}:`, snapErr.message);
        }
      }

      // 3. Mark session complete on backend
      const dur = videoRef.current ? Math.round(videoRef.current.duration * 1000) : 0;
      await api.post(`/video-analysis/sessions/${curSessionId}/complete`, {
        source_duration_ms: dur,
        analysis_status: 'completed',
      });

      setIsCompleted(true);
      setStatusMessage('Analysis completed and verified. Report ready.');
      await loadPastSessions();
    } catch (err) {
      console.error('[VideoAnalysis] Save session failed:', err);
      setError('Failed to persist session: ' + (err.response?.data?.message || err.message));
      // Mark as failed on backend so it is not left indefinitely in PROCESSING
      try {
        await api.post(`/video-analysis/sessions/${curSessionId}/complete`, {
          analysis_status: 'failed',
        });
      } catch { /* best effort */ }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async (sid = sessionId) => {
    if (!sid) return;
    try {
      const res = await api.get(`/video-analysis/sessions/${sid}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video_analysis_report_${sid.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download PDF: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetSession || !deleteConfirmed || deleting) return;
    setDeleting(true);
    const sid = deleteTargetSession.video_analysis_session_id || deleteTargetSession.session_id;
    try {
      await api.delete(`/video-analysis/sessions/${sid}`);
      setDeleteSuccessMsg(`Video analysis session for "${deleteTargetSession.source_filename}" was permanently deleted.`);
      setTimeout(() => setDeleteSuccessMsg(null), 5000);
      setDeleteTargetSession(null);
      setDeleteConfirmed(false);
      if (sessionId === sid) {
        setSessionId(null);
        sessionIdRef.current = null;
        setEvents([]);
        eventsRef.current = [];
        setSnapshots({});
        snapshotsRef.current = {};
      }
      loadPastSessions();
    } catch (err) {
      setError('Failed to delete video analysis session: ' + (err.response?.data?.message || err.message));
    } finally {
      setDeleting(false);
    }
  };

  const seekToTime = (ms) => {
    if (videoRef.current && ms != null) {
      videoRef.current.currentTime = ms / 1000;
      videoRef.current.pause();
    }
  };

  // Safe event counts with fallback to e.type
  const phoneCount = events.filter((e) => (e.event_type || e.type) === 'phone_detected').length;
  const multiFaceCount = events.filter((e) => (e.event_type || e.type) === 'multiple_faces').length;
  const absentCount = events.filter((e) => (e.event_type || e.type) === 'face_absent').length;
  const headTurnCount = events.filter((e) => (e.event_type || e.type) === 'sustained_head_turn').length;

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Recorded-Video Analysis</h1>
          <p className={styles.subtitle}>
            Upload recorded examination videos for browser-local computer-vision inspection,
            real-time frame sampling, and verified PDF report generation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {sessionId && (
            <>
              <button
                className="btn btn-green btn-sm"
                onClick={() => handleDownloadPdf()}
                disabled={!isCompleted && !events.length}
                title="Download verified PDF report"
                id="btn-download-pdf-active"
              >
                <Download size={15} />
                <span>Download PDF</span>
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setDeleteTargetSession({
                  session_id: sessionId,
                  source_filename: file?.name || fileMeta?.name || 'Current Video Session',
                  analysis_status: isCompleted ? 'completed' : analyzing ? 'processing' : 'ready',
                  source_duration_ms: (videoRef.current?.duration || 0) * 1000,
                })}
                title="Delete this video analysis session"
                id="btn-delete-active-session"
              >
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Success Notification */}
      {deleteSuccessMsg && (
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={18} />
          <span>{deleteSuccessMsg}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Card */}
      {!videoUrl && (
        <div className={styles.card}>
          <label className={styles.uploadZone}>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              onChange={handleFileChange}
              className={styles.fileInput}
            />
            <Upload size={40} className={styles.uploadIcon} />
            <div className={styles.uploadTitle}>Choose Exam Video File</div>
            <div className={styles.uploadHint}>
              Supports MP4, WebM, and MOV up to 500 MB. Processing is performed locally in your browser.
            </div>
          </label>
        </div>
      )}

      {/* Video & Analysis Player */}
      {videoUrl && (
        <div className={styles.playerSection}>
          {/* Left: Video Player */}
          <div className={styles.videoWrapper}>
            <video
              ref={videoRef}
              src={videoUrl}
              className={styles.videoElement}
              controls
              onEnded={handleVideoEnded}
              onSeeked={() => {
                if (engineRef.current) {
                  if (typeof engineRef.current.flushActiveEvents === 'function') {
                    engineRef.current.flushActiveEvents();
                  } else if (typeof engineRef.current.flush === 'function') {
                    engineRef.current.flush();
                  }
                }
                if (detectorsRef.current) detectorsRef.current.reset();
                lastSampleTsRef.current = -1;
                setActiveCondition(null);
                setActiveCandidate(null);
              }}
              playsInline
            />

            <div className={styles.controlsBar}>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {!analyzing && !isCompleted && (
                  <button className="btn btn-primary btn-sm" onClick={handleStartAnalysis}>
                    <Play size={16} />
                    <span>Start Analysis</span>
                  </button>
                )}
                {analyzing && (
                  <>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (videoRef.current) {
                          if (videoRef.current.paused) videoRef.current.play();
                          else videoRef.current.pause();
                        }
                      }}
                    >
                      <Pause size={16} />
                      <span>Pause / Resume</span>
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleVideoEnded}
                      title="Finish and save analysis early"
                    >
                      <Check size={16} />
                      <span>Finalize Now</span>
                    </button>
                  </>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setFile(null);
                    setVideoUrl(null);
                    setEvents([]);
                    eventsRef.current = [];
                    setSnapshots({});
                    snapshotsRef.current = {};
                    setSessionId(null);
                    sessionIdRef.current = null;
                    setIsCompleted(false);
                    setActiveCondition(null);
                    setAnalyzing(false);
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Choose Another Video</span>
                </button>
              </div>

              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>
                {statusMessage}
              </div>
            </div>

            {/* File metadata */}
            {fileMeta && (
              <div className={styles.fileMetaRow}>
                <div className={styles.fileMetaItem}>
                  <span className={styles.fileMetaLabel}>File</span>
                  <span className={styles.fileMetaValue}>{fileMeta.name}</span>
                </div>
                <div className={styles.fileMetaItem}>
                  <span className={styles.fileMetaLabel}>Size</span>
                  <span className={styles.fileMetaValue}>{fileMeta.sizeMb} MB</span>
                </div>
                <div className={styles.fileMetaItem}>
                  <span className={styles.fileMetaLabel}>SHA-256</span>
                  <span className={styles.fileMetaValue} style={{ fontFamily: 'monospace' }}>
                    {fileMeta.sha256?.slice(0, 16) || '-'}...
                  </span>
                </div>
              </div>
            )}

            {/* Diagnostics Accordion */}
            <div className={styles.diagPanel}>
              <div
                className={styles.diagHeader}
                onClick={() => setShowDiagnostics((prev) => !prev)}
                title="Toggle development diagnostics panel"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={14} style={{ color: 'var(--color-blue)' }} />
                  <span>Pipeline Diagnostics</span>
                  {sessionId && (
                    <span style={{ fontFamily: 'monospace', fontWeight: 'normal', color: 'var(--color-text-secondary)', marginLeft: 6 }}>
                      (Session: {sessionId.slice(0, 8)})
                    </span>
                  )}
                </div>
                {showDiagnostics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>

              {showDiagnostics && (
                <div className={styles.diagGrid}>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Frame Dimensions</span>
                    <span className={styles.diagValue}>{diagData.frameDimensions}</span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Playback Timestamp</span>
                    <span className={styles.diagValue}>{formatMs(diagData.videoTimestampMs)}</span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Sample Count</span>
                    <span className={styles.diagValue}>{diagData.sampleCount}</span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Face Detection</span>
                    <span className={styles.diagValue}>
                      {diagData.faceCount != null ? `${diagData.faceCount} face(s)` : 'Unavailable'}
                      {diagData.hasLandmarks ? ' (Landmarks OK)' : ''}
                    </span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Head Pose</span>
                    <span className={styles.diagValue}>
                      {diagData.yaw != null ? `Yaw: ${diagData.yaw}°, Pitch: ${diagData.pitch}°` : 'Calibrating / None'}
                    </span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Phone Detector</span>
                    <span className={styles.diagValue}>
                      {diagData.phoneStatus === 'ready' ? (
                        diagData.phoneCandidates.length > 0 ? (
                          `${diagData.phoneCandidates.length} cand. [${diagData.phoneCandidates.map((c) => c.confidence).join(', ')}]`
                        ) : '0 detected'
                      ) : diagData.phoneStatus}
                    </span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Confirmed Events</span>
                    <span className={styles.diagValue}>{diagData.confirmedEventsCount}</span>
                  </div>
                  <div className={styles.diagItem}>
                    <span className={styles.diagLabel}>Pipeline Status</span>
                    <span className={styles.diagValue} style={{ color: diagData.lastError ? 'var(--color-red)' : 'var(--color-text-heading)' }}>
                      {diagData.lastError ? `Error: ${diagData.lastError}` : (diagData.skipReason || 'Inference Nominal')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Real-time Stats & Event Timeline */}
          <SectionErrorBoundary name="Event Timeline">
            <div className={styles.card}>
              {/* Active Condition Banner */}
              {activeCondition && (
                <div className={styles.alertActive}>
                  <AlertTriangle size={18} />
                  <span>
                    Active Violation Condition: {(activeCondition || '').replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
              )}

              {/* Candidate Verifying Banner */}
              {activeCandidate && !activeCondition && (
                <div style={{ background: 'var(--color-surface-alt)', border: '1px dashed var(--color-blue)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-xs)', marginBottom: 'var(--space-3)' }}>
                  <span className="spinner spinner-xs" style={{ width: 14, height: 14 }} />
                  <span><strong>Candidate — verifying:</strong> {activeCandidate.type.replace(/_/g, ' ')} at {formatMs(activeCandidate.timestampMs)}</span>
                </div>
              )}

              {/* Event Counters */}
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statNumber} style={{ color: 'var(--color-red)' }}>{phoneCount}</span>
                  <span className={styles.statLabel}>
                    <Smartphone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Phones
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statNumber} style={{ color: 'var(--color-orange)' }}>{multiFaceCount}</span>
                  <span className={styles.statLabel}>
                    <Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Multiple Faces
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statNumber} style={{ color: '#854d0e' }}>{absentCount}</span>
                  <span className={styles.statLabel}>
                    <UserX size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Face Absence
                  </span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statNumber} style={{ color: 'var(--color-blue)' }}>{headTurnCount}</span>
                  <span className={styles.statLabel}>
                    <Eye size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Head Turn
                  </span>
                </div>
              </div>

              {/* Timeline List */}
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 'bold', color: 'var(--color-text-heading)', marginBottom: 'var(--space-3)' }}>
                Detected Timeline Events ({events.length})
              </h3>

              {events.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  No events detected yet. Start analysis to detect candidate conditions.
                </div>
              ) : (
                <div className={styles.timelineList}>
                  {events.map((e, idx) => {
                    const rawType = e.event_type || e.type || 'unknown_event';
                    const badgeClass =
                      rawType === 'phone_detected' ? styles.badgePhone :
                      rawType === 'multiple_faces' ? styles.badgeFace :
                      rawType === 'sustained_head_turn' ? styles.badgeTurn :
                      styles.badgeAbsent;

                    const thumbObj = snapshots[e.event_id];
                    const thumb = typeof thumbObj === 'string' ? thumbObj : thumbObj?.dataUrl;

                    return (
                      <div
                        key={e.event_id || idx}
                        className={styles.timelineItem}
                        onClick={() => seekToTime(e.video_timestamp_ms)}
                        title="Click to jump to this moment in video"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <span className={styles.timelineTime}>{formatMs(e.video_timestamp_ms)}</span>
                          <span className={`${styles.timelineBadge} ${badgeClass}`}>
                            {rawType.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>
                            {((e.duration_ms || 0) / 1000).toFixed(1)}s
                          </span>
                          {thumb && (
                            <img src={thumb} alt="Evidence" className={styles.snapshotThumb} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Disclaimer */}
              <div className={styles.disclaimer}>
                <strong>Notice:</strong> Algorithmic detections represent visual observations during video playback.
                All reported events require human contextual evaluation before making disciplinary determinations.
              </div>
            </div>
          </SectionErrorBoundary>
        </div>
      )}

      {/* Past Video Analysis Sessions */}
      <SectionErrorBoundary name="Previous Sessions">
        {pastSessions.length > 0 && (
          <div className={styles.pastSessionsSection}>
            <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold', color: 'var(--color-text-heading)', marginBottom: 'var(--space-3)' }}>
              Previous Video Analysis Sessions
            </h2>
            {pastSessions.map((s, idx) => {
              const filename = s.source_filename || 'Unnamed Video';
              const status = s.analysis_status || 'unknown';
              const createdAt = s.created_at ? s.created_at.slice(0, 19).replace('T', ' ') : '-';
              const durSec = s.source_duration_ms ? `${(s.source_duration_ms / 1000).toFixed(1)}s` : 'N/A';

              return (
                <div key={s.video_analysis_session_id || idx} className={styles.sessionItem}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--color-text-heading)', fontSize: 'var(--font-size-md)' }}>
                      {filename}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      Status: <strong style={{ textTransform: 'uppercase' }}>{status}</strong> &nbsp;|&nbsp;
                      Duration: {durSec} &nbsp;|&nbsp;
                      Date: {createdAt}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      className="btn btn-green btn-sm"
                      onClick={() => handleDownloadPdf(s.video_analysis_session_id)}
                      title="Download verified PDF report"
                      id={`btn-download-pdf-${(s.video_analysis_session_id || '').slice(0, 8)}`}
                    >
                      <Download size={14} />
                      <span>Download PDF</span>
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTargetSession(s)}
                      title="Delete this video analysis session and evidence"
                      id={`btn-delete-${(s.video_analysis_session_id || '').slice(0, 8)}`}
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionErrorBoundary>

      {/* Confirmation Modal: Safe Session Deletion */}
      {deleteTargetSession && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="modal-delete-title">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle} id="modal-delete-title">
                <Trash2 size={20} style={{ color: 'var(--color-red)' }} />
                <span>Delete Video Analysis Session</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setDeleteTargetSession(null);
                  setDeleteConfirmed(false);
                }}
                disabled={deleting}
                title="Cancel and close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <AlertTriangle size={18} />
                <span>
                  <strong>Permanent Action:</strong> This will delete all detected events,
                  snapshots, and local storage files for this recorded video analysis session.
                  Actual examination attempts and other sessions will remain untouched.
                </span>
              </div>

              <div style={{ background: 'var(--color-surface-alt)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: 'var(--border-thin)', fontSize: 'var(--font-size-sm)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-2)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Filename:</span>
                  <strong style={{ color: 'var(--color-text-heading)', wordBreak: 'break-all' }}>
                    {deleteTargetSession.source_filename || 'Unnamed Session'}
                  </strong>

                  <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Status:</span>
                  <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                    {deleteTargetSession.analysis_status || 'unknown'}
                  </span>

                  {deleteTargetSession.source_duration_ms != null && (
                    <>
                      <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Duration:</span>
                      <span>{formatMs(deleteTargetSession.source_duration_ms)}</span>
                    </>
                  )}

                  <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>Session ID:</span>
                  <code style={{ fontSize: '11px' }}>
                    {deleteTargetSession.video_analysis_session_id || deleteTargetSession.session_id}
                  </code>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer', padding: 'var(--space-3)', background: 'var(--color-surface)', border: 'var(--border-thin)', borderRadius: 'var(--radius-md)' }}>
                <input
                  type="checkbox"
                  id="chk-confirm-delete"
                  checked={deleteConfirmed}
                  onChange={(e) => setDeleteConfirmed(e.target.checked)}
                  disabled={deleting}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-heading)' }}>
                  I confirm that I want to permanently delete this video analysis session and all associated evidence files.
                </span>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDeleteTargetSession(null);
                  setDeleteConfirmed(false);
                }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={!deleteConfirmed || deleting}
                id="btn-confirm-delete-permanent"
              >
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
