import test from 'node:test';
import assert from 'node:assert/strict';
import { PassiveLivenessDetector } from '../src/proctoring/passiveLiveness.js';

test('passive liveness: reports unavailable when no landmarks provided', () => {
  const detector = new PassiveLivenessDetector();
  const res = detector.process(null, 1000);
  assert.equal(res.status, 'unavailable');
  assert.equal(res.confidence, 0);
});

test('passive liveness: reports inconclusive until minimum frames accumulated', () => {
  const detector = new PassiveLivenessDetector({ minFramesForDecision: 5 });
  const fakeLandmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  
  for (let i = 0; i < 4; i++) {
    const res = detector.process(fakeLandmarks, i * 100);
    assert.equal(res.status, 'inconclusive');
  }
});

test('passive liveness: detects natural micro-movement as live_supported', () => {
  const detector = new PassiveLivenessDetector({ minFramesForDecision: 5, minVarianceThreshold: 0.0001 });
  
  for (let i = 0; i < 6; i++) {
    // Add micro jitter simulating natural human physiological tremor
    const jitter = (i % 2 === 0 ? 0.005 : -0.005) * (i + 1);
    const landmarks = [
      ...Array(4).fill(null),
      { x: 0.5 + jitter, y: 0.5 + jitter }, // index 4: nose
      ...Array(154).fill(null),
      { x: 0.4 + jitter, y: 0.4 },          // index 159: left eye
      ...Array(226).fill(null),
      { x: 0.6 + jitter, y: 0.4 },          // index 386: right eye
      ...Array(200).fill(null),
    ];
    landmarks[13] = { x: 0.5, y: 0.6 + jitter }; // index 13: mouth
    
    const res = detector.process(landmarks, i * 100);
    if (i >= 5) {
      assert.equal(res.status, 'live_supported');
      assert.ok(res.confidence >= 0.7);
    }
  }

  const summary = detector.getSummary();
  assert.ok(summary.liveSupported >= 1);
});
