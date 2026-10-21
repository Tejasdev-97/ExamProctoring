# ExamGuard AI — Testing Plan

**Document Version:** 1.0  
**Project:** ExamGuard AI  
**Problem Statement:** PS1 — ComputerVision SmartExamProctor  
**Status:** Development Specification  
**Primary Goal:** Verify that ExamGuard AI detects relevant exam events reliably, minimizes false alarms, preserves exam data during network failures, and produces understandable, auditable reports.

---

## 1. Purpose

This document defines the testing strategy for ExamGuard AI.

The system combines browser-based exam delivery, computer-vision proctoring, local data persistence, offline synchronization, role-based access control, and post-exam reporting.

Testing must establish that:

1. The core examination workflow works from beginning to end.
2. Face absence and multiple-face conditions are detected.
3. Sustained head turns are detected without treating every short glance as suspicious.
4. Phone detections are recorded with appropriate evidence.
5. Important events produce timestamps, metadata, and snapshots when available.
6. Dismissing a warning does not delete the underlying event.
7. An examination continues when internet connectivity is lost.
8. Answers, events, snapshots, and submission records survive browser refreshes and network failures.
9. Locally queued operations synchronize correctly after connectivity returns.
10. Professor reports contain understandable timelines and supporting evidence.
11. Role permissions prevent unauthorized operations.
12. The system behaves predictably when cameras, models, browsers, or network connections fail.

The test plan prioritizes reliable required features over optional features.

---

## 2. Testing Principles

### 2.1 Test the Complete Workflow

Tests must cover the entire flow:

Input
→ Processing
→ Detection
→ Event Decision
→ Local Persistence
→ Synchronization
→ Reporting

A detection is not considered fully implemented merely because a bounding box appears on the camera preview.

The event must also be recorded, persisted, and made available for reporting.

### 2.2 Separate Detection from Interpretation

The system detects observable conditions, such as:

- No face detected.
- Multiple faces detected.
- Sustained head orientation away from the calibrated forward direction.
- A possible mobile phone detected.
- Camera unavailable.
- Browser page hidden.
- Fullscreen mode exited.

These observations are not proof of cheating.

Reports must describe observed events rather than automatically declaring a student guilty.

### 2.3 Test False Positives

A false positive occurs when the system records an event even though the corresponding condition did not actually occur.

Examples:

- A student briefly looks at another part of the screen.
- A student looks down to read a question.
- Poor lighting causes temporary face-detection failure.
- A phone-like object is incorrectly classified as a mobile phone.
- A student adjusts their position and triggers an unnecessary warning.

False-positive testing is a first-class requirement.

### 2.4 Test Offline Behavior Explicitly

The system must not depend on a continuously available internet connection during an active examination.

The following must continue locally after the exam has been prepared:

- Displaying exam questions.
- Answering questions.
- Running locally available computer-vision models.
- Recording events.
- Capturing and storing available snapshots.
- Displaying warnings.
- Maintaining the examination countdown.
- Saving the student's submission.

Network disconnection must not automatically submit or terminate an active examination.

### 2.5 Make Tests Repeatable

Whenever possible, automated tests should use deterministic inputs.

For computer-vision tests, record:

- Test video or image identifier.
- Expected event type.
- Expected approximate event time.
- Actual detection time.
- Whether an event was recorded.
- Whether the evidence was saved.
- Whether a false positive occurred.

The same test input should be reusable after model or threshold changes.

---

## 3. Testing Scope

### 3.1 Features Included in the Initial Release

| Feature | Testing Priority |
|---|---|
| Face presence detection | Critical |
| Multiple-face detection | Critical |
| Sustained head-turn detection | Critical |
| Mobile-phone detection | Critical |
| Event logging | Critical |
| Snapshot capture and persistence | Critical |
| Student answer persistence | Critical |
| Offline examination continuation | Critical |
| Ordered synchronization | Critical |
| Manual submission and recovery | Critical |
| Professor event timeline | Critical |
| PDF report generation | High |
| Authentication and role permissions | Critical |
| Excel question import | High |
| Uploaded-video analysis | High |
| Camera readiness checks | High |
| Fullscreen-exit logging | Medium |
| Live professor monitoring | Medium |
| Face identity recognition | Deferred |
| Liveness detection | Deferred |
| Native Android application | Deferred |
| Operating-system-wide application blocking | Out of scope for the browser MVP |

### 3.2 Out of Scope for Initial Acceptance

The initial release does not need to prove that it can:

- Detect every application opened on the operating system.
- Identify every website visited outside the browser.
- Prevent every possible form of cheating.
- Guarantee detection under every lighting or camera condition.
- Establish a student's intent from a computer-vision event.
- Reliably identify every person by name.
- Guarantee that every detected phone is actually being used.

These limitations must not be hidden in documentation or reports.

---

## 4. Test Environment

### 4.1 Minimum Development Environment

Use a development computer with:

- A supported desktop browser.
- A working webcam.
- Microphone access only if a future feature explicitly requires it.
- Node.js and npm for the frontend development environment.
- Python for the backend.
- A local PostgreSQL database or configured test database.
- The locally available computer-vision models.
- A stable internet connection for online tests.
- The ability to disable internet connectivity for offline tests.

### 4.2 Recommended Browsers

Test at least one Chromium-based desktop browser.

Where possible, also test:

- Google Chrome.
- Microsoft Edge.
- Firefox, if the implementation supports it.

Do not assume identical camera, fullscreen, storage, or model-performance behavior across browsers.

### 4.3 Test Accounts

Create separate accounts for:

1. System administrator.
2. Professor.
3. Student A.
4. Student B.
5. Unauthorized or inactive user.

Use synthetic test identities and non-sensitive test information.

Do not use real student examination records for routine automated testing.

### 4.4 Test Data

Prepare:

- At least one published examination.
- One unpublished examination.
- One examination with MCQ questions.
- One examination with short-answer questions.
- One mixed-format examination.
- One valid Excel question file.
- Several invalid Excel question files.
- A set of scripted video clips.
- A set of test images.
- A test attempt with multiple event types.
- An attempt with locally queued, unsynchronized records.

---

## 5. Test Categories

The project uses the following testing categories.

### 5.1 Unit Testing

Unit tests verify individual functions without requiring the complete application.

Examples:

