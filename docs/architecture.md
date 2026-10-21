# ExamGuard AI — System Architecture

**Document status:** Baseline implementation specification  
**Version:** 1.1  
**Project:** ExamGuard AI — Smart Exam Proctor  
**Frontend:** React + Vite + JavaScript  
**Backend:** Python + FastAPI  
**Central database:** PostgreSQL  
**Local database:** IndexedDB using Dexie.js  
**Primary objective:** Reliable examination monitoring with uninterrupted local execution and automatic synchronization across repeated internet disconnections.

---

# 1. Purpose

ExamGuard AI is an examination platform designed to combine computer-vision-based monitoring, examination management, local-first data storage, resilient synchronization, evidence collection, and post-exam reporting.

The system has three primary user roles:

1. System administrator.
2. Professor.
3. Student.

The mandatory monitoring features are:

- Face absence detection.
- Multiple-face detection.
- Sustained head-orientation detection.
- Mobile-phone detection.
- Prompt evidence capture.
- Event logging.
- Dismissible warning notifications.
- Live monitoring while connected.
- Post-exam event timelines.
- PDF report generation.
- Live webcam and uploaded-video analysis.

The principal additional requirement is that a student must be able to complete an already-authorized examination despite repeated internet disconnections.

The examination must not depend on a continuously available cloud API.

Questions, answers, countdown, local computer vision, event recording, warning generation, snapshot capture, and local submission must continue to work without an internet connection.

The system must synchronize locally stored information with the central server whenever connectivity returns.

This document defines the architecture and workflows. Detailed database entities, API contracts, synchronization rules, and acceptance tests are specified in:

- `data-model.md`
- `api-contracts.md`
- `sync-protocol.md`
- `testing-plan.md`

---

# 2. Core engineering decisions

The following decisions are the baseline for implementation.

| Concern | Decision |
|---|---|
| Frontend | React + Vite + JavaScript |
| UI styling | CSS or Tailwind CSS |
| Routing | React Router |
| Local structured storage | IndexedDB through Dexie.js |
| Static asset caching | Service worker / PWA caching |
| Face analysis | MediaPipe Tasks Vision |
| Head-pose analysis | Facial landmarks and calibrated rules |
| Phone detection | Pretrained local object detector |
| Backend | Python + FastAPI |
| API validation | Pydantic |
| ORM | SQLAlchemy |
| Database migrations | Alembic |
| Central database | PostgreSQL |
| Local snapshot storage | IndexedDB Blob records |
| Hosted snapshot storage | Durable object storage |
| Excel import | openpyxl |
| PDF reports | ReportLab |
| Online dashboard updates | WebSockets with polling fallback |
| Frontend unit tests | Vitest and React Testing Library |
| End-to-end tests | Playwright |
| Backend tests | pytest |
| Initial deployment | Local development environment |
| Hosted deployment | Vercel frontend and a suitable Python backend host, such as Render |
| Windows packaging | Electron, after core requirements work |
| Android packaging | Later phase |
| Face identity recognition | Later phase |
| Liveness / presentation-attack detection | Later phase |

## 2.1 One application pipeline

The system must not have separate answer-saving implementations for online and offline operation.

Online and offline examinations use the same local-first exam engine.

The difference is whether the synchronization worker can currently communicate with the central API.

Every answer, event, and submission follows this principle:

1. Validate the action.
2. Persist the change locally.
3. Record the corresponding synchronization operation.
4. Confirm local persistence to the UI.
5. Synchronize when the API is reachable.
6. Mark the operation acknowledged only after receiving a valid server acknowledgement.

The frontend must not wait for a cloud response before saving an answer locally.

## 2.2 Local-first does not mean serverless forever

The central server remains responsible for:

- Authentication.
- Exam authorization.
- Initial attempt authorization.
- Question package generation.
- Central data persistence.
- Synchronization validation.
- Role and resource authorization.
- Evidence storage coordination.
- Professor monitoring.
- Reports.
- Retake authorization.
- Audit records.

The local client handles examination execution while disconnected.

The central server remains the authoritative destination for synchronized examination records.

---

# 3. Product requirements

## 3.1 Mandatory computer-vision monitoring

The monitoring system must detect or evaluate the following conditions:

1. No face visible.
2. Multiple faces visible.
3. Sustained head orientation away from the configured forward range.
4. A possible mobile phone visible.

Each detector must produce structured observations that can be consumed by a shared event-rule engine.

The application must not create one confirmed event for every video frame.

Instead, the event engine must combine confidence, persistence, duration, and event lifecycle rules.

For example, a phone that remains visible for several seconds should normally produce one logical event lifecycle rather than hundreds of duplicate events.

The exact detection thresholds must be calibrated using the evaluation clips and ordinary student behavior.

A detector confidence score must never be presented as the probability that a student cheated.

All automated detections are observations requiring appropriate interpretation and human review.

## 3.2 Prompt evidence capture

Evidence capture must not wait until a long-duration event is fully confirmed.

When a relevant candidate detection occurs:

1. Capture the current frame or an appropriate recent frame promptly.
2. Store the evidence locally.
3. Associate it with the candidate event.
4. Apply the configured event-confirmation rules.
5. Preserve the evidence if the event becomes confirmed or requires review.
6. Record evidence availability and synchronization status.

A small rolling frame buffer may be used to preserve recent context.

The system should aim to capture evidence within a fraction of a second of a detected phone or additional face, subject to actual device performance.

The event engine must not delay all evidence capture until the end of a sustained detection interval.

For face absence, a useful face image may not exist. The system must instead preserve appropriate camera-state metadata and surrounding evidence when available.

## 3.3 Event records

