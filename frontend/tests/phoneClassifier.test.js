import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import * as ort from 'onnxruntime-web';
import {
  PhoneClassifier,
  PHONE_CLASSIFIER_CLASSES,
  DEFAULT_CLASSIFIER_CONFIDENCE_THRESHOLD,
  evaluatePhoneCandidate,
} from '../src/proctoring/phoneClassifier.js';
import { FrameDetectors } from '../src/proctoring/frameDetectors.js';

const MODEL_PATH = path.resolve('public/models/phone_classifier.onnx');

test('PhoneClassifier: self-contained ONNX asset exists and is non-empty', () => {
  assert.ok(fs.existsSync(MODEL_PATH), 'phone_classifier.onnx must exist in public/models');
  const stat = fs.statSync(MODEL_PATH);
  assert.ok(stat.size > 10 * 1024 * 1024, `Model size should be ~17MB, got ${stat.size} bytes`);
});

test('PhoneClassifier: loads session and runs inference with 4 output classes', async () => {
  const classifier = new PhoneClassifier({ modelUrl: MODEL_PATH });
  const status = await classifier.load();
  assert.equal(status, 'ready');
  assert.ok(classifier.ready);

  // Measure latency over 3 inference runs
  const latencies = [];
  for (let i = 0; i < 3; i++) {
    const dummyData = new Float32Array(3 * 224 * 224);
    const tensor = new ort.Tensor('float32', dummyData, [1, 3, 224, 224]);
    const start = performance.now();
    const res = await classifier.session.run({ input: tensor });
    const dur = performance.now() - start;
    latencies.push(dur);

    const logits = (res.output || Object.values(res)[0]).data;
    assert.equal(logits.length, 4, 'Output tensor must have 4 logits for the 4 classes');
  }

  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  console.log(`[Test] Average ONNX inference latency: ${avgLatency.toFixed(2)} ms`);
  assert.ok(avgLatency < 250, `Average latency (${avgLatency} ms) should be < 250ms`);

  classifier.close();
  assert.equal(classifier.status, 'idle');
});

test('PhoneClassifier: decision logic correctly discriminates real_phone, distractors, and uncertainty', async () => {
  const classifier = new PhoneClassifier({ confidenceThreshold: 0.65 });

  // Mock session output for 'real_phone' (class index 3)
  classifier.session = {
    run: async () => ({
      output: { data: new Float32Array([-1.0, -2.0, -1.5, 4.0]) }, // strong real_phone
    }),
  };
  classifier.status = 'ready';

  // Mock source canvas
  const mockSource = {
    width: 640,
    height: 480,
    videoWidth: 640,
    videoHeight: 480,
  };
  classifier._ctx = {
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(224 * 224 * 4) }),
  };

  const resPhone = await classifier.classifyCrop(mockSource, [10, 10, 100, 100]);
  assert.equal(resPhone.detectedClass, 'real_phone');
  assert.equal(resPhone.isPhone, true);
  assert.equal(resPhone.isDistractor, false);
  assert.ok(resPhone.confidence > 0.9);

  // Mock session output for 'calculator' (class index 0)
  classifier.session = {
    run: async () => ({
      output: { data: new Float32Array([4.5, -2.0, -1.0, -1.5]) }, // strong calculator
    }),
  };
  const resCalc = await classifier.classifyCrop(mockSource, [10, 10, 100, 100]);
  assert.equal(resCalc.detectedClass, 'calculator');
  assert.equal(resCalc.isPhone, false); // Suppressed!
  assert.equal(resCalc.isDistractor, true);

  // Mock session output for 'empty_case' (class index 2)
  classifier.session = {
    run: async () => ({
      output: { data: new Float32Array([-1.0, -1.0, 4.2, -1.5]) }, // strong empty_case
    }),
  };
  const resCase = await classifier.classifyCrop(mockSource, [10, 10, 100, 100]);
  assert.equal(resCase.detectedClass, 'empty_case');
  assert.equal(resCase.isPhone, false); // Suppressed!
  assert.equal(resCase.isDistractor, true);

  // Mock session output for 'cardboard_cutout' (class index 1)
  classifier.session = {
    run: async () => ({
      output: { data: new Float32Array([-1.0, 4.8, -1.0, -1.5]) }, // strong cardboard_cutout
    }),
  };
  const resCutout = await classifier.classifyCrop(mockSource, [10, 10, 100, 100]);
  assert.equal(resCutout.detectedClass, 'cardboard_cutout');
  assert.equal(resCutout.isPhone, false); // Suppressed!
  assert.equal(resCutout.isDistractor, true);

  // Mock session output for uncertain prediction (all logits close to zero)
  classifier.session = {
    run: async () => ({
      output: { data: new Float32Array([0.1, 0.05, 0.15, 0.12]) }, // max prob ~ 0.27 (< 0.65 threshold)
    }),
  };
  const resUncertain = await classifier.classifyCrop(mockSource, [10, 10, 100, 100]);
  assert.equal(resUncertain.isUncertain, true);
  assert.equal(resUncertain.predictedClass, 'uncertain');
  assert.equal(resUncertain.isPhone, true); // Conservative retention: NOT rejected solely due to uncertainty
  assert.equal(resUncertain.isDistractor, false);

  classifier.close();
});

