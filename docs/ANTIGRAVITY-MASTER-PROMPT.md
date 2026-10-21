# EXAMPROCTOR.AI — MASTER IMPLEMENTATION PROMPT

You are acting as the lead software architect, senior full-stack engineer,
computer-vision engineer, database engineer, UI/UX designer, and QA engineer
responsible for implementing ExamProctor.ai.

Your task is to build the actual working project described in the project
documentation.

This is not a request to create a static dashboard, a design-only prototype,
or a set of disconnected pages.

You must implement a cohesive examination platform with a React frontend,
a Python FastAPI backend, PostgreSQL, IndexedDB/Dexie local persistence,
computer-vision monitoring, offline examination continuity, reliable
synchronization, evidence management, and reporting.

The project is named ExamProctor.ai.

Use this name in all new user-facing screens, application metadata, branding,
documentation, and reports.

Older specification documents may still use the previous name ExamGuard AI.
Treat that as legacy naming and reconcile it with ExamProctor.ai without
discarding the technical requirements in those documents.

============================================================
1. MANDATORY FIRST STEP: READ ALL PROJECT DOCUMENTATION
============================================================

Before writing or modifying code, inspect the existing project directory.

You must locate and read the complete contents of:

1. docs/ExamProctor.ai-PRD.docx
2. docs/architecture.md
3. docs/data-model.md
4. docs/sync-protocol.md
5. docs/api-contracts.md
6. docs/testing-plan.md

The PRD may be supplied as a Word document or an equivalent Markdown file.
If the document is not yet present, use the complete PRD supplied by the user
and identify the missing file in your initial assessment.

Also inspect any existing:

- README.md
- package.json
- requirements.txt
- pyproject.toml
- database migrations
- frontend source code
- backend source code
- environment configuration
- tests
- model files
- deployment files

Do not assume that the repository is empty.

Do not overwrite existing working code before inspecting it.

Do not recreate existing files blindly.

Read the entire specifications, not only their titles or the first sections.

If the environment supports document extraction, extract and inspect the
complete Word document.

Do not proceed to implementation until you have identified the relevant
requirements from all five specification files and the PRD.

============================================================
2. SPECIFICATION RECONCILIATION
============================================================

Create a temporary implementation checklist and requirements matrix.

Map each important requirement to:

- Source document.
- Frontend module.
- Backend module.
- Database entity, if applicable.
- API endpoint, if applicable.
- Test case.
- Completion status.

The PRD defines the intended product behavior and UI design.

The detailed existing documents define the established architecture,
data model, synchronization protocol, API contracts, and testing expectations.

Use the following technical baseline:

FRONTEND:
- React
- Vite
- JavaScript
- React Router
- CSS Modules or organized CSS
- Lucide React icons

LOCAL STORAGE:
- IndexedDB
- Dexie.js
- Persistent outbox
- Local snapshot blobs
- Service-worker caching for static assets

COMPUTER VISION:
- MediaPipe Tasks Vision for face landmarks and face analysis
- A suitable pretrained locally executable phone/object detector
- Shared frame-processing pipeline
- Duration-based event rules
- Local evidence capture

BACKEND:
- Python
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic

CENTRAL DATABASE:
- PostgreSQL

REPORTING:
- ReportLab for PDF reports
- openpyxl for Excel question imports

TESTING:
- Vitest
- React Testing Library
- Playwright
- pytest

ONLINE MONITORING:
- WebSockets where appropriate
- Polling fallback

The current project specification uses JavaScript for the frontend.
Do not silently convert the application to TypeScript.

Do not replace the agreed architecture with an unrelated framework or stack.

If two documents conflict, do not silently ignore the conflict.

Record the conflict, identify the intended behavior, choose the option that
preserves the latest explicit product requirement and the established
data/synchronization contracts, and document the decision.

In particular, preserve all of these invariants:

1. One shared local-first examination pipeline.
2. Local persistence before successful-save feedback.
3. Server acknowledgement before synchronized status.
4. Stable operation IDs.
5. Attempt-scoped monotonically increasing sequence numbers.
6. Idempotent server ingestion.
7. Sequence-gap detection.
8. Correct snapshot upload acknowledgements.
9. Final submission sequence-boundary validation.
10. No automatic submission caused solely by network loss.
11. No deletion of previous attempts when a retake is granted.
12. No correct answers in the student examination package.
13. Backend-enforced authorization.
14. No claim that an AI event proves cheating.

============================================================
3. WORKING STYLE AND IMPLEMENTATION DISCIPLINE
============================================================

Implement the project in small, verifiable phases.

Do not generate the entire project as one giant file.

Do not create enormous React components containing all pages and business
logic.