- Event threshold calculations.
- Event-type validation.
- Head-pose duration calculations.
- Exam-code validation.
- Answer validation.
- Synchronization sequence validation.
- Report event-count calculations.
- Permission checks.
- Excel row validation.

Recommended tools:

- Vitest for JavaScript.
- React Testing Library for frontend components.
- pytest for Python backend tests.

### 5.2 Integration Testing

Integration tests verify that connected components work together.

Examples:

- Detector output creates an event.
- Event creation persists the event locally.
- Event creation also creates an outbox operation.
- A queued event reaches the backend.
- The backend acknowledges the operation.
- A snapshot becomes available in the professor's event timeline.
- A submitted examination appears in the professor dashboard.

### 5.3 End-to-End Testing

End-to-end tests exercise the system through the user interface.

Examples:

- A student logs in and starts an examination.
- The student answers questions and submits.
- The professor sees the attempt.
- The professor opens the event timeline.
- The professor downloads the PDF report.

Recommended tool: Playwright.

### 5.4 Computer-Vision Testing

Computer-vision tests evaluate the face and phone detectors using controlled images and video clips.

Measure:

- True positives.
- False positives.
- False negatives.
- Detection latency.
- Event duration accuracy.
- Snapshot availability.
- Behavior under poor lighting.
- Behavior with small or distant faces.
- Stability across camera angles.

### 5.5 Offline and Recovery Testing

These tests intentionally interrupt network connectivity and simulate browser restarts, failed uploads, and repeated synchronization attempts.

The objective is to verify that examination data is not lost or duplicated.

### 5.6 Security Testing

Security tests verify:

- Authentication.
- Role-based authorization.
- Attempt ownership.
- Exam access rules.
- Snapshot access permissions.
- Input validation.
- Session handling.
- Audit logging.
- Protection against unauthorized report downloads.

---

## 6. Core Computer-Vision Test Cases

### CV-001: One Face Present

**Objective:** Verify that a normal single-face examination does not produce repeated face-absence or multiple-face events.

**Setup:**
- Start an examination.
- Enable the webcam.
- Ensure one student's face is visible.

**Steps:**
1. Sit normally in front of the camera.
2. Look toward the screen.
3. Continue for at least one minute.
4. Review the event log.

**Expected results:**
- One face is detected most of the time under suitable conditions.
- No multiple-face event is recorded.
- No sustained face-absence event is recorded.
- Short detection interruptions do not create excessive warnings.
- The examination remains active.

**Priority:** Critical.

### CV-002: No Face Visible

**Objective:** Verify that sustained face absence is recorded.

**Steps:**
1. Start an examination with one face visible.
2. Move completely out of the camera frame.
3. Remain outside the frame beyond the configured absence threshold.
4. Return to the frame.

**Expected results:**
- The detector initially observes the face.
- A face-absence event is created after the configured grace period.
- The event includes start and end timestamps when available.
- A snapshot or contextual evidence record is saved where possible.
- Face absence ends when the face is detected again.
- The event is not automatically interpreted as proof of cheating.

**Priority:** Critical.

### CV-003: Multiple Faces Present

**Objective:** Verify detection of more than one visible face.

**Steps:**
1. Start an examination with one face visible.
2. Ask another person to enter the camera frame.
3. Keep both faces visible long enough to exceed the configured threshold.
4. Remove the second person.

**Expected results:**
- The system detects more than one face.
- A multiple-face event is recorded.
- Available evidence is captured.
- The event ends when the configured condition clears.
- The professor can inspect the event in the report.

**Priority:** Critical.

### CV-004: Brief Sideways Glance

**Objective:** Ensure that a short glance does not immediately trigger a sustained head-turn event.

**Steps:**
1. Look toward the screen.
2. Briefly turn the head sideways.
3. Return to the normal position before the configured duration threshold.

**Expected results:**
- Head orientation changes may be detected internally.
- No sustained head-turn event is created if the condition does not persist long enough.
- No unnecessary warning is displayed.
- The examination continues normally.

**Priority:** Critical.

### CV-005: Sustained Sideways Head Turn

**Objective:** Verify sustained head-turn event detection.

**Steps:**
1. Look toward the screen.
2. Turn the head sufficiently far away from the calibrated forward direction.
3. Maintain the orientation beyond the configured duration threshold.
4. Return to the forward direction.

**Expected results:**
- The system estimates head orientation.
- The condition must exceed the configured angle and duration rules.
- A sustained head-turn event is recorded.
- The event includes timestamps and available confidence information.
- A snapshot is captured when possible.
- The event clears when the condition no longer persists.

**Priority:** Critical.

### CV-006: Looking Down to Read

**Objective:** Reduce false alarms when the student reads questions or notes.

**Steps:**
1. Look at the examination screen.
2. Briefly look down.
3. Return to the screen.
4. Repeat with different short durations.

**Expected results:**
- Brief downward movement does not automatically create a sustained head-turn event.
- The system follows the configured duration and orientation rules.
- The student is not repeatedly interrupted by unnecessary warnings.

**Priority:** Critical.

### CV-007: Mobile Phone Visible

**Objective:** Verify phone detection.

**Steps:**
1. Start an examination.
2. Hold a mobile phone within the camera frame.
3. Keep the phone visible under suitable lighting.
4. Repeat with different phone positions and distances.

**Expected results:**
- The phone detector identifies the phone when its confidence and persistence conditions are satisfied.
- A phone-detected event is recorded.
- The event includes available confidence and bounding-box information.
- A snapshot is captured when possible.
- The event appears in the professor's timeline.

**Important:** Detection depends on the selected model, model confidence, phone size, camera quality, and visibility. A missed detection must be recorded during testing rather than concealed.

**Priority:** Critical.

### CV-008: Phone-Like Object

**Objective:** Evaluate false positives involving objects that resemble phones.

**Steps:**
1. Show a calculator, remote control, small notebook, or another phone-like object.
2. Keep the object in the camera frame.
3. Repeat under different lighting conditions.

**Expected results:**
- The system should avoid creating a phone event when the detector does not meet its configured confidence and persistence rules.
- False-positive cases are recorded in the evaluation results.
- Threshold changes are evaluated against both missed detections and false alarms.

**Priority:** High.

### CV-009: Poor Lighting

**Objective:** Verify predictable behavior under poor lighting.

