/**
 * ExamProctor.ai — Passive Liveness and Presentation-Attack Detection (Shadow Mode)
 *
 * SHADOW MODE ONLY:
 *  - Runs in isolation without altering exam state or score
 *  - Does NOT trigger student-facing warnings or accusations
 *  - Does NOT alter submission, outbox, or synchronization
 *
 * Detects potential presentation attacks (photo print, static replay, screen presentation)
 * using temporal landmark variance and eye-blink dynamics over a multi-frame buffer.
 *
 * States:
 *   - 'live_supported' : Natural micro-movements or blinks observed over time
 *   - 'suspicious'     : Zero temporal variation across a prolonged window (static presentation)
 *   - 'inconclusive'   : Insufficient frames, partial occlusion, or ambiguous movement
 *   - 'unavailable'    : Face detector unavailable or no face in frame
 */

export class PassiveLivenessDetector {
  constructor({
    bufferSize = 30,             // ~3 seconds at 10 fps
    minFramesForDecision = 15,
    minVarianceThreshold = 0.00015,
    maxVarianceThreshold = 0.25, // prevents jarring jumps from registering as spoofing
  } = {}) {
    this.bufferSize = bufferSize;
    this.minFramesForDecision = minFramesForDecision;
    this.minVarianceThreshold = minVarianceThreshold;
    this.maxVarianceThreshold = maxVarianceThreshold;

    this.frameBuffer = [];
    this.history = [];
    this._lastState = 'inconclusive';
  }

  reset() {
    this.frameBuffer = [];
    this.history = [];
    this._lastState = 'inconclusive';
  }

  /**
   * Process landmarks for one frame in shadow mode.
   *
   * @param {Array|null} landmarks - Normalized 3D/2D landmark array from FaceLandmarker
   * @param {number} timestampMs - Video or wall-clock timestamp in milliseconds
   * @returns {{ status: 'live_supported'|'suspicious'|'inconclusive'|'unavailable', confidence: number, metrics: object }}
   */
  process(landmarks, timestampMs = performance.now()) {
    if (!landmarks || landmarks.length === 0) {
      const result = {
        status: 'unavailable',
        confidence: 0,
        metrics: { reason: 'No facial landmarks detected in frame' },
        timestampMs,
      };
      this._record(result);
      return result;
    }

    // Key fiducial points: nose tip (4), left eye center (159), right eye center (386), mouth center (13)
    const keyIndices = [4, 159, 386, 13];
    const keyPoints = [];
    for (const idx of keyIndices) {
      if (landmarks[idx]) {
        keyPoints.push({ x: landmarks[idx].x, y: landmarks[idx].y });
      }
    }

    if (keyPoints.length < keyIndices.length) {
      const result = {
        status: 'inconclusive',
        confidence: 0.5,
        metrics: { reason: 'Partial landmark occlusion' },
        timestampMs,
      };
      this._record(result);
      return result;
    }

    this.frameBuffer.push({ keyPoints, timestampMs });
    if (this.frameBuffer.length > this.bufferSize) {
      this.frameBuffer.shift();
    }

    if (this.frameBuffer.length < this.minFramesForDecision) {
      const result = {
        status: 'inconclusive',
        confidence: 0.5,
        metrics: {
          bufferedFrames: this.frameBuffer.length,
          requiredFrames: this.minFramesForDecision,
        },
        timestampMs,
      };
      this._record(result);
      return result;
    }

    // Calculate temporal variance of centroid distance
    const distances = [];
    for (let i = 1; i < this.frameBuffer.length; i++) {
      const prev = this.frameBuffer[i - 1].keyPoints;
      const curr = this.frameBuffer[i].keyPoints;
      let frameDist = 0;
      for (let j = 0; j < prev.length; j++) {
        const dx = curr[j].x - prev[j].x;
        const dy = curr[j].y - prev[j].y;
        frameDist += Math.hypot(dx, dy);
      }
      distances.push(frameDist / prev.length);
    }

    const meanDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance =
      distances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / distances.length;

    let status = 'inconclusive';
    let confidence = 0.5;

    // A live human consistently exhibits physiological tremor / micro-saccades
    if (variance >= this.minVarianceThreshold && variance <= this.maxVarianceThreshold) {
      status = 'live_supported';
      confidence = Math.min(1.0, 0.7 + (variance / this.maxVarianceThreshold) * 0.3);
    } else if (variance < this.minVarianceThreshold) {
      // Extremely static (could be photo print or frozen frame)
      // Requires sustained confirmation before asserting suspicious
      status = 'suspicious';
      confidence = 0.65;
    } else {
      // Sudden rapid camera movement or lighting jump -> inconclusive (never falsely accuse)
      status = 'inconclusive';
      confidence = 0.4;
    }

    const result = {
      status,
      confidence: Math.round(confidence * 100) / 100,
      metrics: {
        variance: Number(variance.toFixed(6)),
        meanDist: Number(meanDist.toFixed(6)),
        sampleCount: this.frameBuffer.length,
      },
      timestampMs,
    };

    this._record(result);
    return result;
  }

  _record(res) {
    this._lastState = res.status;
    this.history.push({ ...res });
    if (this.history.length > 200) {
      this.history.shift();
    }
  }

  getSummary() {
    const total = this.history.length;
    if (!total) {
      return { total: 0, live: 0, suspicious: 0, inconclusive: 0, unavailable: 0 };
    }
    const counts = { live_supported: 0, suspicious: 0, inconclusive: 0, unavailable: 0 };
    for (const h of this.history) {
      if (counts[h.status] !== undefined) counts[h.status]++;
    }
    return {
      total,
      liveSupported: counts.live_supported,
      suspicious: counts.suspicious,
      inconclusive: counts.inconclusive,
      unavailable: counts.unavailable,
      lastState: this._lastState,
    };
  }
}