Do not use one giant FastAPI router for the entire backend.

Do not use placeholder buttons for required features.

Do not use mock data as the only source for features that require a backend.

Do not simulate successful persistence when no database write occurred.

Do not show a successful synchronization state before receiving a server
acknowledgement.

Do not fabricate snapshots, detections, users, reports, or server responses.

Temporary development fixtures are permitted only when clearly separated
from production code and never presented as live records.

Do not mark features complete until they work and have been tested.

If a feature depends on an unavailable model or external service, explain the
dependency, provide a graceful unavailable state, and continue implementing
the remaining requirements.

Prefer reliable core features over optional enhancements.

Do not spend time implementing face identity recognition, liveness detection,
Android packaging, or advanced extras before the mandatory examination,
detection, persistence, and synchronization workflows work.

============================================================
4. PRODUCT IDENTITY AND VISUAL DESIGN
============================================================

Build a professional, innovative educational technology product.

The design must use a controlled brutalist/neobrutalist visual language.

It must look intentionally designed, not like a generic admin dashboard.

The visual identity should combine:

- Warm neutral surfaces.
- Strong navy and blue structure.
- Orange accents.
- Yellow highlights.
- Red error states.
- Light-green success states.
- Light-blue informational surfaces.
- Bold typography.
- Strong borders.
- Controlled offset shadows.
- Clear geometry.
- Excellent readability.

Do not make every component bright or visually noisy.

Use color purposefully.

------------------------------------------------------------
4.1 ABSOLUTE RULE: NO GREY TEXT
------------------------------------------------------------

Do not use grey or gray text anywhere in the application.

This is a strict requirement.

Do not use common grey text values such as:

#6B7280
#9CA3AF
#64748B
#94A3B8
#71717A

Do not use grey for:

- Secondary descriptions.
- Helper text.
- Timestamps.
- Table metadata.
- Placeholders.
- Disabled labels.
- Navigation labels.
- Form instructions.
- Footnotes.
- Empty states.
- Supporting text.

Use permitted colors such as:

- Deep navy.
- Dark blue.
- Near-black warm ink.
- Cream.
- White.
- Pale blue.
- Light green backgrounds with readable dark green text.
- Light yellow backgrounds with readable navy text.

Neutral backgrounds are allowed, but text must not be grey.

Create centralized design tokens in:

frontend/src/styles/tokens.css
frontend/src/styles/themes.css
frontend/src/styles/global.css

Do not independently invent colors in each component.

------------------------------------------------------------
4.2 LIGHT MODE
------------------------------------------------------------

Start with these tokens:

Page background: #FFF8EE
Main surface: #FFFFFF
Alternate surface: #FFF0D8
Main text: #172554
Heading text: #10204A
Secondary text: #244A78
Primary blue: #2563EB
Deep blue: #173B8F
Light blue: #DCEBFF
Orange: #F97316
Light orange: #FFEDD5
Yellow: #FACC15
Light yellow: #FEF3C7
Red: #DC2626
Light red: #FEE2E2
Green: #15803D
Light green: #DCFCE7
Strong border: #172554
Focus outline: #2563EB

Use dark text on light surfaces.

Never use white text on a bright yellow surface.

------------------------------------------------------------
4.3 DARK MODE
------------------------------------------------------------

Start with these tokens:

Page background: #0B1220
Main surface: #111D33
Alternate surface: #182844
Main text: #FFF8EE
Heading text: #FFFFFF
Secondary text: #D6E5FF
Primary blue: #60A5FA
Deep blue: #3B82F6
Light blue panel: #243F66
Orange: #FB923C
Light orange panel: #4B2B1B
Yellow: #FDE047
Light yellow panel: #443716
Red: #F87171
Light red panel: #4A2028
Green: #86EFAC
Light green panel: #173B2A
Strong border: #FDE7C7
Focus outline: #93C5FD

Use cream or white text for main content.

Verify contrast in both themes.

Do not create dark mode by simply inverting every light-mode color.

------------------------------------------------------------
4.4 TYPOGRAPHY
------------------------------------------------------------

Use Plus Jakarta Sans as the preferred interface font, with a sensible
fallback stack.

Use a clear typographic hierarchy.

Approximate desktop sizes:

- Main page headings: 32–40 px
- Section headings: 24–28 px
- Card headings: 18–22 px
- Body text: 15–17 px
- Form labels: 14–16 px
- Table text: 14–15 px
- Helper text: 13–14 px

Do not shrink important content merely to fit the screen.

Maintain adequate line height and spacing.

------------------------------------------------------------
4.5 NEO-BRUTALIST COMPONENTS
------------------------------------------------------------

Use:

- Strong 2–3 px borders where appropriate.
- Controlled offset shadows.
- Clear rectangular cards.
- Bold headings.
- Strong alignment.
- Moderate corner radii.
- High-contrast action buttons.
- Consistent spacing.
- Limited decorative geometry.

Do not add heavy shadows to every small element.

The result must be professional, modern, and suitable for an educational
technology product.

------------------------------------------------------------
4.6 ICONS
------------------------------------------------------------

Use lucide-react.

Never use normal emojis as interface icons.

Use meaningful Lucide icons such as:

LayoutDashboard
Users
GraduationCap
BookOpen
ClipboardList
FileQuestion
Settings2
FileBarChart
Download
Upload
Camera
Smartphone
ScanFace
TriangleAlert
CircleCheck
CircleAlert
Wifi
WifiOff
RefreshCw
Sun
Moon
Search
SlidersHorizontal
Timer
Activity
ShieldCheck
Maximize2
Minimize2

Ensure icon-only buttons have accessible labels.

Use consistent icon sizes and stroke widths.

------------------------------------------------------------
4.7 THEME SWITCHING
------------------------------------------------------------

Implement both light and dark modes.

Provide a visible theme toggle using Sun and Moon icons.

Requirements:

- Persist the user's preference.
- Detect the system theme on first use.
- Keep the selected theme across route navigation.
- Avoid an unnecessary flash of the wrong theme.
- Apply the theme to charts, tables, forms, dialogs, tooltips, camera
  overlays, and all role-specific dashboards.

============================================================
5. FRONTEND PAGES
============================================================

Implement the following pages as real functional pages.

------------------------------------------------------------
5.1 LOGIN
------------------------------------------------------------

Create a polished login page.

Include:

- ExamProctor.ai branding.
- Account identifier field.
- Password field.
- Password visibility toggle.
- Login button.
- Validation errors.
- Loading state.
- Theme toggle.

Authenticate through the backend.

Do not hard-code the user's role in the frontend.

------------------------------------------------------------
5.2 ADMINISTRATOR DASHBOARD
------------------------------------------------------------

Provide navigation for:

- Overview
- Users
- System Settings
- Audit Logs
- System Health

Overview should show useful account, activity, and health summaries using
real API data.

Implement:

- User search.
- User filters.
- Create account.
- Edit account.
- Role management.
- Activate/deactivate.
- Secure credential-reset workflow.
- Global settings.
- Audit history.

Do not expose administrator-only functionality to students or professors.

------------------------------------------------------------
5.3 PROFESSOR DASHBOARD
------------------------------------------------------------

Provide navigation for:

- Overview
- Examinations
- Question Bank
- Reports
- Supported professor settings

Include:

- Create Examination.
- Recent examinations.
- Exam status.
- Exam code.
- Student counts.
- Submitted-attempt counts.
- Recent activity.
- Monitoring links.
- Report links.

Use actual backend data.

------------------------------------------------------------
5.4 EXAM BUILDER
------------------------------------------------------------

Implement a clear multi-step exam builder.

Steps:

1. Examination details.
2. Questions.
3. Proctoring configuration.
4. Review.
5. Publish.

Support:

- MCQ questions.
- Short-answer questions.
- Marks.
- Question ordering.
- Draft saving.
- Validation.
- Excel import.
- Preview.
- Correction of invalid rows.
- Confirmation before permanent import.
- Publication.
- Six-digit exam-code display.

Never expose answer keys to the student package.

------------------------------------------------------------
5.5 STUDENT EXAM ENTRY
------------------------------------------------------------

Implement:

- Six-digit exam-code input.
- Exam resolution.
- Examination details.
- Instructions.
- Student name and USN confirmation.
- Authorization checks.
- Package download.
- Readiness checks.

A code alone must not authorize the student.

------------------------------------------------------------
5.6 READINESS CHECK
------------------------------------------------------------

Display clear readiness states for:

- Camera.
- Face visibility.
- Required models.
- Exam package.
- Local database.
- Storage availability.
- Timer.
- Required assets.

Distinguish connectivity status from offline readiness.

Do not permit an examination to start when mandatory offline prerequisites
have failed.

------------------------------------------------------------
5.7 ACTIVE STUDENT EXAM
------------------------------------------------------------

This is a critical page.

Header:

- ExamProctor.ai branding.
- Exam title.
- Student USN.
- Countdown.
- Connectivity status.
- Local-save status.
- Synchronization status.

Main content:

- Question.
- MCQ options or short-answer field.
- Marks.
- Previous and Next buttons.
- Question navigator.
- Answered/unanswered indicators.
- Submit button.

Camera area:

- Compact right-side camera preview.
- Face bounding boxes.
- Phone bounding boxes.
- Enlarge button.
- Camera status.
- Larger centered preview when enlarged.

