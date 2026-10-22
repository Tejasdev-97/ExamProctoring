/**
 * ExamProctor.ai — Independent Screen Monitoring & Focus Evidence Engine
 *
 * Manages the explicit state machine, student warnings, and authorized
 * desktop screen-capture lifecycle during sustained focus-loss episodes.
 *
 * Purely additive: does not compete with CV frame loops or camera tracks.
 */

import { v4 as uuidv4 } from 'uuid';

export const SCREEN_MONITOR_STATES = {
  DISABLED:            'disabled',
  AWAITING_CONSENT:    'awaiting_consent',
  READY:               'ready',
  FOCUS_LOSS_PENDING:  'focus_loss_pending',
  WARNING_VISIBLE:     'warning_visible',
  CAPTURE_PENDING:     'capture_pending',
  CAPTURING:           'capturing',
  EVIDENCE_SAVED:      'evidence_saved',
  CAPTURE_UNAVAILABLE: 'capture_unavailable',
  CAPTURE_FAILED:      'capture_failed',
  STOPPED:             'stopped',
};

// Configurable policy thresholds
export const SCREEN_MONITOR_CONFIG = {
  WARNING_DELAY_MS: 1200,    // matches blur confirmation debounce
  CAPTURE_DELAY_MS: 2500,    // sustained focus loss requirement (2.5s)
  REPEATED_THRESHOLD: 3,     // qualifying episodes to show repeated interruption notice
};

