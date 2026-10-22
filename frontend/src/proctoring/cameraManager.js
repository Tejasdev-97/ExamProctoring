/**
 * ExamProctor.ai — Camera Manager
 * Lifecycle management for the webcam stream used during examination.
 * Handles: permission request, stream start, graceful recovery, snapshot capture.
 */

export class CameraManager {
  constructor(videoElement, onStateChange) {
    this.videoEl = videoElement;
    this.onStateChange = onStateChange; // (state, error?) => void
    this.stream = null;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this.ctx = this.canvas?.getContext ? this.canvas.getContext('2d') : null;
    this._stopped = false;
  }

  /** Attach or re-attach a video element dynamically. */
  attachVideoElement(videoElement) {
    this.videoEl = videoElement;
    if (this.videoEl && this.stream && this.stream.active) {
      this.videoEl.srcObject = this.stream;
      this.videoEl.play().catch((err) => {
        console.warn('[CameraManager] video.play() error during attach:', err.message);
      });
      console.log('[CameraManager Diagnostic] Attached active stream to video element.');
    }
  }

  /** Start the webcam stream. */
  async start(constraints = {}) {
    if (this._stopped) return;
    this._stopped = false;
    const defaultConstraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
    };
    const merged = { ...defaultConstraints, ...constraints };

    try {
      console.log('[CameraManager Diagnostic] Requesting getUserMedia...');
      this.onStateChange('requesting');
      const stream = await navigator.mediaDevices.getUserMedia(merged);
      if (this._stopped) {
        stream.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* noop */ }
        });
        return;
      }
      this.stream = stream;
      const videoTracks = stream.getVideoTracks();
      console.log(`[CameraManager Diagnostic] Stream acquired with ${videoTracks.length} video track(s).`);

      if (this.videoEl) {
        this.videoEl.srcObject = stream;
        try {
          await this.videoEl.play();
          console.log('[CameraManager Diagnostic] video.play() started successfully.');
        } catch (playErr) {
          if (this._stopped) {
            this.stop();
            return;
          }
          console.warn('[CameraManager Diagnostic] video.play() warning:', playErr.message);
        }
      }
      this.onStateChange('active');
    } catch (err) {
      if (!this._stopped) {
        const errName = err?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          console.warn('[CameraManager Diagnostic] Camera permission denied by user or OS.');
          this.onStateChange('permission_denied', err.message);
        } else if (
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError' ||
          errName === 'NotReadableError' ||
          errName === 'TrackStartError'
        ) {
          console.warn('[CameraManager Diagnostic] Camera hardware unavailable or in use:', err.message);
          this.onStateChange('camera_unavailable', err.message);
        } else {
          console.warn('[CameraManager Diagnostic] Camera startup failed:', err.message);
          this.onStateChange('error', err.message);
        }
      }
      throw err;
    }
  }

  /** Stop all tracks and release the camera idempotently. */
  stop() {
    this._stopped = true;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* noop */ }
      });
      this.stream = null;
    }
    if (this.videoEl) {
      if (this.videoEl.srcObject) {
        try {
          const s = this.videoEl.srcObject;
          if (typeof s.getTracks === 'function') {
            s.getTracks().forEach((t) => {
              try { t.stop(); } catch { /* noop */ }
            });
          }
        } catch { /* noop */ }
      }
      this.videoEl.srcObject = null;
    }
    this.onStateChange('stopped');
  }

  /**
   * Capture a JPEG snapshot from the current video frame.
   * Returns an object: { blob, width, height, sha256 }
   * Returns null if the camera is not active.
   */
  async captureSnapshot(quality = 0.82, offscreenCanvas = null) {
    if (!this.stream && !offscreenCanvas) return null;
    const source = offscreenCanvas || this.videoEl;
    if (!source) return null;

    const w = source.videoWidth || source.width;
    const h = source.videoHeight || source.height;
    if (!w || !h) return null;

    this.canvas.width = w;
    this.canvas.height = h;
    // Mirror the image to match user's perspective if capturing directly from live webcam video
    this.ctx.save();
    if (!offscreenCanvas) {
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.videoEl, -w, 0, w, h);
    } else {
      this.ctx.drawImage(offscreenCanvas, 0, 0, w, h);
    }
    this.ctx.restore();

    return new Promise((resolve) => {
      this.canvas.toBlob(
        async (blob) => {
          if (!blob) { resolve(null); return; }
          // Compute SHA-256
          const buf = await blob.arrayBuffer();
          const hashBuf = await crypto.subtle.digest('SHA-256', buf);
          const sha256 = Array.from(new Uint8Array(hashBuf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          resolve({ blob, width: w, height: h, sha256, size: blob.size });
        },
        'image/jpeg',
        quality
      );
    });
  }

  get isActive() {
    return !!this.stream && this.stream.active;
  }

  /** Draw the current frame to a canvas and return ImageData for ML models. */
  getImageData() {
    if (!this.videoEl || !this.videoEl.videoWidth) return null;
    const w = this.videoEl.videoWidth;
    const h = this.videoEl.videoHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(this.videoEl, 0, 0, w, h);
    return this.ctx.getImageData(0, 0, w, h);
  }
}