**Steps:**
1. Run a test with adequate lighting.
2. Reduce the available light.
3. Observe face detection and tracking stability.
4. Restore suitable lighting.

**Expected results:**
- Detection quality may decline, but the application must remain stable.
- Temporary detector failures should follow the configured grace period.
- The system should display a camera-quality warning when supported.
- The report must not claim reliable face verification during periods when the detector was unavailable.

**Priority:** High.

### CV-010: Face Partially Obstructed

**Objective:** Evaluate face detection when part of the face is obstructed.

**Steps:**
1. Start an examination.
2. Partially cover the face.
3. Test several obstruction levels.
4. Restore the normal view.

**Expected results:**
- The system records only conditions supported by its detector and event rules.
- Uncertain observations are not presented as certain conclusions.
- Temporary failures do not cause uncontrolled warning loops.

**Priority:** Medium.

### CV-011: Face Far from Camera

**Objective:** Evaluate detection with a small face in the frame.

**Steps:**
1. Sit at the normal distance.
2. Move farther from the camera.
3. Repeat with different camera resolutions.

**Expected results:**
- The test records detection quality at each distance.
- Detection failures are measured.
- The application remains responsive.
- The system does not claim that a face was verified when it could not reliably detect one.

**Priority:** High.

### CV-012: Camera Disconnected

**Objective:** Verify camera failure handling.

**Steps:**
1. Start an examination.
2. Disable camera permission or disconnect the webcam.
3. Observe the application.
4. Restore camera access.

**Expected results:**
- Camera failure is detected.
- A camera-unavailable event is recorded where possible.
- The user receives a clear, non-accusatory warning.
- Answers and examination state remain intact.
- Camera restoration is handled without requiring the student to restart the entire examination.

**Priority:** Critical.

---

## 7. Required Scripted Video Evaluation

The hackathon evaluation uses ten short scripted clips.

The test suite must support both live webcam input and uploaded-video analysis because the exact evaluation input mode may vary.

### 7.1 Clip Preparation

Create or obtain ten short clips representing controlled examination scenarios.

Each clip must have:

- A unique identifier.
- A description.
- A known expected condition.
- An expected event type, if applicable.
- An approximate time range for the condition.
- A record of the actual events detected.

Do not label a clip as successful merely because the model produced a detection somewhere in the video.

The detected event must match the expected condition within the configured timing tolerance.

### 7.2 Ten-Clip Test Matrix

| Clip | Scenario | Expected Evaluation |
|---|---|---|
| CLIP-01 | Student sitting normally and facing the screen | No sustained head-turn or multiple-face event |
| CLIP-02 | Student briefly looks sideways | No sustained head-turn event if below the duration threshold |
| CLIP-03 | Student looks sideways for an extended period | Sustained head-turn event |
| CLIP-04 | Student looks down briefly while reading | No immediate sustained head-turn event |
| CLIP-05 | Student leaves the camera frame | Face-absence event after the grace period |
| CLIP-06 | A second person enters the frame | Multiple-face event |
| CLIP-07 | Student holds a visible mobile phone | Phone-detected event when detector conditions are satisfied |
| CLIP-08 | Phone is partially obscured or far from the camera | Measure detection performance; record misses and uncertainty |
| CLIP-09 | Lighting changes during the examination | Measure face-detection stability and false alarms |
| CLIP-10 | Normal behavior containing several harmless movements | Evaluate overall false-positive rate |

The clip matrix is a baseline. If the official judge-provided clips differ, add them to the suite and use the official expected labels for acceptance testing.

### 7.3 Evaluation Procedure

For each clip:

1. Reset the analysis session.
2. Load the clip.
3. Run the same detection pipeline used by the application.
4. Save the resulting events.
5. Record the detected event timestamps.
6. Compare detections with the expected labels.
7. Review associated snapshots.
8. Record false positives and missed detections.
9. Repeat after any material detector or threshold change.

### 7.4 Results Table

Maintain a results table like this:

| Clip ID | Expected Event | Detected Event | Timestamp Error | Snapshot Saved | Result |
|---|---|---|---|---|---|
| CLIP-01 | None | None | N/A | N/A | Pass |
| CLIP-02 | None | Sustained head turn | N/A | Yes | Fail: false positive |
| CLIP-03 | Sustained head turn | Sustained head turn | 1.2 seconds | Yes | Pass if within tolerance |

The values above illustrate the format only. Replace them with actual measured results.

### 7.5 Do Not Hide Failed Cases

If a detector misses a phone or incorrectly flags a normal glance, preserve that result.

Use the results to adjust:

- Confidence thresholds.
- Duration thresholds.
- Grace periods.
- Model input resolution.
- Camera-quality requirements.
- Event-clearing rules.

After any adjustment, rerun both positive and negative cases.

A change that improves detection but significantly increases false alarms must not automatically be considered an improvement.

---

## 8. Event Logging and Snapshot Tests

### EVT-001: Event Contains Required Fields

**Objective:** Ensure that every persisted event has valid metadata.

**Verify:**
- Unique event ID.
- Attempt ID.
- Event type.
- Client timestamp.
- Server receipt timestamp, when synchronized.
- Event status.
- Available confidence information.
- Available bounding-box information.
- Duration, when applicable.
- Snapshot references, when available.
- Synchronization status.

**Expected result:** The event can be validated and displayed without losing its essential meaning.

### EVT-002: Event Persistence

**Steps:**
1. Trigger a valid event.
2. Wait for local persistence.
3. Refresh the browser.
4. Reopen the attempt's local event history.

**Expected results:**
- The event remains available.
- The event ID remains unchanged.
- The event is not duplicated merely because the page was refreshed.

### EVT-003: Snapshot Persistence

**Steps:**
1. Trigger an event that supports snapshot capture.
2. Verify that a snapshot Blob or equivalent local representation is stored.
3. Refresh the application.
4. Open the event's evidence locally.

**Expected results:**
- The snapshot remains available locally.
- Its metadata references the correct event and attempt.
- A missing or failed snapshot is represented honestly.
- The application does not fabricate evidence when capture fails.

### EVT-004: Warning Dismissal

**Steps:**
1. Trigger an event that produces a warning card.
2. Dismiss the warning.
3. Open the event history.

**Expected results:**
- The warning disappears from the active UI.
- The event remains in the audit history.
- The event remains available for synchronization and reporting.
- Dismissal does not alter the event's underlying classification.

