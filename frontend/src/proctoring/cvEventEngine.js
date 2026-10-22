/**
 * ExamProctor.ai — Computer Vision Event Engine
 * Runs in the main thread but is designed to be called from a Web Worker.
 *
 * Responsibilities:
 *  - Accept detector frame results
 *  - Apply grace periods, duration thresholds, and persistence rules
 *  - Emit lifecycle notifications per continuous episode of a condition:
 *      'candidate' : the condition was first observed (before temporal confirmation)
 *      'start'     : the condition persisted for its grace period -> CONFIRMED episode begins
 *      'end'       : a confirmed episode ended (duration measured on a monotonic clock)
 *      'rejected'  : a candidate disappeared before confirmation (never a confirmed event)
 *  - Suppress duplicate events while a condition persists (one episode = one event id)
 *  - Tolerate brief detector dropouts (release hysteresis) so a flickering detection does not
 *    fragment one episode into many; a genuine absence longer than the release window ends the
 *    episode and a later reappearance becomes a SEPARATE episode with its own id.
 *
 * Timing: wall-clock timestamps (for reporting) come from `clock().wall`; elapsed durations
 * come from the monotonic `clock().mono`, so system clock changes cannot corrupt durations.
 *
 * All timing values are configurable via the proctoring_config from the exam package.
 */

import { logPhoneDiagnostic } from './phoneClassifier.js';

const DEFAULT_CONFIG = {
  face_absence_grace_ms: 5000,
  multiple_faces_grace_ms: 1000,
  sustained_head_turn_ms: 3000,
  phone_confirm_ms: 1000,
  phone_detection_threshold: 0.65,
  head_turn_yaw_threshold: 30.0,
  head_turn_pitch_threshold: 30.0,
  live_sampling_interval_ms: 500,
  video_sampling_interval_ms: 125,
  // Hysteresis: how long a condition must be continuously absent before the episode ends.
  release_ms: { face_absent: 1000, multiple_faces: 1000, sustained_head_turn: 1000, phone_detected: 1500 },
};

const TYPES = ['face_absent', 'multiple_faces', 'sustained_head_turn', 'phone_detected'];

const defaultClock = () => ({ wall: Date.now(), mono: performance.now() });
const defaultId = () => crypto.randomUUID();

const blank = () => ({
  active: false,        // confirmed episode in progress
  eventId: null,
  firstWall: null,      // wall time candidate first observed
  firstMono: null,
  lastWall: null,       // last time the condition was observed
  lastMono: null,
  lastMetadata: {},
});