A logical event should contain, where applicable:

- Event identifier.
- Attempt identifier.
- Event type.
- Event status.
- Start timestamp.
- End timestamp.
- Duration.
- Detector confidence.
- Detection metadata.
- Bounding-box coordinates.
- Detector and rule versions.
- Snapshot references.
- Local sequence number.
- Server receipt timestamp.
- Synchronization status.

The local event must be stored before the application claims that it has been saved successfully.

Warning dismissal must never delete an event or its evidence.

## 3.4 Examination management

The application must support:

### System administrator

- Create and manage accounts.
- Assign roles.
- Activate and deactivate accounts.
- Reset credentials through a controlled workflow.
- Configure system-wide defaults.
- Review administrative audit records.
- Review system health and synchronization failures.
- Configure appropriate retention and operational policies.

### Professor

- Create and edit examinations.
- Create MCQ questions.
- Create short-answer questions.
- Import questions from Excel.
- Preview imported questions.
- Correct validation errors.
- Publish examinations.
- Generate six-digit exam codes.
- Configure permitted examination settings.
- View active and disconnected attempts.
- View student start and submission information.
- View event counts by category.
- Open event details and snapshots.
- Download PDF reports.
- Authorize retakes through a controlled mechanism.

### Student

- Sign in using an authorized account.
- Enter a six-digit exam code.
- View examination information and instructions.
- Complete readiness checks.
- Download and validate the examination package.
- Start the examination.
- Answer questions and navigate between them.
- View a compact camera preview.
- Enlarge the camera preview.
- Receive non-accusatory warning cards.
- Continue answering while disconnected.
- Submit locally when offline.
- View actual synchronization status.

## 3.5 USN-based student identity

The student's college USN is the unique institutional identifier.

For example:

`2VD23MI001`

The USN must be stored as a normalized string, not an integer.

Names are not unique and must never be used as the primary identifier for a student.

The database must use a generated internal UUID as the primary key for the user record.

The normalized USN must have a unique database constraint.

The student's displayed identity should combine their name and USN when appropriate.

Example:

`Tejas — 2VD23MI001`

The USN identifies the institutional student account. It does not, by itself, prove that the person in front of the camera is that student.

## 3.6 Attempt and retake rules

A student must not be able to create unlimited attempts simply by reusing the six-digit exam code.

The server must enforce the initial-attempt policy.

A professor-authorized retake creates a new attempt with:

- A new attempt UUID.
- A new authorization.
- An incremented attempt number.
- A reference to the previous attempt where appropriate.

Previous attempts must remain unchanged.

A retake must not overwrite the previous attempt's answers, events, snapshots, submission information, or report.

The six-digit exam code identifies the examination. It is not a substitute for authentication or attempt authorization.

---

# 4. System architecture

The system consists of the following major components.

