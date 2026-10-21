/**
 * ExamProctor.ai — MobileNetV3-Large Second-Stage Phone Classifier
 *
 * Runs locally in-browser via onnxruntime-web WebAssembly runtime.
 * Serves model and WASM binaries 100% locally from project assets (/models, /onnx).
 *
 * Categories (trained four-class head):
 *   0: 'calculator'
 *   1: 'cardboard_cutout'
 *   2: 'empty_case'
 *   3: 'real_phone'
 *
 * Input Preprocessing:
 *   - Resolution: 224 x 224 (RGB)
 *   - ImageNet Mean: [0.485, 0.456, 0.406]
 *   - ImageNet Std:  [0.229, 0.224, 0.225]
 *   - Channel layout: NCHW [1, 3, 224, 224] float32
 */

import * as ort from 'onnxruntime-web';

const BASE = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/';

export const PHONE_CLASSIFIER_MODEL_URL = `${BASE}models/phone_classifier.onnx`;
export const PHONE_CLASSIFIER_WASM_PATH = `${BASE}onnx/`;
export const PHONE_CLASSIFIER_WASM_FILE = `${BASE}onnx/ort-wasm-simd-threaded.jsep.wasm`;

export const PHONE_CLASSIFIER_CLASSES = [
  'calculator',
  'cardboard_cutout',
  'empty_case',
  'real_phone',
];

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const INPUT_SIZE = 224;

export const DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD = 0.65;

export class PhoneClassifier {
  constructor({
    modelUrl = PHONE_CLASSIFIER_MODEL_URL,
    confidenceThreshold = DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD,
  } = {}) {
    this.modelUrl = modelUrl;
    this.confidenceThreshold = (typeof confidenceThreshold === 'number' && !isNaN(confidenceThreshold) && confidenceThreshold >= 0.1 && confidenceThreshold <= 1.0)
      ? confidenceThreshold
      : DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD;
    this.session = null;
    this.status = 'idle'; // idle | loading | ready | unavailable
    this.error = null;
    this._canvas = null;
    this._ctx = null;
  }

  setConfidenceThreshold(threshold) {
    if (typeof threshold === 'number' && !isNaN(threshold) && threshold >= 0.1 && threshold <= 1.0) {
      this.confidenceThreshold = threshold;
    }
  }

  /**
   * Load the ONNX model once on startup.
   */
  async load() {
    if (this.status === 'ready' && this.session) {
      return this.status;
    }
    try {
      this.status = 'loading';
      // Configure local WASM paths in browser to guarantee offline operation without CDN hits.
      // Must be configured as an object with the .wasm binary URL (Env.WasmFilePaths), NOT a string prefix.
      // When configured as a string prefix, ONNX Runtime Web attempts dynamic import() of the .mjs wrapper,
      // which fails in Vite because /public assets are served as runtime resources, not JS modules.
      if (typeof window !== 'undefined' && ort?.env?.wasm) {
        ort.env.wasm.numThreads = 1; // Single-thread to ensure compatibility without cross-origin isolation
        ort.env.wasm.wasmPaths = {
          wasm: PHONE_CLASSIFIER_WASM_FILE,
        };
      }

      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      this.status = 'ready';
      this.error = null;
    } catch (err) {
      this.status = 'unavailable';
      this.error = err?.message || 'Failed to initialize ONNX classifier';
      this.session = null;
      console.warn('[PhoneClassifier] Failed to initialize ONNX classifier:', this.error);
    }
    return this.status;
  }

  get ready() {
    return this.status === 'ready' && this.session !== null;
  }

