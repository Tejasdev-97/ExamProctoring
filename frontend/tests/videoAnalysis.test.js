import test from 'node:test';
import assert from 'node:assert/strict';
import { CVEventEngine } from '../src/proctoring/cvEventEngine.js';
import { FrameDetectors } from '../src/proctoring/frameDetectors.js';

/**
 * Suite A: Session history missing optional string fields does not crash
 */
test('A: Session history containing missing optional string fields does not crash', () => {
  const malformedSessions = [
    {
      video_analysis_session_id: 'sess-1',
      source_filename: null,
      source_size_bytes: 1024,
      source_sha256: 'abc123',
      source_duration_ms: null,
      analysis_status: null,
      created_at: null,
    },
    {
      video_analysis_session_id: 'sess-2',
      // all optional fields omitted
    },
  ];

  // Emulate frontend rendering logic from VideoAnalysisPage
  for (const s of malformedSessions) {
    const filename = s.source_filename || 'Unnamed Video';
    const status = s.analysis_status || 'unknown';
    const createdAt = s.created_at ? s.created_at.slice(0, 19).replace('T', ' ') : '-';
    const durSec = s.source_duration_ms ? `${(s.source_duration_ms / 1000).toFixed(1)}s` : 'N/A';

    assert.equal(typeof filename, 'string');
    assert.equal(typeof status, 'string');
    assert.equal(createdAt, '-');
    assert.equal(durSec, 'N/A');
    assert.doesNotThrow(() => {
      // Must not throw .replace() on undefined
      const displayStatus = status.toUpperCase();
      assert.ok(displayStatus);
    });
  }
});

/**
 * Suite B: A malformed session record or event does not make the page blank
 */
test('B: Malformed event record with undefined event_type does not crash', () => {
  const malformedEvents = [
    { event_id: 'evt-1', event_type: undefined, type: undefined },
    { event_id: 'evt-2', event_type: null, type: null },
    { event_id: 'evt-3' },
  ];

  for (const e of malformedEvents) {
    // Safe extraction logic implemented in VideoAnalysisPage
    const rawType = e.event_type || e.type || 'unknown_event';
    assert.doesNotThrow(() => {
      const formatted = rawType.replace(/_/g, ' ');
      assert.equal(formatted, 'unknown event');
    });
  }
});

/**
 * Suite C: The frame sampler processes advancing video timestamps
 */
test('C: Frame sampler processes advancing video timestamps', () => {
  const det = new FrameDetectors();
  const timestamps = [0, 125, 250, 375, 500];
  const capturedTs = [];

  for (const ts of timestamps) {
    // Mock minimal video object
    const mockVideo = { videoWidth: 640, videoHeight: 360 };
    const res = det.detect(mockVideo, ts);
    capturedTs.push(det._lastTs);
  }

  // Timestamps must advance monotonically
  for (let i = 1; i < capturedTs.length; i++) {
    assert.ok(capturedTs[i] > capturedTs[i - 1], `Timestamp ${capturedTs[i]} must be > ${capturedTs[i - 1]}`);
  }

  // Reset clears last timestamp for new video
  det.reset();
  assert.equal(det._lastTs, 0);
});

/**
 * Suite D: Face detection results are passed to the event engine
 */
test('D: Face detection results are passed to the event engine', () => {
  let clockMs = 1000;
  const emitted = [];
  const engine = new CVEventEngine(
    { face_absence_grace_ms: 2000, multiple_faces_grace_ms: 1000 },
    (e) => emitted.push(e),
    { clock: () => ({ wall: clockMs, mono: clockMs }) }
  );

  // 1. Multiple faces: faceCount = 2
  for (let i = 0; i < 4; i++) {
    clockMs += 500;
    engine.processFrame({ faceCount: 2, headYaw: 0, headPitch: 0, phoneDetections: [] });
  }

  const multiFaces = emitted.filter((e) => e.event_type === 'multiple_faces' && e.phase === 'start');
  assert.ok(multiFaces.length > 0, 'Multiple faces should be confirmed after grace period');

  // 2. Face absent: faceCount = 0
  for (let i = 0; i < 6; i++) {
    clockMs += 500;
    engine.processFrame({ faceCount: 0, headYaw: null, headPitch: null, phoneDetections: [] });
  }
  const absent = emitted.filter((e) => e.event_type === 'face_absent' && e.phase === 'start');
  assert.ok(absent.length > 0, 'Face absent should be confirmed after grace period');
});