async function computeSha256(arrayBuffer) {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const digestBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const arr = Array.from(new Uint8Array(digestBuf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback placeholder if WebCrypto is unavailable in test environment
  return '0000000000000000000000000000000000000000000000000000000000000000';
}

function base64ToBlob(base64, mimeType = 'image/jpeg') {
  if (typeof atob === 'function') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
  return new Blob([], { type: mimeType });
}

export class ScreenMonitoringEngine {
  constructor({ attemptId, consented = true, electronAPI = null, snapshotRepo = null }) {
    this.attemptId = attemptId;
    this.consented = Boolean(consented);
    this.electronAPI = electronAPI || (typeof window !== 'undefined' ? window.electronAPI : null);
    this.snapshotRepo = snapshotRepo;

    this.state = this.electronAPI ? SCREEN_MONITOR_STATES.READY : SCREEN_MONITOR_STATES.DISABLED;
    this.activeWarning = null;
    this.episodeCount = 0;
    this.activeEpisode = null;

    this.pendingWarningTimer = null;
    this.pendingCaptureTimer = null;
    this.inFlightCapture = false;
    this.capturedEventIds = new Set();
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  getActiveWarning() {
    return this.activeWarning;
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener({
          state: this.state,
          activeWarning: this.activeWarning,
          episodeCount: this.episodeCount,
          activeEpisode: this.activeEpisode,
        });
      } catch (err) {
        console.warn('[Screen Monitoring Engine] Listener error:', err);
      }
    }
  }

  setConsent(consented) {
    if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
    this.consented = Boolean(consented);
    if (!this.consented && this.pendingCaptureTimer) {
      clearTimeout(this.pendingCaptureTimer);
      this.pendingCaptureTimer = null;
    }
    this._notify();
  }

  /**
   * Called when window focus is lost (from Electron onWindowBlur).
   */
  handleFocusLoss({ timestamp, eventId }) {
    if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
    if (!this.electronAPI) return;

    // Deduplicate: if an episode is already being monitored for this continuous blur, don't restart timers
    if (this.activeEpisode && !this.activeEpisode.endedAt) {
      return;
    }

    const startedAt = timestamp || new Date().toISOString();
    this.activeEpisode = {
      eventId: eventId || uuidv4(),
      startedAt,
      type: 'window_blur',
      captured: false,
    };
    this.episodeCount += 1;
    this.state = SCREEN_MONITOR_STATES.FOCUS_LOSS_PENDING;
    this._notify();

    // 1. Warning timer (fires at WARNING_DELAY_MS if still unfocused)
    if (this.pendingWarningTimer) clearTimeout(this.pendingWarningTimer);
    this.pendingWarningTimer = setTimeout(() => {
      this.pendingWarningTimer = null;
      if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
      if (!this.activeEpisode || this.activeEpisode.endedAt) return;

      const isRepeated = this.episodeCount >= SCREEN_MONITOR_CONFIG.REPEATED_THRESHOLD;
      this.activeWarning = {
        id: `warn-blur-${Date.now()}`,
        type: 'window_inactive',
        title: 'Window inactive',
        message: isRepeated
          ? 'Repeated examination interruptions have been recorded for review. Please remain in the examination.'
          : 'Your exam window is inactive. Please return to your examination. Continued interruptions may be recorded for review.',
        severity: isRepeated ? 'critical' : 'warning',
      };
      this.state = SCREEN_MONITOR_STATES.WARNING_VISIBLE;
      this._notify();
    }, SCREEN_MONITOR_CONFIG.WARNING_DELAY_MS);

    // 2. Capture timer (fires at CAPTURE_DELAY_MS if sustained and consented)
    if (this.pendingCaptureTimer) clearTimeout(this.pendingCaptureTimer);
    if (this.consented) {
      this.pendingCaptureTimer = setTimeout(async () => {
        this.pendingCaptureTimer = null;
        if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
        if (!this.activeEpisode || this.activeEpisode.endedAt) return;

        await this._executeCapture('window_blur');
      }, SCREEN_MONITOR_CONFIG.CAPTURE_DELAY_MS);
    }
  }

  /**
   * Called when page becomes hidden or minimized (visibilitychange).
   */
  handlePageHidden({ timestamp, eventId }) {
    if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
    if (!this.electronAPI) return;

    const startedAt = timestamp || new Date().toISOString();
    const targetEventId = eventId || uuidv4();

    this.activeWarning = {
      id: `warn-hidden-${Date.now()}`,
      type: 'window_hidden',
      title: 'Exam window hidden',
      message: 'Your exam window is hidden or no longer visible. Return to the examination.',
      severity: 'critical',
    };
    this.state = SCREEN_MONITOR_STATES.WARNING_VISIBLE;
    this._notify();

    // If consented and not already captured for this episode, trigger capture
    if (this.consented && !this.capturedEventIds.has(targetEventId)) {
      this.activeEpisode = {
        eventId: targetEventId,
        startedAt,
        type: 'page_hidden',
        captured: false,
      };
      this._executeCapture('page_hidden');
    }
  }

  /**
   * Called when window regains focus (from Electron onWindowFocus).
   */
  handleFocusRestored() {
    if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;

    // Cancel pending warning if returned within grace window
    if (this.pendingWarningTimer) {
      clearTimeout(this.pendingWarningTimer);
      this.pendingWarningTimer = null;
    }

    // Cancel pending capture if returned before capture deadline
    if (this.pendingCaptureTimer) {
      clearTimeout(this.pendingCaptureTimer);
      this.pendingCaptureTimer = null;
    }

    // Dismiss active warning upon return
    this.activeWarning = null;

    if (this.activeEpisode) {
      this.activeEpisode.endedAt = new Date().toISOString();
    }

    // Reset state to READY if still active
    if (!this.inFlightCapture) {
      this.state = SCREEN_MONITOR_STATES.READY;
    }
    this._notify();
  }

  /**
   * Internal capture execution routine
   */
  async _executeCapture(reason) {
    if (this.state === SCREEN_MONITOR_STATES.STOPPED) return;
    if (!this.consented || !this.electronAPI?.requestScreenCapture) {
      this.state = SCREEN_MONITOR_STATES.CAPTURE_UNAVAILABLE;
      this._notify();
      return;
    }

    const episode = this.activeEpisode;
    if (!episode || episode.captured || this.capturedEventIds.has(episode.eventId)) {
      return;
    }

    this.inFlightCapture = true;
    this.state = SCREEN_MONITOR_STATES.CAPTURING;
    this._notify();

    const requestId = uuidv4();

    try {
      const response = await this.electronAPI.requestScreenCapture({
        attemptId: this.attemptId,
        eventId: episode.eventId,
        requestId,
        reason,
      });

      // Guard against race conditions after stop()
      if (this.state === SCREEN_MONITOR_STATES.STOPPED) {
        return;
      }

      if (response && response.success && response.data?.base64) {
        episode.captured = true;
        this.capturedEventIds.add(episode.eventId);

        // Convert base64 to Blob and persist locally
        const blob = base64ToBlob(response.data.base64, response.data.mimeType || 'image/jpeg');
        const arrayBuf = await blob.arrayBuffer();
        const sha256 = await computeSha256(arrayBuf);
        const snapshotId = uuidv4();
        const capturedAt = new Date().toISOString();

        const repo = this.snapshotRepo;
        if (repo && typeof repo.save === 'function') {
          await repo.save({
            snapshot_id:         snapshotId,
            attempt_id:          this.attemptId,
            event_id:            episode.eventId,
            capture_reason:      `screen_${reason}`,
            client_captured_at:  capturedAt,
            blob,
            sha256,
            size_bytes:          blob.size,
            width:               response.data.width || 1280,
            height:              response.data.height || 720,
            storage_status:      'local',
            retry_count:         0,
          });
          console.log(`[Screen Monitoring] Persisted screen evidence (${snapshotId}) for event: ${episode.eventId}`);
        }
        this.state = SCREEN_MONITOR_STATES.EVIDENCE_SAVED;
      } else {
        console.warn('[Screen Monitoring] Capture unavailable or failed:', response?.error);
        this.state = response?.error?.includes('unavailable')
          ? SCREEN_MONITOR_STATES.CAPTURE_UNAVAILABLE
          : SCREEN_MONITOR_STATES.CAPTURE_FAILED;
      }
    } catch (err) {
      console.warn('[Screen Monitoring] Capture exception:', err.message);
      this.state = SCREEN_MONITOR_STATES.CAPTURE_FAILED;
    } finally {
      this.inFlightCapture = false;
      this._notify();
    }
  }

  dismissWarning() {
    this.activeWarning = null;
    this._notify();
  }

  /**
   * Clean shutdown: called on exam submission, cancellation, or page unmount.
   * Atomically clears all timers and disarms capture. Idempotent.
   */
  stop() {
    this.state = SCREEN_MONITOR_STATES.STOPPED;
    this.activeWarning = null;

    if (this.pendingWarningTimer) {
      clearTimeout(this.pendingWarningTimer);
      this.pendingWarningTimer = null;
    }

    if (this.pendingCaptureTimer) {
      clearTimeout(this.pendingCaptureTimer);
      this.pendingCaptureTimer = null;
    }

    if (this.electronAPI?.stopScreenCaptureSession) {
      try {
        this.electronAPI.stopScreenCaptureSession();
      } catch {
        /* noop */
      }
    }

    this._notify();
  }
}