test('FrameDetectors: suppresses distractor candidate from phones array', async () => {
  const det = new FrameDetectors({ phoneThreshold: 0.65 });
  // Mock object detector producing 2 candidates: a real phone and a calculator
  det.object = {
    detectForVideo: () => ({
      detections: [
        {
          categories: [{ score: 0.85, categoryName: 'cell phone' }],
          boundingBox: { originX: 10, originY: 10, width: 80, height: 120 },
        },
        {
          categories: [{ score: 0.78, categoryName: 'cell phone' }],
          boundingBox: { originX: 200, originY: 150, width: 90, height: 110 },
        },
      ],
    }),
  };

  // Mock classifier to classify first as real_phone and second as calculator
  let callCount = 0;
  det.classifier = {
    ready: true,
    status: 'ready',
    classifyCrop: async (src, bbox) => {
      callCount++;
      if (bbox[0] === 10) {
        return {
          detectedClass: 'real_phone',
          confidence: 0.95,
          isPhone: true,
          isDistractor: false,
          isUncertain: false,
          probabilities: { calculator: 0.01, cardboard_cutout: 0.01, empty_case: 0.03, real_phone: 0.95 },
        };
      } else {
        return {
          detectedClass: 'calculator',
          confidence: 0.92,
          isPhone: false,
          isDistractor: true,
          isUncertain: false,
          probabilities: { calculator: 0.92, cardboard_cutout: 0.02, empty_case: 0.04, real_phone: 0.02 },
        };
      }
    },
  };

  const out = await det.detect({ videoWidth: 640, videoHeight: 480 }, 1000);

  assert.equal(callCount, 2, 'Classifier must be called for each candidate');
  assert.equal(out.phoneCandidates.length, 2, 'Both raw detections remain in phoneCandidates');
  assert.equal(out.phones.length, 1, 'Only the real_phone candidate is promoted to out.phones');
  assert.equal(out.phones[0].classifier.detectedClass, 'real_phone');
});

test('evaluatePhoneCandidate: class mapping index 3 is real_phone and classes array matches trained head', () => {
  assert.equal(PHONE_CLASSIFIER_CLASSES[0], 'calculator');
  assert.equal(PHONE_CLASSIFIER_CLASSES[1], 'cardboard_cutout');
  assert.equal(PHONE_CLASSIFIER_CLASSES[2], 'empty_case');
  assert.equal(PHONE_CLASSIFIER_CLASSES[3], 'real_phone');
});