### EVT-005: Duplicate Detection Events

**Objective:** Prevent excessive duplicate records.

**Steps:**
1. Keep a condition active for a prolonged period.
2. Observe how the detector updates the event.
3. Compare the number of records with the configured event-grouping behavior.

**Expected results:**
- A sustained condition is represented consistently.
- Repeated detector frames do not create an uncontrolled number of identical events.
- Separate incidents can still be distinguished when the condition clears and later returns.

### EVT-006: Event Timestamp Ordering

**Objective:** Ensure timeline consistency.

**Steps:**
1. Generate multiple events.
2. Synchronize them in a different arrival order.
3. Open the professor report.

**Expected results:**
- Events are ordered by their relevant event timestamps.
- Client event time and server receipt time remain distinguishable.
- Late-arriving events do not disappear merely because they arrived out of order.

---

## 9. Student Examination Workflow Tests

### EXAM-001: Successful Examination Start

**Steps:**
1. Log in as a student.
2. Enter a valid exam code.
3. Review the examination details.
4. Complete the camera readiness check.
5. Start the examination.

**Expected results:**
- The correct examination is displayed.
- Only authorized students can start it.
- Required exam assets are available.
- The camera starts after permission is granted.
- The attempt is created once.
- The examination countdown starts at the correct time.

### EXAM-002: Invalid Exam Code

**Steps:**
1. Enter a nonexistent exam code.
2. Submit the code.

**Expected results:**
- The application displays a clear error.
- No attempt is created.
- No private examination details are disclosed.

### EXAM-003: Unpublished Examination

**Steps:**
1. Enter the code of an unpublished examination.

**Expected results:**
- The student cannot start the examination.
- The backend independently enforces the restriction.
- A modified frontend request cannot bypass the restriction.

### EXAM-004: Answer Persistence

**Steps:**
1. Start an examination.
2. Answer several questions.
3. Navigate between questions.
4. Refresh the browser in a safe test environment.
5. Reopen the attempt.

**Expected results:**
- Previously saved answers are restored.
- Answer revisions remain consistent.
- No question is marked answered unless its answer was actually persisted.

### EXAM-005: Manual Submission

**Steps:**
1. Start an examination.
2. Answer questions.
3. Submit manually.
4. Confirm submission if a confirmation step exists.

**Expected results:**
- The final submission is recorded locally before network synchronization is attempted.
- The attempt becomes locally submitted.
- A stable submission operation ID is generated.
- The final sequence boundary is recorded.
- Repeated network retries do not create duplicate submissions.

### EXAM-006: Countdown Expiry

**Steps:**
1. Create a short test examination.
2. Start the attempt.
3. Allow the timer to expire.

**Expected results:**
- The expiry behavior follows the documented exam policy.
- The final local attempt state is preserved.
- Network failure does not destroy answers.
- The system does not accidentally extend the exam because a network request is delayed.

### EXAM-007: Fullscreen Exit

**Steps:**
1. Start an examination.
2. Exit fullscreen mode.
3. Return to the examination.

**Expected results:**
- A fullscreen-exit event is recorded when the browser exposes the event.
- The student sees a clear notification if required.
- The exam is not automatically submitted solely because fullscreen mode was exited.
- The event remains in the audit history.

### EXAM-008: Browser Page Hidden

**Steps:**
1. Start an examination.
2. Switch to another browser tab.
3. Return to the examination.

**Expected results:**
- A page-hidden event is recorded when supported.
- The event has a meaningful timestamp.
- The attempt and answers remain intact.
- The event is not described as proof that the student opened a particular application.

---

## 10. Offline Continuity Tests

Offline continuity is a critical requirement.

All offline tests must use an exam package that was downloaded and validated before the network was disconnected.

### OFF-001: Start After Package Preparation

**Steps:**
1. Connect to the server.
2. Download the examination package and required assets.
3. Verify package readiness.
4. Disconnect the network.
5. Start the examination.

**Expected results:**
- The exam can start if all configured offline prerequisites are satisfied.
- Questions are available locally.
- Required local models and application assets are available.
- The application clearly indicates offline operation.

If a required asset is missing, the application must report that the exam is not ready for offline use rather than pretending that it is.

### OFF-002: Network Loss During an Active Exam

**Steps:**
1. Start an examination online.
2. Answer several questions.
3. Disconnect the network.
4. Continue answering questions.
5. Trigger a test proctoring event.
6. Wait and continue working.

**Expected results:**
- The examination remains active.
- The timer continues according to the configured exam clock.
- Answers are saved locally.
- Proctoring events are saved locally.
- Available snapshots are saved locally.
- The student is not automatically submitted.
- The UI clearly indicates that synchronization is pending.

### OFF-003: Offline Answer Recovery

**Steps:**
1. Start an examination.
2. Disconnect the network.
3. Answer multiple questions.
4. Refresh the page in a controlled test.
5. Restore the local attempt.

**Expected results:**
- The locally persisted answers are restored.
- The attempt retains its original ID.
- The countdown follows the documented timing rules.
- The application does not create a second attempt accidentally.

This test must be conducted in the actual target deployment environment. Browser storage, service-worker caching, and camera permissions can behave differently between development and production.

### OFF-004: Offline Event Recovery

**Steps:**
1. Disconnect the network during an active examination.
2. Trigger multiple test events.
3. Refresh the application.
4. Inspect the local event history.

**Expected results:**
- Events remain available locally.
- Event IDs remain stable.
- Snapshot references remain valid.
- Synchronization operations remain queued.

### OFF-005: Offline Manual Submission

**Steps:**
1. Start an examination.
2. Disconnect the network.
3. Answer several questions.
4. Submit the examination manually.

**Expected results:**
- Submission is recorded locally.
- The submission operation has a stable unique ID.
- The final operation sequence is stored.
- The UI indicates that the submission is saved locally and awaiting synchronization.
- The exam is not lost because the server cannot be reached.

The user interface must distinguish local submission from server-confirmed synchronization.

### OFF-006: Reconnect and Synchronize

**Steps:**
1. Complete an offline examination.
2. Keep the browser open.
3. Restore internet connectivity.
4. Allow automatic synchronization.
5. Inspect the central database and professor dashboard.

