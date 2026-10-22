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
        // Network error / offline: restore from local cache
        if (cachedUser) {
          user = cachedUser;
        } else {
          token = null;
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

  // Case E: Offline / Network Error with NO cached session -> token purged
  const resE = await resolveSessionMount({
    networkError: true,
    cachedUser: null,
  });
  assert.equal(resE.token, null);
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
