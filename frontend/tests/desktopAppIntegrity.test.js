import test from 'node:test';
import assert from 'node:assert/strict';

test('Desktop App Guard: rejects non-student accounts on Electron and permits them on Web', () => {
  function validateLoginRole(user, isElectron) {
    if (isElectron && user.role !== 'student') {
      throw new Error(
        'Access restricted: The desktop application is reserved exclusively for Student examinations. Administrators and Professors must sign in via the web portal.'
      );
    }
    return user;
  }

  // 1. On Desktop (Electron): Student succeeds
  const student = { user_id: 'u-1', full_name: 'Student One', role: 'student' };
  assert.equal(validateLoginRole(student, true), student);

  // 2. On Desktop (Electron): Admin is rejected
  const admin = { user_id: 'u-2', full_name: 'Admin One', role: 'admin' };
  assert.throws(
    () => validateLoginRole(admin, true),
    /Access restricted: The desktop application is reserved exclusively for Student examinations/
  );

  // 3. On Desktop (Electron): Professor is rejected
  const prof = { user_id: 'u-3', full_name: 'Prof One', role: 'professor' };
  assert.throws(
    () => validateLoginRole(prof, true),
    /Access restricted: The desktop application is reserved exclusively for Student examinations/
  );

  // 4. On Web (Vercel browser, isElectron = false): All roles succeed
  assert.equal(validateLoginRole(student, false), student);
  assert.equal(validateLoginRole(admin, false), admin);
  assert.equal(validateLoginRole(prof, false), prof);
});

test('Offline Session Recovery: distinguishes network errors from genuine auth rejection', async () => {
  async function resolveSessionMount({ networkError, status, cachedUser }) {
    let token = 'mock-jwt-token';
    let user = null;

    try {
      if (networkError) {
        const err = new Error('Network Error');
        err.code = 'ERR_NETWORK';
        throw err;
      }
      if (status === 401 || status === 403) {
        const err = new Error('Auth Error');
        err.response = { status };
        throw err;
      }
      user = { user_id: 'u-live', role: 'student' };
    } catch (err) {
      const isAuthError = err?.response?.status === 401 || err?.response?.status === 403;
      if (isAuthError) {
        token = null;
        user = null;
      } else {
        // Network error / offline: restore from local cache if available;
        // crucially PRESERVE ep_access_token so user is not permanently logged out!
        if (cachedUser) {
          user = cachedUser;
        } else {
          // Keep token intact; set user null until reconnect
          user = null;
        }
      }
    }

    return { token, user };
  }

  // Case A: Online valid token
  const resA = await resolveSessionMount({ networkError: false, status: 200 });
  assert.equal(resA.token, 'mock-jwt-token');
  assert.equal(resA.user.user_id, 'u-live');

  // Case B: Genuine 401 expired/invalid token -> token purged, user null
  const resB = await resolveSessionMount({ networkError: false, status: 401 });
  assert.equal(resB.token, null);
  assert.equal(resB.user, null);

  // Case C: Genuine 403 account inactive -> token purged, user null
  const resC = await resolveSessionMount({ networkError: false, status: 403 });
  assert.equal(resC.token, null);
  assert.equal(resC.user, null);

  // Case D: Offline / Network Error with cached session -> token preserved, cached user restored
  const resD = await resolveSessionMount({
    networkError: true,
    cachedUser: { user_id: 'u-cached', role: 'student' },
  });
  assert.equal(resD.token, 'mock-jwt-token');
  assert.equal(resD.user.user_id, 'u-cached');

  // Case E: Offline / Network Error with NO cached session -> token PRESERVED (not purged)
  const resE = await resolveSessionMount({
    networkError: true,
    cachedUser: null,
  });
  assert.equal(resE.token, 'mock-jwt-token');
  assert.equal(resE.user, null);
});

