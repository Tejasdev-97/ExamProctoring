ExamProctor.ai
Product Requirements Document (PRD)
Document version: 1.0
Project name: ExamProctor.ai
Project category: AI-powered examination management and computer-vision proctoring
Project type: College final-year project and hackathon implementation
Problem statement: PS1 — ComputerVision SmartExamProctor
Primary users: System administrators, professors, and students
Primary objective: Build a reliable, locally executable examination platform with computer-vision monitoring, evidence collection, offline examination continuity, and centralized reporting.
________________________________________
1. Executive Summary
ExamProctor.ai is an AI-assisted examination platform designed to help educational institutions create, conduct, monitor, and review online examinations.
The platform combines an examination management system with local computer-vision processing, event logging, evidence snapshots, offline-first data storage, reliable synchronization, and post-examination reports.
Unlike an examination application that requires a continuous internet connection, ExamProctor.ai is designed to allow an already-authorized student to continue an examination during internet outages.
The application stores examination questions, answers, monitoring events, evidence snapshots, and submission state locally on the student's device. When connectivity is available, the application synchronizes these records with the central backend.
The system has three primary roles:
•	System administrator: Manages accounts, permissions, and global system settings. 
•	Professor: Creates examinations, imports questions, monitors attempts, reviews events, authorizes retakes, and generates reports. 
•	Student: Logs in, enters an examination code, completes readiness checks, answers questions, and submits the examination. 
The computer-vision engine must support both live webcam monitoring and uploaded-video analysis through a shared processing pipeline.
The initial release focuses on four mandatory monitoring capabilities:
1.	Face absence detection. 
2.	Multiple-face detection. 
3.	Sustained head-turn detection. 
4.	Mobile-phone detection. 
Additional capabilities include fullscreen-exit logging, browser-page visibility logging, camera-readiness checks, snapshots, event timelines, and downloadable PDF reports.
The primary engineering objective is not merely to display AI detections. Every relevant event must be recorded, persisted, synchronized when possible, and available for authorized review.
Core principle: An internet outage changes the synchronization state, not the execution of an already-authorized examination.
________________________________________
2. Product Vision
2.1 Vision
Build a professional, accessible, and dependable examination platform that combines computer vision with reliable local-first examination execution.
The system should provide a modern educational interface while preserving data integrity and minimizing unnecessary interruptions to students.
2.2 Product goals
ExamProctor.ai must:
1.	Allow professors to create and publish examinations. 
2.	Support MCQ and short-answer questions. 
3.	Support Excel-based question import with preview and validation. 
4.	Assign a six-digit examination code to published examinations. 
5.	Allow authenticated students to enter examinations using the code. 
6.	Check examination readiness before starting. 
7.	Run computer-vision inference locally on the student's device. 
8.	Detect and log the required examination events. 
9.	Capture and preserve relevant evidence. 
10.	Display brief, dismissible, non-accusatory warnings. 
11.	Continue an active examination during supported internet outages. 
12.	Preserve answers, events, snapshots, and submission state locally. 
13.	Synchronize queued operations automatically when connectivity returns. 
14.	Provide professors with live monitoring while students are connected. 
15.	Generate understandable examination reports and evidence timelines. 
16.	Enforce authorization on the backend. 
17.	Support both light and dark visual themes. 
18.	Provide a distinctive, professional brutalist/neobrutalist design. 
19.	Keep optional identity recognition and liveness detection separate from the mandatory release. 
20.	Support repeatable testing using ten scripted evaluation clips. 
2.3 Non-goals for the initial release
The initial release does not need to:
•	Guarantee 100% detection accuracy. 
•	Prove that a student intended to cheat. 
•	Reliably identify every person in every camera condition. 
•	Detect every operating-system application. 
•	Block every website or application outside the browser. 
•	Automatically fail a student based on AI detections. 
•	Automatically submit an examination because internet connectivity is lost. 
•	Require training a new computer-vision model from scratch. 
•	Include native Android packaging before the core application is stable. 
•	Implement identity recognition and liveness detection before the mandatory monitoring pipeline works. 
________________________________________
3. Product Principles
All implementation decisions must follow these principles.
3.1 Local-first examination execution
Once an examination is authorized and its complete required package has been downloaded, the student application must be able to continue working without requiring a live API request for each question or answer.
3.2 One examination pipeline
Online and offline examinations must use the same question engine, answer-persistence mechanism, computer-vision engine, event schema, and synchronization mechanism.
Do not build separate online and offline implementations.
3.3 Persist before confirming
A successful local-save indicator may only appear after the corresponding local transaction succeeds.
A server-synchronized indicator may only appear after the server acknowledges the operation.
3.4 Evidence before interpretation
The system must preserve observable events and supporting evidence.
It must not present an automated observation as conclusive proof of cheating.
3.5 Human-readable feedback
Warnings must be brief, understandable, and non-accusatory.
Students must be able to dismiss suitable warning cards without deleting the underlying event or evidence.
3.6 Fail visibly, not silently
Missing models, camera failures, storage failures, synchronization errors, and unavailable snapshots must be represented honestly.
The interface must not pretend that a feature is working when it is unavailable.
3.7 Security at the backend
Frontend route guards improve the user experience but do not provide authorization by themselves.
All protected operations must be validated by the backend.
________________________________________
4. User Roles and Permissions
The application must implement three roles.
4.1 System administrator
The administrator manages the platform rather than individual examinations by default.
Responsibilities
•	View system overview. 
•	Create user accounts. 
•	View users. 
•	Edit user details. 
•	Assign or modify roles. 
•	Activate and deactivate accounts. 
•	Initiate account credential resets through a secure workflow. 
•	Configure system-wide proctoring defaults. 
•	Configure supported system settings. 
•	Review audit logs. 
•	View system health and synchronization statistics. 
•	Manage approved global retention and configuration policies. 
Administrator pages
1.	Administrator dashboard. 
2.	User management. 
3.	Create/edit user. 
4.	System settings. 
5.	Audit logs. 
6.	System health. 
Security requirements
•	Only administrators may perform administrator-only operations. 
•	Role changes must be audited. 
•	Passwords must never be stored or logged in plaintext. 
•	Account deactivation must be enforced by the backend. 
•	A student must not gain administrator permissions by modifying frontend state. 
4.2 Professor
The professor manages examinations and reviews examination activity.
Responsibilities
•	Create examinations. 
•	Edit draft examinations. 
•	Add MCQ questions. 
•	Add short-answer questions. 
•	Import questions from Excel. 
•	Preview and validate imported questions. 
•	Edit imported questions before confirmation. 
•	Configure examination duration and rules. 
•	Configure supported monitoring thresholds. 
•	Publish examinations. 
•	Receive a six-digit examination code. 
•	View examination status. 
•	View student attempts. 
•	View start, submission, last-contact, and synchronization status. 
•	View event counts by event type. 
•	Click event counts to inspect individual events. 
•	Review available snapshots. 
•	Download PDF reports. 
•	Authorize retakes where permitted. 
•	View previously submitted attempts without overwriting them. 
Professor pages
1.	Professor dashboard. 
2.	Examination list. 
3.	Examination builder. 
4.	Question bank. 
5.	Excel import and preview. 
6.	Examination overview. 
7.	Live monitoring. 
8.	Student attempt details. 
9.	Event timeline and evidence. 
10.	Report viewer. 
11.	Retake authorization. 
4.3 Student
The student takes an authorized examination.
Responsibilities
•	Log in. 
•	Enter the six-digit examination code. 
•	Review examination details and instructions. 
•	Complete readiness checks. 
•	Confirm the displayed student identity and USN. 
•	Download and validate the examination package. 
•	Start the examination. 
•	Answer questions. 
•	Navigate between questions. 
•	See local-saving status. 
•	See connectivity and synchronization status. 
•	Receive relevant monitoring warnings. 
•	Enlarge the camera preview. 
•	Submit the examination manually. 
•	Recover locally stored examination state after supported interruptions. 
Student pages
1.	Login. 
2.	Exam-code entry. 
3.	Examination details and instructions. 
4.	Camera and system readiness. 
5.	Active examination. 
6.	Submission confirmation. 
7.	Submission status and recovery. 
________________________________________
5. Authentication and Account Management
5.1 Login
Provide a professional login interface with:
•	ExamProctor.ai branding. 
•	Account identifier field. 
•	Password field. 
•	Password visibility toggle. 
•	Login button. 
•	Validation messages. 
•	Loading state. 
•	Clear authentication errors. 
The account identifier may be an email address, username, or USN depending on the account configuration.
The backend determines the user's role.
5.2 Student identity
The college USN is the student's unique institutional identifier.
USN requirements:
•	Store USN as a string. 
•	Never convert USN to an integer. 
•	Normalize USN consistently for comparison. 
•	Enforce uniqueness in the central database. 
•	Preserve a display form if required. 
Use a generated UUID as the internal user identifier.
Example:
•	Internal ID: generated UUID. 
•	USN: 2VD23MI001. 
•	Role: student. 
The USN is not a password or a substitute for authentication.
5.3 Session management
Implement secure server-side authentication and authorization.
Use the authentication approach established in the API specification. Access tokens or session credentials must be handled securely.
Requirements:
•	Protected API requests. 
•	Session expiration. 
•	Logout. 
•	Appropriate refresh or session-renewal behavior. 
•	Server-side role checks. 
•	Secure credential storage. 
•	No secrets in frontend source code. 
________________________________________
6. Examination Management
6.1 Examination creation
Professors must be able to create an examination with:
•	Examination title. 
•	Description. 
•	Instructions. 
•	Duration. 
•	Availability window, if configured. 
•	Eligible students or eligible student group. 
•	Question list. 
•	Question ordering. 
•	Marks. 
•	MCQ and short-answer configuration. 
•	Monitoring configuration. 
•	Submission policy. 
•	Offline-continuation policy. 
•	Optional attachments. 
•	Publication status. 
6.2 Examination lifecycle
Use explicit examination states.
Suggested states:
•	draft 
•	published 
•	closed 
•	archived 
The backend must enforce valid state transitions.
A student must not start a draft or closed examination unless a specifically authorized policy allows it.
6.3 Six-digit examination code
After successful publication, generate a six-digit examination code.
Requirements:
•	Store it as a string. 
•	Preserve leading zeroes. 
•	Enforce uniqueness among currently valid codes. 
•	Handle collisions by generating another code. 
•	Provide a copy button. 
•	Display the code clearly to the professor. 
•	Resolve the code through the backend. 
•	Never treat the code alone as authentication. 
•	Do not expose correct answers through the student examination package. 
6.4 Examination package
Before starting, the student must download the complete authorized examination package.
The package includes only the data needed by that student and examination.
It may include:
•	Examination metadata. 
•	Questions. 
•	MCQ options. 
•	Question order. 
•	Marks. 
•	Duration. 
•	Instructions. 
•	Examination configuration. 
•	Question versions. 
•	Permitted attachments. 
•	Attempt ID. 
•	Attempt authorization information. 
•	Required offline configuration. 
Correct answers and grading secrets must not be included in the student package.
After downloading the package, the application must verify that it can read the package and that all required resources are available locally.
The examination must not begin until its mandatory offline prerequisites pass.
________________________________________
7. Question Management and Excel Import
7.1 Supported question types
The initial release supports:
Multiple-choice questions
Fields:
•	Question text. 
•	Options A, B, C, and D. 
•	Correct option, stored securely on the server. 
•	Marks. 
•	Optional explanation. 
•	Question order. 
•	Question version. 
The initial interface should support four options per MCQ, while keeping the model extensible.
Short-answer questions
Fields:
•	Question text. 
•	Maximum marks. 
•	Optional response-length guidance. 
•	Question order. 
•	Question version. 
The initial release may store short answers without automatic grading unless a grading feature is explicitly implemented and tested.
7.2 Excel import
Use Python openpyxl on the backend to parse Excel workbooks.
The import workflow must be:
1.	Professor selects a workbook. 
2.	Backend validates the file. 
3.	Professor selects a worksheet if multiple worksheets are present. 
4.	Backend parses rows. 
5.	Backend validates each row. 
6.	Frontend displays a preview. 
7.	Invalid rows are highlighted. 
8.	Professor can correct or remove rows. 
9.	Professor confirms the import. 
10.	Backend saves valid confirmed questions. 
Never silently discard invalid rows.
7.3 Excel validation
Validate:
•	Required columns. 
•	Missing question text. 
•	Missing options. 
•	Invalid correct-option values. 
•	Invalid marks. 
•	Unsupported question types. 
•	Empty rows. 
•	Duplicate questions. 
•	Multiple worksheets. 
•	Corrupted workbooks. 
•	File size and row limits. 
Provide an Excel template download.
The import interface must show how many rows are valid, invalid, or require review.
________________________________________
8. Core Computer-Vision Requirements
All required computer-vision processing must run locally on the student's device during a live examination.
The system must not upload every camera frame to the central API for inference.
Use the same shared detection and event-generation pipeline for live webcam monitoring and uploaded-video analysis.
8.1 Face presence detection
Detect whether zero, one, or multiple faces are visible.
Required event:
face_absent
Expected behavior:
•	A short face-detection interruption does not immediately create an event. 
•	A configured grace period is applied. 
•	Sustained absence creates an event. 
•	The event includes start and end timestamps where available. 
•	The system ends the active absence condition when a face returns. 
•	A lack of a face image is not replaced by fabricated evidence. 
8.2 Multiple-face detection
Required event:
multiple_faces
Expected behavior:
•	Detect more than one visible face. 
•	Apply configured persistence rules. 
•	Record the event. 
•	Capture evidence when possible. 
•	End or update the event when the condition clears. 
•	Avoid creating a separate duplicate event for every frame. 
8.3 Sustained head-turn detection
Required event:
sustained_head_turn
Use MediaPipe Tasks Vision facial landmarks and suitable head-pose calculations.
Requirements:
•	Calibrate a forward-facing baseline. 
•	Estimate head orientation. 
•	Apply configurable angle thresholds. 
•	Apply configurable duration thresholds. 
•	Include a grace period. 
•	Ignore short harmless glances where the condition does not persist long enough. 
•	Avoid treating every downward glance as suspicious. 
•	Support event start, continuation, and clearing. 
•	Record relevant timestamps and available confidence information. 
Do not rely on direct eye-gaze detection as the sole basis for this feature.
The system should primarily use calibrated head orientation and duration rules.
8.4 Mobile-phone detection
Required event:
phone_detected
Use a suitable pretrained, locally executable object detector.
The initial baseline may use a browser-compatible detector that includes a mobile-phone class.
Requirements:
•	Detect candidate phones. 
•	Record confidence and bounding-box information where available. 
•	Apply confidence and persistence thresholds. 
•	Capture candidate evidence promptly. 
•	Avoid treating every one-frame detection as a confirmed event. 
•	Record missed detections during testing. 
•	Evaluate false positives involving phone-like objects. 
•	Keep model loading local after initial preparation. 
Do not assume a pretrained model will be perfectly accurate.
8.5 Camera failure
Required event:
camera_unavailable
The system must handle:
•	Permission denial. 
•	Camera disconnection. 
•	Stream interruption. 
•	Camera initialization failure. 
•	Recovery after camera access returns. 
The examination state and locally saved answers must remain intact.
The interface must not claim that computer-vision monitoring is functioning when the camera or required model is unavailable.
8.6 Camera quality
Where technically feasible, detect or identify conditions that make monitoring unreliable.
Possible conditions:
•	Very low lighting. 
•	Excessive brightness. 
•	Face too small or distant. 
•	Face partly outside the frame. 
•	Camera stream unavailable. 
Required event, where implemented:
camera_quality_warning
These warnings should explain what the student can do to improve the setup.
8.7 Browser events
Record browser-observable events where supported:
•	fullscreen_exit 
•	page_hidden 
These events describe browser state.
They must not be described as proof that a particular operating-system application was opened.
The browser MVP cannot guarantee that it detects every external application or website.
Fullscreen exit and internet loss must not automatically submit an examination.
________________________________________
9. Detection Engine and Event State Machine
The system must use a shared frame-processing pipeline.
Input adapters
•	Live webcam. 
•	Uploaded video. 
Shared pipeline
1.	Receive a frame. 
2.	Validate frame availability. 
3.	Run face detection and face-landmark processing. 
4.	Estimate face count. 
5.	Estimate head orientation. 
6.	Run phone detection. 
7.	Apply event rules. 
8.	Capture candidate evidence where appropriate. 
9.	Create or update event records. 
10.	Persist the event and associated local evidence. 
11.	Trigger a suitable warning if required. 
12.	Queue synchronization operations. 
13.	Update the timeline. 
The uploaded-video adapter must not create a real student's examination attempt.
9.1 Candidate detection versus confirmed event
Separate evidence capture from event confirmation.
Example:
1.	A phone-like object is detected. 
2.	The system captures a candidate frame promptly. 
3.	The candidate evidence is stored locally. 
4.	Confidence and persistence rules are evaluated. 
5.	If confirmed, a phone event is created or updated. 
6.	The evidence is associated with that event. 
7.	If not confirmed, candidate evidence follows a documented expiration or deletion policy. 
This reduces the risk of losing the first relevant frame while avoiding the reporting of every isolated detector response as a confirmed incident.
9.2 Event schema
Every persisted event must include the applicable fields:
•	Event UUID. 
•	Attempt UUID. 
•	Event type. 
•	Event start timestamp. 
•	Event end timestamp, if applicable. 
•	Client timestamp. 
•	Server receipt timestamp, once synchronized. 
•	Event status. 
•	Duration, if applicable. 
•	Detector confidence, if available. 
•	Bounding boxes, if applicable. 
•	Detector or rule version. 
•	Snapshot references. 
•	Synchronization state. 
Use explicit event types and documented statuses.
Possible statuses include:
•	candidate 
•	confirmed 
•	inconclusive 
•	resolved 
Use the statuses according to the agreed data model.
9.3 Event deduplication
The application must not create an uncontrolled number of identical events for a condition that remains active.
Implement event grouping or an explicit event state machine.
A new event should be created when a condition begins or when a distinct incident occurs according to the configured rules.
________________________________________
10. Evidence and Snapshot Management
Snapshots are important supporting evidence.
10.1 Snapshot capture
Capture relevant evidence promptly when a potential event is detected.
Do not wait for a long event-duration threshold before capturing the initial candidate frame when an immediate capture is possible.
10.2 Snapshot metadata
Each snapshot must have:
•	Snapshot UUID. 
•	Attempt UUID. 
•	Event or candidate ID. 
•	Capture timestamp. 
•	Image dimensions. 
•	Relevant detector metadata. 
•	Upload status. 
•	Evidence-retention status. 
•	Content checksum where supported. 
10.3 Local persistence
Store snapshot image blobs in IndexedDB.
The snapshot metadata and associated event must reference the correct attempt.
Snapshot capture must not depend on the central API.
10.4 Snapshot synchronization
When online:
1.	Preserve the local snapshot. 
2.	Register the snapshot metadata. 
3.	Upload the image using the designated binary-upload endpoint. 
4.	Verify the upload acknowledgement. 
5.	Associate the snapshot with the event. 
6.	Mark it synchronized only after the server confirms successful storage. 
Do not delete a locally stored snapshot before the required acknowledgement.
10.5 Missing evidence
If a snapshot cannot be captured or uploaded:
•	Preserve the event when possible. 
•	Record the failure. 
•	Display the evidence status honestly. 
•	Avoid fabricating an image. 
•	Allow the event to appear in reports with a missing-evidence indicator. 
Dismissing a warning must never delete the associated event or evidence.
________________________________________
11. Student Examination Interface
The active examination page is the most important student-facing screen.
It must be clean, focused, readable, and reliable.
11.1 Layout
Header
Include:
•	ExamProctor.ai logo or wordmark. 
•	Examination title. 
•	Student USN. 
•	Countdown timer. 
•	Connectivity status. 
•	Local-save status. 
•	Synchronization status. 
•	Submission status where relevant. 
Main content
Include:
•	Current question. 
•	Question type. 
•	Marks. 
•	MCQ options or short-answer input. 
•	Previous button. 
•	Next button. 
•	Question navigation panel. 
•	Answered and unanswered states. 
•	Submit button. 
Camera panel
Place a compact camera preview on the right side of the examination interface.
The original design target is approximately 10% of the usable screen width, but the panel must maintain a practical minimum size and must not obscure questions or controls.
Include:
•	Camera preview. 
•	Face bounding boxes. 
•	Phone bounding boxes. 
•	Optional labels showing detector status. 
•	Camera status. 
•	Enlarge button. 
Clicking the enlarge button opens a larger centered preview.
The user must be able to return to the compact preview without interrupting the examination.
Warning cards
Warnings must be:
•	Brief. 
•	Non-accusatory. 
•	Easy to understand. 
•	Dismissible where appropriate. 
•	Visually distinct. 
•	Positioned so they do not obscure important exam content. 
Example messages:
•	“We could not detect a face. Please check your camera position.” 
•	“More than one face is visible in the camera frame.” 
•	“A possible mobile phone was detected. Please review your examination instructions.” 
•	“Your camera is unavailable. Your answers remain saved on this device.” 
•	“Internet connection lost. Your examination will continue; synchronization will resume when connectivity returns.” 
These messages must not say that the student has been proven to be cheating.
11.2 Saving states
Clearly distinguish:
•	Saving. 
•	Saved on this device. 
•	Synchronization pending. 
•	Synchronizing. 
•	Synchronized. 
•	Local save failed. 
•	Synchronization failed; retry pending. 
The UI must not show a successful save before the relevant transaction commits.
11.3 Submission
Manual submission must:
1.	Validate the local attempt state. 
2.	Persist the final answers. 
3.	Record the local submission time. 
4.	Record the submission operation ID. 
5.	Record the final sequence boundary. 
6.	Mark the local attempt as submitted. 
7.	Prevent further answer editing according to the submission policy. 
8.	Queue synchronization. 
9.	Show the correct local or server-confirmed submission state. 
If offline, display a message such as:
“Submission saved on this device. Waiting for server synchronization.”
Do not falsely claim server confirmation.
________________________________________
12. Offline-First Architecture
Offline functionality is a mandatory core feature, not a future enhancement.
12.1 Required local capabilities
After a valid examination package has been prepared, the application must be able to:
•	Display questions. 
•	Navigate between questions. 
•	Save answers. 
•	Maintain the countdown. 
•	Run locally available computer-vision models. 
•	Record monitoring events. 
•	Capture snapshots. 
•	Store snapshots locally. 
•	Display warnings. 
•	Maintain attempt state. 
•	Submit locally. 
•	Preserve pending synchronization operations. 
12.2 Local database
Use IndexedDB through Dexie.js.
The local database must support the stores defined in data-model.md, including the applicable stores for:
•	Exam packages. 
•	Attempts. 
•	Answers. 
•	Answer revisions. 
•	Proctoring events. 
•	Snapshots. 
•	Synchronization outbox. 
•	Synchronization receipts. 
•	Local settings. 
•	Video-analysis sessions. 
•	Video-analysis results. 
Use versioned database migrations.
Do not delete pending examination data during a migration.
12.3 Atomic local writes
Where required, use one IndexedDB transaction to persist related changes.
Examples:
•	Answer update plus outbox operation. 
•	Event update plus outbox operation. 
•	Snapshot blob plus metadata. 
•	Sequence increment plus operation creation. 
•	Submission state plus submission operation. 
Only report successful local persistence after the transaction commits.
12.4 Application caching
Use a service worker to cache the application assets required for offline use.
Required assets may include:
•	JavaScript bundles. 
•	CSS. 
•	Fonts. 
•	Icons. 
•	Application shell. 
•	Locally executable model assets. 
•	Other required static resources. 
The service worker alone is not the synchronization system.
Implement a separate persistent synchronization worker.
12.5 Timer
The countdown must not depend on repeatedly querying the server.
Use a reliable local time calculation that accounts for elapsed time and supported page reloads.
Do not decrement the timer only by counting UI intervals, because browser throttling and suspension can make that inaccurate.
The examination policy must define how the local deadline is represented and recovered.
12.6 Browser limitations
Document that browser storage can be limited or evicted.
Check local storage availability before starting.
Request persistent storage where supported.
If required resources are missing, fail the readiness check rather than claiming offline readiness.
A browser PWA cannot guarantee tamper-proof offline execution on a device controlled by the student.
________________________________________
13. Synchronization Protocol
The synchronization protocol must follow sync-protocol.md and api-contracts.md.
13.1 Persistent ordered outbox
Every synchronized operation must have:
•	Stable operation UUID. 
•	Attempt UUID. 
•	Attempt-scoped sequence number. 
•	Operation type. 
•	Entity ID. 
•	Creation timestamp. 
•	Payload or payload reference. 
•	Payload hash where specified. 
•	Synchronization state. 
•	Retry metadata where required. 
13.2 Required synchronization behavior
The client must:
1.	Persist locally first. 
2.	Queue the operation transactionally. 
3.	Attempt synchronization when the API is available. 
4.	Send operations in the defined order. 
5.	Retain unacknowledged operations. 
6.	Retry transient failures. 
7.	Reconcile pending operations on startup. 
8.	Resume synchronization after connectivity returns. 
9.	Respect server acknowledgements. 
10.	Prevent duplicate logical records. 
13.3 Idempotency
If an operation is received more than once, the server must not create duplicate logical records.
The same operation ID must be reused for retries.
The server must reject conflicting reuse of an operation ID according to the synchronization specification.
13.4 Sequence gaps
The server must detect missing required sequence numbers.
The client must not silently skip earlier failed operations and mark later operations as fully synchronized.
13.5 Offline submission
The server must validate the final submission sequence boun.dary.
A final submission must not silently ignore required preceding operations.
The UI must distinguish local submission from server-confirmed submission.
13.6 Repeated outages
The system must continue to operate through repeated online/offline transitions.
It must recover from:
•	Lost acknowledgements. 
•	Interrupted uploads. 
•	Failed API requests. 
•	Browser refresh. 
•	Supported browser restart. 
•	Server restart. 
•	Repeated network failures. 
•	Duplicate requests. 
13.7 Live monitoring limitation
The professor can only see data that has reached the server.
When the student's device is disconnected, the professor dashboard must display the last known server-side state and a clear disconnected or awaiting-synchronization status.
It must not pretend that unsynchronized events are already available centrally.
________________________________________
14. Uploaded-Video Analysis
The application must support a separate uploaded-video analysis workflow.
14.1 Purpose
Allow an authorized user to upload a video and run the same frame-processing and event-generation pipeline used for live monitoring.
14.2 Workflow
1.	User opens video analysis. 
2.	User selects a supported video. 
3.	Backend or frontend validates the file according to the architecture. 
4.	A new analysis session is created. 
5.	The video is decoded into frames. 
6.	The shared detection engine processes frames. 
7.	Events are recorded with video-relative timestamps. 
8.	Available evidence is associated with the relevant event. 
9.	Results are displayed in a timeline. 
10.	The user can review the results. 
14.3 Session isolation
Uploaded-video analysis must not silently create or modify a student's real examination attempt.
Use a distinct analysis-session identifier.
14.4 Testability
The same processing pipeline must be usable for:
•	Live webcam frames. 
•	Uploaded videos. 
•	Scripted test clips. 
This is necessary for repeatable evaluation.
________________________________________
15. Professor Live Monitoring Dashboard
15.1 Overview
The professor should see an examination overview with:
•	Examination title. 
•	Six-digit code. 
•	Examination status. 
•	Number of eligible students. 
•	Number of started attempts. 
•	Number of submitted attempts. 
•	Number of disconnected or awaiting-sync attempts. 
•	Recent activity. 
15.2 Student table
Include:
•	USN. 
•	Student name. 
•	Attempt status. 
•	Start time. 
•	Submission time. 
•	Last server contact. 
•	Synchronization status. 
•	Face-absence event count. 
•	Multiple-face event count. 
•	Sustained-head-turn event count. 
•	Phone-detection event count. 
•	Other relevant event counts. 
15.3 Clickable event counts
Clicking an event count must open the relevant event list.
The professor should be able to see:
•	Event type. 
•	Event timestamp. 
•	Duration, if available. 
•	Available confidence. 
•	Snapshot status. 
•	Snapshot viewer. 
•	Synchronization state where relevant. 
15.4 Live updates
Use WebSockets for near-real-time updates where available.
Provide a suitable polling fallback.
Live updates must not create duplicate event rows or inconsistent counts.
15.5 Disconnected students
Display a clear status such as:
•	Connected. 
•	Disconnected. 
•	Awaiting synchronization. 
•	Submitted locally. 
•	Synchronized. 
Do not imply that the professor has received events that remain only on the student's device.
________________________________________
16. Reports and Evidence Timeline
16.1 PDF report
Generate reports using ReportLab on the backend.
The report must contain:
•	ExamProctor.ai branding. 
•	Examination title. 
•	Examination identifier. 
•	Student name. 
•	Student USN. 
•	Attempt ID. 
•	Examination start time. 
•	Submission time, if available. 
•	Server synchronization status. 
•	Examination duration. 
•	Event summary. 
•	Event counts by type. 
•	Chronological event timeline. 
•	Event durations where available. 
•	Available evidence snapshots. 
•	Snapshot-unavailable indicators. 
•	Relevant detector confidence information. 
•	Human-review disclaimer. 
16.2 Timeline
The event timeline must be understandable and chronologically ordered.
Display the original event time separately from server receipt time where useful.
Late synchronization must not cause events to disappear.
16.3 Evidence presentation
Show snapshots beside their corresponding events.
If a snapshot is unavailable, show a clear text status rather than a blank or fabricated image.
16.4 Review-priority score
An optional review-priority score may be added later.
If implemented:
•	Document the formula. 
•	Use deterministic inputs. 
•	Avoid describing it as a probability of cheating without appropriate validation. 
•	Never automatically fail an examination based solely on the score. 
•	Keep human review central to interpretation. 
16.5 Report access
Only authorized users may retrieve a report.
Students must not be able to access another student's report.
________________________________________
17. Retake Management
The system must support professor-authorized retakes where permitted.
Requirements:
•	Professor selects an eligible student and examination. 
•	Professor requests a retake. 
•	Backend validates authorization. 
•	Backend records who authorized the retake and when. 
•	A new attempt grant is created. 
•	The new attempt receives a new attempt ID. 
•	Previous attempts remain unchanged. 
•	Previous answers, events, and evidence are retained according to the retention policy. 
•	The new attempt is separately reportable. 
A retake must never overwrite a previous submitted attempt.
________________________________________
18. Data Model and Database
Use the existing data-model.md as the authoritative detailed schema specification.
18.1 Central database
Use PostgreSQL.
Use SQLAlchemy for ORM operations and Alembic for database migrations.
18.2 Required entities
The central model must include the entities defined by the data-model document, including:
•	users 
•	exams 
•	questions 
•	Question versions 
•	exam_attempts 
•	answers 
•	proctor_events 
•	snapshots 
•	sync_operations 
•	Retake grants 
•	system_settings 
•	audit_logs 
•	video_analysis_sessions 
Additional tables may be introduced where required by the documented architecture.
18.3 Data integrity
Use:
•	UUID primary keys. 
•	Foreign keys. 
•	Unique constraints. 
•	Check constraints where appropriate. 
•	Explicit status fields. 
•	Transactions. 
•	Server-side validation. 
•	Attempt isolation. 
Every answer, event, snapshot, and synchronization operation must belong to the appropriate attempt or analysis session.
18.4 Question versioning
Published examinations must preserve the question versions assigned to an attempt.
Editing a later draft must not silently alter a previously started examination.
18.5 Snapshot storage
Store snapshot metadata and references in PostgreSQL.
Store large image blobs in IndexedDB locally and durable object storage in the hosted environment, according to the agreed deployment configuration.
Do not store large binary images in ordinary relational rows by default.
18.6 Audit logs
Record important administrative and security-sensitive operations.
Examples:
•	Account creation. 
•	Role changes. 
•	Account deactivation. 
•	Examination publication. 
•	Retake authorization. 
•	System configuration changes. 
Audit logs must not contain passwords or authentication tokens.
________________________________________
19. Backend Architecture
Use Python with FastAPI.
19.1 Responsibilities
The backend handles:
•	Authentication. 
•	Authorization. 
•	User management. 
•	Examination management. 
•	Question management. 
•	Excel import and validation. 
•	Examination-code resolution. 
•	Attempt authorization. 
•	Attempt creation. 
•	Retake grants. 
•	Synchronization ingestion. 
•	Idempotency. 
•	Sequence validation. 
•	Snapshot registration and upload. 
•	Live monitoring data. 
•	Event retrieval. 
•	Report generation. 
•	System settings. 
•	Audit logging. 
•	Video-analysis session management. 
•	Health and readiness checks. 
19.2 API versioning
Use:
/api/v1
The detailed route definitions and request/response contracts must follow api-contracts.md.
Do not invent incompatible endpoint formats when an endpoint is already specified.
19.3 API requirements
•	Validate requests with Pydantic. 
•	Use consistent response formats. 
•	Return suitable HTTP status codes. 
•	Validate all protected requests. 
•	Enforce role and ownership rules. 
•	Provide clear, safe error messages. 
•	Use transactions for related database changes. 
•	Support idempotent synchronization. 
•	Avoid hard-coded production URLs. 
•	Provide API documentation through FastAPI's OpenAPI integration. 
19.4 Health checks
Provide health and readiness endpoints.
Health checks should distinguish basic application availability from readiness to serve requests requiring the database or other dependencies.
________________________________________
20. Frontend Architecture
Use:
•	React. 
•	Vite. 
•	JavaScript. 
•	React Router. 
•	Dexie.js. 
•	CSS Modules or organized CSS. 
•	Lucide React icons. 
The current implementation baseline is JavaScript. Do not silently convert the project to TypeScript merely because another planning draft mentions it.
20.1 Frontend responsibilities
The frontend handles:
•	Authentication screens. 
•	Role-specific routing. 
•	Administrator interface. 
•	Professor interface. 
•	Student interface. 
•	Exam builder. 
•	Question editing. 
•	Excel import preview. 
•	Camera readiness. 
•	Live camera preview. 
•	Local computer-vision integration. 
•	Examination timer. 
•	Question navigation. 
•	Answer editing and local persistence. 
•	Warning cards. 
•	Connectivity status. 
•	Synchronization status. 
•	Local evidence viewing. 
•	Professor event timeline. 
•	Report download. 
•	Uploaded-video analysis. 
•	Theme switching. 
20.2 Component organization
Build reusable components.
Examples:
•	AppShell 
•	Sidebar 
•	Topbar 
•	ThemeToggle 
•	ProtectedRoute 
•	RoleGuard 
•	StatusBadge 
•	ConnectivityBadge 
•	SyncStatusBadge 
•	ExamTimer 
•	CameraPreview 
•	CameraOverlay 
•	FaceBoundingBox 
•	PhoneBoundingBox 
•	WarningCard 
•	QuestionCard 
•	QuestionNavigator 
•	ConfirmSubmitDialog 
•	EventTimeline 
•	SnapshotViewer 
•	DataTable 
•	EmptyState 
•	ErrorState 
•	LoadingState 
Do not place the entire application in one enormous React component.
20.3 Frontend state
Use a clearly organized state strategy.
Separate:
•	Authentication state. 
•	User role. 
•	Examination metadata. 
•	Active attempt state. 
•	Local answers. 
•	Camera and model state. 
•	Event state. 
•	Local storage state. 
•	Synchronization state. 
•	Theme preference. 
Do not treat a frontend state variable as proof that data has been persisted or synchronized.
________________________________________
21. Detailed Folder Structure
The repository must be organized by responsibility.
Use the following structure as the baseline. If a small adjustment is needed to match the existing repository, preserve the same architectural boundaries.
examproctor-ai/
│
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── package.json
│
├── docs/
│   ├── ExamProctor.ai-PRD.docx
│   ├── architecture.md
│   ├── data-model.md
│   ├── sync-protocol.md
│   ├── api-contracts.md
│   ├── testing-plan.md
│   └── implementation-roadmap.md
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/
│   │   ├── manifest.webmanifest
│   │   ├── icons/
│   │   └── models/
│   │
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       │
│       ├── app/
│       │   ├── router.jsx
│       │   ├── providers.jsx
│       │   └── routeConfig.js
│       │
│       ├── assets/
│       │   ├── brand/
│       │   └── illustrations/
│       │
│       ├── components/
│       │   ├── layout/
│       │   ├── navigation/
│       │   ├── feedback/
│       │   ├── forms/
│       │   ├── tables/
│       │   ├── dialogs/
│       │   ├── badges/
│       │   └── icons/
│       │
│       ├── features/
│       │   ├── auth/
│       │   ├── admin/
│       │   ├── professor/
│       │   ├── exams/
│       │   ├── questions/
│       │   ├── excel-import/
│       │   ├── student/
│       │   ├── camera/
│       │   ├── proctoring/
│       │   ├── video-analysis/
│       │   ├── evidence/
│       │   ├── reports/
│       │   └── settings/
│       │
│       ├── services/
│       │   ├── apiClient.js
│       │   ├── authService.js
│       │   ├── examService.js
│       │   ├── attemptService.js
│       │   ├── syncService.js
│       │   └── reportService.js
│       │
│       ├── db/
│       │   ├── database.js
│       │   ├── migrations.js
│       │   ├── repositories/
│       │   └── transactions/
│       │
│       ├── sync/
│       │   ├── outbox.js
│       │   ├── syncWorker.js
│       │   ├── retryPolicy.js
│       │   ├── acknowledgements.js
│       │   └── reconciliation.js
│       │
│       ├── vision/
│       │   ├── cameraManager.js
│       │   ├── frameProcessor.js
│       │   ├── faceDetector.js
│       │   ├── headPose.js
│       │   ├── phoneDetector.js
│       │   ├── eventRules.js
│       │   ├── evidenceCapture.js
│       │   └── modelManager.js
│       │
│       ├── hooks/
│       ├── context/
│       ├── utils/
│       ├── constants/
│       ├── styles/
│       │   ├── tokens.css
│       │   ├── themes.css
│       │   ├── global.css
│       │   └── utilities.css
│       │
│       └── tests/
│           ├── unit/
│           └── integration/
│
├── backend/
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   │
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   │
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py
│   │   │       └── endpoints/
│   │   │
│   │   ├── core/
│   │   │   ├── security.py
│   │   │   ├── permissions.py
│   │   │   ├── exceptions.py
│   │   │   └── logging.py
│   │   │
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── repositories/
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── exam_service.py
│   │   │   ├── attempt_service.py
│   │   │   ├── sync_service.py
│   │   │   ├── snapshot_service.py
│   │   │   ├── report_service.py
│   │   │   ├── excel_service.py
│   │   │   └── audit_service.py
│   │   │
│   │   ├── storage/
│   │   ├── websocket/
│   │   └── utils/
│   │
│   └── tests/
│       ├── unit/
│       ├── integration/
│       ├── api/
│       └── fixtures/
│
├── tests/
│   ├── e2e/
│   ├── computer_vision/
│   │   ├── clips/
│   │   ├── expected-results/
│   │   └── evaluation-results/
│   └── fixtures/
│       ├── excel/
│       ├── images/
│       └── videos/
│
└── deployment/
    ├── frontend/
    ├── backend/
    └── scripts/