Warning cards:

- Brief.
- Non-accusatory.
- Dismissible where appropriate.
- Do not obscure questions.
- Do not delete event history.

The camera preview target is approximately 10% of the usable screen width, but
maintain a practical minimum size.

Do not sacrifice question readability to preserve an exact percentage.

Implement real local persistence.

Do not make each answer dependent on a cloud API request.

------------------------------------------------------------
5.8 PROFESSOR LIVE MONITORING
------------------------------------------------------------

Display:

- Exam title.
- Exam status.
- Student table.
- USN.
- Student name.
- Attempt status.
- Start time.
- Submission time.
- Last server contact.
- Synchronization status.
- Event counts by type.

Event counts must be clickable.

Clicking an event count opens the relevant event list and evidence.

Use WebSockets where appropriate and polling fallback.

Show disconnected students accurately.

------------------------------------------------------------
5.9 ATTEMPT DETAILS AND REPORTS
------------------------------------------------------------

Display:

- Student identity.
- Exam identity.
- Attempt state.
- Start and submission times.
- Synchronization state.
- Event summaries.
- Event timeline.
- Snapshot gallery.
- PDF download.
- Retake action when authorized.

The report must distinguish event time from server receipt time where
appropriate.

------------------------------------------------------------
5.10 UPLOADED-VIDEO ANALYSIS
------------------------------------------------------------

Implement a separate video-analysis workflow.

Include:

- File selection.
- File validation.
- Analysis session.
- Processing state.
- Event timeline.
- Available snapshots.
- Result summary.
- Error and retry states.

Use the shared frame-processing pipeline.

Do not silently turn uploaded-video analysis into a real student examination.

============================================================
6. LOCAL DATABASE AND EXAM ENGINE
============================================================

Implement the local database using Dexie.js and IndexedDB.

Read data-model.md and sync-protocol.md before implementing it.

Implement the required stores and relationships.

At minimum, support the documented stores for:

- Exam packages.
- Attempts.
- Answers.
- Answer revisions.
- Proctor events.
- Snapshots.
- Sync outbox.
- Sync receipts.
- Local settings.
- Video-analysis sessions.
- Video-analysis results.

Use schema versioning and safe migrations.

Do not delete pending operations during migration.

Implement repositories rather than allowing every component to manipulate
IndexedDB directly.

The local exam engine must not require the central server for:

- Question navigation after package preparation.
- Local answer saving.
- Countdown.
- Local computer-vision processing.
- Event creation.
- Snapshot storage.
- Warning generation.
- Local submission.

============================================================
7. COMPUTER-VISION IMPLEMENTATION
============================================================

Build a real local inference pipeline.

Do not simulate detections.

------------------------------------------------------------
7.1 CAMERA MANAGER
------------------------------------------------------------

Implement camera acquisition, stream lifecycle, permission errors, camera
disconnection, and recovery.

Handle browser APIs safely.

Stop camera tracks when the session ends according to the intended lifecycle.

Avoid unintentionally opening multiple independent camera streams.

------------------------------------------------------------
7.2 FACE DETECTION
------------------------------------------------------------

Use MediaPipe Tasks Vision or the compatible approach specified by the
architecture document.

Detect:

- Zero visible faces.
- One visible face.
- Multiple visible faces.

Use a configurable grace period before recording sustained face absence.

Do not create an absence event for every temporary missed frame.

------------------------------------------------------------
7.3 HEAD POSE
------------------------------------------------------------

Use facial landmarks and calibrated head-pose rules.

Do not treat every sideways or downward glance as suspicious.

Implement:

- Forward baseline calibration.
- Orientation estimation.
- Configurable thresholds.
- Duration threshold.
- Grace period.
- Event start and clear behavior.
- Appropriate event metadata.

Test both brief harmless glances and sustained head turns.

------------------------------------------------------------
7.4 PHONE DETECTION
------------------------------------------------------------

Use a suitable locally executable pretrained detector.

Do not assume model compatibility or license permissions without checking.

Implement:

- Model loading.
- Confidence threshold.
- Persistence rule.
- Bounding-box extraction.
- Candidate evidence capture.
- Confirmed-event handling.
- Model-unavailable state.

Test phone-like objects and missed detections.

------------------------------------------------------------
7.5 EVENT ENGINE
------------------------------------------------------------

Build a shared event rule engine.

The pipeline must be:

Frame
-> Detection
-> Rule evaluation
-> Candidate evidence
-> Event confirmation or inconclusive outcome
-> Local persistence
-> Warning
-> Synchronization queue
-> Professor timeline and report

Use the event types defined in data-model.md.

Do not create one new event per frame for a sustained condition.