test('evaluatePhoneCandidate: strong detector candidate (>=0.75) is not lost due to imperfect/uncertain classifier', () => {
  const res = evaluatePhoneCandidate({
    detectorConfidence: 0.82,
    classifierResult: {
      status: 'ready',
      detectedClass: 'empty_case',
      confidence: 0.60,
      probabilities: { calculator: 0.15, cardboard_cutout: 0.10, empty_case: 0.60, real_phone: 0.15 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(res.isRetained, true, 'Strong detector candidate must be retained');
  assert.equal(res.isUncertain, true, 'Should be marked uncertain for temporal verification');
  assert.equal(res.decisionReason, 'retained_strong_detector_uncertain_classifier');
});

test('evaluatePhoneCandidate: confident calculator classification suppresses phone events', () => {
  const res = evaluatePhoneCandidate({
    detectorConfidence: 0.70,
    classifierResult: {
      status: 'ready',
      detectedClass: 'calculator',
      confidence: 0.94,
      probabilities: { calculator: 0.94, cardboard_cutout: 0.02, empty_case: 0.02, real_phone: 0.02 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(res.isRetained, false, 'Confident calculator must be suppressed');
  assert.equal(res.isDistractor, true);
  assert.equal(res.decisionReason, 'rejected_confident_distractor_calculator');
});

test('evaluatePhoneCandidate: empty case and cardboard cutout follow suppression policy', () => {
  const resCase = evaluatePhoneCandidate({
    detectorConfidence: 0.68,
    classifierResult: {
      status: 'ready',
      detectedClass: 'empty_case',
      confidence: 0.88,
      probabilities: { calculator: 0.02, cardboard_cutout: 0.04, empty_case: 0.88, real_phone: 0.06 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(resCase.isRetained, false);
  assert.equal(resCase.isDistractor, true);
  assert.equal(resCase.decisionReason, 'rejected_confident_distractor_empty_case');

  const resCutout = evaluatePhoneCandidate({
    detectorConfidence: 0.72,
    classifierResult: {
      status: 'ready',
      detectedClass: 'cardboard_cutout',
      confidence: 0.91,
      probabilities: { calculator: 0.03, cardboard_cutout: 0.91, empty_case: 0.04, real_phone: 0.02 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(resCutout.isRetained, false);
  assert.equal(resCutout.isDistractor, true);
  assert.equal(resCutout.decisionReason, 'rejected_confident_distractor_cardboard_cutout');
});

test('evaluatePhoneCandidate: modest detector score (0.45) promoted when classifier confirms real_phone', () => {
  const res = evaluatePhoneCandidate({
    detectorConfidence: 0.45,
    classifierResult: {
      status: 'ready',
      detectedClass: 'real_phone',
      confidence: 0.85,
      probabilities: { calculator: 0.05, cardboard_cutout: 0.05, empty_case: 0.05, real_phone: 0.85 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(res.isRetained, true, 'Confirmed real_phone must be retained');
  assert.ok(res.calibratedConfidence >= 0.65, 'Calibrated confidence must meet phone threshold');
  assert.equal(res.decisionReason, 'retained_confirmed_real_phone');
  assert.equal(res.isUncertain, false);
});

test('evaluatePhoneCandidate: weak detector score with uncertain classifier is rejected', () => {
  const res = evaluatePhoneCandidate({
    detectorConfidence: 0.45,
    classifierResult: {
      status: 'ready',
      detectedClass: 'uncertain',
      confidence: 0.35,
      probabilities: { calculator: 0.25, cardboard_cutout: 0.20, empty_case: 0.35, real_phone: 0.20 },
    },
    phoneThreshold: 0.65,
  });
  assert.equal(res.isRetained, false, 'Uncertain candidate with weak detector score must be rejected');
  assert.equal(res.decisionReason, 'rejected_uncertain_low_detector_confidence');
});

test('evaluatePhoneCandidate: fallback policy handles unavailable classifier explicitly', () => {
  const resAbove = evaluatePhoneCandidate({
    detectorConfidence: 0.70,
    classifierResult: null, // classifier unavailable
    phoneThreshold: 0.65,
  });
  assert.equal(resAbove.isRetained, true);
  assert.equal(resAbove.classifierAvailable, false);
  assert.equal(resAbove.decisionReason, 'fallback_detector_retained');

  const resBelow = evaluatePhoneCandidate({
    detectorConfidence: 0.55,
    classifierResult: { status: 'unavailable', error: 'Init failed' },
    phoneThreshold: 0.65,
  });
  assert.equal(resBelow.isRetained, false);
  assert.equal(resBelow.classifierAvailable, false);
  assert.equal(resBelow.decisionReason, 'fallback_detector_low_confidence');
});