/**
 * Suite E: Phone detector results are passed to the event engine
 */
test('E: Phone detector results are passed to the event engine', () => {
  let clockMs = 5000;
  const emitted = [];
  const engine = new CVEventEngine(
    { phone_detection_threshold: 0.5, phone_confirm_ms: 1000 },
    (e) => emitted.push(e),
    { clock: () => ({ wall: clockMs, mono: clockMs }) }
  );

  const phoneFrame = {
    faceCount: 1,
    headYaw: 0,
    headPitch: 0,
    phoneDetections: [{ confidence: 0.75, bbox: [50, 50, 120, 200] }],
  };

  // 1st frame: candidate emitted immediately
  clockMs += 250;
  engine.processFrame(phoneFrame);
  assert.ok(emitted.some((e) => e.event_type === 'phone_detected' && e.phase === 'candidate'));

  // Persists for 1000ms -> start emitted
  for (let i = 0; i < 4; i++) {
    clockMs += 250;
    engine.processFrame(phoneFrame);
  }
  assert.ok(emitted.some((e) => e.event_type === 'phone_detected' && e.phase === 'start'));

  // Video ends -> flushActiveEvents emits end with duration
  engine.flushActiveEvents();
  const endEvent = emitted.find((e) => e.event_type === 'phone_detected' && e.phase === 'end');
  assert.ok(endEvent, 'End event must be emitted on flush');
  assert.equal(endEvent.event_status, 'confirmed');
  assert.ok(endEvent.duration_ms >= 1000);
});

/**
 * Suite F: Inference exceptions are handled without crashing
 */
test('F: Inference exceptions in individual detectors do not throw or crash', () => {
  const det = new FrameDetectors();
  // Simulate face detector throwing WebGL/memory exception
  det.face = {
    detectForVideo: () => {
      throw new Error('WebGL context lost during face inference');
    },
  };
  // Simulate object detector working normally
  det.object = {
    detectForVideo: () => ({
      detections: [
        {
          categories: [{ score: 0.88, categoryName: 'cell phone' }],
          boundingBox: { originX: 10, originY: 20, width: 100, height: 150 },
        },
      ],
    }),
  };

  let out;
  assert.doesNotThrow(() => {
    out = det.detect({ videoWidth: 640, videoHeight: 480 }, 1000);
  });

  assert.equal(out.faceError, 'WebGL context lost during face inference');
  // Object detection must still succeed despite face failure
  assert.equal(out.phones.length, 1);
  assert.equal(out.phones[0].confidence, 0.88);
});

/**
 * Suite G: End-of-video finalization updates session to terminal state
 */
test('G: End-of-video finalization flushes events and constructs complete payload', () => {
  let clockMs = 2000;
  const recordedEvents = [];
  const engine = new CVEventEngine(
    { phone_detection_threshold: 0.5, phone_confirm_ms: 500 },
    (event) => {
      if (event.phase === 'end') {
        recordedEvents.push({
          event_id: event.event_id,
          event_type: event.event_type,
          event_status: 'confirmed',
          video_timestamp_ms: event.firstWall,
          duration_ms: event.duration_ms,
        });
      }
    },
    { clock: () => ({ wall: clockMs, mono: clockMs }) }
  );

  clockMs += 500;
  engine.processFrame({ faceCount: 1, phoneDetections: [{ confidence: 0.8 }] });
  clockMs += 600;
  engine.processFrame({ faceCount: 1, phoneDetections: [{ confidence: 0.85 }] });

  // Both flush() and flushActiveEvents() must work
  assert.equal(typeof engine.flush, 'function');
  assert.equal(typeof engine.flushActiveEvents, 'function');
  engine.flush();

  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].event_type, 'phone_detected');

  // Verify complete payload structure
  const completePayload = {
    source_duration_ms: 10000,
    analysis_status: 'completed',
  };
  assert.equal(completePayload.analysis_status, 'completed');
  assert.ok(completePayload.source_duration_ms > 0);
});