This is a target architecture, not permission to create empty files for every entry.
Create real modules with meaningful responsibilities. Add files when needed, and remove unnecessary placeholders.
Model assets must be obtained and packaged according to their respective licenses.
________________________________________
22. Visual Design System
This is a high-priority requirement.
The application must look like a polished, innovative educational technology product with a distinctive brutalist/neobrutalist visual identity.
It must not look like a generic administration dashboard generated from a template.
22.1 Design direction
Use a combination of:
•	Neo-brutalist layout structure. 
•	Bold typography. 
•	Thick dark borders. 
•	Offset shadows. 
•	Strong geometric composition. 
•	Warm, neutral surfaces. 
•	Blue-based trust and navigation colors. 
•	Orange and yellow for emphasis. 
•	Light green for successful states. 
•	Red for errors and critical warnings. 
•	Clear spacing and strong visual hierarchy. 
The design must remain professional rather than childish.
Do not make every element brightly colored.
Use warm neutral surfaces for most content, blue for structure and navigation, and brighter colors for selected actions, status indicators, and important visual accents.
22.2 Absolute text-contrast rule
Do not use grey text anywhere in the interface.
Avoid all grey and gray text tokens, including common colors such as:
•	#6B7280 
•	#9CA3AF 
•	#64748B 
•	#94A3B8 
•	#71717A 
Do not use grey text for:
•	Secondary descriptions. 
•	Table metadata. 
•	Placeholder text. 
•	Disabled labels. 
•	Timestamps. 
•	Helper text. 
•	Navigation labels. 
•	Empty states. 
•	Form instructions. 
•	Footnotes. 
Use appropriate shades of blue, deep navy, dark brown, or near-black for light mode, and cream or white for dark mode.
Muted text must still be clearly readable.
The prohibition concerns grey text. Neutral backgrounds are allowed, provided they are warm and intentional rather than visually muddy.
22.3 Font family
Use a professional, modern sans-serif font.
Recommended primary font:
Plus Jakarta Sans
Suitable alternatives include Inter or DM Sans.
Use a consistent typography scale.
Element	Recommended desktop size
Main page title	32–40 px
Section title	24–28 px
Card title	18–22 px
Body text	15–17 px
Form label	14–16 px
Button text	14–16 px
Table body	14–15 px
Helper text	13–14 px
Critical status label	13–15 px
Exam countdown	24–32 px
Avoid making all text the same size.
Use font weights deliberately:
•	400 for normal body text. 
•	500 for labels. 
•	600 for controls and card headings. 
•	700 for page headings. 
•	800 for selected neobrutalist display headings. 
Do not use extremely small text to fit too much information onto a screen.
22.4 Light-mode palette
Use this as the initial design-token palette.
Token	Color	Usage
Page background	#FFF8EE	Warm ivory background
Main surface	#FFFFFF	Cards and primary content
Alternate surface	#FFF0D8	Warm secondary panels
Main text	#172554	Deep navy body text
Heading text	#10204A	Strong heading contrast
Secondary text	#244A78	Supporting text without grey
Primary blue	#2563EB	Primary actions
Deep blue	#173B8F	Navigation and strong emphasis
Light blue	#DCEBFF	Selected panels and soft accents
Orange	#F97316	Main accent and selected actions
Light orange	#FFEDD5	Warm highlighted panels
Yellow	#FACC15	High-visibility accent
Light yellow	#FEF3C7	Informational highlights
Red	#DC2626	Errors and critical warnings
Light red	#FEE2E2	Error backgrounds
Green	#15803D	Success text and confirmation
Light green	#DCFCE7	Successful status backgrounds
Strong border	#172554	Neo-brutalist outlines
Focus outline	#2563EB	Keyboard focus
Use dark text on light yellow, light orange, and light red backgrounds.
Do not use white text on a bright yellow background.
Do not use light-green text on a white background.
22.5 Dark-mode palette
Dark mode must be designed independently rather than created by blindly inverting light mode.
Token	Color	Usage
Page background	#0B1220	Deep navy background
Main surface	#111D33	Cards
Alternate surface	#182844	Secondary panels
Main text	#FFF8EE	Main readable text
Heading text	#FFFFFF	Strong headings
Secondary text	#D6E5FF	Supporting text without grey
Primary blue	#60A5FA	Primary interactive accent
Deep blue	#3B82F6	Selected controls
Light blue	#243F66	Soft blue panels
Orange	#FB923C	Warm accent
Light orange	#4B2B1B	Dark orange panel
Yellow	#FDE047	High-visibility accent
Light yellow	#443716	Dark yellow panel
Red	#F87171	Error text
Light red	#4A2028	Dark error panel
Green	#86EFAC	Success text
Light green	#173B2A	Dark success panel
Strong border	#FDE7C7	High-contrast warm outline
Focus outline	#93C5FD	Keyboard focus
Verify contrast in the actual implementation.
The values above are starting tokens, not a substitute for contrast testing.
22.6 Theme behavior
Provide a visible theme toggle using Lucide icons.
Use:
•	Sun 
•	Moon 
Requirements:
•	Light mode. 
•	Dark mode. 
•	Persistent user preference. 
•	System preference detection on first visit. 
•	Consistent theme across all routes. 
•	No flash of the wrong theme during initial rendering where practicable. 
•	Proper contrast in charts, tables, dialogs, tooltips, and camera overlays. 
Use CSS variables for design tokens.
Do not hard-code unrelated colors separately inside every component.
22.7 Neo-brutalist surfaces
Use:
•	Strong 2–3 px borders. 
•	Controlled offset shadows. 
•	Bold section headings. 
•	Clear card separation. 
•	High-contrast buttons. 
•	Slightly rounded corners rather than excessive pill shapes. 
•	Strong geometric alignment. 
•	Limited decorative background shapes. 
Example style direction:
•	White or warm-ivory card. 
•	Deep navy border. 
•	Orange or blue action button. 
•	Offset navy shadow. 
•	Bold dark text. 
•	Consistent spacing. 
Do not apply thick borders and heavy shadows to every tiny element. Use them where they strengthen hierarchy.
22.8 Buttons
Primary buttons should be visually obvious.
Examples:
•	Create Examination. 
•	Publish Examination. 
•	Start Examination. 
•	Submit Examination. 
•	Download Report. 
•	Confirm Import. 
Use a consistent height and spacing system.
Interactive buttons must have:
•	Hover state. 
•	Active state. 
•	Keyboard focus state. 
•	Disabled state. 
•	Loading state where necessary. 
Disabled controls must remain readable. Do not make disabled text grey.
22.9 Forms
Forms must have:
•	Clearly visible labels. 
•	High-contrast input text. 
•	Readable placeholder text using a permitted non-grey color. 
•	Visible borders. 
•	Clear focus indicators. 
•	Inline validation messages. 
•	Adequate spacing. 
•	Proper error states. 
Never rely on placeholder text as the only field label.
22.10 Tables
Tables are important for professor and administrator workflows.
Use:
•	Clear headings. 
•	High-contrast body text. 
•	Adequate row height. 
•	Distinct status badges. 
•	Readable timestamps. 
•	Visible row hover states. 
•	Search and filters where appropriate. 
•	Responsive overflow handling. 
Do not use pale grey table text.
22.11 Status colors
Use color together with text and, where helpful, an icon.
Status	Suggested treatment
Connected	Green
Synchronized	Green
Local save successful	Green
Pending synchronization	Orange
Disconnected	Orange or red, according to severity
Camera unavailable	Red
Critical system failure	Red
Informational state	Blue
Draft	Blue or warm neutral with navy text
Do not communicate state using color alone.
22.12 Icons
Use lucide-react.
Never use normal emojis as interface icons.
Examples:
Purpose	Lucide icon
Dashboard	LayoutDashboard
Users	Users
Student	GraduationCap
Professor	BookOpen
Examinations	ClipboardList
Questions	FileQuestion
Settings	Settings2
Reports	FileBarChart
Download	Download
Upload	Upload
Camera	Camera
Phone detection	Smartphone
Face detection	ScanFace
Warning	TriangleAlert
Success	CircleCheck
Error	CircleAlert
Connectivity	Wifi
Disconnected	WifiOff
Synchronization	RefreshCw
Theme	Sun, Moon
Search	Search
Filter	SlidersHorizontal
Close	X
Expand	Maximize2
Collapse	Minimize2
Timer	Timer
Event timeline	Activity
Security	ShieldCheck
Select icons based on meaning, and keep icon stroke width and size consistent.
________________________________________
23. Frontend Pages and Design Requirements
23.1 Login
Create a polished login screen.
Include:
•	ExamProctor.ai wordmark. 
•	Login form. 
•	Account identifier. 
•	Password. 
•	Password visibility toggle. 
•	Submit button. 
•	Loading and error states. 
•	Light/dark theme toggle. 
Use a warm neutral background with a distinctive blue and orange accent.
23.2 Administrator dashboard
Use a persistent left sidebar on desktop.
Navigation:
•	Overview. 
•	Users. 
•	System Settings. 
•	Audit Logs. 
•	System Health. 
Main content:
•	Account statistics. 
•	Recent administrative activity. 
•	Account-status summary. 
•	System health cards. 
•	Recent audit entries. 
23.3 User management
Include:
•	Search. 
•	Filters. 
•	Role badges. 
•	Account-status badges. 
•	Create user. 
•	Edit user. 
•	Activate/deactivate. 
•	Secure credential-reset action. 
Use a high-contrast data table.
23.4 Professor dashboard
Navigation:
•	Overview. 
•	Examinations. 
•	Question Bank. 
•	Reports. 
•	Settings, if professor-level settings are supported. 
Main content:
•	Welcome heading. 
•	Create Examination action. 
•	Summary cards. 
•	Recent examinations. 
•	Examination table. 
•	Recent activity. 
23.5 Examination builder
Use a clear multi-step workflow.
Suggested steps:
1.	Details. 
2.	Questions. 
3.	Proctoring rules. 
4.	Review. 
5.	Publish. 
Include draft saving and validation.
Excel import must have its own preview and correction interface.
23.6 Student exam entry
Include:
•	Six-digit code input. 
•	Examination lookup. 
•	Examination title. 
•	Duration. 
•	Instructions. 
•	Student name and USN confirmation. 
•	Start readiness workflow. 
Do not create an attempt simply because the student typed an invalid code.
23.7 Readiness check
Display separate readiness cards for:
•	Camera access. 
•	Face visibility. 
•	Required computer-vision models. 
•	Examination package. 
•	Local database. 
•	Storage availability. 
•	Timer readiness. 
•	Connectivity state. 
The page must distinguish online readiness from offline readiness.
The Start Examination button must remain disabled when mandatory local prerequisites fail.
23.8 Active examination
Use a focused layout.
Prioritize:
1.	Question readability. 
2.	Answer selection. 
3.	Countdown visibility. 
4.	Local-save status. 
5.	Navigation. 
6.	Monitoring status. 
7.	Camera preview. 
Do not let decorative UI interfere with examination usability.
23.9 Live monitoring
Display student rows, status, event counts, and timestamps.
Provide filters and direct navigation to attempt details.
23.10 Attempt details
Display:
•	Student identity. 
•	Examination details. 
•	Attempt status. 
•	Start time. 
•	Submission time. 
•	Last synchronization time. 
•	Event counts. 
•	Event timeline. 
•	Snapshot gallery. 
•	PDF download. 
•	Retake authorization when permitted. 
23.11 Report viewer
Provide a browser-readable report summary and a PDF download action.
Use the same data source and count rules as the generated PDF.
23.12 Uploaded-video analysis
Provide:
•	File selection. 
•	Validation feedback. 
•	Analysis progress. 
•	Video preview where supported. 
•	Event timeline. 
•	Detection summaries. 
•	Evidence viewer. 
•	Analysis report. 
Keep uploaded-video analysis visually distinct from real examination attempts.
________________________________________
24. Accessibility and Usability
The interface must:
•	Support keyboard navigation. 
•	Use visible focus indicators. 
•	Provide readable form labels. 
•	Avoid relying only on color. 
•	Maintain sufficient contrast. 
•	Use meaningful icon labels. 
•	Provide accessible names for icon-only buttons. 
•	Keep important text readable at common browser zoom levels. 
•	Support responsive layouts. 
•	Respect reduced-motion preferences. 
•	Avoid unnecessary flashing or excessive animations. 
Animations must not interfere with exam timers, warning visibility, or camera monitoring.
________________________________________
25. Security, Privacy, and Evidence Handling
25.1 Authorization
Enforce permissions in the backend.
Students must not access another student's:
•	Answers. 
•	Attempt details. 
•	Events. 
•	Snapshots. 
•	Reports. 
Professors must not modify examinations they are not authorized to manage unless an explicit administrative permission permits it.
25.2 Credentials
•	Hash passwords using a suitable password-hashing algorithm. 
•	Never store plaintext passwords. 
•	Keep secrets out of source control. 
•	Use environment variables for secrets. 
•	Validate sessions and protected API requests. 
25.3 Evidence privacy
Capture only the evidence required by the examination-monitoring workflow.
Limit snapshot access to authorized users.
Define configurable retention behavior.
Do not expose snapshots through public unauthenticated URLs.
25.4 Human review
The system must distinguish detection from judgment.
A face-absence event, head-turn event, or phone detection must not automatically establish intent or guilt.
The report must state that automated events are observations requiring contextual human review.
25.5 Auditability
Preserve event timestamps, operation IDs, relevant synchronization status, and audit records.
Do not silently alter or discard previously submitted attempt history.
________________________________________
26. Computer-Vision Models and Licensing
Use locally executable pretrained models for the initial implementation.
Do not train a model from scratch unless later testing demonstrates that it is necessary and feasible.
Before adding any model:
1.	Verify that it supports the required runtime. 
2.	Verify its supported classes and outputs. 
3.	Verify its license. 
4.	Verify the license for the model weights. 
5.	Confirm whether redistribution is permitted. 
6.	Measure its performance on the actual test environment. 
7.	Document any limitations. 
Model licensing must be checked separately from the license of the code repository.
Keep model assets outside ordinary application source files where appropriate, and do not commit large model files to Git unless the repository policy permits it.
Do not use a cloud inference API for mandatory live monitoring.
________________________________________
27. Future Enhancements
These are later-phase features and must not delay the core requirements.
27.1 Face identity matching
Possible later workflow:
•	Student enrolls using reference photographs. 
•	A suitable pretrained model produces face embeddings. 
•	The application compares detected faces with authorized enrollment references. 
•	A sufficiently reliable match may display the student's registered identity. 
•	An unmatched face is shown as Anonymous or Unverified. 
•	Uncertain matches remain inconclusive. 
Identity recognition must not be presented as perfectly accurate.
27.2 Liveness detection
A dedicated presentation-attack-detection stage may be evaluated later.
It must be tested against printed photographs and video-replay attempts.
Face recognition alone does not prove liveness.
27.3 Desktop packaging
A Windows Electron application may be introduced after the browser-based local-first workflow passes the core tests.
27.4 Android packaging
Android support is a later-phase enhancement.
27.5 Review-priority indicator
A transparent indicator may help professors prioritize which events to inspect.
It must not be represented as a probability of cheating without appropriate validation.
________________________________________
28. Testing Requirements
The detailed test cases are defined in testing-plan.md.
The implementation must include tests for:
•	Face presence. 
•	Face absence. 
•	Multiple faces. 
•	Brief head turns. 
•	Sustained head turns. 
•	Looking down to read. 
•	Phone detection. 
•	Phone-like false positives. 
•	Poor lighting. 
•	Camera disconnection. 
•	Event persistence. 
•	Snapshot persistence. 
•	Warning dismissal. 
•	Answer persistence. 
•	Offline examination continuation. 
•	Offline submission. 
•	Ordered synchronization. 
•	Idempotent retries. 
•	Sequence gaps. 
•	Snapshot-upload failures. 
•	Backend authorization. 
•	Excel validation. 
•	Professor monitoring. 
•	PDF report consistency. 
•	Uploaded-video analysis. 
•	Data integrity. 
The ten scripted clips must be supported by the test harness.
Do not mark a test as passed merely because the application starts.
Record actual results and known limitations.
________________________________________
29. Recommended Implementation Phases
Implement in this order.
Phase 1 — Project foundation
•	Repository structure. 
•	Frontend setup. 
•	Backend setup. 
•	Database configuration. 
•	Migrations. 
•	Environment configuration. 
•	Design tokens. 
•	Theme system. 
•	Routing. 
•	Authentication foundation. 
Phase 2 — Local examination storage
•	Dexie database. 
•	Local repositories. 
•	Exam package storage. 
•	Answer persistence. 
•	Attempt state. 
•	Outbox. 
•	Atomic local writes. 
Phase 3 — Core computer vision
•	Camera manager. 
•	Face detection. 
•	Face counting. 
•	Head-pose estimation. 
•	Phone detection. 
•	Event rules. 
•	Event state machine. 
•	Evidence capture. 
•	Local persistence. 
Phase 4 — Student examination workflow
•	Exam-code entry. 
•	Package download. 
•	Readiness checks. 
•	Question navigation. 
•	MCQ answering. 
•	Short-answer input. 
•	Countdown. 
•	Camera preview. 
•	Warnings. 
•	Local submission. 
Phase 5 — Synchronization
•	Ordered outbox. 
•	API client. 
•	Idempotent ingestion. 
•	Sequence validation. 
•	Acknowledgements. 
•	Retry logic. 
•	Startup reconciliation. 
•	Snapshot uploads. 
•	Offline submission finalization. 
Phase 6 — Professor functionality
•	Examination creation. 
•	Question management. 
•	Excel import. 
•	Publication. 
•	Live monitoring. 
•	Event timeline. 
•	Snapshot viewer. 
•	Retake authorization. 
•	PDF reports. 
Phase 7 — Administrator functionality
•	User management. 
•	Role management. 
•	Account status. 
•	System settings. 
•	Audit logs. 
•	Health status. 
Phase 8 — Uploaded-video analysis
•	File validation. 
•	Video frame adapter. 
•	Shared detection pipeline. 
•	Timeline. 
•	Evidence viewer. 
Phase 9 — Testing and stabilization
•	Run all critical tests. 
•	Run the ten scripted clips. 
•	Test repeated network outages. 
•	Test recovery after refresh and restart. 
•	Test permissions. 
•	Test report consistency. 
•	Test the production build. 
•	Fix critical failures. 
Optional identity recognition, liveness detection, and native application packaging must not take priority over unresolved critical requirements.
________________________________________
30. Definition of Done
ExamProctor.ai is not complete merely because its pages exist.
A feature is complete only when its core behavior works and has been verified.
30.1 Student examination
•	Student can log in. 
•	Student can enter a valid examination code. 
•	The correct exam package is downloaded. 
•	Readiness checks work. 
•	The examination starts. 
•	Questions can be answered. 
•	Answers persist locally. 
•	The timer follows the configured policy. 
•	Manual submission works. 
30.2 Computer vision
•	Face presence works. 
•	Face absence is recorded after the configured grace period. 
•	Multiple-face detection works. 
•	Sustained head-turn detection uses duration and orientation rules. 
•	Phone detection is integrated. 
•	Candidate evidence is captured when possible. 
•	Events are persisted locally. 
•	Warnings are dismissible without deleting event history. 
30.3 Offline behavior
•	A prepared examination continues without internet. 
•	Questions remain available. 
•	Answers persist. 
•	Local monitoring continues when required assets remain available. 
•	Events and snapshots persist. 
•	Local submission works. 
•	Connectivity loss does not automatically submit the exam. 
•	Synchronization resumes after reconnection. 
•	Repeated retries do not create duplicate records. 
30.4 Professor workflow
•	Professor can create and publish examinations. 
•	Excel import preview works. 
•	Six-digit codes are generated. 
•	Student status is visible. 
•	Event counts are correct. 
•	Evidence can be reviewed. 
•	PDF reports are generated. 
•	Retakes preserve previous attempts. 
30.5 Administrator workflow
•	Administrator can manage accounts. 
•	Role permissions work. 
•	System settings are accessible. 
•	Audit logs are available. 
30.6 Visual design
•	Light mode works. 
•	Dark mode works. 
•	Theme preference persists. 
•	No grey text is used. 
•	Text contrast is verified. 
•	Lucide React icons are used consistently. 
•	The interface follows the agreed brutalist/neobrutalist design system. 
•	No normal emojis are used as UI icons. 
•	Responsive layouts remain usable. 
30.7 Documentation and setup
•	README contains setup instructions. 
•	Environment variables are documented. 
•	Database migrations work. 
•	Backend dependencies are documented. 
•	Frontend dependencies are documented. 
•	Tests can be run using documented commands. 
•	Known limitations are documented. 
________________________________________
31. Final Product Rule
ExamProctor.ai must be implemented as one cohesive product, not as a collection of disconnected mockup pages.
The frontend, backend, database, computer-vision engine, local database, synchronization protocol, evidence storage, and reports must work together.
The user interface must remain professional, readable, and consistent in both light and dark modes.
The application must prioritize data integrity, accurate observations, reliable local execution, and transparent limitations.
The defining requirement is that repeated internet disconnections must not, by themselves, stop an already-authorized examination or cause the application to lose locally committed examination data.

