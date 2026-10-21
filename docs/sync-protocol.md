# ExamGuard AI — Synchronization Protocol Specification

**Document version:** 1.1  
**Status:** Baseline implementation specification  
**Project:** ExamGuard AI — Smart Exam Proctor  
**Frontend:** React + Vite + JavaScript  
**Local database:** IndexedDB through Dexie.js  
**Backend:** Python + FastAPI  
**Central database:** PostgreSQL  
**Synchronization model:** Local-first, ordered, idempotent synchronization  
**Primary requirement:** Examination continuity during repeated internet disconnections  
**Related documents:** architecture.md, data-model.md, api-contracts.md, testing-plan.md

---

# 1. Purpose

This document defines the synchronization protocol between the ExamGuard AI student client and the central server.

It establishes how the application stores and synchronizes:

- Examination attempts.
- Student answers.
- Answer revisions.
- Proctoring events.
- Evidence snapshots.
- Attempt status changes.
- Examination submissions.
- Synchronization acknowledgements.
- Recovery information.

The protocol must support three connectivity conditions:

1. Continuous internet connectivity.
2. Complete internet disconnection.
3. Repeated transitions between connected and disconnected states.

The application must use one consistent local-first persistence pipeline in all three conditions.

The student must not lose an already locally committed answer simply because the internet disconnects.

The monitoring pipeline must continue locally while disconnected, provided the camera, required local assets, computer-vision models, and local storage remain available.

The student must be able to submit an examination while offline if the examination policy permits offline continuation.

After connectivity returns, the application must automatically resume synchronization.

The server must process repeated requests safely so that retrying a request does not create duplicate logical records.

**The protocol must never automatically submit an examination solely because the internet connection is lost.**

---

# 2. Core synchronization principles

The following principles are mandatory.

## 2.1 Local persistence comes first

Every supported student action that changes examination state must be persisted locally before the application reports that the change was successfully saved.

The sequence is:

1. Validate the action locally.
2. Create or update the local record.
3. Create the corresponding synchronization operation.
4. Commit the related changes in one IndexedDB transaction.
5. Confirm that the action was saved locally.
6. Attempt synchronization if the server is reachable.

The UI must not wait for a server response before allowing an otherwise valid locally saved answer to remain available.

## 2.2 Local save and server synchronization are different states

A locally saved answer is not necessarily synchronized.

The interface must distinguish:

- `saved_local`
- `pending_sync`
- `syncing`
- `synced`
- `sync_blocked`
- `local_save_failed`

The application must not display `synced` until the server has acknowledged the corresponding operation.

Similarly, a locally submitted examination is not necessarily a server-confirmed submission.

## 2.3 Stable operation identifiers

Every synchronization operation must have a stable UUID.

Once an operation has been created, its identifier must not change when the operation is retried.

Example:

`operation_id = 7a60e4c7-1b8f-4b17-a98d-15b15e1e6b0a`

The same operation ID must be reused after:

- A request timeout.
- A lost response.
- A browser reload.
- An internet disconnection.
- A temporary server failure.
- An application restart supported by the deployment.
- A retry following an ambiguous network result.

Generating a new operation ID for the same logical operation can create duplicates and is prohibited.

## 2.4 Ordered operations

Each examination attempt maintains an increasing sequence of synchronization operations.

For example:

```text
Attempt: A123

Sequence 1: Initial answer update
Sequence 2: Another answer update
Sequence 3: Proctoring event
Sequence 4: Answer revision
Sequence 5: Evidence metadata update
Sequence 6: Submission finalization

The sequence number is assigned when an operation is created locally.

The operation and sequence-counter update must be committed atomically.

The server must not silently skip a missing required sequence number.

2.5 Idempotent processing

An operation is idempotent when processing the same logical operation repeatedly produces the same logical result.

If the server accepts operation 12 and its response is lost, the client may send operation 12 again.

The server must recognize the existing operation and return its original result rather than applying the operation as a new operation.

The same principle applies to submission requests and snapshot uploads.

2.6 No cloud dependency during an authorized offline examination

After an examination package has been downloaded, validated, and authorized, the student client must not require a live server request for:

Displaying an assigned question.
Navigating between downloaded questions.
Saving answers locally.
Updating the local countdown.
Processing webcam frames.
Running locally available computer-vision models.
Recording local proctoring events.
Capturing and saving snapshots.
Displaying warnings.
Recording supported browser visibility events.
Preparing a local submission.

The server remains responsible for authorization, central persistence, and synchronized records.

The client remains responsible for local examination execution during supported disconnections.

3. System components

The synchronization system contains five major components.

3.1 Local repository

The local repository is the only supported application-level interface for persisting examination state.

It manages IndexedDB through Dexie.js.

Responsibilities:

Save answers.
Save events.
Save snapshots.
Save attempt state.
Create synchronization operations.
Maintain the operation sequence counter.
Record server acknowledgements.
Recover pending operations.
Apply local schema migrations safely.

UI components must not independently manipulate the synchronization outbox.

3.2 Synchronization outbox

The outbox contains locally committed operations that still require server processing.

Each operation must include:

Operation ID.
Attempt ID.
Sequence number.
Operation type.
Entity ID.
Payload.
Canonical payload hash.
Client creation timestamp.
Synchronization state.
Retry metadata.

The outbox is persistent.

It must survive supported reloads and application restarts.

It must not be cleared merely because a request failed or a timeout occurred.

3.3 Synchronization worker

The synchronization worker processes the outbox.

Responsibilities:

Detect pending operations.
Check actual API reachability.
Send bounded batches.
Preserve operation ordering.
Process acknowledgements.
Retry retryable failures.
Detect sequence gaps.
Handle conflicts.
Resume after connectivity returns.
Coordinate evidence uploads.
Reconcile local and server state.

The worker must not block the examination UI.

Where supported, a Web Worker may perform background synchronization tasks. Browser lifecycle restrictions must still be respected.

3.4 Central synchronization API

The FastAPI backend receives synchronization requests.

Responsibilities:

Authenticate the caller.
Authorize the examination attempt.
Validate operation payloads.
Validate operation IDs.
Validate sequence numbers.
Enforce idempotency.
Persist accepted operations transactionally.
Update answers, events, and attempt state.
Return explicit acknowledgements.
Report conflicts and retryable errors.

The server must not trust the client merely because it supplied a valid UUID.

3.5 Central persistence

The central database stores accepted records in PostgreSQL.

Evidence images are stored in durable object storage or another explicitly configured persistent storage solution.

PostgreSQL stores snapshot metadata and storage references.

The central persistence layer must not treat a file as durably uploaded until the configured storage service confirms successful storage.

4. Synchronization architecture
                 STUDENT EXAMINATION CLIENT
                            |
                            v
                    STUDENT ACTION
                            |
                            v
                     LOCAL REPOSITORY
                            |
                            v
                  INDEXEDDB TRANSACTION
                            |
             +--------------+--------------+
             |                             |
             v                             v
       SAVE ANSWER / EVENT            CREATE OPERATION
       / SNAPSHOT / STATE             WITH STABLE ID
             |                             |
             +--------------+--------------+
                            |
                            v
                     TRANSACTION COMMIT
                            |
                            v
                   SHOW LOCAL SAVE STATUS
                            |
                            v
                    SYNCHRONIZATION WORKER
                            |
                            v
                    API REACHABLE NOW?
                       /           \
                     YES            NO
                      |              |
                      v              v
                SEND OPERATIONS   KEEP PENDING
                      |              |
                      v              |
                SERVER VALIDATION   |
                      |              |
             +--------+--------+     |
             |                 |     |
             v                 v     |
          ACCEPTED           ERROR   |
             |                 |     |
             v                 v     |
       CENTRAL DATABASE   RETRY OR    |
             |            CONFLICT   |
             v                 |     |
        ACKNOWLEDGEMENT         |     |
             |                 |     |
             v                 |     |
       UPDATE LOCAL RECEIPT <---+-----+
             |
             v
       PROCESS NEXT OPERATIONS
             |
             v
       ALL REQUIRED RECORDS
       SYNCHRONIZED?
             |
             +------ NO ------> CONTINUE LATER
             |
             +------ YES -----> MARK SYNCHRONIZED

The synchronization worker must operate independently of the React UI's component lifecycle.

Unmounting a component must not erase the outbox or reset the sequence counter.

5. Local database requirements
5.1 Required local stores

The local IndexedDB database should contain the following stores.

Store	Purpose
examPackages	Validated examination packages
attempts	Local attempt state
answers	Current local answers
answerRevisions	Optional answer history
proctorEvents	Local event records
snapshots	Snapshot metadata and Blob data
syncOutbox	Pending synchronization operations
syncReceipts	Server acknowledgements
localSettings	Non-secret local configuration
analysisSessions	Uploaded-video analysis metadata
analysisResults	Uploaded-video analysis results

The exact store definitions must be implemented in the local database module.

5.2 Operation record

A synchronization operation should follow this logical structure:

{
  "operation_id": "7a60e4c7-1b8f-4b17-a98d-15b15e1e6b0a",
  "attempt_id": "0f4b92e8-8f80-45f2-9d7e-3efde1ac4b27",
  "sequence_number": 12,
  "operation_type": "answer_upsert",
  "entity_id": "bb9c7811-70e4-45b9-9d82-1d7cb8c1b7f2",
  "payload_hash": "canonical-sha256-hex-digest",
  "payload": {
    "question_id": "bb9c7811-70e4-45b9-9d82-1d7cb8c1b7f2",
    "answer_value": {
      "selected_option": "B"
    },
    "revision": 3
  },
  "client_created_at": "2026-10-18T09:30:00Z",
  "sync_status": "pending",
  "retry_count": 0,
  "last_attempt_at": null,
  "last_error_code": null
}

The example is illustrative.

The exact request schema must match api-contracts.md.

The example hash is a placeholder. Production code must calculate the actual SHA-256 digest from a deterministic canonical representation of the operation payload.

5.3 Local operation states

The client should use the following operation states:

pending
in_flight
acknowledged
retry_wait
blocked
rejected
pending

The operation is stored locally and has not yet been sent successfully.

in_flight

A synchronization request containing the operation is currently being processed.

This is a temporary state, not proof of server acceptance.

acknowledged

The server has confirmed successful processing.

The client has persisted the acknowledgement locally.

retry_wait

The operation failed for a retryable reason and must be retried later.

blocked

The operation cannot currently proceed because a dependency, sequence gap, or unresolved conflict must be addressed.

rejected

The server has definitively rejected the operation.

A rejected operation must not be silently deleted.

The client must preserve the error details and follow the defined recovery policy.

5.4 Atomic local writes

The following operations must be atomic wherever they share the same IndexedDB database:

Updating an answer and inserting its synchronization operation.
Creating an event and inserting its synchronization operation.
Allocating a sequence number and inserting the corresponding operation.
Persisting snapshot metadata and its local Blob.
Recording local submission and inserting the final submission operation.
Updating local acknowledgement state and marking the corresponding operation acknowledged.

For example, an answer update must not succeed locally while its required synchronization operation fails to persist.

If the transaction fails, the UI must report that the local save failed.

5.5 Sequence counter persistence

Maintain an attempt-scoped sequence counter.

Example:

attempt_id: A123
last_allocated_sequence: 17

The next operation receives sequence number 18.

The sequence number must be allocated in the same transaction that inserts the operation.

The sequence counter must survive reloads.

The client must not reset it merely because:

The internet disconnects.
The page reloads.
The API restarts.
The synchronization worker restarts.
An operation is retried.

A new examination attempt has a separate sequence space.

6. Operation types

The initial protocol supports the following logical operation types.

6.1 answer_upsert

Creates or updates the current answer for a question in an attempt.

The operation contains:

Attempt ID.
Question ID.
Answer value.
Answer revision.
Operation ID.
Sequence number.
Client creation timestamp.

The server must verify that the question belongs to the attempt's assigned package.

The server must verify that the attempt permits answer changes.

The server must validate the answer format.

For MCQs, the selected option must belong to the question.

The server must not accept an answer update after finalization unless an explicit policy permits it.

6.2 event_upsert

Creates or updates a logical proctoring event.

The operation contains:

Event ID.
Attempt ID.
Event type.
Event status.
Client-reported start time.
Optional end time.
Duration where applicable.
Confidence where applicable.
Detector metadata.
Bounding boxes where applicable.
Related snapshot identifiers where available.

The server must validate the event schema and attempt ownership.

A repeated operation must not create another logical event.

A new event must use a new event ID.

The application must not generate a separate event for every frame belonging to the same event lifecycle.

6.3 submission_finalize

Finalizes an examination attempt.

The operation contains:

Stable submission operation ID.
Attempt ID.
Final operation sequence.
Client-reported submission time.
Final answer-state metadata where required.
Applicable submission metadata.

The submission operation must have a stable ID and must be retried with that same ID.

The server must finalize the attempt idempotently.

A repeated submission request must return the existing submission result rather than creating another submission.

6.4 attempt_state_update

Updates a supported attempt state when the protocol explicitly permits that transition.

Examples may include supported lifecycle changes that do not finalize the examination.

The server must validate all state transitions.

The client must not use this operation to bypass attempt authorization or reopen a finalized attempt.

6.5 Snapshot binary uploads

Snapshot bytes must not be placed inside ordinary JSON synchronization batches.

Snapshot upload uses a separate endpoint and upload lifecycle.

The local snapshot metadata and binary Blob must be persisted before upload is attempted.

The snapshot's metadata and related event must retain stable identifiers across retries.

7. Sequence-number rules
7.1 Sequence scope

Sequence numbers are scoped to one examination attempt.

Example:

Attempt A:
1, 2, 3, 4, 5, 6

Attempt B:
1, 2, 3, 4

The server must not compare the sequence numbers of unrelated attempts.

7.2 Contiguous processing

The server tracks the highest contiguous accepted sequence for each attempt.

Suppose the server has accepted:

1, 2, 3, 4

The highest contiguous accepted sequence is 4.

If the client sends sequence 5, the server may accept it if all other validation succeeds.

If the client sends sequence 7 while sequence 5 is still missing, the server must not silently advance the contiguous sequence to 7.

It must return an explicit sequence-gap response.

The client must retain the missing operation and retry it.

7.3 Out-of-order arrival

The initial implementation should process operations in sequence order for each attempt.

A batch must contain operations in ascending sequence order.

Only one ordered batch should be in flight per attempt unless a later protocol version explicitly defines safe parallelism.

The client should not intentionally send sequence 12 before sequence 11.

If out-of-order arrival occurs because of retries, multiple requests, or network behavior, the server must handle it without silently losing operations.

7.4 Acknowledgement cursor

The server should return the highest contiguous accepted sequence for the attempt.

Example:

{
  "attempt_id": "0f4b92e8-8f80-45f2-9d7e-3efde1ac4b27",
  "last_accepted_sequence": 12
}

The cursor means that the server has accepted all required operations through sequence 12 according to the protocol.

It must not mean merely that the server has received a request containing sequence 12.

The client must use explicit operation acknowledgements to determine the state of individual operations.

A cursor must not cause an unacknowledged operation to be discarded if the corresponding operation was not actually accepted.

7.5 Sequence gaps

When a sequence gap is detected:

Preserve all affected local operations.
Record the server's expected sequence.
Identify the missing local operation.
Retry the missing operation first.
Resume ordered processing.
Reconcile the server cursor.
Do not create replacement operation IDs for existing operations.

If the missing operation cannot be found locally, the client must enter a recoverable synchronization-blocked state.

It must not fabricate an acknowledgement or silently skip the missing sequence.

8. Idempotency rules
8.1 Operation ID uniqueness

Each operation ID identifies exactly one logical operation.

The server must enforce a unique constraint on operation_id.

The server must also enforce the attempt-scoped sequence uniqueness rule defined in data-model.md.

8.2 Identical retry

If the server receives an operation whose ID, attempt, sequence, and payload match an already accepted operation, it must return the original successful result.

It must not apply the operation a second time.

Example:

Client sends operation 8.
Server accepts operation 8.
Response is lost.
Client sends operation 8 again.
Server recognizes the accepted operation.
Server returns the original acknowledgement.
No duplicate record is created.
8.3 Conflicting reuse

If an operation ID is reused with a different payload, the server must reject the request.

If an attempt and sequence number are already associated with a different operation ID, the server must reject the conflicting operation.

The server must not guess which operation the client intended.

The conflict must be recorded in an appropriate diagnostic or audit mechanism without exposing unnecessary sensitive data.

8.4 Payload hashing

The client and server must use a documented canonicalization procedure before computing a payload hash.

The canonical representation must define:

Object-key ordering.
String encoding.
Number representation.
Treatment of absent and null fields.
Timestamp formatting.
Representation of arrays.
Included operation metadata.

Use SHA-256 for the canonical payload digest.

Do not hash arbitrary JSON text whose key order or whitespace may vary.

The server must independently calculate the hash.

The server must not trust a client-provided hash without verification.

The server must reject a payload whose calculated digest does not match the declared digest.

9. Synchronization worker workflow
9.1 Startup

When the application starts or resumes:

Open the local database.
Validate the database schema.
Recover the active attempt if one exists.
Load pending synchronization operations.
Recover any operation left in in_flight after an interrupted request.
Return recoverable operations to pending or retry_wait.
Inspect pending snapshots.
Check whether the API is reachable.
Reconcile server synchronization state when connected.
Resume synchronization without resetting the attempt sequence counter.

A recovered operation must retain its original operation ID and sequence number.

9.2 Connectivity detection

The browser's navigator.onLine value is only a hint.

A device may report itself online while the actual API is unreachable.

The worker must use actual API responses to determine whether synchronization can proceed.

The worker should react to:

Browser online events.
Browser offline events.
Application startup.
Application resume.
New outbox operations.
Retry timers.
Server responses indicating recovery may be possible.

Connectivity detection must not be part of the examination's critical answer-saving path.

9.3 Normal synchronization

When the API is reachable:

Select the oldest pending operation for an attempt.
Verify its local integrity.
Send a bounded ordered batch.
Process each operation's result.
Persist acknowledgements locally.
Update the attempt's server synchronization cursor.
Process the next eligible batch.
Upload pending snapshots when their dependencies are satisfied.
Continue until caught up or an error requires waiting.

The worker must yield when necessary so that synchronization does not interfere with examination rendering or local computer vision.

9.4 Multiple attempts

If the student has multiple stored attempts, synchronize each attempt independently.

Operations from different attempts must not share a sequence counter.

A blocked operation for one attempt must not permanently prevent synchronization of unrelated attempts.

However, the worker must preserve the ordering rules within each attempt.

9.5 Bounded batches

Do not send an unlimited number of operations in one request.

Configure a maximum batch size and maximum request payload size.

The server may accept a smaller batch than the client has available.

The client must process the server's explicit results rather than assuming that every operation in the request was accepted.

If a batch is partially accepted, the client must retain and retry all operations that remain pending.

9.6 Synchronization completion

An attempt is fully synchronized only when all required synchronization operations have been acknowledged and all evidence required by the configured policy has reached its required storage state.

The UI must not use an empty outbox alone as proof that every record is centrally stored.

For example, an event may already be synchronized while its associated snapshot remains pending upload.

The application must represent these states separately.

10. Retry policy and backoff
10.1 Retryable failures

Examples include:

Network unavailable.
Connection timeout.
Temporary DNS failure.
Server temporarily unavailable.
HTTP 408.
HTTP 429, subject to Retry-After.
HTTP 500.
HTTP 502.
HTTP 503.
HTTP 504.
Temporary object-storage failure.

These failures must not cause pending operations to be deleted.

10.2 Non-retryable failures

Examples include:

Invalid payload.
Invalid event type.
Malformed UUID.
Invalid answer option.
Unauthorized attempt.
Attempt ownership mismatch.
Conflicting operation ID.
Conflicting sequence assignment.
Invalid or inconsistent payload hash.

A definitive rejection must be recorded with an error code and appropriate details.

The application must not retry an invalid operation forever without changing or resolving the underlying problem.

Do not automatically change a rejected operation's payload while retaining its old operation ID.

If a genuine correction is required, the protocol must define how the invalid operation is resolved without silently corrupting the sequence history.

10.3 Exponential backoff

Use exponential backoff for retryable failures.

A recommended starting policy is:

Retry 1: approximately 1 second
Retry 2: approximately 2 seconds
Retry 3: approximately 4 seconds
Retry 4: approximately 8 seconds
Retry 5: approximately 16 seconds
Retry 6: approximately 32 seconds
Later retries: capped at approximately 60 seconds

Add random jitter to avoid synchronized retry storms.

Respect the server's Retry-After header when present.

These values are starting defaults and should be configurable.

They must not affect the local examination countdown or answer-saving behavior.

10.4 Repeated disconnections

The worker must be able to recover from a pattern such as:

ONLINE
  |
  v
Synchronize operations 1–8
  |
  v
OFFLINE
  |
  v
Create operations 9–14 locally
  |
  v
ONLINE
  |
  v
Synchronize operations 9–11
  |
  v
OFFLINE AGAIN
  |
  v
Create operations 15–18 locally
  |
  v
ONLINE AGAIN
  |
  v
Synchronize operations 12–18
  |
  v
Verify all required records
  |
  v
Mark attempt synchronized

Previously acknowledged operations must not be inserted again as new records.

Operations with uncertain outcomes must be retried using their original IDs.

The worker must not assume that a failed client request means the server failed to process it.

11. Answer synchronization
11.1 Local answer update

When the student selects or changes an answer:

Validate the local input.
Generate a stable operation ID.
Allocate the next attempt sequence number.
Increment the local answer revision.
Update the local answer record.
Insert the corresponding answer_upsert operation.
Commit both changes atomically.
Update the UI to show that the answer is saved locally.
Trigger synchronization if appropriate.

The student must not need to click a separate Save button unless the UI explicitly requires it.

11.2 Answer revisions

Each answer revision must be identifiable.

Example:

Question 1:
Revision 1: Option A
Revision 2: Option C
Revision 3: Option B

The local answer table stores the current answer.

The outbox preserves the operations required to communicate accepted changes to the server.

The implementation must define how obsolete, superseded answer updates are handled.

For the initial implementation, the safest policy is to preserve and process the ordered answer operations rather than deleting pending operations merely because a newer answer exists.

A later optimization may compact operations only if it proves that:

The original operation sequence remains valid.
No required sequence number is lost.
The final answer is preserved.
Server idempotency remains correct.
Submission dependencies remain correct.

Do not implement outbox compaction in the initial version unless these conditions are explicitly tested.

11.3 Answer conflict handling

The server is responsible for validating answer updates.

The client must not overwrite a newer server state silently.

If the server reports a conflict:

Preserve the local answer.
Preserve the rejected operation and its error information.
Obtain the server's relevant attempt and answer state.
Determine whether the operation was already accepted or is genuinely conflicting.
Follow the defined recovery policy.
Do not claim full synchronization while the conflict remains unresolved.

The exact conflict-response schema must be defined in api-contracts.md.

12. Proctoring-event synchronization
12.1 Event creation

When the event engine creates a logical event:

Assign a stable event UUID.
Record the event type and initial status.
Record the client-reported timestamp.
Record relevant confidence and detector metadata.
Associate the event with the current attempt.
Persist the event locally.
Create an event_upsert operation.
Commit the event and operation atomically.
Display the warning if the configured rules require one.
Synchronize when possible.

The event must remain available if the warning is dismissed.

12.2 Event lifecycle updates

An event may evolve from a candidate observation into a confirmed, resolved, or inconclusive state.

The event engine must not create a new event ID for every lifecycle update.

Use the same logical event ID when updating the same event lifecycle.

Each synchronization operation that communicates an update must have its own operation ID and sequence number.

The server must preserve valid event relationships and prevent duplicate logical events.

12.3 Event evidence

When evidence is captured, associate its snapshot ID with the appropriate event.

The event may be synchronized before its snapshot finishes uploading.

The system must distinguish:

Event synchronized, snapshot pending.
Event synchronized, snapshot uploaded.
Event synchronized, snapshot upload failed.
Event retained locally, not yet synchronized.

A professor's report must display evidence availability accurately.

12.4 Events during disconnection

The monitoring pipeline must continue creating events locally while the internet is unavailable, provided local processing and storage remain functional.

The professor cannot see new events that exist only on the disconnected device.

After connectivity returns, those events must be synchronized according to the ordering rules.

13. Snapshot upload protocol
13.1 Snapshot persistence

When a snapshot is captured:

Generate a stable snapshot UUID.
Capture the image bytes.
Calculate the image's SHA-256 checksum.
Record its media type and size.
Record its capture timestamp.
Associate it with the appropriate event and attempt.
Persist the Blob and metadata locally.
Mark it as pending upload.
Commit the local transaction.
Schedule upload when the required metadata is available and the API is reachable.

If local Blob persistence fails, the application must not report that the snapshot was saved successfully.

13.2 Upload initialization

The client requests permission or an upload session for a snapshot.

The server validates:

Authentication.
Attempt ownership.
Snapshot identifier.
Event relationship.
Allowed media type.
Expected size.
Upload limits.
Applicable retention and authorization policies.

The server returns an upload instruction according to the API contract.

The implementation may use a direct upload endpoint or a controlled object-storage upload flow.

13.3 Binary transfer

The client uploads the snapshot bytes.

The server or configured storage service must verify that the received content matches the expected size and checksum.

The implementation must not trust only the filename or client-supplied MIME type.

13.4 Upload confirmation

The server confirms successful durable storage.

Only after this confirmation may the client mark the snapshot as uploaded.

If the upload response is lost, the client must query the snapshot's server state or retry using the same snapshot ID and checksum.

The server must not create duplicate logical snapshot records for identical retries.

13.5 Interrupted upload

If connectivity disappears during an upload:

Keep the local Blob.
Preserve the snapshot ID.
Preserve its checksum.
Mark the upload as pending or retryable.
Resume when connectivity returns.
Verify the server's state before creating a new logical upload.
Delete the local Blob only when the retention policy permits it and the required server acknowledgement has been recorded.

If resumable uploads are implemented later, the upload session and part identifiers must also be stable and recoverable.

13.6 Storage failure

If the configured object storage is unavailable, the server must not falsely confirm durable evidence storage.

It may accept the metadata while reporting the evidence as pending, provided the API contract explicitly supports that state.

The report must not represent the snapshot as available until storage confirmation has been received.

14. Offline examination submission

Offline submission is a mandatory workflow.

14.1 Local finalization

When the student presses Submit:

Confirm that the current local attempt is eligible for submission.
Validate the local answer state.
Ensure all required local answer writes have committed.
Determine the final allocated operation sequence.
Generate a stable submission operation ID.
Record the local submission timestamp.
Persist the local attempt's submitted state.
Insert the submission_finalize operation.
Commit the state change and operation atomically.
Lock the local examination against further answer changes.
Display the appropriate submission status.
Attempt synchronization if the API is reachable.

The application must not require an internet connection merely to record the student's submission locally.

14.2 Submission status

Use distinct local and server submission states.

Recommended logical states:

not_submitted
submitted_local
submission_pending_sync
submission_syncing
submitted_server_confirmed
submission_conflict

The exact field representation may differ, but the distinction must be preserved.

14.3 Offline submission message

If the student submits without a working API connection, show a message such as:

"Your submission has been saved on this device. It is waiting to synchronize with the server."

Do not show:

"Submission received by the server."

until the server has confirmed receipt.

14.4 Submission ordering

The submission operation must depend on the final answer state.

The client must not finalize the attempt before the required preceding answer operations have been accepted under the protocol.

The submission operation should record the final sequence boundary.

If the final operation sequence is 18, the server must verify that the required preceding operations have been accepted before finalizing the attempt.

The exact meaning of the submission sequence boundary must be defined consistently in api-contracts.md.

14.5 Repeated submission requests

If the submission request is repeated:

Reuse the original submission operation ID.
Reuse the original final sequence.
Preserve the original submission intent.
Return the original result if already accepted.
Do not create another attempt.
Do not create a second logical submission.
Do not reset the examination timer.
14.6 Internet loss after submission

If the student submits while online but the connection disappears before acknowledgement:

The client must treat the outcome as uncertain.

It must retain the submission operation.

When connectivity returns, it must retry the same operation ID or reconcile the server state.

It must not create a new submission operation merely because the first response was lost.

15. Submission and sequence reconciliation

The client and server may temporarily disagree about synchronization progress.

For example:

Client last acknowledged sequence: 10
Server last accepted sequence: 12

This can occur if the server accepted operations but the client lost the corresponding acknowledgements.

The client must reconcile by retrieving the server's accepted-operation information or synchronization status.

It must not blindly resend operations using new IDs.

The server must return enough information to determine:

The highest contiguous accepted sequence.
Which submitted operations were accepted.
Which operations remain missing.
Whether the attempt is finalized.
Whether the final submission operation was accepted.
Which snapshot uploads remain incomplete, where supported.

The client must preserve local data until it has reconciled ambiguous outcomes.

If the server reports that the attempt is already finalized, the client must not silently reopen it.

If the client has a locally finalized submission but the server has not received it, the client must retain and retry the original submission operation.

16. Authentication and authorization during synchronization

Every synchronization request must be authenticated.

The server must validate that the authenticated user owns the relevant student attempt or otherwise has explicit authorization.

The server must reject attempts to:

Synchronize another student's answers.
Insert events into another student's attempt.
Upload evidence to an unrelated attempt.
Change the attempt owner.
Modify protected exam configuration.
Grant a retake.
Change a finalized attempt without authorization.
Submit an unrelated question package.
Change a stable operation's attempt or sequence assignment.

The client must not be trusted to enforce these restrictions.

The six-digit exam code is not sufficient authentication.

Authentication credentials must not be copied into synchronization payloads or written to ordinary operation logs.

If a login session expires while an examination is already in progress, the local exam must follow the documented offline-continuation policy.

The client must not erase local data or automatically submit the exam solely because a session-refresh request fails.

The server must still authenticate and authorize subsequent synchronization requests.

If synchronization requires renewed authentication, preserve all local operations until the issue is resolved.

17. Server-side transaction requirements

The server must apply operation processing transactionally.

For a new valid operation, the logical transaction must:

Authenticate and authorize the request.
Validate the attempt.
Validate the operation ID.
Validate the attempt and sequence assignment.
Verify the canonical payload hash.
Verify that the required preceding sequence is accepted.
Persist the synchronization operation.
Apply the corresponding answer, event, or attempt mutation.
Update the accepted sequence state.
Record the operation result.
Commit the transaction.
Return the acknowledgement.

If a required database mutation fails, the server must not acknowledge the operation as successfully applied.

The operation record and its logical effect must not become inconsistent.

For an already accepted identical operation, the server must return its stored result without applying the mutation again.

If the transaction outcome is uncertain to the client, the client retries the same operation ID.

18. Professor dashboard synchronization semantics

The professor dashboard must distinguish server-observed state from client-local state.

18.1 Online student

When the student is connected and communicating successfully, the dashboard may display recently synchronized:

Answers where the professor is authorized to see them.
Proctoring events.
Event counts.
Snapshot availability.
Attempt state.
Submission state.
Last server contact.
18.2 Disconnected student

When communication stops, the server cannot observe new local activity.

The dashboard must show the last known server contact and an appropriate connectivity status.

For example:

Student: Tejas
USN: 2VD23MI001
Attempt: In progress
Connectivity: Disconnected / no recent server contact
Last server contact: 10:42 AM
Submission: Not received
Synchronization: Awaiting client reconnection

The example is illustrative.

The dashboard must not claim to know the exact current state of a disconnected client.

18.3 Reconnected student

When connectivity returns:

The client resumes synchronization.
The server validates pending operations.
Accepted events become available to authorized dashboard queries.
Snapshot availability updates when storage is confirmed.
The dashboard refreshes its data.
The submission status updates after server confirmation.

The dashboard must not count pending client-only events as centrally received events.

18.4 Live updates

Use WebSockets for online updates when practical, with polling as a fallback.

WebSocket availability is not required for local exam continuity.

If the professor dashboard's WebSocket disconnects, the student examination must continue unaffected.

19. Data retention and cleanup

The client must not remove pending records merely because an examination has ended.

A local operation may be deleted from the active outbox only after the server has acknowledged it and the acknowledgement has been persisted locally.

The application may archive acknowledged operations locally according to the retention policy.

Snapshot Blobs require separate retention rules.

A snapshot must not be deleted merely because its event metadata has synchronized.

The local snapshot must remain available until the required upload acknowledgement and retention conditions have been satisfied.

The system must define how it handles:

Old completed attempts.
Fully synchronized records.
Pending evidence.
Failed uploads.
Rejected operations.
Abandoned local attempts.
Expired authorization.
Browser storage quota pressure.
Database migration failures.

The application must not automatically delete the only remaining copy of an unsynchronized answer, submission, or required evidence.

If local storage is close to its limit, the application should warn the user and apply the documented storage policy.

If a required local write fails, the UI must report the failure.

20. Failure handling
20.1 Internet unavailable

Expected behavior:

Examination continues.
Local countdown continues.
Answers are saved locally.
Events are saved locally.
Snapshots are stored locally when storage is available.
The outbox grows as required.
Synchronization waits.
The student is not automatically submitted.
20.2 API unavailable

Expected behavior:

Local examination continues.
Operations remain pending.
The worker applies backoff.
The UI displays the actual synchronization state.
The worker retries later.
20.3 Lost acknowledgement

Expected behavior:

The client retains the original operation.
The client retries using the same operation ID.
The server recognizes the duplicate request.
The server returns the original result.
No duplicate logical record is created.
20.4 Invalid operation

Expected behavior:

The server returns an explicit rejection.
The client retains the error details.
The operation is not silently deleted.
The client follows the defined recovery procedure.
The attempt is not falsely marked fully synchronized.
20.5 Sequence gap

Expected behavior:

The server identifies the missing sequence.
The client retains affected operations.
The client recovers or retries the missing operation.
Later operations are not silently treated as contiguous.
Synchronization resumes after the gap is resolved.
20.6 Snapshot upload failure

Expected behavior:

The local Blob remains stored.
The snapshot ID remains unchanged.
The checksum remains unchanged.
The upload can be retried.
The report shows that evidence is pending or unavailable.
The snapshot is not falsely marked uploaded.
20.7 Local storage failure

Expected behavior:

The application does not claim the action was saved successfully.
The UI displays a clear critical warning.
The application attempts only safe recovery actions.
Existing local records are not intentionally erased.
The application does not automatically submit the exam as a workaround.

A local storage failure is different from an internet failure. The system must not claim it can safely continue saving data when the local database is unavailable.

20.8 Browser or application termination

Background synchronization is not guaranteed after the browser or application is closed.

When the application reopens, it must:

Recover the active attempt where permitted.
Reopen the local database.
Recover the outbox.
Recover pending snapshots.
Reconcile the server cursor.
Resume synchronization.

The implementation must document supported browser and packaging limitations.

21. Security requirements

The synchronization protocol must:

Authenticate every protected request.
Enforce attempt ownership.
Validate all operation payloads.
Validate operation IDs and sequence numbers.
Validate payload hashes.
Enforce idempotency.
Restrict evidence access.
Reject unauthorized state changes.
Prevent answer-key disclosure.
Apply upload-size limits.
Validate image content.
Avoid logging passwords or tokens.
Avoid exposing private evidence in error messages.
Preserve audit records for important administrative actions.
Apply rate limits where appropriate.
Use HTTPS in hosted deployments.

UUIDs are identifiers, not authorization mechanisms.

A user who knows an attempt UUID must not automatically gain access to that attempt.

The server must independently enforce all access controls.

22. Operational monitoring

The system should record operational metrics such as:

Number of pending operations.
Number of acknowledged operations.
Number of retryable failures.
Number of rejected operations.
Number of sequence-gap errors.
Number of pending snapshots.
Number of failed snapshot uploads.
Time since the oldest pending operation was created.
Number of attempts awaiting synchronization.
Number of offline submissions awaiting server receipt.
Synchronization latency when connected.

Operational metrics must not expose unnecessary student data.

The administrator interface should make persistent synchronization failures visible.

A large pending outbox should not be silently treated as successful synchronization.

23. Acceptance criteria

The synchronization implementation is ready for acceptance testing when all the following conditions are satisfied.

23.1 Local persistence
An answer is persisted locally before the UI reports successful local saving.
An answer update and its outbox operation are committed atomically.
An event and its outbox operation are committed atomically.
A snapshot Blob remains available until the applicable upload and retention requirements are satisfied.
Submission state and its submission operation are committed atomically.
The sequence counter survives supported reloads.
23.2 Online operation
Answers synchronize while the API is reachable.
Monitoring events synchronize while the API is reachable.
The server returns explicit acknowledgements.
The client records acknowledgements locally.
The professor dashboard displays only server-confirmed synchronized information.
Snapshot status reflects actual server storage confirmation.
23.3 Offline operation
The exam continues after internet disconnection.
The local countdown continues.
The student can navigate downloaded questions.
Answers continue to be saved locally.
Local computer vision continues when its required resources are available.
Events continue to be recorded locally.
Snapshots continue to be stored locally when storage is available.
The student can submit locally when policy permits.
Internet loss does not automatically submit the examination.
23.4 Repeated connectivity changes
The system can alternate between online and offline states repeatedly.
Previously acknowledged operations are not inserted again as new records.
Unacknowledged operations retain their original IDs.
Sequence numbers are not reset.
Missing operations are detected.
Synchronization resumes after connectivity returns.
A temporary server failure does not erase local records.
23.5 Idempotency
Repeating an accepted operation does not create a duplicate logical record.
Reusing an operation ID with a different payload is rejected.
Conflicting sequence assignments are rejected.
Repeated submission requests do not create duplicate submissions.
Retrying a snapshot upload does not create duplicate logical snapshot records.
23.6 Submission
An offline submission is stored locally.
The client clearly distinguishes local submission from server-confirmed submission.
The final sequence boundary is validated.
The server does not finalize an attempt while required preceding operations remain missing.
A lost submission acknowledgement can be recovered safely.
The same submission operation ID is reused during retries.
23.7 Recovery
Pending operations survive supported reloads.
Interrupted requests can be retried.
A sequence gap can be diagnosed.
Pending snapshots remain recoverable.
Database migration does not silently delete critical pending records.
Local storage errors are reported honestly.
24. Implementation order

Implement the synchronization system in the following order.

Phase 1 — Local database

Create the Dexie.js database.

Implement the required stores.

Implement local repositories for attempts, answers, events, snapshots, and outbox operations.

Add schema versioning and safe migrations.

Phase 2 — Atomic local writes

Implement:

Answer plus outbox transactions.
Event plus outbox transactions.
Snapshot Blob plus metadata transactions.
Sequence allocation.
Local submission transactions.

Verify that failed transactions do not produce false success indicators.

Phase 3 — Basic synchronization

Implement:

API reachability checks.
Ordered batch creation.
Stable operation IDs.
Payload hashing.
Request submission.
Per-operation acknowledgements.
Local acknowledgement persistence.
Phase 4 — Server idempotency

Implement server-side operation deduplication.

Add database uniqueness constraints.

Verify that repeated identical requests return the original result.

Reject conflicting operation ID reuse.

Phase 5 — Sequence validation

Implement:

Attempt-scoped sequence tracking.
Highest contiguous accepted sequence.
Sequence-gap responses.
Ordered retries.
Reconciliation.
Phase 6 — Failure recovery

Implement exponential backoff.

Recover interrupted in_flight operations.

Resume synchronization on application startup and connectivity restoration.

Test repeated online/offline transitions.

Phase 7 — Snapshot uploads

Implement snapshot metadata registration.

Implement binary upload.

Verify checksums.

Implement upload acknowledgements.

Recover interrupted uploads.

Phase 8 — Submission finalization

Implement offline submission.

Implement stable submission operation IDs.

Validate the final sequence boundary.

Implement idempotent server finalization.

Phase 9 — Monitoring and reporting

Expose synchronization state to the professor dashboard.

Distinguish server-confirmed records from pending client records.

Display accurate snapshot and submission states.

Phase 10 — End-to-end testing

Test:

Continuous connectivity.
Complete disconnection.
Repeated disconnections.
Lost acknowledgements.
Duplicate operations.
Sequence gaps.
Interrupted snapshot uploads.
Offline submission.
Reload recovery.
Server restart.
Invalid operations.
Storage failures.

Detailed scenarios and expected results belong in testing-plan.md.

25. Final design rule

ExamGuard AI must use a single, consistent local-first execution and persistence pipeline.

The internet connection determines when data can be synchronized, not whether an already-authorized student can continue the examination.

The application must preserve locally committed answers, events, snapshots, and submission state through supported disconnections and recovery scenarios.

The server must validate and acknowledge synchronized records explicitly.

Repeated requests must not create duplicate logical records.

Missing sequence numbers must not be silently skipped.

Evidence must not be marked uploaded before durable storage is confirmed.

A locally saved submission must not be falsely presented as server-confirmed.

The defining requirement is that repeated internet disconnections must not, by themselves, stop an already-authorized examination or cause the application to lose locally committed examination data.

End of synchronization protocol specification.