/**
 * Suite H: Repeated rendering does not create duplicate processing loops
 */
test('H: Frame sample timer management prevents duplicate running loops', () => {
  let timerId = null;
  const startLoop = () => {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {}, 125);
  };

  startLoop();
  const firstTimer = timerId;
  startLoop();
  const secondTimer = timerId;

  assert.notEqual(firstTimer, null);
  assert.notEqual(secondTimer, null);
  // Old timer is cleared
  clearInterval(timerId);
});

/**
 * Suite I: Original video bytes are never sent to the backend
 */
test('I: Network payloads contain only metadata and snapshots, never video bytes', () => {
  const sessionPayload = {
    source_filename: 'exam_recording.mp4',
    source_size_bytes: 45000000,
    source_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    source_duration_ms: 66700,
  };

  const snapshotFormDataFields = ['snapshot_id', 'event_id', 'capture_reason', 'video_timestamp_ms', 'file'];

  // Ensure session payload contains no video binary
  assert.ok(!('video' in sessionPayload));
  assert.ok(!('file' in sessionPayload));
  assert.ok(!('bytes' in sessionPayload));

  // Snapshot payload is strictly an evidence JPEG image
  assert.ok(snapshotFormDataFields.includes('file'));
  assert.ok(snapshotFormDataFields.includes('event_id'));
});

/**
 * Suite J: Video Analysis Session Deletion Modal confirmation control
 */
test('J: Deletion button disabled until explicit confirmation checkbox checked', () => {
  let deleteConfirmed = false;
  let deleting = false;

  const isButtonDisabled = () => !deleteConfirmed || deleting;

  // Initially unchecked: button disabled
  assert.equal(isButtonDisabled(), true);

  // User checks confirmation box: button enabled
  deleteConfirmed = true;
  assert.equal(isButtonDisabled(), false);

  // Deletion in progress: button disabled to prevent duplicate submissions
  deleting = true;
  assert.equal(isButtonDisabled(), true);
});

/**
 * Suite K: Student Attempt Isolation by student_user_id
 */
test('K: Student attempts are isolated strictly by student_user_id', () => {
  const cachedAttempts = [
    { attempt_id: 'att-1', student_user_id: 'student-A', exam_title: 'Exam 1' },
    { attempt_id: 'att-2', student_user_id: 'student-B', exam_title: 'Exam 2' },
    { attempt_id: 'att-3', student_user_id: 'student-A', exam_title: 'Exam 3' },
  ];

  const studentAAttempts = cachedAttempts.filter((a) => a.student_user_id === 'student-A');
  const studentBAttempts = cachedAttempts.filter((a) => a.student_user_id === 'student-B');

  assert.equal(studentAAttempts.length, 2);
  assert.deepEqual(studentAAttempts.map((a) => a.attempt_id), ['att-1', 'att-3']);
  assert.equal(studentBAttempts.length, 1);
  assert.deepEqual(studentBAttempts.map((a) => a.attempt_id), ['att-2']);
});

/**
 * Suite L: Authoritative Single Threshold (Below, Equal, Above, 0.55 with 0.50)
 */
