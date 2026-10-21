/**
 * ExamProctor.ai — Shared frame detectors (live webcam AND uploaded video).
 *
 * Uses MediaPipe Tasks Vision with model files served locally from
 * /models (so inference works offline once the files are cached):
 *   - face_landmarker.task        (Apache-2.0, Google MediaPipe)
 *   - efficientdet_lite0.tflite   (Apache-2.0, Google MediaPipe; COCO classes,
 *                                  includes "cell phone")
 *   - phone_classifier.onnx       (MobileNetV3-Large 4-class second-stage classifier)
 * WASM runtime is served from /mediapipe/wasm and /onnx.
 *
 * Nothing here simulates detections. If a model fails to load, the status
 * object reports it honestly and the corresponding signal is `null`.
 */

import { FilesetResolver, FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision';
import {
  PhoneClassifier,
  DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD,
  evaluatePhoneCandidate,
  logPhoneDiagnostic,
} from './phoneClassifier.js';

const BASE = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/';
export const MODEL_URLS = {
  face: `${BASE}models/face_landmarker.task`,
  object: `${BASE}models/efficientdet_lite0.tflite`,
  classifier: `${BASE}models/phone_classifier.onnx`,
  wasm: `${BASE}mediapipe/wasm`,
  onnxWasm: `${BASE}onnx/`,
  onnxWasmFile: `${BASE}onnx/ort-wasm-simd-threaded.jsep.wasm`,
};

/** Convert a 4x4 column-major MediaPipe matrix to yaw/pitch degrees. */
export function matrixToYawPitch(m) {
  // Rotation matrix elements (column-major): r[row][col] = m[col*4+row]
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r21 = m[6], r22 = m[10];
  const pitch = Math.atan2(-r21, r22) * (180 / Math.PI);
  const yaw = Math.atan2(r20, Math.hypot(r00, r10)) * (180 / Math.PI);
  return { yaw, pitch };
}

export class FrameDetectors {
  constructor({
    phoneThreshold = 0.65,
    calibrationFrames = 8,
    classifierThreshold = DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD,
    enableClassifier = true,
  } = {}) {
    this.phoneThreshold = (typeof phoneThreshold === 'number' && !isNaN(phoneThreshold) && phoneThreshold >= 0.1 && phoneThreshold <= 1.0)
      ? phoneThreshold
      : 0.65;
    this.calibrationFrames = calibrationFrames;
    this.classifierThreshold = (typeof classifierThreshold === 'number' && !isNaN(classifierThreshold) && classifierThreshold >= 0.1 && classifierThreshold <= 1.0)
      ? classifierThreshold
      : DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD;
    this.face = null;
    this.object = null;
    this.classifier = enableClassifier ? new PhoneClassifier({ confidenceThreshold: this.classifierThreshold }) : null;
    this.status = { face: 'idle', object: 'idle', classifier: enableClassifier ? 'idle' : 'disabled', error: null };
    this._calib = [];
    this.baseline = null; // {yaw, pitch}
    this._lastTs = 0;
  }

  setPhoneThreshold(threshold) {
    if (typeof threshold === 'number' && !isNaN(threshold) && threshold >= 0.1 && threshold <= 1.0) {
      this.phoneThreshold = threshold;
    }
  }

  setClassifierThreshold(threshold) {
    if (typeof threshold === 'number' && !isNaN(threshold) && threshold >= 0.1 && threshold <= 1.0) {
      this.classifierThreshold = threshold;
      if (this.classifier) {
        this.classifier.setConfidenceThreshold(threshold);
      }
    }
  }

  async load() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(MODEL_URLS.wasm);
      try {
        this.face = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URLS.face },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFacialTransformationMatrixes: true,
        });
        this.status.face = 'ready';
      } catch (e) {
        this.status.face = 'unavailable';
        this.status.error = `face: ${e.message}`;
      }
      try {
        this.object = await ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URLS.object },
          runningMode: 'VIDEO',
          scoreThreshold: 0.3,
          maxResults: 8,
          categoryAllowlist: ['cell phone'],
        });
        this.status.object = 'ready';
      } catch (e) {
        this.status.object = 'unavailable';
        this.status.error = `${this.status.error || ''} object: ${e.message}`.trim();
      }
    } catch (e) {
      this.status = { face: 'unavailable', object: 'unavailable', classifier: this.status.classifier, error: e.message };
    }

    if (this.classifier) {
      try {
        const classStatus = await this.classifier.load();
        this.status.classifier = classStatus;
      } catch (e) {
        this.status.classifier = 'unavailable';
        this.status.error = `${this.status.error || ''} classifier: ${e.message}`.trim();
      }
    }

    return this.status;
  }

  get ready() {
    return this.status.face === 'ready' || this.status.object === 'ready';
  }

  reset() {
    this._lastTs = 0;
    this.resetCalibration();
  }

  resetCalibration() {
    this._calib = [];
    this.baseline = null;
  }

  /**
   * Synchronous face & object detection.
   * @private
   */
  _detectSync(video, timestampMs) {
    const ts = Math.max(timestampMs, this._lastTs + 1);
    this._lastTs = ts;

    const out = {
      faceCount: null,
      yaw: null,
      pitch: null,
      faceBoxes: [],
      phones: [],
      phoneCandidates: [],
      hasLandmarks: false,
      calibrated: !!this.baseline,
      error: null,
    };

    if (!video || !video.videoWidth || !video.videoHeight) {
      return out;
    }

    if (this.face) {
      try {
        const res = this.face.detectForVideo(video, ts);
        const faces = res.faceLandmarks || [];
        out.faceCount = faces.length;
        out.hasLandmarks = faces.length > 0;
        out.faceBoxes = faces.map((lm) => {
          let minX = 1, minY = 1, maxX = 0, maxY = 0;
          for (const p of lm) {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
          }
          return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }; // normalised 0..1
        });
        const mats = res.facialTransformationMatrixes || [];
        if (faces.length === 1 && mats[0]?.data) {
          const { yaw, pitch } = matrixToYawPitch(mats[0].data);
          if (!this.baseline) {
            this._calib.push({ yaw, pitch });
            if (this._calib.length >= this.calibrationFrames) {
              const n = this._calib.length;
              this.baseline = {
                yaw: this._calib.reduce((s, c) => s + c.yaw, 0) / n,
                pitch: this._calib.reduce((s, c) => s + c.pitch, 0) / n,
              };
            }
          } else {
            out.yaw = yaw - this.baseline.yaw;
            out.pitch = pitch - this.baseline.pitch;
          }
        }
      } catch (err) {
        out.faceError = err.message;
      }
    }

    if (this.object) {
      try {
        const res = this.object.detectForVideo(video, ts);
        const w = video.videoWidth || 1, h = video.videoHeight || 1;
        const raw = (res.detections || []).map((d) => {
          const cat = d.categories?.find((c) => c.categoryName === 'cell phone') || d.categories?.[0];
          const score = cat?.score ?? 0;
          const box = d.boundingBox || { originX: 0, originY: 0, width: 0, height: 0 };
          return {
            categoryName: cat?.categoryName || 'cell phone',
            confidence: score,
            detectorConfidence: score,
            bbox: [box.originX, box.originY, box.width, box.height],
            bboxNorm: { x: box.originX / w, y: box.originY / h, w: box.width / w, h: box.height / h },
          };
        });
        out.phoneCandidates = raw;

        if (raw.length === 0) {
          logPhoneDiagnostic('A', { timestampMs: ts });
        } else {
          logPhoneDiagnostic('B', {
            count: raw.length,
            candidates: raw.map((c) => ({ confidence: c.confidence, bbox: c.bbox })),
          });
        }

        // If classifier is absent or unavailable, evaluate candidates using fallback policy
        if (!this.classifier || this.classifier.status !== 'ready') {
          if (raw.length > 0) {
            logPhoneDiagnostic('D', { status: this.classifier?.status || 'absent', ready: false });
          }
          out.phones = raw
            .map((cand, i) => {
              const dec = evaluatePhoneCandidate({
                detectorConfidence: cand.confidence,
                classifierResult: null,
                phoneThreshold: this.phoneThreshold,
                classifierThreshold: this.classifierThreshold,
              });
              cand.decisionReason = dec.decisionReason;
              cand.calibratedConfidence = dec.calibratedConfidence;
              cand.isUncertain = dec.isUncertain;
              if (raw.length > 0) {
                logPhoneDiagnostic('F', { candidateIndex: i, ...dec });
              }
              return dec.isRetained ? { ...cand, confidence: dec.calibratedConfidence } : null;
            })
            .filter(Boolean);
        }
      } catch (err) {
        out.objectError = err.message;
      }
    }
    out.calibrated = !!this.baseline;
    return out;
  }

  /**
   * Run second-stage MobileNetV3-Large classification on candidate crops
   * with calibrated joint decision policy.
   * @private
   */
  async _classifyCandidates(video, out) {
    if (!out.phoneCandidates?.length) {
      return out;
    }
    if (!this.classifier?.ready) {
      logPhoneDiagnostic('D', { status: this.classifier?.status || 'not_ready', ready: false });
      return out;
    }
    logPhoneDiagnostic('D', { status: this.classifier.status, ready: true });

    try {
      const retained = [];
      for (let i = 0; i < out.phoneCandidates.length; i++) {
        const cand = out.phoneCandidates[i];

        // Crop diagnostic (Stage C)
        const [origX, origY, boxW, boxH] = cand.bbox || [];
        logPhoneDiagnostic('C', {
          candidateIndex: i,
          bbox: cand.bbox,
          validCrop: (boxW || 0) > 0 && (boxH || 0) > 0,
        });

        const classification = await this.classifier.classifyCrop(video, cand.bbox);
        cand.classifier = classification;

        // Classifier prediction diagnostic (Stage E)
        logPhoneDiagnostic('E', {
          candidateIndex: i,
          predictedClass: classification.predictedClass,
          detectedClass: classification.detectedClass,
          confidence: classification.confidence,
          probabilities: classification.probabilities,
        });

        // Calibrated Decision Policy (Stage F)
        const decision = evaluatePhoneCandidate({
          detectorConfidence: cand.detectorConfidence ?? cand.confidence,
          classifierResult: classification,
          phoneThreshold: this.phoneThreshold,
          classifierThreshold: this.classifierThreshold,
        });

        cand.decisionReason = decision.decisionReason;
        cand.calibratedConfidence = decision.calibratedConfidence;
        cand.isUncertain = decision.isUncertain;

        logPhoneDiagnostic('F', {
          candidateIndex: i,
          ...decision,
        });

        if (decision.isRetained) {
          retained.push({
            ...cand,
            confidence: decision.calibratedConfidence,
          });
        }
      }
      out.phones = retained;
    } catch (err) {
      console.warn('[FrameDetectors] Candidate classification error:', err?.message);
    }
    return out;
  }

  /**
   * Analyse one video frame.
   * Synchronous when classifier is absent/idle; returns a dual Promise/Object when classifier runs.
   * @returns {Promise<object>|object}
   */
  detect(video, timestampMs = performance.now()) {
    const out = this._detectSync(video, timestampMs);
    if (!this.classifier || this.classifier.status !== 'ready' || !out.phoneCandidates?.length) {
      return out;
    }
    const promise = this._classifyCandidates(video, out);
    return Object.assign(promise, out);
  }

  close() {
    try { this.face?.close(); } catch { /* noop */ }
    try { this.object?.close(); } catch { /* noop */ }
    try { this.classifier?.close(); } catch { /* noop */ }
    this.face = null;
    this.object = null;
    this.classifier = null;
  }
}