**Expected results:**
- Queued operations are retried automatically.
- The backend acknowledges accepted operations.
- Events, answers, snapshots, and submission status become available centrally.
- The server does not create duplicate records.
- The professor dashboard updates after synchronization.

### OFF-007: Browser Restart Before Synchronization

**Steps:**
1. Complete an examination offline.
2. Submit locally.
3. Close the browser before reconnecting.
4. Reopen the application.
5. Restore connectivity.

**Expected results:**
- The locally stored attempt and queued operations remain available.
- Synchronization resumes where supported.
- Existing operation IDs are reused.
- The submission is not silently discarded.

This test must verify the actual storage and packaging environment. Clearing browser data or uninstalling the application may remove local records and must be treated as a separate recovery scenario.

### OFF-008: Network Flaps Repeatedly

**Steps:**
1. Start an examination.
2. Alternate between online and offline states several times.
3. Generate answers and events during each state.
4. Allow synchronization to retry.

**Expected results:**
- The examination remains usable.
- Failed requests do not lose local records.
- Retries do not create duplicate records.
- The outbox does not incorrectly mark failed operations as acknowledged.

### OFF-009: Snapshot Upload Failure

**Steps:**
1. Generate an event and snapshot.
2. Make the event metadata available to the server.
3. Force the snapshot upload to fail.
4. Restore the network.

**Expected results:**
- The event metadata remains valid.
- The snapshot remains available locally until the server acknowledges its upload.
- The upload is retried.
- The server can associate the uploaded snapshot with the correct event and attempt.

### OFF-010: Missing Local Model

**Steps:**
1. Prepare a test environment with a required model missing.
2. Attempt to start an offline examination.

**Expected results:**
- The readiness check detects the missing model.
- The application does not falsely claim that offline computer-vision monitoring is available.
- The configured exam policy determines whether starting is blocked or a documented limitation is shown.
- No unsupported detection claims are made in the final report.

---

## 11. Synchronization Protocol Tests

Synchronization must preserve operation order and be idempotent.

Each queued operation must have a stable operation ID and a sequence number scoped to the relevant attempt.

### SYNC-001: Ordered Synchronization

**Steps:**
1. Create several local operations.
2. Assign increasing sequence numbers.
3. Send them to the server.

**Expected results:**
- The server accepts operations according to the documented sequence rules.
- A later operation is not treated as proof that a missing earlier operation was received.
- Sequence gaps are reported and resolved.
- The client retains unacknowledged operations.

### SYNC-002: Idempotent Retry

**Steps:**
1. Send a valid operation.
2. Simulate a lost response.
3. Retry the same operation using the same operation ID.

**Expected results:**
- The server does not create a second logical operation.
- The server returns an appropriate acknowledgement or previously recorded result.
- The client can safely retry without duplicating the event or answer.

### SYNC-003: Duplicate Operation ID with Different Payload

**Steps:**
1. Submit an operation with a particular ID and payload.
2. Submit the same operation ID with a different payload.

**Expected results:**
- The backend rejects the conflicting payload or handles it according to a documented conflict policy.
- Existing records are not silently overwritten.

### SYNC-004: Sequence Gap

**Steps:**
1. Queue operations with sequence numbers 1, 2, and 3.
2. Attempt to synchronize operations 1 and 3 while operation 2 remains unavailable.

**Expected results:**
- The server reports the gap when required by the protocol.
- The client does not silently advance the confirmed sequence beyond missing operations.
- The client retains operation 3 until the gap is resolved if strict ordering is required.

### SYNC-005: Final Submission Boundary

**Steps:**
1. Create several operations for an attempt.
2. Record the final submission sequence boundary.
3. Attempt to submit before all required preceding operations have been acknowledged.
4. Synchronize the missing operations.
5. Retry finalization.

**Expected results:**
- The server validates the final sequence boundary.
- The server does not silently ignore required preceding operations.
- The attempt is finalized according to the documented policy.
- Retrying finalization does not create duplicate submissions.

### SYNC-006: Snapshot Acknowledgement

**Steps:**
1. Queue a snapshot for upload.
2. Simulate an upload failure.
3. Confirm that the client retains the local snapshot.
4. Retry and obtain a server acknowledgement.

**Expected results:**
- The local snapshot is not marked uploaded before acknowledgement.
- The server can retrieve the stored snapshot after successful upload.
- The event-to-snapshot relationship remains valid.

### SYNC-007: Concurrent Synchronization Requests

**Steps:**
1. Trigger synchronization from two client tasks for the same attempt.
2. Submit overlapping operation batches.

**Expected results:**
- Duplicate requests do not create duplicate logical records.
- Sequence constraints remain valid.
- Acknowledgements are associated with the correct operations.

### SYNC-008: Server Failure During Synchronization

**Steps:**
1. Queue several operations.
2. Make the backend unavailable.
3. Attempt synchronization.
4. Restore the backend.

**Expected results:**
- Local data remains intact.
- The client displays a pending-sync state.
- Synchronization resumes after recovery.
- Failed operations are not incorrectly marked as successful.

---

## 12. Authentication and Authorization Tests

### SEC-001: Valid Login

Verify that a valid active account can log in and receives only the permissions associated with its role.

### SEC-002: Invalid Login

Verify that invalid credentials do not create an authenticated session.

Error messages should not reveal unnecessary account information.

### SEC-003: Inactive Account

Verify that a deactivated account cannot obtain a new authenticated session or perform protected actions.

### SEC-004: Student Cannot Access Administration

Attempt to access administrator endpoints using a student account.

**Expected result:** The server rejects the request.

Hiding a button in the frontend is not sufficient authorization.

### SEC-005: Student Cannot Access Another Student's Attempt

Attempt to retrieve another student's answers, events, snapshots, or report.

**Expected result:** Access is denied unless an explicitly authorized administrative policy permits it.

### SEC-006: Professor Exam Ownership

Attempt to modify an examination owned by another professor.

**Expected result:** The backend enforces the configured ownership and administrative rules.

### SEC-007: Snapshot Authorization

Attempt to download a snapshot without appropriate permissions.

**Expected result:** The backend denies unauthorized access.

### SEC-008: Unauthorized Submission

Attempt to submit an attempt belonging to another student.

**Expected result:** The backend rejects the request.

### SEC-009: Exam Code Is Not Authentication

Attempt to use a valid six-digit exam code without a valid student session.