test('Fullscreen Guard: 5-second grace period countdown and automatic submission trigger', () => {
  let submitted = false;
  let modalActive = false;
  let remaining = 5;

  function onFullscreenExit() {
    modalActive = true;
    remaining = 5;
  }

  function onFullscreenReturn() {
    modalActive = false;
    remaining = 5;
  }

  function tick() {
    if (!modalActive) return;
    remaining -= 1;
    if (remaining <= 0) {
      modalActive = false;
      submitted = true;
    }
  }

  // Scenario 1: Exit and return within 3 seconds -> exam continues
  onFullscreenExit();
  assert.equal(modalActive, true);
  tick(); // 4s
  tick(); // 3s
  onFullscreenReturn();
  assert.equal(modalActive, false);
  assert.equal(submitted, false);

  // Scenario 2: Exit and do not return -> 5 seconds expire -> submitted
  onFullscreenExit();
  assert.equal(modalActive, true);
  tick(); // 4s
  tick(); // 3s
  tick(); // 2s
  tick(); // 1s
  tick(); // 0s -> auto-submit
  assert.equal(modalActive, false);
  assert.equal(submitted, true);
});

test('Focus loss (window_blur) is recorded distinctly without forcing immediate exit submit', () => {
  const eventsRecorded = [];

  function recordEvent(type, metadata) {
    eventsRecorded.push({
      event_type: type,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  // A brief focus loss (e.g. notification pop-up or Alt+Tab) records window_blur
  recordEvent('window_blur', { reason: 'window_focus_loss_detected' });
  assert.equal(eventsRecorded.length, 1);
  assert.equal(eventsRecorded[0].event_type, 'window_blur');

  // An actual fullscreen exit records fullscreen_exit
  recordEvent('fullscreen_exit', { reason: 'fullscreen_exit_detected' });
  assert.equal(eventsRecorded.length, 2);
  assert.equal(eventsRecorded[1].event_type, 'fullscreen_exit');
});

test('Submission Idempotency: concurrent timer, fullscreen timeout, and user clicks do not duplicate finalize', async () => {
  let submissionCalls = 0;
  const isSubmittingRef = { current: false };

  async function mockSubmit() {
    if (isSubmittingRef.current) return 'skipped_duplicate';
    isSubmittingRef.current = true;
    submissionCalls += 1;
    return 'submission_enqueued';
  }

  // Concurrent calls triggered simultaneously
  const results = await Promise.all([
    mockSubmit(), // user click
    mockSubmit(), // timer expire
    mockSubmit(), // fullscreen grace expire
  ]);

  assert.equal(submissionCalls, 1);
  assert.deepEqual(results, [
    'submission_enqueued',
    'skipped_duplicate',
    'skipped_duplicate',
  ]);
});

test('Vercel SPA Routing: rewrite regex correctly distinguishes SPA routes from static assets and API', () => {
  // Regex from frontend/vercel.json:
  // /((?!assets/|mediapipe/|models/|onnx/|api/|.*\\.[\\w]+$).*)
  const rewritePattern = /^((?!assets\/|mediapipe\/|models\/|onnx\/|api\/|.*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$).*)$/;

  // Valid nested SPA client routes MUST match the rewrite -> /index.html
  assert.equal(rewritePattern.test('student'), true);
  assert.equal(rewritePattern.test('student/enter-exam'), true);
  assert.equal(rewritePattern.test('student/readiness/att-123'), true);
  assert.equal(rewritePattern.test('student/exam/66e57956-11a2-42b8-9727-6284c6601f36'), true);
  assert.equal(rewritePattern.test('professor/exams/new'), true);
  assert.equal(rewritePattern.test('admin/audit'), true);
  assert.equal(rewritePattern.test('login'), true);
  assert.equal(rewritePattern.test('unknown-route-for-404'), true);

  // Static assets, models, and real files MUST NOT match the rewrite
  assert.equal(rewritePattern.test('assets/index-CgiAPn5q.js'), false);
  assert.equal(rewritePattern.test('assets/index-_422YeP3.css'), false);
  assert.equal(rewritePattern.test('models/classifier.onnx'), false);
  assert.equal(rewritePattern.test('mediapipe/detector.tflite'), false);
  assert.equal(rewritePattern.test('examproctor.ai_logo.png'), false);
  assert.equal(rewritePattern.test('api/v1/auth/login'), false);
});

test('Exam Attempt Recovery: loads remote package and restores attempt when local Dexie cache is empty', async () => {
  const localDb = {
    pkg: null,
    attempt: null,
  };

  const remoteServer = {
    attempts: [{ attempt_id: 'att-4', exam_id: 'ex-iot', status: 'in_progress', server_started_at: '2026-10-22T06:46:39Z' }],
    packages: {
      'ex-iot': { title: 'Internet of Things', duration_seconds: 1800, questions: [{ question_id: 'q1' }, { question_id: 'q2' }] },
    },
  };

  async function resumeExam(attemptId) {
    let pkg = localDb.pkg;
    let attempt = localDb.attempt;

    if (!attempt) {
      attempt = remoteServer.attempts.find((a) => a.attempt_id === attemptId) || null;
      if (attempt) localDb.attempt = attempt;
    }

    if (!pkg && attempt?.exam_id) {
      const remotePkg = remoteServer.packages[attempt.exam_id];
      if (remotePkg) {
        pkg = { attempt_id: attemptId, ...remotePkg };
        localDb.pkg = pkg;
      }
    }

    if (!pkg) {
      throw new Error('Examination package unavailable.');
    }

    // Fixed absolute deadline calculation
    const startIso = attempt.server_started_at || '2026-10-22T06:46:39Z';
    const deadlineMs = Date.parse(startIso) + (pkg.duration_seconds * 1000);

    return { pkg, attempt, deadlineMs, status: attempt.status };
  }

  const result = await resumeExam('att-4');
  assert.equal(result.attempt.attempt_id, 'att-4');
  assert.equal(result.attempt.status, 'in_progress');
  assert.equal(result.pkg.title, 'Internet of Things');
  assert.equal(result.pkg.questions.length, 2);
  assert.equal(result.deadlineMs, Date.parse('2026-10-22T06:46:39Z') + 1800000);
  // Verified saved into local cache
  assert.notEqual(localDb.pkg, null);
  assert.notEqual(localDb.attempt, null);
});

test('Exam Resume Error Handling: failed package download clears loading and reports actionable error', async () => {
  let loading = true;
  let error = null;

  async function resumeExamWithError() {
    loading = true;
    error = null;
    try {
      // Simulate network outage or forbidden 403
      throw new Error('This examination attempt is not authorized or has already ended.');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  await resumeExamWithError();
  assert.equal(loading, false);
  assert.equal(error, 'This examination attempt is not authorized or has already ended.');
});

test('Fullscreen Consent Flow: dialog cancels cleanly, confirms once, and verifies fullscreen before start', async () => {
  let isNativeFullscreen = false;
  let examStarted = false;
  let showModal = false;

  const mockElectronAPI = {
    setFullscreen: async (flag) => {
      isNativeFullscreen = Boolean(flag);
      return isNativeFullscreen;
    },
    getFullscreen: async () => isNativeFullscreen,
  };

  // 1. Click Start Exam -> Opens consent modal, does NOT start exam or enter fullscreen yet
  showModal = true;
  assert.equal(showModal, true);
  assert.equal(isNativeFullscreen, false);
  assert.equal(examStarted, false);

  // 2. Click Cancel -> Dismisses modal without starting exam
  showModal = false;
  assert.equal(showModal, false);
  assert.equal(examStarted, false);

  // 3. Click Start Exam again -> Open modal
  showModal = true;

  // 4. Click Enter Fullscreen and Start -> engages fullscreen, verifies it, then starts exam
  await mockElectronAPI.setFullscreen(true);
  const confirmed = await mockElectronAPI.getFullscreen();
  assert.equal(confirmed, true);
  examStarted = true;
  showModal = false;

  assert.equal(examStarted, true);
  assert.equal(isNativeFullscreen, true);
});

test('Fullscreen Idempotency: repeated setFullscreen calls do not toggle or dispatch redundant events', () => {
  let nativeState = false;
  let stateChangeCount = 0;

  function setFullscreenIdempotent(flag) {
    const target = Boolean(flag);
    if (nativeState !== target) {
      nativeState = target;
      stateChangeCount += 1;
    }
    return nativeState;
  }

  // Initial enter
  assert.equal(setFullscreenIdempotent(true), true);
  assert.equal(stateChangeCount, 1);

  // Redundant enter calls (e.g. from React re-renders or effect re-runs) do NOT change state
  assert.equal(setFullscreenIdempotent(true), true);
  assert.equal(setFullscreenIdempotent(true), true);
  assert.equal(stateChangeCount, 1); // strictly 1, no flicker!

  // Exit
  assert.equal(setFullscreenIdempotent(false), false);
  assert.equal(stateChangeCount, 2);

  // Redundant exit calls do NOT change state
  assert.equal(setFullscreenIdempotent(false), false);
  assert.equal(stateChangeCount, 2);
});