```text
                         EXAMGUARD AI
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
       ADMIN / PROFESSOR                  STUDENT CLIENT
          WEB APPLICATION                 LOCAL EXAM ENGINE
              |                                 |
              |                         +-------+--------+
              |                         |                |
              |                         v                v
              |                    EXAM MODULE      CV MODULE
              |                         |                |
              |                         |         +------+------+
              |                         |         |             |
              |                         |         v             v
              |                         |     FACE / HEAD    PHONE
              |                         |       ANALYSIS    DETECTOR
              |                         |         |             |
              |                         |         +------+------+
              |                         |                |
              |                         |                v
              |                         |          EVENT ENGINE
              |                         |                |
              |                         |                v
              |                         |         EVIDENCE CAPTURE
              |                         |                |
              |                         +-------+--------+
              |                                 |
              |                                 v
              |                          LOCAL STORAGE
              |                           IndexedDB
              |                                 |
              |                                 v
              |                            SYNC OUTBOX
              |                                 |
              +---------------+-----------------+
                              |
                      INTERNET AVAILABLE?
                              |
                     +--------+--------+
                     |                 |
                    YES                NO
                     |                 |
                     v                 v
                CENTRAL API       CONTINUE LOCALLY
                     |            NO CLOUD REQUIRED
                     v
                POSTGRESQL
                     |
                     v
             DURABLE EVIDENCE STORAGE
                     |
                     v
           PROFESSOR DASHBOARD / REPORTS

5. Frontend architecture
5.1 Frontend responsibilities

The frontend provides:

Authentication screens.
Role-specific navigation.
Administrator pages.
Professor pages.
Student examination entry.
Examination instructions.
Camera readiness checks.
Examination question display.
Local answer saving.
Local countdown.
Camera preview and enlargement.
Computer-vision overlays.
Warning cards.
Connectivity indicators.
Synchronization status.
Event review interfaces.
Report download interfaces.

The frontend must not directly write arbitrary database records from unrelated UI components.

Use typed or consistently structured repository functions to access local storage.

Even though the project uses JavaScript, define stable object shapes and validate data at important boundaries.

5.2 Recommended frontend organization
frontend/
├── public/
│   ├── models/
│   └── icons/
│
├── src/
│   ├── app/
│   │   ├── App.jsx
│   │   ├── router.jsx
│   │   └── providers.jsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── feedback/
│   │   └── common/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── admin/
│   │   ├── exams/
│   │   ├── questions/
│   │   ├── exam-entry/
│   │   ├── exam-session/
│   │   ├── proctoring/
│   │   ├── identity/
│   │   ├── sync/
│   │   ├── reports/
│   │   └── settings/
│   │
│   ├── services/
│   │   ├── api/
│   │   ├── connectivity/
│   │   └── logging/
│   │
│   ├── storage/
│   │   ├── database.js
│   │   ├── repositories/
│   │   ├── migrations/
│   │   └── outbox/
│   │
│   ├── workers/
│   │   ├── vision.worker.js
│   │   └── sync.worker.js
│   │
│   ├── hooks/
│   ├── utils/
│   ├── styles/
│   └── main.jsx
│
├── tests/
├── package.json
└── vite.config.js

This is the target organization, not a requirement to create every file immediately.

Create modules when the corresponding functionality is implemented.

Do not place the complete examination system, synchronization engine, and computer-vision pipeline inside one large React component.

6. Backend architecture
6.1 Backend responsibilities

The Python + FastAPI service provides:

Authentication and authorization.
User administration.
Examination management.
Question management.
Excel import and validation.
Examination package generation.
Attempt authorization.
Retake authorization.
Synchronization ingestion.
Snapshot upload coordination.
Central event persistence.
Professor monitoring data.
Report generation.
Audit logging.
System settings.
Health and operational diagnostics.

The backend must validate all incoming data.

The frontend cannot be trusted to enforce roles, attempt ownership, answer validity, event ownership, or retake rules.

6.2 Recommended backend organization
backend/
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   └── v1/
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── exams.py
│   │       ├── questions.py
│   │       ├── attempts.py
│   │       ├── sync.py
│   │       ├── snapshots.py
│   │       ├── monitoring.py
│   │       ├── reports.py
│   │       ├── retakes.py
│   │       └── settings.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── permissions.py
│   │   └── errors.py
│   │
│   ├── db/
│   │   ├── session.py
│   │   ├── base.py
│   │   └── models/
│   │
│   ├── schemas/
│   ├── repositories/
│   ├── services/
│   │   ├── authentication.py
│   │   ├── exam_service.py
│   │   ├── attempt_service.py
│   │   ├── package_service.py
│   │   ├── sync_service.py
│   │   ├── snapshot_service.py
│   │   ├── excel_import_service.py
│   │   ├── report_service.py
│   │   ├── retake_service.py
│   │   └── settings_service.py
│   │
│   ├── storage/
│   └── tests/
│
├── alembic/
├── alembic.ini
├── requirements.txt
└── .env.example

The backend must not require a continuous connection to the student client.

It receives updates whenever the student is connected and synchronizes pending records when the student reconnects.

7. Local-first examination engine

The local examination engine is the central component responsible for uninterrupted student activity.

It must continue working when the central API is unavailable.

7.1 Responsibilities

The local exam engine manages:

Authorized examination package.
Local attempt state.
Question navigation.
Current answers.
Answer revisions.
Exam countdown.
Local submission.
Proctoring observations.
Event lifecycles.
Evidence capture.
Warning notifications.
Connectivity state.
Synchronization state.
Recovery after supported reloads or restarts.

The engine must not fetch the next question from the cloud during the examination.

All assigned questions must be downloaded and validated before the student starts.

7.2 Examination package preparation

When a student enters an exam code:

Authenticate the student.
Validate the six-digit exam code.
Verify the exam is available.
Verify the student's eligibility.
Check the initial-attempt and retake rules.
Create or authorize the correct attempt.
Issue the attempt identifier and authorization.
Download the complete assigned question package.
Download any required attachments.
Ensure required application assets and model files are available locally.
Verify package integrity.
Persist the package locally.
Read the saved package back and validate it.
Run readiness checks.
Permit the student to start only when required resources are ready.

The student package must exclude correct answer keys and private grading rules.

The server must provide only the questions assigned to the authorized attempt.

The package should include:

Exam metadata.
Attempt ID.
Package version.
Question identifiers.
Question ordering.
Question text.
MCQ options where applicable.
Marks and question type.
Exam duration.
Proctoring configuration.
Required asset manifest.
Package integrity information.
Authorization metadata.
7.3 No cloud dependency after start

After the exam begins, the following operations must work locally:

Display the next downloaded question.
Display the previous question when allowed.
Change an answer.
Save an answer.
Update the countdown.
Capture webcam frames.
Run local computer vision.
Record monitoring events.
Capture snapshots.
Display warnings.
Record fullscreen or page-visibility observations.
Save a final submission.

A cloud failure must not interrupt these operations.

8. Online, offline, and intermittent connectivity
8.1 One local write path

The online and offline modes use the same local storage layer.

When online, the application persists locally and then synchronizes.

When offline, the application persists locally and queues operations for later synchronization.

Student action
      |
      v
Validate action
      |
      v
Persist local record
      |
      v
Append sync operation
      |
      v
Local transaction succeeds?
      |
      +---- NO ----> Show local-storage error
      |
      +---- YES ---> Show locally saved state
                           |
                           v
                    API reachable?
                      /       \
                    YES        NO
                     |          |
                     v          v
                 Sync queue   Keep pending
                     |
                     v
              Server acknowledgement
                     |
                     v
               Mark acknowledged

The answer-saving logic must not be duplicated into separate online and offline implementations.

8.2 Local persistence

Use IndexedDB through Dexie.js for the browser-based implementation.

The local database must persist:

Exam packages.
Attempt state.
Answers.
Answer revisions where required.
Event records.
Snapshot Blobs.
Synchronization operations.
Acknowledgement state.
Submission state.
Relevant recovery metadata.

All related changes must be committed transactionally where supported.

For example, saving an answer and appending its synchronization operation must occur in the same IndexedDB transaction.

The UI must display a successful local-save indicator only after the transaction commits.

8.3 Synchronization while online

The application should synchronize continuously while the API is reachable.

It must not wait until the student presses Submit.

This allows the professor's dashboard to receive updates while the student is connected.

The synchronization worker must:

Check API reachability.
Reconcile local and server synchronization state.
Select the oldest unacknowledged operation.
Send a bounded batch of ordered operations.
Process per-operation acknowledgements.
Update local synchronization state.
Upload required snapshot data.
Continue until caught up or a failure requires retry.
Resume after connectivity returns.
8.4 Offline behavior

When internet connectivity disappears:

The exam continues.
The timer continues.
Questions remain available.
Answers are saved locally.
Computer vision continues locally.
Events continue to be recorded.
Snapshots continue to be captured and stored.
Warning cards continue to work.
The student can navigate between questions.
Manual submission remains available.
Pending operations remain in the local outbox.

Display a message such as:

"No internet connection. Offline mode active; your exam will continue."

Do not automatically submit the examination because of a network failure.

8.5 Repeated connectivity changes

The system must support repeated transitions such as:

ONLINE
   |
   v
Save and synchronize answers 1–10
   |
   v
OFFLINE
   |
   v
Save answers 11–13 and monitoring events locally
   |
   v
ONLINE
   |
   v
Synchronize the oldest unacknowledged operations
   |
   v
OFFLINE AGAIN
   |
   v
Continue answering and recording events locally
   |
   v
ONLINE AGAIN
   |
   v
Resume synchronization
   |
   v
All required operations acknowledged

Previously acknowledged operations must not be inserted again as new records.

Operations whose acknowledgements were lost must be retried using their original operation IDs.

The server must return the original result for an identical retry.

8.6 Correctness of synchronization order

The synchronization engine must preserve the logical order of operations within an attempt.

Each operation receives:

A stable operation ID.
An attempt ID.
An attempt-scoped sequence number.
An operation type.
An entity ID.
A payload.
A payload hash.
A client creation timestamp.

Sequence allocation and outbox insertion must be atomic.

The server must detect missing required sequence numbers.

An operation must not be silently skipped because a later operation arrived first.

The exact request and acknowledgement rules are defined in sync-protocol.md and api-contracts.md.

8.7 Snapshot synchronization

Snapshot files are binary data and may take longer to upload than ordinary records.

The local client must retain each snapshot until the server confirms durable receipt.

A snapshot must not be marked uploaded merely because an upload request was started.

The event record and snapshot metadata must preserve their relationship during retries.

The professor's interface must distinguish between:

Evidence available on the server.
Evidence pending synchronization.
Evidence upload failure.
Evidence unavailable.

The report must never imply that a pending snapshot has already been uploaded.

8.8 Browser limitations

The browser-based version cannot guarantee that the operating system will never evict local data or that a determined user cannot tamper with the device.

The application should request persistent browser storage where supported, monitor quota errors, and fail readiness when required storage cannot be used.

If storage fails during an exam, show a critical warning and do not claim that unsaved data is safe.

A browser service worker caches application resources; it does not automatically implement the synchronization protocol.

The synchronization worker must be implemented explicitly.

Background execution is not guaranteed after the browser or application is closed. The application must resume pending synchronization when reopened or brought back into an active state.

9. Countdown and recovery

The exam timer must not depend on periodic requests to the central API.

The timer should use a monotonic clock during an active session where supported.

The system must distinguish:

The server-recorded start time.
The client-reported start time.
Local elapsed time.
The locally recorded submission time.
The server receipt time.

The application must not rely solely on the computer's wall clock for countdown calculations.

9.1 Reload or restart recovery

If a supported reload or restart occurs:

Reopen the local database.
Validate the local attempt.
Load the authorized package.
Recover answers and event state.
Recover the synchronization outbox.
Restore the attempt's timing state according to the configured policy.
Reconcile server state if connected.
Resume the existing attempt when allowed.

Do not create a new attempt simply because the page reloads.

Do not reset the operation sequence counter.

Do not clear pending records after a failed migration.

The timer must not restart from the full original duration after a reload.

For the initial browser prototype, recovery should be tested on supported browsers and devices. The application must document any remaining limitations.

10. Computer-vision architecture

The computer-vision pipeline must be shared between live webcam monitoring and uploaded-video analysis.

Both input modes must feed the same observation and event-processing logic.

                    INPUT ADAPTER
                         |
                +--------+--------+
                |                 |
                v                 v
           LIVE CAMERA        VIDEO FILE
                |                 |
                +--------+--------+
                         |
                         v
                 FRAME NORMALIZATION
                         |
                         v
                  FACE ANALYSIS
                         |
                         v
                   PHONE DETECTOR
                         |
                         v
                  HEAD-POSE ESTIMATE
                         |
                         v
                CANDIDATE OBSERVATIONS
                         |
                         v
                PROMPT EVIDENCE CAPTURE
                         |
                         v
                  EVENT RULE ENGINE
                         |
                         v
                EVENT LIFECYCLE UPDATE
                         |
                         v
                 LOCAL EVENT STORAGE
                         |
                         v
                 WARNING / VISUALIZATION
                         |
                         v
                 POST-EXAM REPORT DATA

The diagram describes logical stages. Implementations may schedule or execute compatible inference stages in parallel when doing so improves performance without compromising correctness.

10.1 Input adapters
Live webcam adapter

Responsibilities:

Request camera permission.
Acquire frames.
Record frame timestamps.
Detect camera disconnection.
Pass frames to the shared processing pipeline.
Display the live preview.
Avoid freezing the examination UI.
Uploaded-video adapter

Responsibilities:

Accept a supported video file.
Validate its format and size.
Decode frames.
Record video-relative timestamps.
Feed frames into the shared processing pipeline.
Generate the same event types where applicable.
Produce an event timeline and evidence.

Uploaded-video analysis must not pretend that the recording represents a live student session.

A recorded clip is an evaluation input, not proof that the person in the clip is the authenticated student.

The same detection engine can be used, but live exam sessions and offline video-analysis sessions must remain distinguishable in the data model.

10.2 Face detection and counting

Use a suitable pretrained face-analysis model.

The pipeline must:

Detect visible faces.
Record their bounding boxes.
Count the detected faces.
Track face presence over time where appropriate.
Start a face-absence candidate when no face is detected.
Apply a configurable grace period.
Create or update a logical event when the configured rules are satisfied.

A temporary camera interruption must not automatically be treated as proof of face absence.

10.3 Head-pose detection

Estimate head orientation using facial landmarks or compatible model outputs.

Use configurable angle ranges and duration thresholds.

A brief glance should not create a sustained-head-turn event.

The system must avoid making direct eye contact with the webcam a requirement for normal behavior.

Students may look at question text, answer options, permitted paper, or other legitimate materials.

The exact thresholds must be calibrated using evaluation clips and ordinary student behavior.

10.4 Phone detection

Use a pretrained object detector that can run locally.

The initial implementation should evaluate a model that supports a phone or cell-phone category.

The detector must produce:

Object class.
Bounding box.
Confidence score.
Frame timestamp.
Relevant detector metadata.

When a possible phone is detected:

Capture candidate evidence promptly.
Associate the evidence with the candidate event.
Apply configured confidence and persistence rules.
Update the event lifecycle.
Persist the event and snapshot locally.
Display an appropriate warning when configured.

A model may miss small, partially hidden, distant, or poorly illuminated phones.

False positives and false negatives must be measured against actual test clips.

10.5 Event rule engine

The event rule engine converts noisy per-frame observations into useful event lifecycles.

It must:

Use configurable thresholds.
Track candidate and confirmed events.
Avoid one event per frame.
Avoid duplicate active events for the same condition.
Record start and end timestamps.
Calculate duration consistently.
Preserve candidate evidence.
Resolve events according to policy.
Distinguish confirmed, inconclusive, and expired candidates where applicable.
Record detector and rule versions.
Handle camera and model failures explicitly.

The event engine must not automatically infer that a student cheated solely because an object or face was detected.

11. Identity recognition and liveness detection

These are separate capabilities from ordinary face detection.

11.1 Face detection

Answers:

"Is a face visible, and where is it?"

This is a mandatory feature.

11.2 Face recognition

Answers:

"Does this detected face match an enrolled identity?"

This is a later-phase feature.

The intended future workflow is:

Student is authenticated using their account.
Student provides consent for the configured identity-verification workflow.
The application captures a small number of suitable reference images.
A compatible pretrained recognition model generates reference embeddings.
The system compares the current face with the enrolled references.
The application displays the registered name and USN only when the match meets the validated policy.
Otherwise, the face is shown as Unknown or Unverified.

The initial enrollment workflow may capture different poses, such as frontal, left-facing, right-facing, and a suitable additional pose.

However, four photographs do not guarantee accurate identity recognition under all conditions.

The system must be evaluated for false matches and incorrect rejection.

When multiple faces are present, each detected face must have its own bounding box and identity state.

If recognition is implemented, an enrolled student's face may display:

Tejas — 2VD23MI001

Other unmatched faces must display a neutral label such as:

Unknown person

An unmatched face must not be assigned a guessed name.

Identity recognition must not replace the mandatory face-counting logic.

11.3 Liveness and presentation-attack detection

Liveness detection attempts to determine whether the camera input may represent a real live person rather than a photograph or replay.

The later-phase evaluation should include:

A live person.
A printed photograph.
A photograph moved in front of the camera.
A video replay displayed on a mobile screen.
Different lighting conditions.
Screen reflections and brightness changes.
Low frame rates.
Different camera qualities.

Simple face detection, blinking, or head movement alone does not guarantee reliable liveness detection.

The system must not promise 100% protection against photographs or video replays.

When evidence is insufficient, the result must be reported as inconclusive.

Identity recognition and liveness detection must remain separate modules because matching a face to a registered student does not establish that the camera input is live.

Before selecting models, verify the licenses for both code and pretrained weights.

Do not assume that a public repository or freely downloadable model automatically permits unrestricted use.

12. Student interface layout

The student interface must keep the examination content as the primary focus.

12.1 Examination screen

Recommended layout:

+-----------------------------------------------------------+
| Exam Title          Connection Status       Timer         |
+-----------------------------------------------------------+
|                                                           |
|  Question 1                              +---------------+ |
|                                          | CAMERA PREVIEW| |
|  Question text                           |               | |
|                                          | Face boxes    | |
|  ( ) Option A                            | Phone boxes   | |
|                                          |               | |
|  ( ) Option B                            +---------------+ |
|                                                           |
|  ( ) Option C                           [Enlarge Camera]   |
|                                                           |
|  ( ) Option D                                             |
|                                                           |
|  [Previous]                              [Next]            |
|                                                           |
|                       [Submit Exam]                        |
+-----------------------------------------------------------+

This is a conceptual layout, not a fixed pixel specification.

The camera preview should be compact, approximately 10% of the available screen area where practical.

Use a minimum usable preview size rather than forcing a tiny preview on smaller screens.

The enlarge button should open a larger, centered camera view.

The enlarged view must be closable so the student can return to the examination layout.

The camera preview must not cover answer controls or obstruct important question text.

12.2 Warning cards

Warnings should appear in a compact area near the top-right of the examination interface.

Examples:

"No face is visible. Please return to the camera view."
"Multiple faces detected. Please ensure only you are visible."
"Please face the exam screen when ready."
"A phone may be visible. Please keep unauthorized devices away."
"No internet connection. Offline mode active; your exam will continue."
"Connection restored. Synchronizing your exam data..."

Warnings must be brief, dismissible, and non-accusatory.

The warning UI must not generate a new event for every displayed frame.

Dismissing a warning affects only the warning's visibility.

It must not delete the associated event, snapshot, or audit record.

12.3 Connectivity and save indicators

The interface must distinguish:

Saved locally.
Pending synchronization.
Synchronizing.
Synchronized.
Synchronization blocked.
Local storage error.

The student must not be told that an answer or submission has reached the central server until the server has acknowledged it.

A browser's online status is only a hint. Actual API responses determine server reachability.

13. Professor interface layout

The professor interface must expose separate pages for examination creation, monitoring, event review, and reporting.

13.1 Examination management

The professor should be able to:

Create a draft examination.
Enter title and instructions.
Configure duration.
Add MCQ questions.
Add short-answer questions.
Import an Excel workbook.
Preview imported questions.
Correct validation errors.
Publish the examination.
Obtain a six-digit exam code.
Review examination status.

Published question changes must follow explicit versioning rules.

An active attempt must not silently receive a different question package midway through an exam.

13.2 Live monitoring dashboard

For each authorized student attempt, display:

Student name.
Student USN.
Attempt number.
Exam start information.
Last server contact.
Current connectivity status as last observed by the server.
Submission status.
Synchronization status.
Event counts by category.

The dashboard may use WebSockets for online updates and polling as a fallback.

13.3 Event review

Clicking an event count must open the corresponding event list.

Each event entry should display:

Event type.
Timestamp.
Duration where applicable.
Detector confidence where relevant.
Event status.
Snapshot availability.
Synchronization status.

The professor should be able to open the corresponding snapshot when it is available.

The professor must not be shown a stale event list as if it were a live view of a disconnected student's current activity.

13.4 Disconnected students

When a student's internet connection is lost:

The student continues monitoring locally.
The professor receives no new events from that disconnected device.
The dashboard displays the last known server contact.
The attempt is marked disconnected or awaiting synchronization according to policy.
Newly recorded events become available after successful synchronization.

The server cannot remotely observe new events that remain only on a disconnected device.

13.5 Reports

The professor should be able to generate a PDF report containing:

Exam title and identifier.
Student name and USN.
Attempt number.
Start and submission information.
Monitoring duration.
Event counts.
Event timeline.
Event durations.
Relevant snapshots.
Evidence upload status.
Synchronization status.
Human-review disclaimer.

The report must distinguish client-reported timestamps from server-received timestamps when this distinction matters.

A face-absence event must not fabricate an image of a missing face.

Automated observations must not be presented as conclusive proof of misconduct.

14. Administrator interface and system settings

Administrator workflows must use separate pages rather than combining all administrative operations into one large screen.

14.1 Account management

The administrator should be able to:

Create student accounts.
Create professor accounts.
Manage administrator accounts under a controlled policy.
Activate and deactivate accounts.
Reset credentials.
Assign and review roles.
Review account-related audit records.

The backend must enforce permissions for every administrative operation.

14.2 System settings

The system must provide a configuration mechanism for appropriate global defaults.

Examples include:

Default face-absence duration.
Default sustained-head-turn duration.
Default phone-detection threshold.
Multiple-face event rules.
Warning configuration.
Evidence retention defaults.
Upload size limits.
Operational synchronization limits.
Maximum local storage expectations.
Default offline-exam policy.

Only settings that are implemented and validated should be exposed in the UI.

The administrator must not be able to configure values that silently bypass essential data-integrity or authorization rules.

Changes to important settings must be audited.

The system must preserve the configuration and rule versions used for each examination attempt.

14.3 System health

The administrator should be able to review:

API availability.
Database availability.
Model and asset availability where observable.
Failed synchronization operations.
Pending evidence uploads.
Recent system errors.
Storage-related failures.
Relevant audit records.

Do not expose secrets, passwords, tokens, or unnecessary biometric data in diagnostics.

15. Excel question import

The professor must be able to import supported .xlsx question files.

The backend uses openpyxl to parse and validate workbooks.

The import workflow is:

Professor selects workbook
          |
          v
Validate file type and size
          |
          v
Read workbook and worksheets
          |
          v
Validate headers and rows
          |
          v
Map rows to question schemas
          |
          v
Generate preview and errors
          |
          v
Professor reviews and edits
          |
          v
Confirm import
          |
          v
Server revalidates data
          |
          v
Persist accepted questions

The import must not silently discard invalid rows.

Errors must identify the worksheet and row where possible.

Validation must include:

Missing question text.
Missing required options.
Invalid correct-answer references.
Duplicate question numbers.
Empty rows.
Unsupported question types.
Unexpected column names.
Multiple worksheets.
Merged cells where problematic.
Unsupported or oversized files.
Invalid marks.
Workbooks with no valid questions.

The professor should be able to preview and correct imported questions before confirming the import.

Correct answer keys must remain server-side and must never be included in student examination packages.

16. Database architecture

Use PostgreSQL as the central relational database.

Use IndexedDB as the browser client's local persistent store.

If a future desktop application requires a bundled local Python service, SQLite may be evaluated as a local database. It must not create a second, inconsistent answer-saving pipeline.

The initial browser implementation should use IndexedDB consistently for local-first examination execution.

16.1 Main central entities

The baseline data model includes:

users
exams
questions
exam_attempts
answers
proctor_events
snapshots
sync_operations
retake_grants
audit_logs
system_settings

The exact fields, relationships, constraints, and indexes are defined in data-model.md.

16.2 Internal identifiers

Use UUIDs for internal entity identifiers.

Use the normalized USN as the unique institutional identifier for student accounts.

Use six-character strings for exam codes so that leading zeroes are preserved.

Do not use student names as unique keys.

16.3 Answer keys

The student package must contain only the fields needed to display the assigned questions.

Correct answers and private grading rules must remain server-side.

The backend must validate submitted answer references against the questions and options belonging to the authorized examination.

16.4 Evidence storage

Use IndexedDB Blob records for local evidence in the browser implementation.

For hosted deployment, use durable object storage or another suitable persistent storage service.

Do not assume that files written to an ordinary hosting container's local filesystem will survive restarts, redeployments, or instance replacement.

PostgreSQL should store snapshot metadata and durable storage references rather than large image binaries by default.

17. Authentication and authorization

Authentication and authorization are separate concerns.

Authentication establishes which account is signed in.

Authorization determines which resources and operations that account may access.

The backend must enforce authorization for every protected endpoint.

17.1 Student permissions

A student may:

Access their own profile.
Enter an eligible examination.
Retrieve their own authorized package.
Submit valid operations for their authorized attempt.
View their own submission status according to policy.

A student must not be able to:

Read another student's attempt.
Read another student's private evidence.
Change their role.
Change another student's answers.
Access an unrelated exam package.
Grant themselves a retake.
Retrieve correct answer keys from the student package.
17.2 Professor permissions

A professor may manage examinations they own or are explicitly authorized to manage.

A professor must not automatically receive access to every examination or every student's private data.

17.3 Administrator permissions

Administrators may have broader system privileges according to policy.

Sensitive administrative operations must be audited.

17.4 Exam code

The six-digit exam code is an identifier, not authentication.

The server must still check:

Authenticated student identity.
Student account status.
Exam availability.
Student eligibility.
Attempt rules.
Retake authorization.
Attempt ownership.
18. Live monitoring and server communication

While connected, the student client synchronizes local operations continuously.

The professor dashboard receives server-confirmed updates through WebSockets or polling.

The server may report:

Last received operation sequence.
Last server contact.
Current known attempt state.
Last synchronized event.
Submission status.
Pending evidence information when known.

When the student disconnects, the server cannot know about new local events until synchronization resumes.

The dashboard must distinguish:

Connected and recently communicating.
Disconnected or not recently communicating.
Submission received.
Submission saved locally but not yet received.
Synchronization pending.
Synchronization blocked.
Fully synchronized.

Do not infer that a disconnected student has stopped working merely because server updates have stopped.

Do not infer that an online browser is necessarily connected to the actual API.

19. Fullscreen and application switching

The initial browser implementation should:

Request fullscreen when appropriate.
Record fullscreen exits.
Record page visibility changes.
Display warnings according to policy.
Preserve the examination and its local data.

Fullscreen exit or a connectivity change must not automatically submit the exam by default.

A browser cannot reliably identify every application opened over the exam or every website accessed elsewhere on the device.

The Page Visibility API can identify when the exam document becomes hidden, but it does not reveal the identity of every application responsible.

If stronger restrictions are later required, evaluate a dedicated examination environment such as Safe Exam Browser or suitable platform-specific controls.

Do not claim that the normal browser application provides a complete operating-system lockdown.

20. Timer and attempt finalization

The countdown must be maintained locally.

The local exam engine must not require periodic cloud requests to advance the timer.

The application must distinguish:

Active attempt.
Locally submitted attempt.
Server-confirmed submission.
Expired attempt.
Cancelled attempt.
Attempt with a synchronization conflict.
20.1 Manual submission

When the student submits:

Validate the final local state.
Persist the final answer state.
Record the local submission timestamp.
Record the final operation sequence.
Append a stable submission operation.
Mark the local attempt as submitted.
Prevent further answer changes.
Continue synchronization when possible.

If offline, show:

"Submission saved on this device — awaiting synchronization."

After server acknowledgement, show the synchronized state.

Do not claim that the central server has received the submission before acknowledgement.

The server must finalize an attempt idempotently.

Repeated submission retries must not create multiple final submissions.

21. Deployment architecture
21.1 Local development

During development, run:

React + Vite frontend.
FastAPI backend.
PostgreSQL.
Local computer-vision assets.
Local IndexedDB storage.

The student exam should work locally while disconnected after the required package and assets have been prepared.

21.2 Hosted frontend

The professor and administrator frontend may be deployed to a static hosting service such as Vercel.

Use HTTPS for deployed authentication and API communication.

21.3 Hosted backend

The FastAPI backend may be deployed to a suitable Python hosting service such as Render.

PostgreSQL must be configured as a persistent database service.

The deployment must use environment variables or secret configuration for credentials.

21.4 Snapshot storage

Use a durable storage solution suitable for evidence files.

Do not depend on an ephemeral web-service filesystem for evidence that must survive redeployment or restart.

Define storage limits, retention policies, and recovery behavior.

21.5 Free hosting limitations

Free hosting may have:

Service sleep or cold starts.
Request and compute quotas.
Database limitations.
Storage restrictions.
Temporary service unavailability.

The local exam engine must not depend on the availability of the hosted service after the examination has been authorized and its required resources have been downloaded.

A hosting outage must change synchronization status, not terminate the student's local exam.

22. Security and privacy

The application must:

Hash passwords using an appropriate password-hashing algorithm.
Protect authentication credentials.
Use HTTPS in deployment.
Validate all incoming requests.
Enforce role and resource ownership.
Keep answer keys out of student packages.
Validate uploaded files.
Restrict snapshot access.
Use stable operation IDs.
Validate synchronization sequence numbers.
Avoid logging passwords or access tokens.
Audit sensitive administrative operations.
Define evidence retention and deletion policies.
Protect backups and database credentials.
Avoid collecting unnecessary personal data.

Identity recognition and liveness detection require additional privacy review and appropriate consent.

The system must not use a model-generated score as the sole basis for failing a student or accusing them of misconduct.

23. Known limitations and non-goals

The following limitations must be documented honestly.

No face or phone detector guarantees perfect accuracy.
A detector confidence score is not a cheating probability.
A browser cannot reliably identify every application running on the device.
Fullscreen and tab visibility are monitoring signals, not complete security controls.
A disconnected student's new events cannot be viewed remotely until they synchronize.
Browser storage can fail or be evicted under some circumstances.
A determined device owner may tamper with a browser-based offline application.
A client-reported offline timestamp cannot be independently proven accurate by the server.
Four enrollment photographs do not guarantee accurate identity recognition.
Face recognition does not prove liveness.
Simple blinking or head movement does not guarantee protection against photograph or video replay attacks.
Free hosting does not guarantee uninterrupted service or permanent storage.
Background synchronization is not guaranteed after the browser or application is closed.
Uploaded-video analysis does not establish that the person in the video is the authenticated student.
Liveness detection, identity recognition, Electron packaging, and Android packaging are later-phase tasks.

These limitations do not prevent the project from being useful. They define what must be tested and what the system must not falsely promise.

24. Implementation milestones

Implement the project in the following order.

Milestone 1 — Foundation
Create the repository and folder structure.
Set up React + Vite + JavaScript.
Set up Python + FastAPI.
Configure the central database.
Establish basic API contracts.
Verify local development works.
Milestone 2 — Monitoring pipeline
Acquire webcam frames.
Implement face presence detection.
Implement multiple-face detection.
Implement head-pose estimation.
Integrate the pretrained phone detector.
Build the event-rule engine.
Capture evidence promptly.
Persist events and snapshots locally.
Milestone 3 — Detection evaluation
Add uploaded-video input.
Run both input modes through the shared processing pipeline.
Create a labeled test manifest.
Measure false positives and false negatives.
Measure event and snapshot latency.
Adjust thresholds.
Verify that the UI remains responsive.
Milestone 4 — Local examination engine
Implement exam package validation.
Implement local question navigation.
Implement local answer saving.
Implement the local countdown.
Implement attempt recovery.
Implement local submission.
Milestone 5 — Synchronization
Implement the IndexedDB outbox.
Implement stable operation IDs.
Implement attempt-scoped sequence numbers.
Implement idempotent server ingestion.
Implement acknowledgement processing.
Implement retries and backoff.
Implement snapshot upload recovery.
Test repeated internet disconnections.
Milestone 6 — Student interface
Implement exam entry.
Implement instructions and readiness checks.
Implement the examination screen.
Implement the compact camera preview.
Implement camera enlargement.
Implement warning cards.
Implement connectivity and save indicators.
Implement fullscreen and page-visibility logging.
Milestone 7 — Professor interface
Implement examination creation.
Implement MCQ and short-answer questions.
Implement Excel preview and import.
Implement six-digit exam codes.
Implement live monitoring.
Implement event review.
Implement snapshot viewing.
Implement PDF reports.
Implement authorized retakes.
Milestone 8 — Administrator interface
Implement user management.
Implement role management.
Implement system settings.
Implement audit review.
Implement system-health information.
Milestone 9 — Final testing
Run the complete examination workflow.
Test all required detection scenarios.
Test uploaded-video analysis.
Test continuous online operation.
Test fully offline operation.
Test repeated online/offline transitions.
Test offline submission.
Test interrupted snapshot uploads.
Test browser reload recovery.
Test duplicate prevention.
Test role and resource authorization.
Test report accuracy.
Milestone 10 — Deployment
Configure the hosted frontend.
Deploy FastAPI.
Configure PostgreSQL.
Configure durable snapshot storage.
Configure secrets and HTTPS.
Run migrations.
Test the deployed API.
Test synchronization against the actual hosted service.
Milestone 11 — Later enhancements

Only after the core requirements pass:

Face identity recognition.
Liveness and presentation-attack detection.
More advanced analytics.
Electron packaging.
Android packaging.

Do not make packaging the first task.

25. Definition of done

The core project is not considered complete merely because its pages render or its models draw bounding boxes.

The core project is complete only when the following end-to-end workflow works:

The professor creates an examination.
The professor adds questions or imports them from Excel.
The professor publishes the examination and receives a six-digit code.
The student signs in and enters the code.
The server validates the student's eligibility and attempt authorization.
The student downloads the complete assigned question package.
The client stores and validates the package locally.
Readiness checks confirm that required assets, camera access, and local storage are available.
The student starts the examination.
The application displays questions without requiring cloud requests for navigation.
The monitoring pipeline detects the required behaviors.
Candidate evidence is captured promptly.
Events and snapshots are persisted locally.
Answers are persisted locally before successful-save indicators appear.
The professor receives updates while the student is connected.
The internet can disconnect without interrupting the local exam.
The student can continue answering and generating monitoring events offline.
The student can submit while offline.
Pending operations survive supported reloads or restarts.
Connectivity can return and fail repeatedly without losing acknowledged or pending operations.
Synchronization resumes from the oldest unacknowledged operation.
Retries do not create duplicate logical records.
Snapshot uploads are confirmed before being marked complete.
The professor sees synchronized records and accurate submission status.
The professor opens event snapshots and downloads a correct PDF report.
The system distinguishes observations from conclusions and preserves evidence for human review.

The defining success criterion is this: online, offline, and intermittently connected examinations must use one consistent local-first execution and persistence pipeline.

No cloud outage should force the student to lose locally saved answers or stop an already-authorized examination.