**Expected result:** The code alone does not grant unauthorized access to protected examination data.

### SEC-010: Input Validation

Test invalid values for:

- Exam IDs.
- Attempt IDs.
- Event types.
- Question IDs.
- Answer formats.
- Sequence numbers.
- Operation IDs.
- Snapshot metadata.
- Uploaded file names and content types.

**Expected result:** Invalid requests are rejected safely and do not corrupt data.

### SEC-011: Audit Logging

Verify that important administrative actions and security-sensitive operations produce appropriate audit records.

Examples:

- Account deactivation.
- Role changes.
- Exam publication.
- Retake authorization.
- Report access, where required by policy.
- Examination configuration changes.

Audit logs must not expose passwords or authentication tokens.

---

## 13. Excel Import Tests

### XLS-001: Valid MCQ Workbook

Import a workbook containing valid multiple-choice questions.

**Expected results:**
- Questions are parsed correctly.
- Options are mapped to the correct fields.
- Correct-answer values are validated.
- A preview is displayed before confirmation.
- Questions are not imported twice because of a repeated preview request.

### XLS-002: Valid Short-Answer Workbook

Import valid short-answer questions with required fields.

**Expected results:**
- Question text and marks are preserved.
- Unsupported fields are handled according to the documented import format.
- The preview accurately represents the imported content.

### XLS-003: Missing Required Column

Remove a required column.

**Expected result:** The importer displays a useful validation error.

### XLS-004: Invalid Correct Option

Use a correct-answer value that does not correspond to a valid option.

**Expected result:** The row is flagged and is not silently imported as a valid question.

### XLS-005: Empty Question Text

Include rows with missing question text.

**Expected result:** Invalid rows are clearly identified.

### XLS-006: Duplicate Questions

Include repeated questions.

**Expected result:** The importer follows a documented duplicate-handling policy and does not silently create unintended duplicates.

### XLS-007: Multiple Worksheets

Provide a workbook containing several worksheets.

**Expected result:** The interface identifies the worksheet being imported and makes the selection clear.

### XLS-008: Malformed Workbook

Attempt to upload a corrupted or unsupported file.

**Expected result:** The system reports an understandable error and remains operational.

### XLS-009: Large Workbook

Import a workbook near the configured size and row limits.

**Expected result:** The application enforces limits safely and remains responsive.

### XLS-010: Preview Before Confirmation

Modify or cancel the import after preview.

**Expected result:** No unintended questions are permanently created before confirmation.

---

## 14. Professor Dashboard Tests

### PROF-001: Examination Overview

Verify that the professor can see authorized examinations and their statuses.

### PROF-002: Student Attempt Status

Verify that the dashboard distinguishes states such as:

- Not started.
- In progress.
- Submitted.
- Offline or disconnected.
- Submitted locally but awaiting synchronization, where this status is available.
- Synchronized.
- Failed synchronization or unresolved recovery.

The exact labels may differ, but the meanings must be clear.

### PROF-003: Event Counts

Verify that event counts match the underlying authorized event records.

Counts must not accidentally include records from another attempt or examination.

### PROF-004: Open Event Evidence

Click an event count or event timeline item.

**Expected results:**
- The corresponding events are displayed.
- Available snapshots are linked to the correct events.
- Missing evidence is indicated clearly.
- Access controls are enforced.

### PROF-005: Offline Student Visibility

Disconnect a student during an examination.

**Expected results:**
- The professor sees the last known server-side state.
- The interface identifies the student as disconnected or awaiting synchronization when supported.
- The dashboard does not pretend to have received events that remain only on the student's device.

### PROF-006: Late Synchronization

Reconnect a previously offline student.

**Expected results:**
- Newly synchronized events become visible.
- Event timestamps reflect the original event time where available.
- Server receipt time remains separately identifiable.
- Event ordering is correct.

### PROF-007: Live Updates

Verify that WebSocket or polling updates do not create duplicate rows or inconsistent counts.

### PROF-008: Unauthorized Examination

Attempt to open another professor's examination.

**Expected result:** Access is denied unless explicitly permitted by the administrator's policy.

---

## 15. Reporting Tests

### REP-001: Complete PDF Report

Generate a report for an examination containing multiple event types.

**Expected results:**
- Examination details are correct.
- Student and attempt references are correct.
- Start and end timestamps are correct.
- Event counts match the source records.
- The timeline is chronologically understandable.
- Available snapshots are associated with the correct events.
- The report states when evidence is unavailable.
- The report includes an explanation that events are observations requiring human review.

### REP-002: Empty Event History

Generate a report for an attempt with no recorded proctoring events.

**Expected results:**
- The report is still valid.
- Zero event counts are displayed correctly.
- The report does not imply that cheating is impossible simply because no event was recorded.

### REP-003: Missing Snapshot

Generate a report containing an event without a stored snapshot.

**Expected results:**
- The event remains visible.
- The report indicates that a snapshot is unavailable.
- No fabricated image is displayed.

### REP-004: Long Event Timeline

Generate a report with many events.

**Expected results:**
- Pages break correctly.
- Tables and images remain readable.
- No event is silently omitted.
- The report remains usable.

### REP-005: Special Characters

Use question text or names containing valid Unicode characters and punctuation.

**Expected results:**
- Text is displayed correctly.
- The PDF does not contain corrupted characters where the selected fonts support them.
- Long text wraps safely.

### REP-006: Report Access Control

Attempt to download a report without authorization.

**Expected result:** Access is denied.

### REP-007: Event Count Consistency

Compare counts in:

1. The database.
2. The professor dashboard.
3. The event detail view.
4. The generated PDF.

**Expected result:** Counts agree according to the report's documented filters and event-grouping rules.

### REP-008: Review-Priority Score

If a review-priority score is implemented, verify that:

- Its formula is documented.
- The same input produces the same result.
- Missing data is handled consistently.
- The score is not described as a probability of cheating unless a separately validated statistical model justifies that interpretation.
- A high score does not automatically fail an examination.

This test is optional if the initial release does not include a review-priority score.

---

## 16. Uploaded-Video Analysis Tests

Uploaded-video analysis must use the same detection and event-generation pipeline where technically appropriate, while remaining separate from live examination attempts.

### VID-001: Valid Video

Upload a supported video file.