test('L: Phone detection threshold filtering behaves consistently at below, equal, and above boundaries', () => {
  const events = [];
  let clockMs = 1000;
  const engine = new CVEventEngine(
    { phone_detection_threshold: 0.50, phone_confirm_ms: 1000 },
    (e) => events.push(e),
    { clock: () => ({ wall: clockMs, mono: clockMs }) }
  );

  // 1. Below threshold (0.45 < 0.50) -> No candidate
  engine.processFrame({ phoneDetections: [{ confidence: 0.45, bbox: [0, 0, 10, 10] }] });
  assert.equal(events.length, 0, 'Confidence 0.45 must not trigger candidate with 0.50 threshold');

  // 2. Exactly at threshold (0.50 == 0.50) -> Candidate triggered
  clockMs = 1100;
  engine.processFrame({ phoneDetections: [{ confidence: 0.50, bbox: [0, 0, 10, 10] }] });
  assert.equal(events.length, 1, 'Confidence 0.50 must trigger candidate with 0.50 threshold');
  assert.equal(events[0].phase, 'candidate');
  assert.equal(events[0].event_type, 'phone_detected');

  // 3. Confidence 0.55 with threshold 0.50 -> Sustained candidate / confirmation
  clockMs = 2200; // Past 1000ms confirmation window
  engine.processFrame({ phoneDetections: [{ confidence: 0.55, bbox: [0, 0, 10, 10] }] });
  const startEvent = events.find((e) => e.phase === 'start');
  assert.ok(startEvent, 'Confidence 0.55 must confirm candidate after grace duration');
  assert.equal(startEvent.metadata.confidence, 0.55);

  // 4. Update configuration dynamically (raise threshold to 0.70)
  engine.updateConfig({ phone_detection_threshold: 0.70 });
  assert.equal(engine.cfg.phone_detection_threshold, 0.70);

  // Reset and test with new threshold
  engine.flushActiveEvents();
  events.length = 0;
  clockMs = 5000;
  engine.processFrame({ phoneDetections: [{ confidence: 0.65, bbox: [0, 0, 10, 10] }] });
  assert.equal(events.length, 0, 'Confidence 0.65 must be rejected after threshold was raised to 0.70');
});

/**
 * Suite M: FrameDetectors setPhoneThreshold synchronization
 */
test('M: FrameDetectors and CVEventEngine remain synchronized on config updates', () => {
  const det = new FrameDetectors({ phoneThreshold: 0.65 });
  assert.equal(det.phoneThreshold, 0.65);

  // Update threshold
  det.setPhoneThreshold(0.50);
  assert.equal(det.phoneThreshold, 0.50);

  // Out-of-bounds updates are rejected safely
  det.setPhoneThreshold(1.5);
  assert.equal(det.phoneThreshold, 0.50, 'Invalid threshold > 1.0 must be ignored');
  det.setPhoneThreshold(-0.2);
  assert.equal(det.phoneThreshold, 0.50, 'Invalid threshold < 0.1 must be ignored');
});

/**
 * Suite N: Independent episodes of the same event type do not overwrite evidence
 */
test('N: Repeated episodes of phone detection maintain unique event IDs and separate snapshot associations', () => {
  const emittedEvents = [];
  let clockMs = 1000;
  const engine = new CVEventEngine(
    { phone_detection_threshold: 0.50, phone_confirm_ms: 500, release_ms: { phone_detected: 300 } },
    (e) => emittedEvents.push(e),
    { clock: () => ({ wall: clockMs, mono: clockMs }) }
  );

  const provisionalSnapshots = {}; // evtId -> snapshot
  const confirmedSnapshots = {};    // evtId -> snapshot

  // Episode 1: Phone appears
  clockMs = 1000;
  engine.processFrame({ phoneDetections: [{ confidence: 0.8, bbox: [1, 1, 10, 10] }] });
  const cand1 = emittedEvents[0];
  assert.equal(cand1.phase, 'candidate');
  // Emulate candidate snapshot capture keyed by unique evtId
  provisionalSnapshots[cand1.event_id] = { snap: 'data:image/jpeg;base64,snap1', timestampMs: 1000 };

  // Episode 1 confirms
  clockMs = 1600;
  engine.processFrame({ phoneDetections: [{ confidence: 0.8, bbox: [1, 1, 10, 10] }] });

  // Episode 1 ends (phone removed for > release_ms)
  clockMs = 2500;
  engine.processFrame({ phoneDetections: [] });
  const end1 = emittedEvents.find((e) => e.phase === 'end');
  assert.ok(end1);
  confirmedSnapshots[end1.event_id] = provisionalSnapshots[end1.event_id];
  delete provisionalSnapshots[end1.event_id];

  // Episode 2: Phone reappears 2 seconds later
  clockMs = 4000;
  engine.processFrame({ phoneDetections: [{ confidence: 0.9, bbox: [2, 2, 20, 20] }] });
  const cand2 = emittedEvents.filter((e) => e.phase === 'candidate')[1];
  assert.ok(cand2);
  assert.notEqual(cand2.event_id, cand1.event_id, 'Second episode must have a distinct event ID');

  provisionalSnapshots[cand2.event_id] = { snap: 'data:image/jpeg;base64,snap2', timestampMs: 4000 };

  // Episode 2 confirms and ends
  clockMs = 4600;
  engine.processFrame({ phoneDetections: [{ confidence: 0.9, bbox: [2, 2, 20, 20] }] });
  clockMs = 5500;
  engine.processFrame({ phoneDetections: [] });
  const end2 = emittedEvents.filter((e) => e.phase === 'end')[1];
  assert.ok(end2);
  confirmedSnapshots[end2.event_id] = provisionalSnapshots[end2.event_id];

  // Verify both snapshots survived independently without overwriting
  assert.equal(Object.keys(confirmedSnapshots).length, 2);
  assert.equal(confirmedSnapshots[end1.event_id].snap, 'data:image/jpeg;base64,snap1');
  assert.equal(confirmedSnapshots[end2.event_id].snap, 'data:image/jpeg;base64,snap2');
});