  /**
   * Classify a candidate crop from a video or canvas element.
   *
   * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
   * @param {number[]} bbox - [originX, originY, width, height]
   * @returns {Promise<{
   *   predictedClass: string,
   *   detectedClass: string,
   *   confidence: number,
   *   isPhone: boolean,
   *   isDistractor: boolean,
   *   isUncertain: boolean,
   *   probabilities: { calculator: number, cardboard_cutout: number, empty_case: number, real_phone: number }
   * }>}
   */
  async classifyCrop(source, bbox) {
    const defaultProbabilities = {
      calculator: 0.25,
      cardboard_cutout: 0.25,
      empty_case: 0.25,
      real_phone: 0.25,
    };

    if (!this.session || this.status !== 'ready') {
      return {
        predictedClass: 'uncertain',
        detectedClass: 'unknown',
        confidence: 0,
        isPhone: true, // Conservative fallback: do not discard when classifier is not ready
        isDistractor: false,
        isUncertain: true,
        probabilities: defaultProbabilities,
      };
    }

    if (!source) {
      return {
        predictedClass: 'uncertain',
        detectedClass: 'unknown',
        confidence: 0,
        isPhone: true,
        isDistractor: false,
        isUncertain: true,
        probabilities: defaultProbabilities,
      };
    }

    const sw = source.videoWidth || source.width || 0;
    const sh = source.videoHeight || source.height || 0;
    if (sw <= 0 || sh <= 0) {
      return {
        predictedClass: 'uncertain',
        detectedClass: 'unknown',
        confidence: 0,
        isPhone: true,
        isDistractor: false,
        isUncertain: true,
        probabilities: defaultProbabilities,
      };
    }

    // Bounds check crop coordinates
    const [origX, origY, boxW, boxH] = bbox || [0, 0, sw, sh];
    const sx = Math.max(0, Math.min(sw - 1, origX));
    const sy = Math.max(0, Math.min(sh - 1, origY));
    const cw = Math.max(1, Math.min(sw - sx, boxW));
    const ch = Math.max(1, Math.min(sh - sy, boxH));

    if (!this._canvas) {
      if (typeof document !== 'undefined') {
        this._canvas = document.createElement('canvas');
        this._canvas.width = INPUT_SIZE;
        this._canvas.height = INPUT_SIZE;
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
      }
    }

    if (!this._ctx) {
      return {
        predictedClass: 'uncertain',
        detectedClass: 'unknown',
        confidence: 0,
        isPhone: true,
        isDistractor: false,
        isUncertain: true,
        probabilities: defaultProbabilities,
      };
    }

    // Draw crop scaled to 224x224
    this._ctx.drawImage(source, sx, sy, cw, ch, 0, 0, INPUT_SIZE, INPUT_SIZE);
    const imgData = this._ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

    // Normalise to ImageNet float32 tensor (NCHW)
    const floatData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const planeSize = INPUT_SIZE * INPUT_SIZE;

    for (let i = 0; i < planeSize; i++) {
      const r = imgData[i * 4] / 255.0;
      const g = imgData[i * 4 + 1] / 255.0;
      const b = imgData[i * 4 + 2] / 255.0;
      floatData[i] = (r - MEAN[0]) / STD[0];
      floatData[planeSize + i] = (g - MEAN[1]) / STD[1];
      floatData[2 * planeSize + i] = (b - MEAN[2]) / STD[2];
    }

    try {
      const inputTensor = new ort.Tensor('float32', floatData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
      const results = await this.session.run({ input: inputTensor });
      const logits = (results.output || Object.values(results)[0]).data;

      // Numerically stable softmax
      let maxLogit = -Infinity;
      for (let i = 0; i < 4; i++) {
        if (logits[i] > maxLogit) maxLogit = logits[i];
      }
      let sumExp = 0;
      const exps = new Float32Array(4);
      for (let i = 0; i < 4; i++) {
        exps[i] = Math.exp(logits[i] - maxLogit);
        sumExp += exps[i];
      }

      const probs = {
        calculator: exps[0] / sumExp,
        cardboard_cutout: exps[1] / sumExp,
        empty_case: exps[2] / sumExp,
        real_phone: exps[3] / sumExp,
      };

      let topClass = 'calculator';
      let topConf = probs.calculator;
      for (const c of PHONE_CLASSIFIER_CLASSES) {
        if (probs[c] > topConf) {
          topClass = c;
          topConf = probs[c];
        }
      }

      const isDistractor = (topClass === 'calculator' || topClass === 'cardboard_cutout' || topClass === 'empty_case')
        && topConf >= this.confidenceThreshold;
      const isRealPhone = topClass === 'real_phone' && topConf >= this.confidenceThreshold;
      const isUncertain = !isDistractor && !isRealPhone;

      // Conservative rule: Do not reject candidate solely due to uncertainty.
      // Filter out ONLY when confidently classified as a distractor (calculator, empty_case, cardboard_cutout).
      const isPhone = !isDistractor;

      return {
        predictedClass: isUncertain ? 'uncertain' : topClass,
        detectedClass: topClass,
        confidence: topConf,
        isPhone,
        isDistractor,
        isUncertain,
        probabilities: probs,
        logits: Array.from(logits),
        status: 'ready',
      };
    } catch (inferenceErr) {
      console.warn('[PhoneClassifier] Inference error:', inferenceErr?.message);
      return {
        predictedClass: 'uncertain',
        detectedClass: 'unknown',
        confidence: 0,
        isPhone: true, // Conservative fallback on error
        isDistractor: false,
        isUncertain: true,
        probabilities: defaultProbabilities,
        status: 'error',
        error: inferenceErr?.message,
      };
    }
  }

  close() {
    try {
      this.session?.release?.();
    } catch {
      /* noop */
    }
    this.session = null;
    this.status = 'idle';
  }
}

/**
 * Minimal low-noise targeted diagnostic logger for phone detection pipeline.
 * Throttles repetitive idle frames and logs structured candidate details.
 */
let lastStageALogTs = 0;
export function logPhoneDiagnostic(stage, data = {}) {
  const isDebug = (typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    (typeof window !== 'undefined' && window.__EXAMPROCTOR_DEBUG__);
  if (!isDebug) return;

  const now = Date.now();
  if (stage === 'A') {
    if (now - lastStageALogTs < 10000) return; // rate limit idle logs to once every 10s
    lastStageALogTs = now;
  }

  const stageLabels = {
    A: 'A [No Detector Candidate]',
    B: 'B [Detector Candidate Produced]',
    C: 'C [Crop Generated]',
    D: 'D [Classifier Status]',
    E: 'E [Classifier Probabilities]',
    F: 'F [Candidate Decision]',
    G: 'G [Event Engine Confirmation]',
  };

  const label = stageLabels[stage] || `Stage ${stage}`;
  console.debug(`[PhoneDiagnostics] ${label}:`, {
    timestamp: new Date().toISOString(),
    ...data,
  });
}

/**
 * Calibrated Phone Candidate Decision Policy.
 *
 * Implements the joint evaluation of MediaPipe EfficientDet detector confidence
 * and MobileNetV3-Large classifier class probabilities:
 *
 * 1. Fallback when classifier is unavailable:
 *    Rely explicitly on EfficientDet threshold; do not pretend classifier ran.
 * 2. Confident Distractor Suppression:
 *    Suppress if classifier confidently identifies calculator, cardboard cutout, or empty case
 *    (prob >= 0.70 and real_phone < 0.25).
 *    Override exception: if detector confidence is exceptionally strong (>= 0.88), do not drop.
 * 3. Confident Real Phone Confirmation:
 *    If classifier predicts real_phone (prob >= 0.60 and detConf >= 0.35, or prob >= 0.50 and detConf >= 0.50),
 *    retain candidate with combined calibrated confidence.
 * 4. Strong Detector Candidate:
 *    If EfficientDet score >= 0.75, do not discard solely because classifier is noisy/uncertain.
 * 5. Uncertain Candidates with Low Detector Score:
 *    If detector is weak (< phoneThreshold) and classifier is uncertain, reject to avoid false alarms.
 */
export function evaluatePhoneCandidate({
  detectorConfidence = 0,
  classifierResult = null,
  phoneThreshold = 0.65,
  classifierThreshold = DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD,
} = {}) {
  // 1. Fallback when classifier is unavailable or errored
  if (!classifierResult || classifierResult.status === 'unavailable' || classifierResult.error) {
    const isRetained = detectorConfidence >= phoneThreshold;
    return {
      isRetained,
      calibratedConfidence: detectorConfidence,
      decisionReason: isRetained ? 'fallback_detector_retained' : 'fallback_detector_low_confidence',
      isPhone: isRetained,
      isDistractor: false,
      isUncertain: true,
      classifierAvailable: false,
    };
  }

  const probs = classifierResult.probabilities || {
    calculator: 0.25,
    cardboard_cutout: 0.25,
    empty_case: 0.25,
    real_phone: 0.25,
  };
  const topClass = classifierResult.detectedClass || 'uncertain';
  const topConf = classifierResult.confidence || 0;
  const pPhone = probs.real_phone ?? 0;
  const pCalc = probs.calculator ?? 0;
  const pCutout = probs.cardboard_cutout ?? 0;
  const pEmpty = probs.empty_case ?? 0;

  // 2. Confident Distractor Suppression
  const isStrongCalculator = topClass === 'calculator' && pCalc >= 0.70 && pPhone < 0.20;
  const isConfidentDistractor = (
    (topClass === 'calculator' || topClass === 'cardboard_cutout' || topClass === 'empty_case') &&
    topConf >= Math.max(0.68, classifierThreshold) &&
    pPhone < 0.25
  );

  if (isConfidentDistractor && (!isStrongCalculator ? detectorConfidence < 0.88 : pPhone < 0.15)) {
    return {
      isRetained: false,
      calibratedConfidence: detectorConfidence,
      decisionReason: `rejected_confident_distractor_${topClass}`,
      isPhone: false,
      isDistractor: true,
      isUncertain: false,
      classifierAvailable: true,
    };
  }

  // 3. Confident Real Phone Confirmation
  if ((pPhone >= 0.60 && detectorConfidence >= 0.35) || (topClass === 'real_phone' && pPhone >= 0.50 && detectorConfidence >= 0.50)) {
    const combined = Math.min(1.0, Math.max(detectorConfidence, detectorConfidence * 0.4 + pPhone * 0.6));
    const finalConf = Math.max(combined, phoneThreshold);
    return {
      isRetained: true,
      calibratedConfidence: Number(finalConf.toFixed(4)),
      decisionReason: 'retained_confirmed_real_phone',
      isPhone: true,
      isDistractor: false,
      isUncertain: false,
      classifierAvailable: true,
    };
  }

  // 4. Strong Detector Candidate with Classifier Disagreement/Uncertainty
  if (detectorConfidence >= 0.75) {
    return {
      isRetained: true,
      calibratedConfidence: detectorConfidence,
      decisionReason: 'retained_strong_detector_uncertain_classifier',
      isPhone: true,
      isDistractor: false,
      isUncertain: true,
      classifierAvailable: true,
    };
  }

  // 5. Uncertain classifier output with weak detector (< phoneThreshold)
  if (detectorConfidence < phoneThreshold) {
    return {
      isRetained: false,
      calibratedConfidence: detectorConfidence,
      decisionReason: 'rejected_uncertain_low_detector_confidence',
      isPhone: false,
      isDistractor: false,
      isUncertain: true,
      classifierAvailable: true,
    };
  }

  // 6. Retain when detector reaches threshold and classifier is ambiguous
  return {
    isRetained: true,
    calibratedConfidence: detectorConfidence,
    decisionReason: 'retained_detector_threshold_uncertain_classifier',
    isPhone: true,
    isDistractor: false,
    isUncertain: true,
    classifierAvailable: true,
  };
}