Maintain consistent timestamps and attempt relationships.

------------------------------------------------------------
7.6 IMMEDIATE EVIDENCE CAPTURE
------------------------------------------------------------

Capture relevant candidate frames promptly when possible.

Do not wait for the full duration threshold before capturing the first
candidate frame.

Store snapshot blobs locally.

Associate evidence with the correct event or candidate.

A face-absence event may not have a face snapshot. Record that honestly.

------------------------------------------------------------
7.7 SHARED VIDEO PIPELINE
------------------------------------------------------------

Support two input adapters:

1. Live webcam.
2. Uploaded video.

Both must feed the shared frame-processing and event-rule engine.

Do not maintain two independent copies of detection logic.

============================================================
8. OFFLINE CONTINUITY — CRITICAL
============================================================

This requirement has higher priority than optional features.

Before an examination begins, download and verify:

- Exam metadata.
- Questions and options.
- Question ordering.
- Required configuration.
- Required local assets.
- Required model files.
- Attempt authorization.
- Other required package resources.

The student must not begin until mandatory offline prerequisites are ready.

After starting, the exam must continue during internet outages.

The following must continue locally:

- Question display.
- Navigation.
- Answer saving.
- Timer.
- Camera monitoring when camera and model resources remain available.
- Event recording.
- Snapshot capture.
- Warning display.
- Submission.

Network loss must not automatically submit the exam.

Do not terminate the exam simply because an API request fails.

Display a visible but non-blocking connectivity warning.

Use the same local-first pipeline online and offline.

Do not create a separate offline exam implementation.

============================================================
9. ORDERED SYNCHRONIZATION
============================================================

Implement the protocol specified by sync-protocol.md and api-contracts.md.

Each operation must use:

- Stable operation UUID.
- Attempt UUID.
- Attempt-scoped sequence number.
- Operation type.
- Entity ID.
- Timestamp.
- Payload.
- Required payload hash or metadata.
- Synchronization state.

Allocate sequence numbers transactionally with the outbox operation.

Never reuse a sequence number for a different operation.

Implement:

- Persistent outbox.
- Ordered synchronization.
- Idempotent server ingestion.
- Explicit acknowledgements.
- Retry with backoff.
- Startup reconciliation.
- Connectivity-change handling.
- Interrupted-request recovery.
- Sequence-gap detection.
- Snapshot upload acknowledgements.
- Final submission boundary validation.

The server must reject conflicting operation-ID reuse.

Repeated identical requests must not create duplicate logical records.

A later operation must not silently bypass a missing required earlier operation.

Do not mark a snapshot synchronized before the server confirms storage.

Do not mark a submission server-confirmed before the server acknowledges it.

A locally submitted exam must remain distinguishable from a server-confirmed
submission.

The professor dashboard must not pretend to show unsynchronized events.

============================================================
10. BACKEND IMPLEMENTATION
============================================================

Use FastAPI, SQLAlchemy, Alembic, Pydantic, and PostgreSQL.

Follow the detailed API contracts.

Implement separate modules for:

- Authentication.
- Users.
- Exams.
- Questions.
- Excel import.
- Attempts.
- Answers.
- Synchronization.
- Events.
- Snapshots.
- Reports.
- Retakes.
- Settings.
- Audit logs.
- Video-analysis sessions.
- Health checks.

Use API version prefix:

/api/v1

Do not invent incompatible request and response structures where the
specification already defines them.

Implement the specified endpoint families, including the relevant:

- Health and readiness routes.
- Authentication routes.
- User-management routes.
- Exam-management routes.
- Question-management routes.
- Excel-import routes.
- Attempt-authorization routes.
- Exam-package routes.
- Synchronization routes.
- Submission routes.
- Snapshot metadata and binary-upload routes.
- Professor monitoring routes.
- Event and evidence routes.
- Report routes.
- Settings routes.
- Audit routes.
- Video-analysis routes.
- WebSocket monitoring route.

Use the exact paths and payload requirements from api-contracts.md.

Enforce authorization in the backend.

Use database constraints and transactions.

Never trust a role, student identity, attempt ownership, or exam permission
supplied only by the frontend.

Implement database migrations.

Provide a clear setup procedure.

============================================================
11. DATABASE REQUIREMENTS
============================================================

Use data-model.md as the authoritative detailed data specification.

Implement the required entities, including:

- users
- exams
- questions
- question versions
- exam_attempts
- answers
- proctor_events
- snapshots
- sync_operations
- retake_grants
- system_settings
- audit_logs
- video_analysis_sessions

Preserve any additional required entities in the existing schema.

Use UUID identifiers.

Store USN as a normalized string.

Enforce unique constraints and foreign keys.