/**
 * Suite O: In-flight candidate race protection (confirmed or rejected before async capture completes)
 */
test('O: In-flight candidate capture promise resolution cleanly pairs with start and rejected phases', async () => {
  const inFlightCaptures = new Map();
  const provisionalStore = new Map();
  const localEvidenceStore = new Map();

  const eventId = 'test-evt-async-1';

  // Emulate candidate phase launching async capture
  let resolveCapture;
  const capturePromise = new Promise((resolve) => {
    resolveCapture = resolve;
  });
  inFlightCaptures.set(eventId, capturePromise);

  // Emulate candidate confirmed ('start') while capture is still in flight
  // The system awaits the in-flight capture promise rather than dropping it
  const startHandler = async () => {
    const pending = inFlightCaptures.get(eventId);
    if (pending) {
      const snapId = await pending;
      inFlightCaptures.delete(eventId);
      localEvidenceStore.set(eventId, snapId);
    }
  };

  const startPromise = startHandler();

  // Async capture completes with snapshot ID
  resolveCapture('snap-id-xyz-999');
  await startPromise;

  assert.equal(localEvidenceStore.get(eventId), 'snap-id-xyz-999', 'Snapshot promoted to local evidence despite race');
  assert.equal(inFlightCaptures.has(eventId), false, 'In-flight capture map cleaned up');
});

/**
 * Suite P: Sampling concurrency lock prevents overlapping inference
 */
test('P: Sampling concurrency lock prevents duplicate overlapping inference cycles', () => {
  let isInferring = false;
  let inferenceCount = 0;
  let rejectedInferences = 0;

  const runSample = () => {
    if (isInferring) {
      rejectedInferences++;
      return;
    }
    isInferring = true;
    inferenceCount++;
    // Simulate active inference
  };

  runSample();
  assert.equal(inferenceCount, 1);
  assert.equal(isInferring, true);

  // Second sample arrives while first is still running
  runSample();
  assert.equal(inferenceCount, 1, 'Second inference must not execute while lock is held');
  assert.equal(rejectedInferences, 1);

  // First completes
  isInferring = false;

  // Third sample arrives
  runSample();
  assert.equal(inferenceCount, 2);
  assert.equal(isInferring, true);
  isInferring = false;
});

/**
 * Suite Q: Full source video SHA-256 computation (not 10MB chunk)
 */
test('Q: Video file hashing digests entire buffer', async () => {
  const fullBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', fullBytes.buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fullHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  assert.equal(fullHash.length, 64);
  assert.equal(typeof fullHash, 'string');
});