**Expected results:**
- The file is validated.
- The analysis session is created.
- Frames are processed in a controlled manner.
- Events are associated with the analysis session.
- A result summary is available.

### VID-002: Unsupported Format

Upload an unsupported file.

**Expected result:** The application rejects it with a clear message.

### VID-003: Corrupted Video

Upload a damaged video.

**Expected result:** The application reports the failure and does not create misleading results.

### VID-004: Timestamp Mapping

Verify that detected events are mapped to the correct video-relative timestamps.

### VID-005: Session Isolation

Verify that video-analysis events are not inserted into a student's live examination attempt unless a specific, authorized workflow explicitly supports that behavior.

### VID-006: Large Video

Test the configured file-size and duration limits.

**Expected result:** The application handles the file safely and communicates limits clearly.

---

## 17. User Interface and Accessibility Tests

### UI-001: Camera Preview

Verify that the camera preview remains compact during an examination and does not obscure important question content.

### UI-002: Enlarged Camera Preview

Open and close the enlarged preview.

**Expected results:**
- The preview can be enlarged and restored.
- The examination state remains unchanged.
- The camera stream is not accidentally duplicated.

### UI-003: Detection Overlays

Verify that face and phone bounding boxes align with the displayed preview.

If the video is mirrored, ensure overlay coordinates are transformed consistently.

### UI-004: Warning Cards

Verify that warnings:

- Use clear, non-accusatory language.
- Do not repeatedly interrupt the student unnecessarily.
- Can be dismissed where appropriate.
- Do not erase event history when dismissed.
- Do not obscure critical exam controls.

### UI-005: Save and Synchronization Indicators

Verify that the student can distinguish:

- Saving in progress.
- Saved locally.
- Synchronization pending.
- Synchronization completed.
- Synchronization failed and awaiting retry.

Do not display a server-confirmed state before the server acknowledges it.

### UI-006: Keyboard Navigation

Verify that major controls can be reached and operated using the keyboard where applicable.

### UI-007: Responsive Layout

Test the interface at common laptop screen sizes and different browser zoom settings.

### UI-008: Error Messages

Verify that errors are actionable, understandable, and do not expose sensitive technical information.

---

## 18. Performance and Reliability Tests

### PERF-001: Detection Latency

Measure the time between a relevant visual condition appearing and the corresponding event being recorded.

Record:
- Video or frame identifier.
- Expected condition start.
- Actual event timestamp.
- Processing latency.
- Hardware configuration.

### PERF-002: Interface Responsiveness

Run the detector while navigating questions and typing answers.

**Expected result:** Computer-vision processing must not make the examination interface unusable.

### PERF-003: Long Examination

Run a simulated examination for an extended period.

**Expected results:**
- Memory usage remains controlled.
- Local records continue to persist.
- The timer remains consistent.
- Repeated detector frames do not produce uncontrolled event growth.

### PERF-004: Storage Growth

Measure the local storage consumed by answers, events, and snapshots.

**Expected results:**
- The application handles storage limits.
- Storage failures are surfaced clearly.
- Existing data is not silently deleted to make room.

### PERF-005: Backend Recovery

Restart the backend during a test examination.

**Expected results:**
- The local examination remains usable when offline prerequisites are satisfied.
- Pending operations remain queued.
- Synchronization resumes when the backend returns.

### PERF-006: Model Loading Failure

Force a model-loading error.

**Expected results:**
- The application reports the unavailable model.
- It does not claim that the affected detector is working.
- The examination follows its documented failure policy.

### PERF-007: Snapshot Size

Test the configured snapshot resolution, compression, and upload size limits.

**Expected results:**
- Snapshots remain sufficiently clear for review.
- Storage and upload costs remain manageable.
- Compression does not unexpectedly corrupt the image.

---

## 19. Data Integrity Tests

### DATA-001: Attempt Isolation

Create two separate student attempts.

Verify that answers, events, snapshots, and synchronization operations are associated with the correct attempt.

### DATA-002: Stable Identifiers

Refresh the application and retry synchronization.

Verify that local operation IDs and event IDs remain stable.

### DATA-003: Question Versioning

Modify a question after an examination has been published.

Verify that an existing attempt remains associated with the question version that was assigned to it.

### DATA-004: Immutable Submitted Attempt

After a submission is finalized, attempt to modify the submitted record through unauthorized or unsupported operations.

Verify that the documented submission and audit rules are enforced.

### DATA-005: Retake Isolation

Create an authorized retake.

Verify that the new attempt receives a new attempt ID and does not overwrite the previous attempt's answers, events, or snapshots.

### DATA-006: Snapshot Relationships

Verify that every snapshot reference points to the correct event and attempt.

### DATA-007: Database Constraints

Attempt to create invalid relationships and duplicate identifiers.

Verify that application validation and database constraints prevent inconsistent records.

### DATA-008: Time Representation

Verify that stored timestamps follow the documented UTC convention.

Display timestamps in the intended user-facing timezone without changing the underlying event ordering.

---

## 20. Test Automation Structure

Organize tests into a maintainable structure.

Suggested layout:

tests/
├── unit/
│   ├── frontend/
│   │   ├── eventRules.test.js
│   │   ├── answerPersistence.test.js
│   │   └── warningCards.test.jsx
│   └── backend/
│       ├── test_event_validation.py
│       ├── test_permissions.py
│       ├── test_sync_validation.py
│       └── test_report_counts.py
├── integration/
│   ├── test_event_persistence.py
│   ├── test_snapshot_upload.py
│   ├── test_submission_flow.py
│   └── test_offline_sync.py
├── e2e/
│   ├── student-exam.spec.js
│   ├── professor-dashboard.spec.js
│   └── administrator.spec.js
├── computer_vision/
│   ├── clips/
│   ├── expected-results/
│   └── evaluation-results/
└── fixtures/
    ├── excel/
    ├── images/
    └── videos/

This is a suggested organization. Adapt paths to the actual repository structure.

Do not store real student data or private examination evidence in the automated test fixtures.

---

## 21. Recommended Test Commands

Use the commands that match the tools configured in the repository.

### Frontend

Install dependencies:

    npm install

Run the frontend development server:

    npm run dev

Run frontend unit tests, if configured:

    npm test

Run the production build:

    npm run build

### Backend

Create and activate the project's Python virtual environment according to the repository setup.