Use timezone-aware server timestamps.

Keep answer keys separate from student-visible examination packages.

Preserve attempt history.

A retake must create a new attempt.

Do not overwrite an existing submitted attempt.

Use object storage for hosted snapshot binaries according to the configured
deployment architecture. Keep snapshot metadata in PostgreSQL.

============================================================
12. EXCEL IMPORT
============================================================

Use openpyxl.

Implement:

- File validation.
- Worksheet selection.
- Row parsing.
- Column validation.
- MCQ validation.
- Short-answer validation.
- Marks validation.
- Correct-option validation.
- Duplicate handling.
- Preview.
- Row-level errors.
- Correction before confirmation.
- Confirmed import.

Do not silently discard invalid rows.

Do not permanently import questions before the required confirmation step.

Provide a downloadable template.

============================================================
13. REPORTING
============================================================

Use ReportLab for PDF reports.

The report must include:

- ExamProctor.ai branding.
- Exam details.
- Student name and USN.
- Attempt identifier.
- Start and submission times.
- Synchronization state.
- Event counts.
- Event timeline.
- Event durations where applicable.
- Available snapshots.
- Missing-evidence indicators.
- Relevant detector metadata.
- Human-review disclaimer.

Ensure that dashboard counts and PDF counts follow the same filtering rules.

Do not describe events as conclusive proof of cheating.

============================================================
14. SECURITY AND PRIVACY
============================================================

Implement backend-enforced authorization.

Students must not access another student's answers, attempts, snapshots, or
reports.

Professors must not access or modify unauthorized examinations.

Protect administrator routes.

Hash passwords appropriately.

Do not commit secrets.

Use environment variables.

Validate uploads.

Restrict snapshot access.

Do not expose private evidence through public unauthenticated URLs.

Do not log passwords or authentication tokens.

Record important administrative actions in audit logs.

============================================================
15. TESTING
============================================================

Read testing-plan.md in full.

Implement tests that correspond to its requirements.

Use:

- Vitest.
- React Testing Library.
- pytest.
- Playwright.

At minimum, test:

1. Face present.
2. Face absent.
3. Multiple faces.
4. Brief sideways glance.
5. Sustained head turn.
6. Looking down to read.
7. Phone visible.
8. Phone-like object.
9. Poor lighting.
10. Camera disconnection.
11. Event persistence.
12. Snapshot persistence.
13. Warning dismissal.
14. Answer persistence.
15. Manual submission.
16. Offline continuation.
17. Offline submission.
18. Reconnection and synchronization.
19. Ordered operations.
20. Duplicate-operation retry.
21. Sequence gaps.
22. Snapshot upload failure.
23. Backend permissions.
24. Excel import validation.
25. Professor monitoring.
26. Report consistency.
27. Uploaded-video analysis.
28. Recovery after supported reloads.
29. Theme switching.
30. UI readability and accessibility.

Support the ten scripted evaluation clips described in testing-plan.md.

Do not fabricate test results.

If no actual test clip is available, create the test harness and document
which real clip-based evaluations remain unexecuted.

Record actual failures and limitations.

============================================================
16. REQUIRED IMPLEMENTATION ORDER
============================================================

Follow this order unless an existing implementation requires a justified
adjustment.

PHASE 0: REPOSITORY AUDIT

- Inspect the repository.
- Read all specification documents.
- Create a requirements checklist.
- Identify missing files and dependencies.
- Reconcile naming and technical decisions.
- Document conflicts before resolving them.

PHASE 1: FOUNDATION

- Frontend setup.
- Backend setup.
- Environment configuration.
- Database setup.
- Migrations.
- Routing.
- Theme system.
- Design tokens.
- Shared components.
- Authentication foundation.

PHASE 2: LOCAL DATA ENGINE

- Dexie database.
- Repositories.
- Exam package storage.
- Answer persistence.
- Event persistence.
- Snapshot persistence.
- Outbox.
- Atomic transactions.

PHASE 3: COMPUTER VISION

- Camera manager.
- Face detection.
- Multiple-face detection.
- Head-pose estimation.
- Phone detection.
- Event rule engine.
- Candidate evidence capture.
- Event persistence.

PHASE 4: STUDENT EXAM

- Exam-code entry.
- Exam package download.
- Readiness checks.
- Question interface.
- Answer saving.
- Timer.
- Camera preview.
- Warning cards.
- Manual submission.

PHASE 5: SYNCHRONIZATION

- Persistent outbox.
- Ordered sync worker.
- Server acknowledgements.
- Idempotent ingestion.
- Sequence validation.
- Retry handling.
- Startup reconciliation.
- Snapshot upload.
- Submission finalization.

