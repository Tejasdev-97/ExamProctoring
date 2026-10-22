import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenMonitoringEngine, SCREEN_MONITOR_STATES } from '../src/proctoring/screenMonitoring/screenMonitoringEngine.js';

test('ScreenMonitoringEngine: Disabled when electronAPI is not available', () => {
  const engine = new ScreenMonitoringEngine({ attemptId: 'att-1', consented: true, electronAPI: null });
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.DISABLED);
});

test('ScreenMonitoringEngine: Requires explicit consent before armed', () => {
  const mockElectronAPI = {
    requestScreenCapture: async () => ({ success: true, data: { base64: 'mock' } }),
    stopScreenCaptureSession: () => {},
  };
  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-1',
    consented: false,
    electronAPI: mockElectronAPI,
  });

  assert.equal(engine.consented, false);

  // Trigger focus loss without consent
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-1' });

  // State becomes FOCUS_LOSS_PENDING
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.FOCUS_LOSS_PENDING);

  // Pending capture timer should NOT be set when not consented
  assert.equal(engine.pendingCaptureTimer, null);

  engine.stop();
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.STOPPED);
});

test('ScreenMonitoringEngine: Brief focus loss cancels pending warning and capture', async () => {
  const mockElectronAPI = {
    requestScreenCapture: async () => {
      throw new Error('Should not be called for brief focus loss');
    },
    stopScreenCaptureSession: () => {},
  };
  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-1',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-1' });
  assert.ok(engine.pendingWarningTimer !== null, 'Warning timer scheduled');
  assert.ok(engine.pendingCaptureTimer !== null, 'Capture timer scheduled');

  // Focus restored after brief duration (e.g. 200ms)
  engine.handleFocusRestored();

  assert.equal(engine.pendingWarningTimer, null, 'Warning timer cancelled');
  assert.equal(engine.pendingCaptureTimer, null, 'Capture timer cancelled');
  assert.equal(engine.getActiveWarning(), null, 'No warning displayed');
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.READY, 'Returned to READY');

  engine.stop();
});

test('ScreenMonitoringEngine: Sustained focus loss triggers warning at 1200ms threshold', async () => {
  let warningEmitted = null;
  const mockElectronAPI = {
    requestScreenCapture: async () => ({ success: true, data: { base64: 'bW9jaw==' } }),
    stopScreenCaptureSession: () => {},
  };
  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-1',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  engine.subscribe(({ activeWarning }) => {
    if (activeWarning) warningEmitted = activeWarning;
  });

  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-2' });

  // Simulate warning timer firing
  await new Promise((resolve) => setTimeout(resolve, 1250));

  assert.ok(warningEmitted !== null, 'Warning was emitted after delay');
  assert.equal(warningEmitted.title, 'Window inactive');
  assert.match(warningEmitted.message, /Your exam window is inactive/);
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.WARNING_VISIBLE);

  engine.handleFocusRestored();
  assert.equal(engine.getActiveWarning(), null, 'Warning dismissed on refocus');

  engine.stop();
});

test('ScreenMonitoringEngine: Repeated interruptions (>3) escalate warning wording', async () => {
  const mockElectronAPI = {
    requestScreenCapture: async () => ({ success: true, data: { base64: 'bW9jaw==' } }),
    stopScreenCaptureSession: () => {},
  };
  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-1',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  // Cycle through 3 episodes
  for (let i = 0; i < 3; i++) {
    engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: `evt-rep-${i}` });
    engine.handleFocusRestored();
  }

  // 4th episode
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-rep-4' });

  // Fast-forward warning
  await new Promise((resolve) => setTimeout(resolve, 1250));

  const warning = engine.getActiveWarning();
  assert.ok(warning !== null);
  assert.match(warning.message, /Repeated examination interruptions have been recorded for review/);
  assert.equal(warning.severity, 'critical');

  engine.stop();
});