Install the declared dependencies, then run:

    pytest

### End-to-End Tests

If Playwright is configured, run:

    npx playwright test

These commands assume that the corresponding scripts, dependencies, and configuration files have been added.

Do not treat a command as passing if the test suite was not actually executed.

---

## 22. Acceptance Criteria

The project should be considered ready for the hackathon demonstration only when the critical requirements below have been verified.

### 22.1 Detection

- Face presence detection works on the prepared test environment.
- Multiple-face detection works on representative test inputs.
- Sustained head-turn detection uses duration and orientation rules.
- Phone detection is evaluated using representative clips.
- Brief harmless movements do not automatically trigger sustained head-turn events.
- False positives and missed detections are measured and documented.

### 22.2 Event Recording

- Required events contain valid metadata.
- Events persist locally.
- Supported events produce snapshots when capture succeeds.
- Snapshot failures are represented accurately.
- Dismissing a warning does not delete its event.
- Events can be reviewed after the examination.

### 22.3 Offline Examination

- A prepared examination can continue without internet connectivity.
- Questions and answers remain available locally.
- The countdown continues according to the configured policy.
- Local events and snapshots are preserved.
- Network loss does not automatically submit the examination.
- Manual submission can be stored locally.
- Pending operations survive a controlled browser restart.
- Synchronization resumes after reconnection.

### 22.4 Synchronization

- Operation IDs remain stable across retries.
- Duplicate requests do not create duplicate logical records.
- Sequence gaps are handled according to the protocol.
- Final submission boundaries are validated.
- Snapshot uploads are acknowledged before local deletion or completion marking.
- The central database receives the expected records after synchronization.

### 22.5 Reports

- The professor can open an authorized examination's report.
- Event counts match the underlying records.
- Timestamps and timeline ordering are correct.
- Available snapshots are displayed with their corresponding events.
- Missing evidence is identified clearly.
- Reports do not present event observations as conclusive proof of cheating.

### 22.6 Security

- Authentication works.
- Role-based authorization is enforced by the backend.
- Students cannot access other students' protected records.
- Professors cannot access unauthorized examinations.
- Snapshot and report access controls are enforced.

### 22.7 Demonstration Readiness

- The ten-clip evaluation can be run repeatably.
- Test results are recorded.
- The application can demonstrate a normal exam, a detected event, a report, and offline recovery.
- No critical known failure is hidden from the demonstration team.

---

## 23. Suggested Development Order

For a short hackathon, execute testing in this order.

### Phase 1: Core Detection

1. Verify that the camera works.
2. Test face presence.
3. Test multiple faces.
4. Test sustained head turns.
5. Test phone detection.
6. Measure false positives.

### Phase 2: Event Pipeline

1. Generate events.
2. Persist event metadata.
3. Capture snapshots.
4. Verify local persistence.
5. Confirm that warnings and event records are independent.

### Phase 3: Examination Workflow

1. Log in as a student.
2. Start an examination.
3. Answer questions.
4. Save answers.
5. Submit the examination.
6. Verify the professor view.

### Phase 4: Offline Continuity

1. Download the exam package.
2. Disconnect the network.
3. Continue answering.
4. Trigger events.
5. Submit locally.
6. Reconnect.
7. Verify synchronization and recovery.

### Phase 5: Reporting and Permissions

1. Open event timelines.
2. Inspect snapshots.
3. Generate a PDF report.
4. Verify event counts.
5. Test role permissions.

### Phase 6: Final Regression

1. Run the ten scripted clips.
2. Run critical automated tests.
3. Repeat the offline recovery test.
4. Test a clean production build.
5. Record remaining limitations.

Do not prioritize optional identity recognition, liveness detection, or native application packaging over unresolved critical requirements.

---

## 24. Bug Reporting Template

Use the following template when a test fails.

### Bug ID

Unique issue identifier.

### Title

Short description of the failure.

### Environment

- Operating system:
- Browser:
- Browser version:
- Frontend version:
- Backend version:
- Model version:
- Network state:

### Preconditions

Describe the account, examination, camera, model, and data required to reproduce the issue.

### Steps to Reproduce

1.
2.
3.

### Expected Result

Describe the intended behavior.

### Actual Result

Describe the observed behavior.

### Evidence

Include safe test logs, screenshots, event IDs, and timestamps where appropriate.

### Severity

- Critical: Examination data loss, unauthorized access, or inability to complete a core workflow.
- High: A major required feature is broken.
- Medium: A significant but recoverable feature problem.
- Low: A minor UI or usability issue.

### Reproducibility

- Always.
- Frequently.
- Intermittently.
- Unable to reproduce.

### Resolution

Describe the fix and the regression test added.

---

## 25. Test Result Summary Template

Complete this summary before the demonstration.

| Category | Total Tests | Passed | Failed | Not Run |
|---|---:|---:|---:|---:|
| Face detection | | | | |
| Multiple-face detection | | | | |
| Head-turn detection | | | | |
| Phone detection | | | | |
| Event and snapshot persistence | | | | |
| Student workflow | | | | |
| Offline continuity | | | | |
| Synchronization | | | | |
| Authentication and authorization | | | | |
| Excel import | | | | |
| Professor dashboard | | | | |
| PDF reporting | | | | |
| Uploaded-video analysis | | | | |
| Performance and reliability | | | | |

### Final Known Limitations

Document all important limitations, including:

- Conditions that reduce detector accuracy.
- Known false-positive cases.
- Known missed detections.
- Browser restrictions.
- Model-loading requirements.
- Offline storage limitations.
- Unsupported operating systems or browsers.
- Features deferred until after the hackathon.

Never mark an untested requirement as passed.

---

## 26. Final Testing Policy

ExamGuard AI is a decision-support and evidence-collection system.

Its purpose is to identify potentially relevant examination events, preserve evidence, and help authorized reviewers understand what happened.

The system must:

- Preserve student answers and examination records reliably.
- Avoid unnecessary interruptions.
- Record observations accurately.
- Distinguish unavailable evidence from evidence that a condition did not occur.
- Maintain an auditable synchronization history.
- Avoid interpreting a detection event as definitive proof of misconduct.
- Allow authorized human review.
- Clearly disclose limitations.

**A successful release is one that is reliable, testable, transparent about its limitations, and capable of preserving examination data—not merely one that displays impressive AI detections.**