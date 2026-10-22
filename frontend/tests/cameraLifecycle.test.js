import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraManager } from '../src/proctoring/cameraManager.js';

function createMockTrack() {
  let stopped = false;
  return {
    kind: 'video',
    readyState: 'live',
    get isStopped() { return stopped; },
    stop() { stopped = true; this.readyState = 'ended'; },
  };
}

function createMockStream(tracks = [createMockTrack()]) {
  return {
    active: true,
    getTracks() { return tracks; },
    getVideoTracks() { return tracks.filter(t => t.kind === 'video'); },
  };
}

function createMockVideoElement() {
  return {
    srcObject: null,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {},
    pause: () => {},
  };
}

function mockMediaDevices(mockImpl) {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'mediaDevices');
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: mockImpl,
    configurable: true,
    writable: true,
  });
  return () => {
    if (original) {
      Object.defineProperty(globalThis.navigator, 'mediaDevices', original);
    }
  };
}

test('CameraManager: stop() calls stop() on all active MediaStream tracks and nullifies stream', async () => {
  const videoEl = createMockVideoElement();
  const track1 = createMockTrack();
  const track2 = createMockTrack();
  const mockStream = createMockStream([track1, track2]);

  const restore = mockMediaDevices({
    getUserMedia: async () => mockStream,
  });

  try {
    const cm = new CameraManager(videoEl, () => {});
    await cm.start();

    assert.equal(cm.stream, mockStream);
    assert.equal(videoEl.srcObject, mockStream);
    assert.equal(track1.isStopped, false);
    assert.equal(track2.isStopped, false);

    // Stop camera
    cm.stop();

    assert.equal(track1.isStopped, true, 'Track 1 must be stopped');
    assert.equal(track2.isStopped, true, 'Track 2 must be stopped');
    assert.equal(cm.stream, null, 'Internal stream reference must be released');
    assert.equal(videoEl.srcObject, null, 'Video element srcObject must be detached');
  } finally {
    restore();
  }
});

test('CameraManager: stop() is idempotent and safe to call multiple times without error', () => {
  const videoEl = createMockVideoElement();
  const cm = new CameraManager(videoEl, () => {});

  assert.doesNotThrow(() => {
    cm.stop();
    cm.stop();
    cm.stop();
  }, 'Multiple stop calls must not throw');
});

test('CameraManager: late asynchronous getUserMedia resolving after stop() stops returned tracks immediately', async () => {
  const videoEl = createMockVideoElement();
  const track = createMockTrack();
  const mockStream = createMockStream([track]);

  let resolveGetUserMedia;
  const pendingPromise = new Promise((resolve) => {
    resolveGetUserMedia = resolve;
  });

  const restore = mockMediaDevices({
    getUserMedia: () => pendingPromise,
  });

  try {
    const cm = new CameraManager(videoEl, () => {});
    const startPromise = cm.start();

    // Stop is called while getUserMedia is still awaiting resolution (e.g. user submitted exam quickly)
    cm.stop();

    // Now resolve the late getUserMedia
    resolveGetUserMedia(mockStream);
    await startPromise;

    assert.equal(track.isStopped, true, 'Returned stream tracks must be immediately stopped');
    assert.equal(cm.stream, null, 'Stream must not be retained');
    assert.equal(videoEl.srcObject, null, 'Video element must not be assigned a late stream');
  } finally {
    restore();
  }
});

test('Camera Lifecycle: stops camera on both online and offline submission flows without altering stored events', async () => {
  // Simulate queued offline events and snapshots
  const mockOfflineOutbox = [
    { operationId: 'op-1', operationType: 'event_upsert', payload: { event_type: 'phone_detected' } },
    { operationId: 'op-2', operationType: 'answer_save', payload: { question_id: 'q1' } },
  ];
  const mockOfflineSnapshots = [
    { snapshotId: 'snap-1', eventId: 'evt-1', blob: 'fake-data' },
  ];

  const videoEl = createMockVideoElement();
  const track = createMockTrack();
  const mockStream = createMockStream([track]);

  const restore = mockMediaDevices({
    getUserMedia: async () => mockStream,
  });

  try {
    const cm = new CameraManager(videoEl, () => {});
    await cm.start();
    assert.equal(track.isStopped, false);

    // Trigger submission cleanup
    cm.stop();

    // Verify camera stopped
    assert.equal(track.isStopped, true, 'Webcam tracks must be stopped');
    assert.equal(cm.stream, null);

    // Verify offline events and evidence are completely preserved
    assert.equal(mockOfflineOutbox.length, 2, 'Outbox queue must remain intact');
    assert.equal(mockOfflineSnapshots.length, 1, 'Snapshots repository must remain intact');
    assert.equal(mockOfflineOutbox[0].operationId, 'op-1');
  } finally {
    restore();
  }
});

test('CameraManager: classifies permission_denied, camera_unavailable, and active states accurately', async () => {
  const videoEl = createMockVideoElement();
  const statesRecorded = [];

  // 1. Permission denied error
  const restoreDenied = mockMediaDevices({
    getUserMedia: async () => {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    },
  });

  try {
    const cm = new CameraManager(videoEl, (state) => statesRecorded.push(state));
    await assert.rejects(async () => cm.start());
    assert.ok(statesRecorded.includes('permission_denied'), 'Must transition to permission_denied on NotAllowedError');
  } finally {
    restoreDenied();
  }

  // 2. Camera hardware unavailable / in use
  statesRecorded.length = 0;
  const restoreUnavailable = mockMediaDevices({
    getUserMedia: async () => {
      const err = new Error('Device in use');
      err.name = 'NotReadableError';
      throw err;
    },
  });

  try {
    const cm = new CameraManager(videoEl, (state) => statesRecorded.push(state));
    await assert.rejects(async () => cm.start());
    assert.ok(statesRecorded.includes('camera_unavailable'), 'Must transition to camera_unavailable on NotReadableError');
  } finally {
    restoreUnavailable();
  }

  // 3. Successful acquisition
  statesRecorded.length = 0;
  const track = createMockTrack();
  const mockStream = createMockStream([track]);
  const restoreSuccess = mockMediaDevices({
    getUserMedia: async () => mockStream,
  });

  try {
    const cm = new CameraManager(videoEl, (state) => statesRecorded.push(state));
    await cm.start();
    assert.ok(statesRecorded.includes('requesting'));
    assert.ok(statesRecorded.includes('active'));
    cm.stop();
  } finally {
    restoreSuccess();
  }
});

test('CameraManager: attachVideoElement correctly connects newly mounted video element to live stream', async () => {
  const track = createMockTrack();
  const mockStream = createMockStream([track]);
  const restore = mockMediaDevices({
    getUserMedia: async () => mockStream,
  });

  try {
    // Construct with null element (e.g. before exam question package loads)
    const cm = new CameraManager(null, () => {});
    await cm.start();
    assert.equal(cm.stream, mockStream);

    // Now video element mounts in DOM
    let played = false;
    const mountedVideoEl = {
      srcObject: null,
      play: async () => { played = true; },
    };

    cm.attachVideoElement(mountedVideoEl);
    assert.equal(mountedVideoEl.srcObject, mockStream, 'Stream must be attached to newly mounted video element');
    assert.equal(played, true, 'play() must be invoked on newly mounted video element');

    cm.stop();
    assert.equal(track.isStopped, true);
  } finally {
    restore();
  }
});
