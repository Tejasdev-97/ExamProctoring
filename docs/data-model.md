# ExamGuard AI — Data Model Specification

**Document version:** 1.1  
**Status:** Baseline implementation specification  
**Database:** PostgreSQL  
**ORM:** SQLAlchemy  
**Migrations:** Alembic  
**Local database:** IndexedDB through Dexie.js  
**Related documents:** architecture.md, sync-protocol.md, api-contracts.md, testing-plan.md

---

# 1. Purpose

This document defines the logical data model for ExamGuard AI.

It specifies the entities, identifiers, relationships, constraints, and persistence requirements for:

- Users and roles.
- Examinations.
- Questions and question versions.
- Examination attempts.
- Answers.
- Proctoring events.
- Snapshots and evidence.
- Synchronization operations.
- Retake authorizations.
- Administrative settings.
- Audit records.
- Uploaded-video analysis sessions.

The PostgreSQL database is the central persistent data store.

The student's browser uses IndexedDB through Dexie.js to persist examination data locally and support continued operation during internet disconnections.

The local and central data models must be compatible. Synchronization must not require a separate answer-saving or event-recording pipeline for online and offline operation.

This document defines the logical model. The implementation must enforce the specified relationships and constraints through database constraints, application validation, transactions, and authorization checks.

---

# 2. Data-model principles

## 2.1 Internal identifiers

Use UUIDs for internal entity identifiers wherever practical.

Examples:

- `user_id`
- `exam_id`
- `question_id`
- `attempt_id`
- `answer_id`
- `event_id`
- `snapshot_id`
- `operation_id`
- `retake_grant_id`

UUIDs must be generated before local records are created when those records need stable identifiers for synchronization.

A locally generated UUID must remain unchanged during retries and synchronization.

Do not replace a local identifier with a new server-generated identifier after synchronization.

## 2.2 USN is the institutional student identifier

The college USN is the unique institutional identifier for a student.

Example:

`2VD23MI001`

The USN must be stored as a string, not an integer.

Reasons:

- USNs may contain letters.
- Leading zeroes may be meaningful.
- Numeric conversion can alter the original identifier.
- USNs are identifiers, not quantities.

The internal `user_id` remains the primary database key.

The normalized USN must have a unique database constraint for student accounts.

Student names are not unique and must never be used as the primary identifier.

The displayed identity may contain both the name and USN:

`Tejas — 2VD23MI001`

The USN identifies the institutional account. It does not independently establish the identity of the person visible in a webcam.

## 2.3 Exam codes

The six-digit examination code must be stored as a six-character string.

Example:

`004281`

Do not store it as an integer because leading zeroes must be preserved.

The code identifies an examination. It is not an authentication credential and must not independently authorize access to an examination.

The server must verify the student's authenticated identity, eligibility, exam availability, and attempt authorization.

## 2.4 Attempt isolation

Each examination attempt must have its own UUID.

An attempt owns its answers, events, snapshots, synchronization history, and submission state.

A retake creates a new attempt.

A retake must never overwrite the previous attempt.

## 2.5 Immutable identifiers and retry safety

An entity's identifier must remain stable across:

- Online synchronization.
- Offline operation.
- Repeated connection failures.
- Application reloads.
- Synchronization retries.
- Duplicate request delivery.

The server must enforce uniqueness constraints that prevent the same logical record from being inserted multiple times.

## 2.6 Time fields

Store authoritative server timestamps in UTC.

For client-generated timestamps, preserve the original timestamp and identify it as client-reported.

Where required, store both:

- `client_created_at`
- `server_received_at`

Client-reported timestamps are useful for reconstructing the examination timeline, but they are not independently verified proof of real-world time.

For duration calculations during an active session, use the local monotonic timer rather than relying exclusively on the computer's wall clock.

---

# 3. Entity relationship overview

The main relationships are:

```text
USER
 |
 +-----------------------------+
 |                             |
 v                             v
EXAM OWNERSHIP             EXAM ATTEMPTS
 |                             |
 v                             +------------------+
EXAMS                         |                  |
 |                            v                  v
 +--> QUESTIONS             ANSWERS         PROCTOR EVENTS
 |                                               |
 v                                               v
QUESTION VERSIONS                            SNAPSHOTS

USER
 |
 +--> RETAKE GRANTS
 |
 +--> AUDIT LOGS

EXAM ATTEMPTS
 |
 +--> SYNC OPERATIONS
 |
 +--> ANSWERS
 |
 +--> PROCTOR EVENTS
 |
 +--> SNAPSHOTS

SYSTEM SETTINGS
 |
 +--> ADMINISTRATIVE AUDIT RECORDS

VIDEO ANALYSIS SESSION
 |
 +--> ANALYSIS EVENTS
 |
 +--> SNAPSHOTS

 4. Users
4.1 Table: users

Stores account and identity information.

Fields
Field	Type	Required	Description
user_id	UUID	Yes	Primary key
full_name	VARCHAR(200)	Yes	Display name
email	VARCHAR(320)	Policy-dependent	Login or contact email
password_hash	TEXT	Policy-dependent	Secure password hash
role	ENUM or constrained VARCHAR	Yes	admin, professor, or student
usn_normalized	VARCHAR(50)	Student only	Normalized institutional USN
account_status	ENUM or constrained VARCHAR	Yes	active, inactive, or locked
created_at	TIMESTAMPTZ	Yes	Server creation timestamp
updated_at	TIMESTAMPTZ	Yes	Last server update
created_by_user_id	UUID	No	Administrator who created the account
last_login_at	TIMESTAMPTZ	No	Last successful login
deactivated_at	TIMESTAMPTZ	No	Account deactivation timestamp
Constraints
user_id is the primary key.
role must be one of the supported roles.
A student must have a valid normalized USN.
The normalized USN must be unique among student accounts.
Non-student accounts must not claim a student's USN.
Inactive accounts must not start new examination attempts.
Email uniqueness must follow the chosen account policy.
Passwords must never be stored in plaintext.

A suitable normalized USN policy should be documented and applied consistently. For example, trim surrounding whitespace and convert letters to uppercase if that matches the institution's USN format.

Do not remove meaningful characters from a USN.

Privacy

Only store identity information needed by the application.

Do not store passwords, session tokens, or unnecessary authentication secrets in local examination records.

5. Examinations
5.1 Table: exams

Stores examination configuration.

Fields
Field	Type	Required	Description
exam_id	UUID	Yes	Primary key
owner_user_id	UUID	Yes	Professor responsible for the exam
title	VARCHAR(250)	Yes	Exam title
description	TEXT	No	Exam description
instructions	TEXT	Yes	Student-facing instructions
exam_code	CHAR(6)	Yes	Six-digit exam code
status	VARCHAR(30)	Yes	Draft, published, active, closed, or archived
duration_seconds	INTEGER	Yes	Configured exam duration
available_from	TIMESTAMPTZ	No	Opening time
available_until	TIMESTAMPTZ	No	Closing time
allow_offline_continuation	BOOLEAN	Yes	Whether offline continuation is permitted
allow_question_navigation	BOOLEAN	Yes	Whether students may navigate between questions
proctoring_config	JSONB	Yes	Versioned monitoring configuration
question_package_version	INTEGER	Yes	Current published package version
created_at	TIMESTAMPTZ	Yes	Creation timestamp
updated_at	TIMESTAMPTZ	Yes	Last update timestamp
published_at	TIMESTAMPTZ	No	Publication timestamp
closed_at	TIMESTAMPTZ	No	Closure timestamp
Constraints
exam_id is the primary key.
owner_user_id references an authorized professor account.
exam_code must contain exactly six digits.
duration_seconds must be positive.
question_package_version must be positive.
A published examination must contain valid questions.
A closed examination must follow the configured attempt policy.
Only authorized professors or administrators may modify an examination.
The code must not be treated as a substitute for authentication.
Exam code uniqueness

The six-digit code has a limited namespace.

The implementation must prevent ambiguous active codes and handle collisions.

A reasonable initial policy is to ensure that each code identifies no more than one currently eligible examination.

If codes are regenerated, the old code must be invalidated according to a defined policy.

Do not assume that six digits provide sufficient security against guessing.

Apply authentication, authorization, rate limits, and exam-eligibility checks.

6. Questions
6.1 Table: questions

Stores the logical question identity and current question data.

Fields
Field	Type	Required	Description
question_id	UUID	Yes	Primary key
exam_id	UUID	Yes	Owning examination
question_number	INTEGER	Yes	Display ordering
question_type	VARCHAR(30)	Yes	mcq or short_answer
question_text	TEXT	Yes	Question text
options	JSONB	MCQ only	Available options
marks	NUMERIC(8,2)	Yes	Marks available
answer_key	JSONB	Optional	Server-side grading data
grading_metadata	JSONB	No	Private grading configuration
version	INTEGER	Yes	Question version
created_at	TIMESTAMPTZ	Yes	Creation timestamp
updated_at	TIMESTAMPTZ	Yes	Last update timestamp
Constraints
question_id is the primary key.
exam_id references an existing examination.
Question numbers must be unique within the applicable published version.
Marks must be non-negative.
MCQ questions must contain valid options.
Short-answer questions must not require MCQ options.
Answer keys must reference valid options or the correct answer representation.
Student packages must exclude answer keys and private grading metadata.
6.2 Published question versions

An active attempt must not silently receive altered questions.

The implementation must preserve the exact question package assigned to an attempt.

A published package may be represented by immutable versioned records or an immutable package snapshot.

The selected implementation must ensure that changing a draft or publishing a later exam version does not mutate the question content of an already-authorized attempt.

The attempt must reference the exact package version it received.

7. Examination attempts
7.1 Table: exam_attempts

Represents one student's attempt at an examination.

Fields
Field	Type	Required	Description
attempt_id	UUID	Yes	Primary key
exam_id	UUID	Yes	Examination
student_user_id	UUID	Yes	Student account
attempt_number	INTEGER	Yes	Attempt number for the student and exam
previous_attempt_id	UUID	No	Previous attempt, if this is a retake
package_version	INTEGER	Yes	Exact question package version
status	VARCHAR(30)	Yes	Authorized, in progress, submitted, expired, cancelled, or another explicitly supported state
authorization_id	UUID	No	Authorization associated with the attempt
authorized_at	TIMESTAMPTZ	Yes	Server authorization time
client_started_at	TIMESTAMPTZ	No	Client-reported start time
server_started_at	TIMESTAMPTZ	No	Server-recorded start time
client_submitted_at	TIMESTAMPTZ	No	Client-reported submission time
server_submitted_at	TIMESTAMPTZ	No	Server-recorded submission time
last_server_contact_at	TIMESTAMPTZ	No	Last accepted client communication
last_accepted_sequence	BIGINT	Yes	Last accepted contiguous sequence
final_sequence	BIGINT	No	Final operation sequence at submission
submission_operation_id	UUID	No	Stable submission operation ID
submission_received	BOOLEAN	Yes	Whether the server has received the submission
created_at	TIMESTAMPTZ	Yes	Record creation time
updated_at	TIMESTAMPTZ	Yes	Last update time
Constraints
attempt_id is the primary key.
exam_id references an examination.
student_user_id references a student account.
attempt_number must be positive.
package_version must reference a valid package.
last_accepted_sequence must be non-negative.
final_sequence, when present, must be non-negative.
The student and exam must satisfy the configured attempt policy.
An attempt must not be duplicated by retrying its creation request.
Uniqueness

The database must enforce the selected attempt-number policy.

A recommended constraint is:

UNIQUE (exam_id, student_user_id, attempt_number)

The implementation must also prevent more than one initial attempt for a student and exam when the policy permits only one initial attempt.

A professor-authorized retake must use a new attempt number and a new attempt UUID.

Do not overwrite previous attempts.

7.2 Attempt status

The implementation must define legal status transitions.

A recommended logical progression is:

AUTHORIZED
    |
    v
IN_PROGRESS
    |
    +------> SUBMITTED
    |
    +------> EXPIRED
    |
    +------> CANCELLED

The exact policy may distinguish a locally submitted attempt from a server-confirmed submission.

A client-side submission must not be treated as server-confirmed merely because it was saved locally.

An offline submission may remain pending synchronization while the local client records that the student has completed the exam.

8. Answers
8.1 Table: answers

Stores the current centrally synchronized answer state for a question in an attempt.

Fields
Field	Type	Required	Description
answer_id	UUID	Yes	Primary key
attempt_id	UUID	Yes	Examination attempt
question_id	UUID	Yes	Answered question
answer_value	JSONB	Yes	Selected option or text answer
revision	INTEGER	Yes	Current accepted revision
last_operation_id	UUID	Yes	Operation that produced the current revision
client_updated_at	TIMESTAMPTZ	Yes	Client-reported update time
server_updated_at	TIMESTAMPTZ	Yes	Server update time
created_at	TIMESTAMPTZ	Yes	Initial record creation time
Constraints
answer_id is the primary key.
attempt_id references an authorized attempt.
question_id must belong to the attempt's assigned question package.
An answer must not be written to another student's attempt.
An MCQ answer must reference an allowed option.
A short-answer value must conform to the permitted answer format.
The answer must be accepted only while the attempt's policy permits changes.
Duplicate operation delivery must not create duplicate logical answer updates.

A recommended uniqueness constraint is:

UNIQUE (attempt_id, question_id)

This table represents the current answer state.

If a complete history of answer revisions is required, retain the individual answer operations in the synchronization operation history or introduce a dedicated answer-revision table.

The implementation must not silently discard conflicting updates.

8.2 Local answer persistence

The local database should store the current answer state and the pending operation needed to synchronize changes.

The answer and its corresponding synchronization operation must be persisted in one local transaction.

If the transaction fails, the UI must not claim that the answer was saved successfully.

The answer-saving pipeline must be identical whether the application is online or offline.

9. Proctoring events
9.1 Table: proctor_events

Stores logical monitoring events.

Fields
Field	Type	Required	Description
event_id	UUID	Yes	Primary key
attempt_id	UUID	Conditional	Exam attempt for live proctoring
video_analysis_session_id	UUID	Conditional	Uploaded-video analysis session
event_type	VARCHAR(50)	Yes	Event category
event_status	VARCHAR(30)	Yes	Candidate, confirmed, resolved, inconclusive, or another defined state
client_started_at	TIMESTAMPTZ	Yes	Client-reported event start
client_ended_at	TIMESTAMPTZ	No	Client-reported event end
server_received_at	TIMESTAMPTZ	No	Server receipt time
duration_ms	BIGINT	No	Calculated event duration
confidence	NUMERIC(6,5)	No	Detector confidence when applicable
bounding_boxes	JSONB	No	Relevant detected regions
detector_name	VARCHAR(100)	No	Detector used
detector_version	VARCHAR(100)	No	Detector version
rule_version	VARCHAR(100)	No	Event-rule version
metadata	JSONB	No	Additional structured context
created_at	TIMESTAMPTZ	Yes	Record creation time
Event types

The initial implementation should support:

face_absent
multiple_faces
sustained_head_turn
phone_detected
camera_unavailable
camera_quality_warning
fullscreen_exit
page_hidden
model_unavailable

Additional event types may be added only when their semantics are documented and tested.

Constraints
event_id is the primary key.
Exactly one of attempt_id and video_analysis_session_id must be supplied for an ordinary event.
Event type must be supported.
Confidence must be within the valid range when supplied.
Duration must be non-negative.
The event must belong to an authorized attempt or a valid analysis session.
Duplicate event ingestion must not create a second logical event.
Event timestamps must preserve their original client-reported values.

For face_absent, the application must not require a face snapshot to exist.

For phone_detected and multiple_faces, snapshots should be attached when available.

A candidate observation may be retained for evidence handling even if it does not eventually become a confirmed event.

The report must distinguish confirmed events from inconclusive observations when relevant.

10. Snapshots and evidence
10.1 Table: snapshots

Stores metadata for evidence images.

The image bytes should normally be stored in IndexedDB locally and in durable object storage on the server.

PostgreSQL stores metadata and references.

Fields
Field	Type	Required	Description
snapshot_id	UUID	Yes	Primary key
attempt_id	UUID	Conditional	Associated exam attempt
video_analysis_session_id	UUID	Conditional	Associated video-analysis session
event_id	UUID	No	Related event
capture_reason	VARCHAR(50)	Yes	Reason for capture
client_captured_at	TIMESTAMPTZ	Yes	Client-reported capture time
server_received_at	TIMESTAMPTZ	No	Server receipt time
mime_type	VARCHAR(100)	Yes	Image media type
size_bytes	BIGINT	Yes	Image size
sha256	CHAR(64)	Yes	Content checksum
width	INTEGER	No	Image width
height	INTEGER	No	Image height
storage_status	VARCHAR(30)	Yes	Local, pending, uploaded, failed, or another defined state
storage_key	TEXT	No	Durable object-storage reference
created_at	TIMESTAMPTZ	Yes	Metadata creation time
Constraints
snapshot_id is the primary key.
Exactly one of attempt_id and video_analysis_session_id must be supplied.
Image size must be positive.
Image type must be allowed.
The checksum must be valid.
The associated event must belong to the same attempt or analysis session.
A snapshot must not be marked uploaded until the server confirms durable receipt.
Duplicate snapshot uploads must not create duplicate logical snapshot records.
Evidence requirements

The client must retain the local image until upload completion is acknowledged.

The server must validate the uploaded content against its expected metadata.

The checksum should be used to detect corruption or accidental mismatch.

A failed upload must remain retryable.

A report must not imply that an image is available on the server when only a local copy exists.

11. Synchronization operations
11.1 Table: sync_operations

Records synchronization operations received by the central server.

The browser also maintains a corresponding local outbox in IndexedDB.

The server-side table provides deduplication, sequence validation, and recovery information.

Fields
Field	Type	Required	Description
operation_id	UUID	Yes	Stable operation identifier
attempt_id	UUID	Yes	Associated attempt
sequence_number	BIGINT	Yes	Attempt-scoped operation sequence
operation_type	VARCHAR(50)	Yes	Answer update, event creation, submission, or another defined operation
entity_id	UUID	Yes	Target logical entity
payload_hash	CHAR(64)	Yes	Hash of canonical operation payload
payload	JSONB	Yes	Validated operation payload
client_created_at	TIMESTAMPTZ	Yes	Client-reported creation time
server_received_at	TIMESTAMPTZ	Yes	Server receipt time
processing_status	VARCHAR(30)	Yes	Received, accepted, rejected, or another defined state
result_metadata	JSONB	No	Result or rejection details
Constraints
operation_id is the primary key.
attempt_id references an authorized attempt.
Sequence numbers must be positive.
An operation ID must always refer to the same logical payload.
Reuse of an operation ID with a different payload must be rejected.
Duplicate delivery of an identical operation must return the original result.
The server must validate operation ordering.
Invalid operations must not be silently skipped.
Server-side mutations must be applied transactionally with operation acceptance.

Recommended uniqueness constraint:

UNIQUE (attempt_id, sequence_number)

The server must also prevent one operation ID from being accepted under conflicting attempt or sequence metadata.

11.2 Operation types

The initial implementation may support:

answer_upsert
event_upsert
submission_finalize
attempt_state_update

Snapshot binary uploads should use the dedicated evidence-upload flow.

The exact operation payloads and acknowledgements are defined in sync-protocol.md and api-contracts.md.

11.3 Sequence semantics

The client must assign a stable sequence number when an operation is created.

Sequence allocation and local outbox insertion must be atomic.

The server must track the highest contiguous accepted sequence.

If operation 8 arrives before operation 7, the server must not silently pretend that the missing operation was accepted.

The implementation must return a retryable response or an explicit sequence-gap result according to the synchronization protocol.

12. Retake authorizations
12.1 Table: retake_grants

Stores professor-authorized permission for an additional examination attempt.

Fields
Field	Type	Required	Description
retake_grant_id	UUID	Yes	Primary key
exam_id	UUID	Yes	Examination
student_user_id	UUID	Yes	Authorized student
previous_attempt_id	UUID	No	Previous attempt
granted_by_user_id	UUID	Yes	Professor or administrator granting permission
reason	TEXT	No	Optional explanation
status	VARCHAR(30)	Yes	Granted, consumed, revoked, or expired
granted_at	TIMESTAMPTZ	Yes	Grant time
expires_at	TIMESTAMPTZ	No	Expiration time
consumed_at	TIMESTAMPTZ	No	Time used
consumed_by_attempt_id	UUID	No	Attempt created from this grant
Constraints
retake_grant_id is the primary key.
The exam and student must exist.
The granting user must have permission to authorize the retake.
A grant must not be consumed more than once.
A consumed grant must reference the resulting attempt.
A retake must create a new attempt.
The previous attempt must remain unchanged.

The server must enforce retake authorization.

The student must not be able to grant themselves another attempt by modifying local data.

13. System settings
13.1 Table: system_settings

Stores global configuration values.

Fields
Field	Type	Required	Description
setting_id	UUID	Yes	Primary key
setting_key	VARCHAR(150)	Yes	Unique configuration key
setting_value	JSONB	Yes	Validated setting value
description	TEXT	No	Purpose of the setting
updated_by_user_id	UUID	Yes	Administrator making the latest change
version	INTEGER	Yes	Configuration version
created_at	TIMESTAMPTZ	Yes	Creation time
updated_at	TIMESTAMPTZ	Yes	Last update time
Constraints
setting_id is the primary key.
setting_key must be unique.
Only authorized administrators may modify protected settings.
Setting values must pass schema validation.
Important changes must be recorded in the audit log.
Active examination attempts must retain the configuration version assigned to them.

Examples of possible settings include:

Default face-absence duration.
Default sustained-head-turn duration.
Default phone-detection threshold.
Evidence retention policy.
Maximum permitted upload size.
Default offline-continuation policy.

Only implemented and validated settings should be exposed in the administrator interface.

14. Audit logs
14.1 Table: audit_logs

Records important administrative and security-relevant actions.

Fields
Field	Type	Required	Description
audit_log_id	UUID	Yes	Primary key
actor_user_id	UUID	No	User performing the action
action_type	VARCHAR(100)	Yes	Action category
target_type	VARCHAR(100)	No	Target entity type
target_id	UUID	No	Target entity ID
occurred_at	TIMESTAMPTZ	Yes	Server-recorded time
result	VARCHAR(30)	Yes	Success, failure, or another defined result
metadata	JSONB	No	Non-sensitive action context
Actions to audit

Examples:

Account creation.
Account deactivation.
Role assignment.
Examination publication.
Examination closure.
Retake authorization.
System setting changes.
Attempt cancellation.
Administrative report access where required.
Security-sensitive authorization failures.

Audit logs must not contain passwords, authentication tokens, or unnecessary biometric data.

Ordinary high-frequency frame observations should not generate excessive administrative audit entries.

15. Uploaded-video analysis sessions
15.1 Table: video_analysis_sessions

Uploaded-video evaluation is separate from a live examination attempt.

It must use the same detection and event-processing pipeline while retaining a distinct session type.

Fields
Field	Type	Required	Description
video_analysis_session_id	UUID	Yes	Primary key
created_by_user_id	UUID	Yes	Authorized user initiating analysis
source_filename	VARCHAR(255)	Yes	Original filename
source_size_bytes	BIGINT	Yes	File size
source_sha256	CHAR(64)	Yes	Video checksum
source_duration_ms	BIGINT	No	Source duration
analysis_status	VARCHAR(30)	Yes	Queued, processing, completed, failed, or cancelled
pipeline_version	VARCHAR(100)	Yes	Detection pipeline version
started_at	TIMESTAMPTZ	No	Processing start
completed_at	TIMESTAMPTZ	No	Processing completion
created_at	TIMESTAMPTZ	Yes	Session creation time
Constraints
The session ID is the primary key.
The creator must be authorized to initiate analysis.
File type and size must be validated.
The checksum must match the analyzed input.
Events must reference the analysis session rather than an unrelated live exam attempt.
The application must not treat the video as proof of a live student's identity.

The initial implementation may process uploaded videos locally without storing the entire source video on the central server.

The system should retain only the data needed for the analysis report and evidence policy.

16. Local IndexedDB model

The local database must support offline examination execution and reliable synchronization.

Use Dexie.js to define the IndexedDB schema.

Recommended local stores:

Store	Purpose
examPackages	Downloaded, validated exam packages
attempts	Local attempt state and recovery metadata
answers	Current local answer state
answerRevisions	Optional answer history
proctorEvents	Local event records
snapshots	Snapshot Blob records and metadata
syncOutbox	Ordered pending synchronization operations
syncReceipts	Server acknowledgements and reconciliation state
localSettings	Non-secret client configuration
analysisSessions	Uploaded-video analysis metadata
analysisResults	Local analysis events and report data

The exact store definitions must be implemented in the local database module.

16.1 Local record requirements

Local answer, event, snapshot, and operation records must have stable identifiers.

The local database must preserve:

Attempt ID.
Operation ID.
Sequence number.
Entity ID.
Payload.
Payload hash.
Local creation time.
Synchronization state.
Server acknowledgement information where available.
16.2 Atomic writes

The following related updates must be atomic where they share the same IndexedDB database:

Answer update plus outbox insertion.
Event creation plus outbox insertion.
Snapshot metadata creation plus local Blob persistence.
Submission finalization plus submission operation creation.
Sequence-counter increment plus operation insertion.

If a local transaction fails, the application must not display a false successful-save status.

16.3 Local database migrations

The client must have a versioned IndexedDB schema.

A migration must not silently erase:

Active attempts.
Answers.
Pending synchronization operations.
Unuploaded snapshots.
Submission state.

If a migration cannot preserve critical records, the application must fail safely and explain the problem rather than silently starting a fresh attempt.

17. Identity recognition data — later phase

Identity recognition is not required for the initial monitoring pipeline.

If it is implemented later, biometric reference data must be handled separately from ordinary user identity records.

The design must consider:

Appropriate consent.
Reference-image retention.
Embedding storage.
Model and weight licensing.
Access control.
Data deletion.
False matches.
Incorrect rejection.
Unmatched faces.
Multiple-face situations.

The initial data model must not require face embeddings to create a user or examination attempt.

A registered name and USN must not be displayed above an arbitrary detected face without a validated identity match.

If recognition is unavailable or uncertain, use a neutral identity state such as Unknown or Unverified.

Do not store raw reference images or embeddings unless the later identity feature has been explicitly designed and approved.

18. Liveness detection data — later phase

Liveness and presentation-attack detection are separate from face detection and identity recognition.

The initial schema does not require liveness scores.

If a later implementation adds liveness analysis, it must define:

Model and version.
Analysis timestamp.
Result category.
Confidence or quality indicators where supported.
Failure and inconclusive states.
Evidence references where appropriate.
Retention and privacy policy.

Do not interpret a liveness score as a guaranteed proof that a camera input is genuine.

Do not use a simple blink event as a substitute for a validated presentation-attack detection system.

19. Database indexes

The implementation should add indexes for frequently used queries.

Recommended indexes include:

Users
Unique normalized USN for student accounts.
Unique email where the account policy requires it.
Role and account status where useful.
Examinations
Exam code.
Owner and status.
Availability window where useful.
Attempts
(exam_id, student_user_id, attempt_number).
(exam_id, status).
(student_user_id, created_at).
Attempt status and last server contact where useful.
Answers
Unique (attempt_id, question_id).
Proctoring events
(attempt_id, client_started_at).
(video_analysis_session_id, client_started_at).
(attempt_id, event_type).
Snapshots
(attempt_id, client_captured_at).
(event_id).
Storage status for pending-upload queries.
Synchronization operations
Unique (attempt_id, sequence_number).
(attempt_id, processing_status).
Server receipt time where useful.
Retake grants
(exam_id, student_user_id, status).
Audit logs
(actor_user_id, occurred_at).
(target_type, target_id).
(action_type, occurred_at).

Indexes should be validated against actual query patterns rather than added indiscriminately.

20. Data integrity requirements

The following rules are mandatory.

Every student account has one normalized institutional USN.
The normalized USN is unique among student accounts.
Student names are not unique identifiers.
Every examination attempt has a stable UUID.
Every answer belongs to one attempt and one question in its assigned package.
Every event belongs to one attempt or one video-analysis session.
Every snapshot belongs to one attempt or one video-analysis session.
Event and snapshot relationships must be valid.
Every synchronization operation has a stable UUID.
Every attempt-scoped operation has a stable sequence number.
The same operation ID cannot represent different payloads.
Duplicate operation delivery must be idempotent.
Server acknowledgement must reflect the actual processing result.
A submission must be idempotent.
Retakes create new attempts.
Previous attempts must not be overwritten.
Student packages must not expose correct answer keys.
Unauthorized users must not access another student's answers or evidence.
Pending local snapshots must not be deleted before acknowledged upload.
Failed local writes must not be reported as successful saves.
Client timestamps must be distinguishable from server timestamps.
Active attempts must preserve their assigned question-package version.
Settings changes must be validated and audited.
Uploaded-video analysis must remain distinct from live examination attempts.
Identity recognition and liveness detection must remain optional until implemented and validated.
21. Retention and deletion

The system must define a retention policy for:

Exam packages.
Answers.
Proctoring events.
Snapshots.
Uploaded-video analysis results.
Identity reference data if introduced later.
Audit logs.
Local synchronization records.

Retention periods must follow the institution's requirements and applicable privacy rules.

The application must not delete unsynchronized examination records merely because an exam has ended.

Local evidence may be removed only when the applicable policy permits deletion and the required server acknowledgements or other retention conditions have been satisfied.

Deletion must not silently corrupt the relationship between an event and its evidence.

Where records must be retained for audit purposes, use a documented archival or deletion process.

22. Acceptance criteria

The data model is ready for implementation when:

Student USNs are stored as normalized strings.
Duplicate student USNs are rejected.
Internal entities use stable identifiers.
Exam codes preserve leading zeroes.
Attempts are isolated.
Retakes create new attempts.
Answers are associated with the correct attempt and question.
Published question packages remain stable for active attempts.
Events and snapshots have valid relationships.
Synchronization operations are idempotent.
Operation sequence constraints are defined.
System settings are represented and validated.
Administrative actions can be audited.
Uploaded-video sessions remain separate from live attempts.
Local storage supports atomic answer, event, snapshot, and outbox updates.
Correct answer keys are not exposed to the student.
Pending evidence remains recoverable.
The central schema supports the online, offline, and intermittently connected workflows defined in architecture.md.