PHASE 6: PROFESSOR FEATURES

- Exam builder.
- Question bank.
- Excel import.
- Publication.
- Live monitoring.
- Event timeline.
- Evidence viewer.
- Retakes.
- PDF reports.

PHASE 7: ADMINISTRATION

- User management.
- Role management.
- Settings.
- Audit logs.
- System health.

PHASE 8: VIDEO ANALYSIS

- Upload.
- Validation.
- Shared frame pipeline.
- Timeline.
- Evidence.
- Results.

PHASE 9: STABILIZATION

- Run tests.
- Fix critical bugs.
- Test repeated outages.
- Test local recovery.
- Test security.
- Test report consistency.
- Verify the production build.
- Update documentation.

Do not skip ahead to optional identity recognition or liveness detection while
critical persistence and synchronization requirements remain broken.

============================================================
17. REQUIRED DEVELOPER EXPERIENCE
============================================================

Provide a complete README.md containing:

- Project overview.
- Architecture overview.
- Prerequisites.
- Frontend installation.
- Backend installation.
- Environment variables.
- Database setup.
- Migration commands.
- Development startup commands.
- Test commands.
- Production build instructions.
- Model setup and licensing notes.
- Offline-testing procedure.
- Known limitations.

Provide .env.example with safe placeholder values only.

Do not put real secrets into the repository.

Provide database migration files.

Provide a reliable local development workflow.

Where practical, configure Docker Compose for PostgreSQL and the backend
development environment, without making Docker the only supported way to
develop the frontend.

Use separate environment configurations for development and production.

Do not hard-code a production API URL.

============================================================
18. ACCEPTANCE CHECKLIST
============================================================

The project is not complete until the following have been verified.

FRONTEND:
[ ] All required routes exist.
[ ] Role-specific navigation works.
[ ] Light mode works.
[ ] Dark mode works.
[ ] Theme preference persists.
[ ] No grey text is used.
[ ] Lucide React icons are used.
[ ] Forms are readable.
[ ] Tables are readable.
[ ] Camera preview works.
[ ] Warning cards work.
[ ] Student answer interface works.
[ ] Synchronization states are accurate.

BACKEND:
[ ] Authentication works.
[ ] Role permissions are enforced.
[ ] Exam creation works.
[ ] Question management works.
[ ] Excel import works.
[ ] Attempt authorization works.
[ ] Sync ingestion works.
[ ] Sequence validation works.
[ ] Snapshot upload works.
[ ] Submission finalization works.
[ ] Reports work.
[ ] Retake authorization works.
[ ] Audit logs work.

COMPUTER VISION:
[ ] Face detection is integrated.
[ ] Multiple-face detection is integrated.
[ ] Sustained head-turn rules work.
[ ] Phone detection is integrated.
[ ] Event records persist locally.
[ ] Candidate evidence capture works where possible.
[ ] Camera/model failures are represented honestly.

OFFLINE:
[ ] Exam package can be prepared before disconnection.
[ ] Questions remain available offline.
[ ] Answers persist offline.
[ ] Countdown continues according to policy.
[ ] Local CV continues when required assets remain available.
[ ] Events persist offline.
[ ] Snapshots persist offline.
[ ] Manual submission works offline.
[ ] Connectivity loss does not auto-submit.
[ ] Sync resumes after reconnection.
[ ] Retries do not create duplicate records.
[ ] Sequence gaps are handled.
[ ] Server-confirmed states require acknowledgements.

PROFESSOR:
[ ] Exam creation works.
[ ] Six-digit exam code is available.
[ ] Student status is accurate.
[ ] Event counts are correct.
[ ] Event evidence can be inspected.
[ ] PDF reports are generated.
[ ] Retakes preserve previous attempts.

TESTING:
[ ] Critical unit tests pass.
[ ] Critical integration tests pass.
[ ] Critical end-to-end tests pass.
[ ] Offline recovery tests have been run.
[ ] Ten-clip test harness exists.
[ ] Actual detection limitations are documented.

DOCUMENTATION:
[ ] README is complete.
[ ] Environment setup is documented.
[ ] Database migrations are documented.
[ ] Test commands are documented.
[ ] Known limitations are documented.

Do not mark an item complete unless it has been implemented and verified.

============================================================
19. FINAL EXECUTION INSTRUCTIONS
============================================================

Begin by inspecting the repository and reading all six specification
documents, including the PRD and the five existing technical documents.

Then produce a concise initial assessment containing:

1. Existing repository structure.
2. Existing implementation status.
3. Missing requirements.
4. Specification conflicts, if any.
5. Recommended implementation phases.
6. Critical risks.
7. The first implementation milestone.

After the assessment, begin implementation.

Do not stop after writing a plan.