export class CVEventEngine {
  constructor(config = {}, onEvent, { clock = defaultClock, idFactory = defaultId } = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...config, release_ms: { ...DEFAULT_CONFIG.release_ms, ...(config.release_ms || {}) } };
    this.onEvent = onEvent; // (event) => void
    this.clock = clock;
    this.newId = idFactory;
    this._state = Object.fromEntries(TYPES.map((t) => [t, blank()]));
  }

  /**
   * Process a single frame result from the detectors.
   *
   * @param {object} frame
   *  - faceCount: number of detected faces (0, 1, 2+) or null if the face model is unavailable
   *  - headYaw / headPitch: degrees (null if unknown)
   *  - phoneDetections / phones / phoneCandidates: [{confidence, bbox}]
   */
  processFrame(frame) {
    const t = this.clock();
    const { faceCount, headYaw, headPitch, phoneDetections, phones, phoneCandidates } = frame;

    // A null signal means "model unavailable / unknown": rules for it are not evaluated.
    if (faceCount !== null && faceCount !== undefined) {
      this._update('face_absent', faceCount === 0, t, this.cfg.face_absence_grace_ms, { face_count: 0 });
      this._update('multiple_faces', faceCount > 1, t, this.cfg.multiple_faces_grace_ms, { face_count: faceCount });
    }

    if (headYaw !== null && headYaw !== undefined) {
      const yawExceeded = Math.abs(headYaw) > this.cfg.head_turn_yaw_threshold;
      const pitchExceeded = headPitch !== null && headPitch !== undefined &&
        Math.abs(headPitch) > this.cfg.head_turn_pitch_threshold;
      this._update('sustained_head_turn', yawExceeded || pitchExceeded, t, this.cfg.sustained_head_turn_ms,
        { yaw: headYaw, pitch: headPitch });
    } else if (faceCount === 0 || faceCount > 1) {
      // No usable single-face pose this frame: do not extend an active head-turn episode.
      this._update('sustained_head_turn', false, t, this.cfg.sustained_head_turn_ms, {});
    }

    const candidateList = phoneDetections || phones || phoneCandidates || [];
    const threshold = this.cfg.phone_detection_threshold ?? 0.65;
    const strongPhone = candidateList
      .filter((d) => d.confidence >= threshold)
      .sort((a, b) => b.confidence - a.confidence)[0];
    this._update('phone_detected', !!strongPhone, t, this.cfg.phone_confirm_ms,
      strongPhone ? {
        confidence: strongPhone.confidence,
        bbox: strongPhone.bbox,
        decision_reason: strongPhone.decisionReason,
        ...(strongPhone.classifier ? { classifier: strongPhone.classifier } : {}),
      } : {});
  }

  _update(type, conditionActive, t, graceMs, metadata) {
    const s = this._state[type];
    const release = this.cfg.release_ms[type] ?? 1000;

    if (conditionActive) {
      if (s.firstMono === null) {
        // Condition first observed -> CANDIDATE (immediate; evidence can be requested now)
        s.eventId = this.newId();
        s.firstWall = t.wall;
        s.firstMono = t.mono;
        s.lastMetadata = metadata;
        if (type === 'phone_detected') {
          logPhoneDiagnostic('G', {
            phase: 'candidate',
            type,
            eventId: s.eventId,
            conditionActive: true,
            metadata,
          });
        }
        this._emit('candidate', type, s, { client_started_at: new Date(t.wall).toISOString(), metadata });
      }
      s.lastWall = t.wall;
      s.lastMono = t.mono;
      if (type === 'phone_detected' && metadata.confidence !== undefined &&
          (s.lastMetadata.confidence === undefined || metadata.confidence >= s.lastMetadata.confidence)) {
        s.lastMetadata = metadata; // keep the most confident observation of the episode
      } else if (type !== 'phone_detected') {
        s.lastMetadata = metadata;
      }
      if (!s.active && t.mono - s.firstMono >= graceMs) {
        // Temporal verification passed -> CONFIRMED episode starts at the first observation time
        s.active = true;
        if (type === 'phone_detected') {
          logPhoneDiagnostic('G', {
            phase: 'start_confirmed',
            type,
            eventId: s.eventId,
            conditionActive: true,
            durationMs: t.mono - s.firstMono,
            metadata: s.lastMetadata,
          });
        }
        this._emit('start', type, s, {
          event_status: 'candidate', // persisted as confirmed only when/if it ends or is flushed
          client_started_at: new Date(s.firstWall).toISOString(),
          metadata: s.lastMetadata,
        });
      }
      return;
    }

    if (s.firstMono === null) return; // nothing in progress

    // Condition not observed this frame: honour release hysteresis before closing the episode.
    if (t.mono - s.lastMono < release) return;
    this._close(type, s, false);
  }

  /** End (confirmed) or reject (unconfirmed) the episode; the end time is the LAST observation. */
  _close(type, s, useNow) {
    if (s.active) {
      const endMono = useNow ? this.clock().mono : s.lastMono;
      const endWall = useNow ? this.clock().wall : s.lastWall;
      if (type === 'phone_detected') {
        logPhoneDiagnostic('G', {
          phase: 'end',
          type,
          eventId: s.eventId,
          conditionActive: false,
          durationMs: Math.max(0, Math.round(endMono - s.firstMono)),
          metadata: s.lastMetadata,
        });
      }
      this._emit('end', type, s, {
        event_status: 'confirmed',
        client_started_at: new Date(s.firstWall).toISOString(),
        client_ended_at: new Date(endWall).toISOString(),
        duration_ms: Math.max(0, Math.round(endMono - s.firstMono)),
        metadata: s.lastMetadata,
      });
    } else {
      if (type === 'phone_detected') {
        logPhoneDiagnostic('G', {
          phase: 'rejected',
          type,
          eventId: s.eventId,
          conditionActive: false,
          reason: 'disappeared_before_confirmation_grace',
          elapsedMs: s.lastMono - s.firstMono,
        });
      }
      this._emit('rejected', type, s, {
        event_status: 'rejected',
        client_started_at: new Date(s.firstWall).toISOString(),
        metadata: s.lastMetadata,
      });
    }
    this._state[type] = blank();
  }

  _emit(phase, type, s, fields) {
    this.onEvent({
      event_id: s.eventId,
      eventId: s.eventId,
      event_type: type,
      type: type,
      event_status: 'candidate',
      client_ended_at: null,
      duration_ms: null,
      durationMs: fields?.duration_ms ?? null,
      firstWall: s.firstWall,
      lastWall: s.lastWall,
      video_timestamp_ms: s.firstWall,
      metadata: {},
      ...fields,
      phase,
    });
  }

  /** Flush active/candidate episodes as they stand (e.g. on exam submission or video end). */
  flushActiveEvents() {
    for (const [type, s] of Object.entries(this._state)) {
      if (s.firstMono !== null) this._close(type, s, true);
    }
  }

  /** Alias for flushActiveEvents() */
  flush() {
    return this.flushActiveEvents();
  }

  updateConfig(config) {
    this.cfg = { ...this.cfg, ...config, release_ms: { ...this.cfg.release_ms, ...(config?.release_ms || {}) } };
  }
}