test('ScreenMonitoringEngine: Captures screenshot at sustained threshold with correct attempt and event ID', async () => {
  let capturedPayload = null;
  const mockElectronAPI = {
    requestScreenCapture: async (payload) => {
      capturedPayload = payload;
      return {
        success: true,
        data: {
          base64: 'bW9jaw==', // valid base64
          width: 1280,
          height: 720,
          mimeType: 'image/jpeg',
          sizeBytes: 4,
          sourceName: 'Primary Display',
        },
      };
    },
    stopScreenCaptureSession: () => {},
  };

  const engine = new ScreenMonitoringEngine({
    attemptId: 'attempt-test-123',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'event-test-456' });

  // Wait for capture delay (2500ms)
  await new Promise((resolve) => setTimeout(resolve, 2600));

  assert.ok(capturedPayload !== null, 'Screen capture was requested');
  assert.equal(capturedPayload.attemptId, 'attempt-test-123');
  assert.equal(capturedPayload.eventId, 'event-test-456');
  assert.equal(capturedPayload.reason, 'window_blur');
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.EVIDENCE_SAVED);

  // Focus restored
  engine.handleFocusRestored();
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.READY);

  engine.stop();
});

test('ScreenMonitoringEngine: Deduplication prevents multiple screenshots during continuous blur', async () => {
  let captureCount = 0;
  const mockElectronAPI = {
    requestScreenCapture: async () => {
      captureCount += 1;
      return { success: true, data: { base64: 'bW9jaw==' } };
    },
    stopScreenCaptureSession: () => {},
  };

  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-dup',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  // Initial blur
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-dup-1' });

  // Duplicate blur events during the same continuous loss
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-dup-1' });
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-dup-1' });

  // Wait for capture timer
  await new Promise((resolve) => setTimeout(resolve, 2600));

  assert.equal(captureCount, 1, 'Only one capture request must be made for a continuous blur episode');

  engine.stop();
});

test('ScreenMonitoringEngine: Capture failure produces accurate state without crashing', async () => {
  const mockElectronAPI = {
    requestScreenCapture: async () => ({
      success: false,
      error: 'Desktop display source unavailable',
    }),
    stopScreenCaptureSession: () => {},
  };

  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-fail',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-fail' });
  await new Promise((resolve) => setTimeout(resolve, 2600));

  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.CAPTURE_UNAVAILABLE);

  engine.stop();
});

test('ScreenMonitoringEngine: Page Hidden event immediately triggers warning and capture', async () => {
  let capturedReason = null;
  const mockElectronAPI = {
    requestScreenCapture: async ({ reason }) => {
      capturedReason = reason;
      return { success: true, data: { base64: 'bW9jaw==' } };
    },
    stopScreenCaptureSession: () => {},
  };

  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-hidden',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  engine.handlePageHidden({ timestamp: new Date().toISOString(), eventId: 'evt-hidden' });

  const warn = engine.getActiveWarning();
  assert.ok(warn !== null);
  assert.equal(warn.title, 'Exam window hidden');
  assert.match(warn.message, /Your exam window is hidden/);

  // Wait for capture execution
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(capturedReason, 'page_hidden');
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.EVIDENCE_SAVED);

  engine.stop();
});

test('ScreenMonitoringEngine: Final submission immediately stops and disarms all pending captures', async () => {
  let captureRequested = false;
  let sessionStopped = false;

  const mockElectronAPI = {
    requestScreenCapture: async () => {
      captureRequested = true;
      return { success: true, data: { base64: 'bW9jaw==' } };
    },
    stopScreenCaptureSession: () => {
      sessionStopped = true;
    },
  };

  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-submit',
    consented: true,
    electronAPI: mockElectronAPI,
  });

  // Blur starts
  engine.handleFocusLoss({ timestamp: new Date().toISOString(), eventId: 'evt-sub-1' });
  assert.ok(engine.pendingCaptureTimer !== null);

  // Student clicks submit at 500ms
  engine.stop();

  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.STOPPED);
  assert.equal(engine.pendingCaptureTimer, null, 'Pending capture timer must be cleared');
  assert.equal(sessionStopped, true, 'Electron session must be stopped');

  // Wait beyond normal capture threshold
  await new Promise((resolve) => setTimeout(resolve, 2600));

  assert.equal(captureRequested, false, 'Capture must NOT be requested after stop()');
});

test('ScreenMonitoringEngine: Idempotent stop() can be called repeatedly without throwing', () => {
  const engine = new ScreenMonitoringEngine({
    attemptId: 'att-idemp',
    consented: true,
    electronAPI: { stopScreenCaptureSession: () => {} },
  });

  assert.doesNotThrow(() => {
    engine.stop();
    engine.stop();
    engine.stop();
  });
  assert.equal(engine.getState(), SCREEN_MONITOR_STATES.STOPPED);
});