Create and modify the actual project files.

Run available tests and builds.

Fix errors caused by your changes.

If a test cannot run because a dependency, model, database, or test asset is
missing, report the exact reason and what remains necessary.

Keep the documentation synchronized with the implementation.

At the end of each phase, report:

- Files created or modified.
- Features completed.
- Tests run.
- Actual test results.
- Known limitations.
- Next implementation step.

Do not claim success without evidence.

The final goal is a working ExamProctor.ai implementation, not a mockup.

Start with the repository audit now.============================================================
20. FINAL SAFEGUARDS AND IMPLEMENTATION RULES
============================================================

1. SOURCE-OF-TRUTH CHECK
Before implementation, verify that the PRD and all five technical
documents actually exist and have been read completely. If any document
is missing, report it instead of pretending it was reviewed. Do not
invent undocumented API endpoints or silently change established contracts.

2. WORKING SOFTWARE, NOT JUST UI
Every implemented button, form, filter, navigation item, and action must
perform its intended function. Connect frontend features to real backend
services or the local database as appropriate. Clearly label any remaining
incomplete feature. Never disguise mock data as production data.

3. END-TO-END VERIFICATION
Verify complete workflows, not just individual pages:
- Administrator creates a user.
- Professor creates, imports, publishes, and monitors an examination.
- Student is authorized, downloads the exam package, completes the exam,
  and submits it.
- The exam continues during network loss and synchronizes after reconnection.
- The professor reviews synchronized events and generates a PDF report.
- An authorized retake creates a new attempt without overwriting history.

4. OFFLINE DATA SAFETY
Test actual browser network disconnection, reload/recovery where supported,
duplicate retries, interrupted uploads, missing sequence numbers, and
submission before reconnection. Never claim offline support based solely
on service-worker caching. Preserve locally stored data and pending
operations during failures and migrations.

5. COMPUTER-VISION HONESTY
Use real locally executable models and verify that their files load.
Do not generate fake detection results. Clearly distinguish candidate,
confirmed, cleared, and inconclusive events according to the documented
event model. Use configurable thresholds and persistence rules to reduce
false positives. An event is an observation requiring context, not proof
of misconduct. Never automatically fail a student based solely on detections.

6. MODEL AND DEPENDENCY LICENSING
Before selecting or integrating a pretrained model, verify its actual
license, weight-file terms, browser compatibility, redistribution rights,
and commercial-use restrictions. Document the chosen model and its source.
Do not download huge models or introduce paid dependencies without
checking feasibility and explaining the trade-offs.

7. SECURITY AND PRIVACY
Use secure password hashing, appropriate authentication, backend-enforced
role permissions, input validation, protected evidence access, and safe
error handling. Never expose answer keys to students or place secrets in
frontend code. Minimize retained camera evidence and document retention
and deletion behavior. Do not treat client timestamps as authoritative
server timestamps.

8. ACCESSIBILITY AND RESPONSIVENESS
Verify keyboard navigation, visible focus, accessible labels, readable
contrast, reduced-motion preferences, and usable layouts on laptop and
smaller screens. Preserve the strict no-grey-text requirement in both
themes, including placeholders, disabled controls, tables, and timestamps.

9. BUILD AND ENVIRONMENT RELIABILITY
Provide reproducible installation and startup instructions. Validate
environment variables, database connectivity, migrations, model assets,
and frontend production builds. Provide meaningful health and readiness
checks. Handle unavailable dependencies gracefully without falsely
reporting the application as ready.

10. TEST EVIDENCE
Run the tests that the available environment supports. Report exact
commands, pass/fail results, skipped tests, and reasons for failures.
Never claim that a feature or test is complete without verification.
Maintain a requirements-to-tests checklist and update it as work proceeds.

11. IMPLEMENTATION PRIORITY
Prioritize a complete, secure, locally persistent examination workflow
and reliable synchronization before optional enhancements. Do not
sacrifice core reliability to add animations, extra dashboards, face
recognition, liveness detection, or other advanced features.

12. CONTINUOUS PROGRESS
Work phase by phase without waiting for approval after every routine step.
If blocked, explain the specific blocker, implement independent work that
can proceed safely, and record what remains. Do not stop after creating
the plan or initial UI.

13. FINAL HANDOVER
Provide:
- A summary of implemented functionality.
- The final project structure.
- Setup and startup commands.
- Database migration and test commands.
- Required model assets and their licenses.
- Actual test and build results.
- Known bugs and incomplete features.
- Offline-testing instructions.
- A checklist separating VERIFIED, IMPLEMENTED BUT UNVERIFIED,
  and NOT IMPLEMENTED requirements.

Start implementation immediately after the initial repository audit.