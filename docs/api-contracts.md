# ExamGuard AI — API Contracts Specification

**Document version:** 1.1  
**Status:** Baseline implementation specification  
**Project:** ExamGuard AI — Smart Exam Proctor  
**Frontend:** React + Vite + JavaScript  
**Backend:** Python + FastAPI  
**Central database:** PostgreSQL  
**Local database:** IndexedDB through Dexie.js  
**API base path:** `/api/v1`  
**Transport:** HTTPS in hosted environments  
**Related documents:** architecture.md, data-model.md, sync-protocol.md, testing-plan.md

---

# 1. Purpose

This document defines the HTTP API contracts between the ExamGuard AI frontend and backend.

It specifies the endpoints, request formats, response formats, authorization requirements, error handling, and synchronization behavior needed by the application.

The API supports three primary roles:

- System administrator.
- Professor.
- Student.

The API must support:

- Authentication and session management.
- User administration.
- Examination creation and publication.
- MCQ and short-answer question management.
- Excel question import and validation.
- Six-digit examination codes.
- Student eligibility checks.
- Examination package downloads.
- Attempt authorization and retakes.
- Answer synchronization.
- Proctoring-event synchronization.
- Snapshot metadata and image uploads.
- Offline submission synchronization.
- Professor monitoring dashboards.
- Event review and evidence access.
- PDF report generation.
- Administrative settings.
- Audit records and system health.

The API must support local-first examination execution.

The student client must not require a live API request for every answer, question navigation, webcam frame, or monitoring event.

After an examination has been authorized and its required resources have been downloaded, local examination execution must continue during supported internet disconnections.

The API becomes responsible for receiving and validating locally stored records when connectivity is available.

---

# 2. General API conventions

## 2.1 Base URL

All API routes are relative to:

`/api/v1`

For local development, the frontend may communicate with a development backend such as:

`http://localhost:8000/api/v1`

For hosted deployment, use the configured HTTPS API origin.

The production frontend must not hard-code development URLs.

Configure the API base URL through environment-specific frontend configuration.

## 2.2 Content types

Use JSON for ordinary API requests and responses.

Standard JSON requests should use:

`Content-Type: application/json`

File uploads must use the content type defined by their upload contract.

PDF downloads should return:

`Content-Type: application/pdf`

Excel upload endpoints should accept multipart file uploads.

Snapshot uploads must use the dedicated binary-upload flow rather than embedding large image files in synchronization JSON.

## 2.3 Identifiers

Use UUID strings for internal identifiers, including:

- User IDs.
- Exam IDs.
- Question IDs.
- Attempt IDs.
- Answer IDs where required.
- Event IDs.
- Snapshot IDs.
- Operation IDs.
- Retake grant IDs.

The frontend must preserve locally generated IDs across synchronization retries.

Do not replace an existing local entity ID merely because the server receives the record.

## 2.4 Student USN

The college USN is the institutional student identifier.

Example:

`2VD23MI001`

Store and transmit USNs as strings.

The server must apply the documented normalization policy consistently.

Names are not unique identifiers.

A student response may include both the student's name and normalized USN.

## 2.5 Examination code

An examination code is exactly six decimal digits.

Example:

`004281`

Represent it as a string so that leading zeroes are preserved.

The exam code identifies an examination. It is not a password and does not replace authentication or authorization.

The server must independently validate:

- Authenticated user.
- Account status.
- Exam availability.
- Exam status.
- Student eligibility.
- Attempt policy.
- Retake authorization, when applicable.

## 2.6 Timestamps

Use ISO 8601 timestamps.

Server timestamps should be UTC.

Example:

`2026-10-18T10:30:00Z`

Client-reported timestamps must remain distinguishable from server-recorded timestamps.

The server must not treat a client-reported timestamp as independently verified proof of real-world time.

## 2.7 Pagination

List endpoints should support pagination.

Recommended query parameters:

- `limit`
- `cursor`

The server must validate pagination values and enforce a maximum page size.

For simple initial implementations, offset-based pagination may be used where appropriate, but cursor pagination is preferable for changing event lists.

The selected pagination scheme must be consistent within each endpoint family.

## 2.8 Common response envelope

Successful JSON responses should use a consistent structure where practical.

Example:

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000001"
  },
  "meta": {
    "request_id": "req_example"
  }
}
For paginated responses:

{
  "data": [],
  "meta": {
    "request_id": "req_example",
    "next_cursor": null,
    "has_more": false
  }
}

The actual FastAPI response schemas must be defined in the backend schema modules.

Do not return sensitive internal information in responses.

2.9 Standard error response

Use a consistent error structure.

Example:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The supplied request is invalid.",
    "details": [],
    "request_id": "req_example",
    "retryable": false
  }
}

The details field may contain safe field-level validation information.

It must not expose passwords, tokens, database credentials, private answer keys, or internal stack traces.

2.10 HTTP status codes

Use status codes consistently.

Status	Meaning
200 OK	Request succeeded
201 Created	Resource created
202 Accepted	Work accepted for asynchronous processing
204 No Content	Request succeeded without a response body
400 Bad Request	Malformed or invalid request
401 Unauthorized	Authentication is missing or invalid
403 Forbidden	Authenticated user lacks permission
404 Not Found	Resource does not exist or is not accessible under the applicable disclosure policy
409 Conflict	State, idempotency, or sequence conflict
413 Content Too Large	Upload exceeds permitted size
415 Unsupported Media Type	Unsupported content type
422 Unprocessable Entity	Schema or semantic validation failure
429 Too Many Requests	Rate limit exceeded
500 Internal Server Error	Unexpected server failure
502 Bad Gateway	Upstream service failure
503 Service Unavailable	Service temporarily unavailable
504 Gateway Timeout	Upstream request timed out

The API must document any endpoint-specific status-code exceptions.

3. Authentication and authorization
3.1 Authentication model

All protected endpoints require an authenticated user.

The implementation may use secure session cookies or a properly designed token-based authentication mechanism.

The final mechanism must be selected before implementation and documented in the security configuration.

For browser-based authentication, prefer secure cookie handling where practical.

If cookies are used, implement appropriate CSRF protection.

If bearer tokens are used, define token expiration, refresh, revocation, and secure storage.

Do not store long-lived authentication secrets in ordinary examination records or synchronization payloads.

3.2 Roles

The supported roles are:

admin
professor
student

The server must enforce role and resource permissions for every protected endpoint.

Hiding a button in React is not authorization.

3.3 Role permissions
Administrator

May perform authorized system administration, account management, role management, system settings, and audit-review operations.

Professor

May create and manage examinations they own or are explicitly authorized to manage.

May review attempts and reports for examinations they are authorized to manage.

May authorize retakes according to policy.

Student

May access their own account and authorized examination attempts.

May synchronize operations only for their own authorized attempts.

May retrieve evidence or submission status only when explicitly permitted.

Students must not access other students' answers, attempts, private evidence, or reports.

3.4 Authentication expiration during an examination

If authentication expires while the student is already taking an authorized examination, the local exam engine must follow the offline-continuation policy.

A failed refresh request must not automatically submit the examination.

The client must retain locally committed answers, events, snapshots, and pending operations.

Subsequent synchronization requests must still be authenticated.

4. Health and readiness endpoints
4.1 GET /health

Purpose: Check whether the API process is responding.

Authentication: Not required, subject to deployment policy.

Response — 200 OK
{
  "status": "ok"
}

This endpoint must not expose secrets or detailed infrastructure information.

4.2 GET /ready

Purpose: Check whether required backend dependencies are ready.

Authentication: Internal or restricted access may be appropriate.

Response — 200 OK
{
  "status": "ready",
  "dependencies": {
    "database": "available"
  }
}
Response — 503 Service Unavailable

Returned when a required dependency prevents the API from serving requests safely.

Do not expose database credentials, connection strings, or internal infrastructure details.

5. Authentication endpoints
5.1 POST /auth/login

Purpose: Authenticate a user.

Authentication: Not required.

Request
{
  "identifier": "2VD23MI001",
  "password": "user_supplied_password"
}

The identifier may be a normalized student USN or an email address, according to the configured account policy.

Passwords must be transmitted only over HTTPS in hosted environments.

Response — 200 OK
{
  "data": {
    "user": {
      "user_id": "00000000-0000-4000-8000-000000000001",
      "full_name": "Example Student",
      "role": "student",
      "usn": "2VD23MI001",
      "account_status": "active"
    },
    "session": {
      "expires_at": "2026-10-18T12:00:00Z"
    }
  }
}

The session representation depends on the chosen authentication mechanism.

If secure cookies are used, session secrets must not be returned unnecessarily in JSON.

Errors
401 INVALID_CREDENTIALS
403 ACCOUNT_INACTIVE
429 RATE_LIMITED

Avoid responses that reveal whether an arbitrary account exists.

5.2 POST /auth/logout

Purpose: End the authenticated session.

Authentication: Required.

Response — 204 No Content

The server invalidates the applicable session or refresh credential according to the authentication design.

5.3 GET /auth/me

Purpose: Retrieve the current authenticated user's profile.

Authentication: Required.

Response — 200 OK
{
  "data": {
    "user_id": "00000000-0000-4000-8000-000000000001",
    "full_name": "Example Student",
    "role": "student",
    "usn": "2VD23MI001",
    "account_status": "active"
  }
}

Fields that do not apply to the current role may be omitted or returned as null according to the implemented schema.

5.4 POST /auth/refresh

Purpose: Refresh an authentication session where the selected authentication mechanism supports refresh.

Authentication: Valid refresh credential required.

The request and response depend on the selected session or token design.

Refresh credentials must be protected against theft and replay.

If refresh fails during an authorized offline examination, the client must not erase the local attempt.

6. User administration endpoints
6.1 POST /users

Purpose: Create an account.

Authentication: Administrator only, except for explicitly implemented and authorized account-provisioning workflows.

Request
{
  "full_name": "Example Student",
  "email": "student@example.edu",
  "role": "student",
  "usn": "2VD23MI001"
}

Account provisioning must define how initial credentials are established.

Never return a plaintext password generated by an unsafe or undocumented process.

Response — 201 Created
{
  "data": {
    "user_id": "00000000-0000-4000-8000-000000000001",
    "full_name": "Example Student",
    "role": "student",
    "usn": "2VD23MI001",
    "account_status": "active"
  }
}
Validation
Role must be supported.
Student USN must be present and valid.
Normalized student USN must be unique.
Email uniqueness must follow the configured policy.
The actor must have permission to create the requested role.
6.2 GET /users

Purpose: List users.

Authentication: Administrator only.

Query parameters
role
account_status
limit
cursor
Response — 200 OK
{
  "data": [],
  "meta": {
    "next_cursor": null,
    "has_more": false
  }
}

Do not return password hashes or authentication secrets.

6.3 GET /users/{user_id}

Purpose: Retrieve a user record.

Authentication: Administrator or another explicitly authorized user.

Response — 200 OK

Returns the permitted user profile.

6.4 PATCH /users/{user_id}

Purpose: Update permitted user fields.

Authentication: Administrator or another explicitly authorized actor.

Only explicitly permitted fields may be changed.

Role changes must follow the role-management policy and be audited.

Students must not be able to change their role or institutional USN arbitrarily.

6.5 POST /users/{user_id}/deactivate

Purpose: Deactivate an account.

Authentication: Administrator only.

The server must apply the defined policy to active attempts and future logins.

Deactivation must not silently delete historical attempts or audit records.

6.6 POST /users/{user_id}/activate

Purpose: Reactivate an eligible account.

Authentication: Administrator only.

6.7 POST /users/{user_id}/credential-reset

Purpose: Initiate a controlled credential reset.

Authentication: Administrator or another authorized recovery mechanism.

The response must not reveal existing credentials.

The implementation must use a secure reset workflow.

7. Examination endpoints
7.1 POST /exams

Purpose: Create an examination draft.

Authentication: Professor or authorized administrator.

Request
{
  "title": "Computer Networks Internal Assessment",
  "description": "Internal examination",
  "instructions": "Read all questions carefully.",
  "duration_seconds": 1800,
  "allow_offline_continuation": true,
  "allow_question_navigation": true,
  "proctoring_config": {
    "face_absence_grace_ms": 5000,
    "multiple_faces_grace_ms": 2000,
    "sustained_head_turn_ms": 3000,
    "phone_detection_threshold": 0.65
  }
}

The values are examples, not universal detection thresholds.

The backend must validate the configuration and reject unsupported settings.

Response — 201 Created
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "title": "Computer Networks Internal Assessment",
    "status": "draft",
    "duration_seconds": 1800,
    "allow_offline_continuation": true,
    "question_package_version": 1
  }
}

The server determines the owner from the authenticated user unless an explicit administrative ownership workflow is implemented.

7.2 GET /exams

Purpose: List examinations available to the authenticated user.

Authentication: Required.

Professors see examinations they own or may manage.

Students see only examinations they are authorized to discover under the configured policy.

Query parameters
status
limit
cursor
Response — 200 OK
{
  "data": [],
  "meta": {
    "next_cursor": null,
    "has_more": false
  }
}
7.3 GET /exams/{exam_id}

Purpose: Retrieve permitted examination metadata.

Authentication: Required.

Students must not receive answer keys or private grading configuration.

7.4 PATCH /exams/{exam_id}

Purpose: Update an editable examination.

Authentication: Owning professor or authorized administrator.

Published and active examinations must follow the versioning rules in architecture.md and data-model.md.

An active attempt must not silently receive altered questions or configuration.

7.5 POST /exams/{exam_id}/publish

Purpose: Publish a valid examination.

Authentication: Owning professor or authorized administrator.

Request
{
  "publish": true
}
Response — 200 OK
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "status": "published",
    "question_package_version": 1,
    "exam_code": "004281",
    "published_at": "2026-10-18T10:00:00Z"
  }
}

The server must generate or assign the exam code according to the collision policy.

The code must contain exactly six digits.

The server must prevent ambiguous active codes.

7.6 POST /exams/{exam_id}/close

Purpose: Close an examination according to policy.

Authentication: Owning professor or authorized administrator.

Closing an examination must not silently erase or overwrite existing attempts.

The server must define how already-authorized attempts are handled.

7.7 POST /exams/resolve-code

Purpose: Resolve a six-digit code to permitted examination information.

Authentication: Student.

Request
{
  "exam_code": "004281"
}
Response — 200 OK
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "title": "Computer Networks Internal Assessment",
    "instructions": "Read all questions carefully.",
    "duration_seconds": 1800,
    "available": true
  }
}

This response must not disclose correct answers, private grading rules, or another student's attempt information.

The endpoint must enforce rate limits.

The exam code must not bypass authentication or attempt authorization.

8. Question management endpoints
8.1 POST /exams/{exam_id}/questions

Purpose: Create a question.

Authentication: Owning professor or authorized administrator.

MCQ request
{
  "question_number": 1,
  "question_type": "mcq",
  "question_text": "Which protocol is used to resolve domain names?",
  "options": {
    "A": "HTTP",
    "B": "DNS",
    "C": "FTP",
    "D": "SMTP"
  },
  "marks": 1,
  "answer_key": {
    "correct_option": "B"
  }
}
Short-answer request
{
  "question_number": 2,
  "question_type": "short_answer",
  "question_text": "Explain the purpose of DNS.",
  "marks": 5
}

The backend must accept grading metadata only from authorized question-management requests.

Response — 201 Created

Returns the created question's permitted representation.

The professor may receive the answer key.

Student-facing question responses must not contain answer keys or private grading metadata.

8.2 GET /exams/{exam_id}/questions

Purpose: Retrieve questions for authorized examination management.

Authentication: Owning professor or authorized administrator.

The response may include answer keys for authorized question-management workflows.

Student clients must retrieve assigned questions through the authorized examination-package endpoint instead.

8.3 PATCH /exams/{exam_id}/questions/{question_id}

Purpose: Update a question in an editable examination.

Authentication: Owning professor or authorized administrator.

Changes must follow question-package versioning rules.

8.4 DELETE /exams/{exam_id}/questions/{question_id}

Purpose: Delete a question from an editable examination.

Authentication: Owning professor or authorized administrator.

Do not delete a question in a way that silently changes the assigned package of an active attempt.

9. Excel question import endpoints
9.1 POST /exams/{exam_id}/questions/import-preview

Purpose: Upload an Excel workbook and receive a validation preview.

Authentication: Owning professor or authorized administrator.

Content type: multipart/form-data

Form field:

file

Accepted workbook formats and size limits must be documented in backend configuration.

Response — 200 OK
{
  "data": {
    "import_id": "00000000-0000-4000-8000-000000000020",
    "worksheet_count": 1,
    "valid_question_count": 2,
    "invalid_row_count": 1,
    "questions": [
      {
        "row_number": 2,
        "question_number": 1,
        "question_type": "mcq",
        "question_text": "Example question?",
        "options": {
          "A": "Option A",
          "B": "Option B",
          "C": "Option C",
          "D": "Option D"
        },
        "marks": 1,
        "validation_errors": []
      }
    ],
    "errors": [
      {
        "worksheet": "Sheet1",
        "row_number": 4,
        "field": "question_text",
        "code": "MISSING_QUESTION_TEXT",
        "message": "Question text is required."
      }
    ]
  }
}

This is an illustrative response schema.

The implementation must preserve row-level validation information.

The server must not silently discard invalid rows.

9.2 POST /exams/{exam_id}/questions/import-confirm

Purpose: Confirm a previously validated import.

Authentication: Owning professor or authorized administrator.

Request
{
  "import_id": "00000000-0000-4000-8000-000000000020",
  "questions": [
    {
      "question_number": 1,
      "question_type": "mcq",
      "question_text": "Example question?",
      "options": {
        "A": "Option A",
        "B": "Option B",
        "C": "Option C",
        "D": "Option D"
      },
      "marks": 1,
      "answer_key": {
        "correct_option": "B"
      }
    }
  ]
}

The backend must revalidate all submitted question data.

The server must not rely exclusively on the earlier preview.

Response — 201 Created
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "created_question_count": 1,
    "question_package_version": 2
  }
}

The implementation must define whether imports are transactional.

The preferred behavior is all-or-nothing confirmation unless partial import is explicitly designed and clearly reported.

10. Examination attempt endpoints
10.1 POST /attempts/authorize

Purpose: Authorize a student's examination attempt.

Authentication: Student.

Request
{
  "exam_code": "004281"
}
Response — 201 Created
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "student_user_id": "00000000-0000-4000-8000-000000000001",
    "attempt_number": 1,
    "package_version": 1,
    "status": "authorized",
    "authorized_at": "2026-10-18T10:00:00Z",
    "allow_offline_continuation": true
  }
}

The server must enforce the attempt policy.

Repeated requests must not create duplicate initial attempts.

If an attempt already exists, the server must return an appropriate existing-attempt response or a documented conflict.

A retake must require a valid retake grant.

10.2 GET /attempts/{attempt_id}

Purpose: Retrieve permitted attempt status.

Authentication: Student who owns the attempt, authorized professor, or authorized administrator.

Response — 200 OK
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "attempt_number": 1,
    "status": "in_progress",
    "package_version": 1,
    "last_accepted_sequence": 12,
    "submission_received": false
  }
}

The server must not expose private information to unauthorized users.

10.3 POST /attempts/{attempt_id}/start

Purpose: Record the start of an authorized attempt.

Authentication: Student who owns the attempt.

Request
{
  "client_started_at": "2026-10-18T10:05:00Z"
}
Response — 200 OK
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "status": "in_progress",
    "server_started_at": "2026-10-18T10:05:01Z"
  }
}

The start operation must be idempotent according to the attempt lifecycle policy.

The client must record the local start state before depending on the response for further local execution.

10.4 GET /attempts/{attempt_id}/package

Purpose: Retrieve the authorized examination package.

Authentication: Student who owns the authorized attempt.

Response — 200 OK
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "package_version": 1,
    "title": "Computer Networks Internal Assessment",
    "instructions": "Read all questions carefully.",
    "duration_seconds": 1800,
    "allow_question_navigation": true,
    "allow_offline_continuation": true,
    "proctoring_config": {
      "face_absence_grace_ms": 5000,
      "multiple_faces_grace_ms": 2000,
      "sustained_head_turn_ms": 3000,
      "phone_detection_threshold": 0.65
    },
    "questions": [
      {
        "question_id": "00000000-0000-4000-8000-000000000041",
        "question_number": 1,
        "question_type": "mcq",
        "question_text": "Which protocol is used to resolve domain names?",
        "options": {
          "A": "HTTP",
          "B": "DNS",
          "C": "FTP",
          "D": "SMTP"
        },
        "marks": 1
      }
    ],
    "package_integrity": {
      "algorithm": "SHA-256",
      "digest": "server-generated-package-digest"
    }
  }
}

The package must include only the questions and configuration assigned to the authorized attempt.

Correct answer keys and private grading metadata must never be included.

The client must validate and persist the complete package before starting an examination that requires offline continuation.

The exact package digest algorithm and canonicalization procedure must be implemented consistently on the server and client.

10.5 POST /attempts/{attempt_id}/cancel

Purpose: Cancel an attempt when permitted by policy.

Authentication: Student who owns the attempt, authorized professor, or administrator according to the configured policy.

Cancellation must not be used as an automatic response to internet disconnection.

11. Synchronization endpoints

These endpoints implement the protocol specified in sync-protocol.md.

11.1 GET /attempts/{attempt_id}/sync-state

Purpose: Retrieve the server's synchronization state.

Authentication: Student who owns the attempt or another explicitly authorized actor.

Response — 200 OK
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "last_accepted_sequence": 12,
    "attempt_status": "in_progress",
    "submission_received": false,
    "final_sequence": null,
    "pending_snapshot_count": 2
  }
}

The response must describe server-known state.

The server cannot report new events that remain only on a disconnected client.

11.2 POST /attempts/{attempt_id}/sync

Purpose: Submit a bounded, ordered batch of synchronization operations.

Authentication: Student who owns the attempt.

Request
{
  "attempt_id": "00000000-0000-4000-8000-000000000030",
  "operations": [
    {
      "operation_id": "00000000-0000-4000-8000-000000000051",
      "sequence_number": 13,
      "operation_type": "answer_upsert",
      "entity_id": "00000000-0000-4000-8000-000000000041",
      "payload_hash": "canonical-sha256-digest",
      "client_created_at": "2026-10-18T10:10:00Z",
      "payload": {
        "question_id": "00000000-0000-4000-8000-000000000041",
        "answer_value": {
          "selected_option": "B"
        },
        "revision": 1
      }
    }
  ]
}

The hash is illustrative. Production clients must calculate the actual digest.

Response — 200 OK
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "last_accepted_sequence": 13,
    "results": [
      {
        "operation_id": "00000000-0000-4000-8000-000000000051",
        "sequence_number": 13,
        "status": "accepted",
        "duplicate": false,
        "error_code": null
      }
    ]
  }
}
Duplicate retry response

An identical previously accepted operation may return:

{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "last_accepted_sequence": 13,
    "results": [
      {
        "operation_id": "00000000-0000-4000-8000-000000000051",
        "sequence_number": 13,
        "status": "accepted",
        "duplicate": true,
        "error_code": null
      }
    ]
  }
}

The server must not apply the same logical operation twice.

Sequence-gap response

If a required sequence is missing, return an explicit conflict.

Example:

{
  "error": {
    "code": "SEQUENCE_GAP",
    "message": "A required earlier operation has not been accepted.",
    "details": [
      {
        "expected_sequence": 13,
        "received_sequence": 14
      }
    ],
    "retryable": true
  }
}

The client must preserve the affected operations and retry the missing sequence.

Other validation requirements

The server must:

Authenticate the request.
Validate attempt ownership.
Validate each operation schema.
Validate operation IDs.
Validate sequence numbers.
Recalculate payload hashes.
Reject conflicting operation ID reuse.
Reject conflicting sequence assignments.
Enforce operation ordering.
Persist accepted operations transactionally.
Return explicit per-operation results.
Never silently discard invalid operations.

The client must not assume that every operation in a batch succeeded merely because the HTTP response was successful.

11.3 POST /attempts/{attempt_id}/submit

Purpose: Submit an examination.

The local-first client must record the submission locally before relying on a server response.

The submission operation must also be transmitted through the ordered synchronization mechanism.

This endpoint may be implemented as a dedicated wrapper around the same idempotent finalization service.

It must not introduce a separate, inconsistent submission pipeline.

Request
{
  "operation_id": "00000000-0000-4000-8000-000000000060",
  "final_sequence": 18,
  "client_submitted_at": "2026-10-18T10:35:00Z"
}

The exact sequence-boundary semantics must be consistent with sync-protocol.md.

Response — 200 OK
{
  "data": {
    "attempt_id": "00000000-0000-4000-8000-000000000030",
    "status": "submitted",
    "submission_received": true,
    "final_sequence": 18,
    "server_submitted_at": "2026-10-18T10:35:02Z"
  }
}

The server must verify that the required preceding operations have been accepted before finalizing the attempt.

If required operations are missing, return an explicit sequence-gap or submission-pending response.

Offline behavior

When the student is offline:

Do not wait for this endpoint to save the local submission.
Persist the submission locally.
Create the stable submission_finalize operation.
Display the local submission status.
Synchronize automatically when connectivity returns.
Idempotency

Repeated submissions using the same operation ID and same logical payload must return the original result.

The server must not create duplicate submissions.

A conflicting reuse of the operation ID must be rejected.

12. Snapshot and evidence endpoints
12.1 POST /attempts/{attempt_id}/snapshots

Purpose: Register snapshot metadata before uploading the binary image.

Authentication: Student who owns the attempt.

Request
{
  "snapshot_id": "00000000-0000-4000-8000-000000000070",
  "event_id": "00000000-0000-4000-8000-000000000080",
  "capture_reason": "phone_detected",
  "client_captured_at": "2026-10-18T10:12:00Z",
  "mime_type": "image/jpeg",
  "size_bytes": 125000,
  "sha256": "actual-64-character-sha256-hex-digest",
  "width": 1280,
  "height": 720
}

The checksum must be a valid SHA-256 digest.

Response — 201 Created
{
  "data": {
    "snapshot_id": "00000000-0000-4000-8000-000000000070",
    "storage_status": "pending",
    "upload_url": "/api/v1/attempts/00000000-0000-4000-8000-000000000030/snapshots/00000000-0000-4000-8000-000000000070/content"
  }
}

The example uses a server-managed upload URL.

A production implementation may instead return a controlled object-storage upload URL.

The selected upload strategy must be documented and consistently implemented.

The server must validate the event relationship and attempt ownership.

12.2 PUT /attempts/{attempt_id}/snapshots/{snapshot_id}/content

Purpose: Upload snapshot image bytes.

Authentication: Student who owns the attempt, or a validated upload capability under the chosen object-storage design.

Content type: An explicitly supported image type, such as image/jpeg.

The server must:

Enforce upload-size limits.
Validate actual file content.
Verify the expected checksum.
Verify the expected size.
Prevent unauthorized snapshot association.
Avoid duplicate logical records.
Confirm durable storage before marking the snapshot uploaded.
Response — 200 OK
{
  "data": {
    "snapshot_id": "00000000-0000-4000-8000-000000000070",
    "storage_status": "uploaded",
    "sha256": "actual-64-character-sha256-hex-digest"
  }
}

A successful HTTP request must not be treated as evidence of durable storage unless the configured storage operation has actually completed.

12.3 GET /attempts/{attempt_id}/snapshots/{snapshot_id}

Purpose: Retrieve permitted snapshot metadata.

Authentication: Student who owns the attempt, authorized professor, or authorized administrator.

Response — 200 OK

Returns the permitted snapshot metadata, including its current storage status.

12.4 GET /attempts/{attempt_id}/snapshots/{snapshot_id}/content

Purpose: Retrieve the image when authorized.

Authentication: Student who owns the attempt, authorized professor, or authorized administrator.

The server must enforce access control before returning evidence.

The response must use the actual stored media type.

The server must not return a fake image or imply that evidence exists when only local metadata was received.

12.5 Snapshot retry behavior

A repeated registration request using the same snapshot ID and identical metadata must not create another logical snapshot.

If the same snapshot ID is reused with conflicting metadata, reject the request.

If an upload response is lost, the client must query the snapshot state or retry using the same snapshot ID and checksum.

The client must retain the local Blob until the required server acknowledgement and retention conditions are satisfied.

13. Retake endpoints
13.1 POST /exams/{exam_id}/retake-grants

Purpose: Authorize a student to take another attempt.

Authentication: Owning professor or authorized administrator.

Request
{
  "student_user_id": "00000000-0000-4000-8000-000000000001",
  "previous_attempt_id": "00000000-0000-4000-8000-000000000030",
  "reason": "Approved by the professor"
}
Response — 201 Created
{
  "data": {
    "retake_grant_id": "00000000-0000-4000-8000-000000000090",
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "student_user_id": "00000000-0000-4000-8000-000000000001",
    "status": "granted",
    "granted_at": "2026-10-18T11:00:00Z"
  }
}

The server must validate the professor's authorization.

A retake grant must not be consumed more than once.

13.2 GET /exams/{exam_id}/retake-grants

Purpose: List retake grants for an authorized examination.

Authentication: Owning professor or authorized administrator.

13.3 POST /retake-grants/{retake_grant_id}/revoke

Purpose: Revoke an unused retake grant when policy permits.

Authentication: Authorized professor or administrator.

Revocation must not overwrite a previously completed attempt.

14. Professor monitoring endpoints
14.1 GET /exams/{exam_id}/monitoring

Purpose: Retrieve the monitoring dashboard for an examination.

Authentication: Owning professor or authorized administrator.

Response — 200 OK
{
  "data": {
    "exam_id": "00000000-0000-4000-8000-000000000010",
    "attempts": [
      {
        "attempt_id": "00000000-0000-4000-8000-000000000030",
        "student_name": "Example Student",
        "student_usn": "2VD23MI001",
        "attempt_number": 1,
        "status": "in_progress",
        "server_started_at": "2026-10-18T10:05:00Z",
        "server_submitted_at": null,
        "last_server_contact_at": "2026-10-18T10:20:00Z",
        "submission_received": false,
        "last_accepted_sequence": 12,
        "event_counts": {
          "face_absent": 1,
          "multiple_faces": 0,
          "sustained_head_turn": 2,
          "phone_detected": 1,
          "camera_unavailable": 0,
          "fullscreen_exit": 0,
          "page_hidden": 0
        }
      }
    ]
  }
}

Event counts must be calculated from server-known records.

The server must not claim to know about events that remain on a disconnected device.

14.2 GET /exams/{exam_id}/attempts

Purpose: List attempts for an authorized examination.

Authentication: Owning professor or authorized administrator.

Query parameters
status
student_usn
limit
cursor

The server must enforce the professor's examination access permissions.

14.3 GET /attempts/{attempt_id}/events

Purpose: Retrieve the event timeline for an attempt.

Authentication: Student who owns the attempt where permitted, authorized professor, or authorized administrator.

Query parameters
event_type
event_status
from
to
limit
cursor
Response — 200 OK
{
  "data": [
    {
      "event_id": "00000000-0000-4000-8000-000000000080",
      "event_type": "phone_detected",
      "event_status": "confirmed",
      "client_started_at": "2026-10-18T10:12:00Z",
      "client_ended_at": "2026-10-18T10:12:04Z",
      "duration_ms": 4000,
      "confidence": 0.87,
      "snapshot_ids": [
        "00000000-0000-4000-8000-000000000070"
      ],
      "evidence_status": "uploaded",
      "server_received_at": "2026-10-18T10:15:00Z"
    }
  ],
  "meta": {
    "next_cursor": null,
    "has_more": false
  }
}

The response must distinguish client-reported event timestamps from server receipt timestamps.

Automated events are observations and must not be presented as conclusive proof of misconduct.

14.4 GET /attempts/{attempt_id}/events/{event_id}

Purpose: Retrieve event details.

Authentication: Authorized attempt owner, professor, or administrator.

The server must validate that the event belongs to the specified attempt.

15. PDF report endpoints
15.1 GET /attempts/{attempt_id}/report

Purpose: Download a PDF report for an examination attempt.

Authentication: Authorized professor or administrator, and the student only if student access to their own report is explicitly enabled.

Response content type: application/pdf

The report should contain:

Examination title and identifier.
Student name and USN.
Attempt number.
Start and submission information.
Examination duration.
Event counts by type.
Event timeline.
Event durations where applicable.
Relevant evidence snapshots.
Evidence synchronization status.
Submission synchronization status where relevant.
A statement that automated detections are observations requiring appropriate human review.

The report must not imply that a pending snapshot is available on the server.

The report must distinguish client-reported timestamps from server-recorded timestamps where relevant.

A face-absence event must not fabricate an image of a missing face.

15.2 GET /exams/{exam_id}/reports

Purpose: Retrieve available report metadata for an authorized examination.

Authentication: Owning professor or authorized administrator.

The endpoint may return report metadata or provide links to individually generated reports.

The implementation must define whether reports are generated on demand or stored as versioned artifacts.

16. Administrator settings endpoints
16.1 GET /settings

Purpose: Retrieve settings visible to the authenticated administrator.

Authentication: Administrator only, unless specific read-only settings are intentionally exposed to other roles.

Response — 200 OK
{
  "data": [
    {
      "setting_key": "default_face_absence_grace_ms",
      "setting_value": 5000,
      "version": 1,
      "updated_at": "2026-10-18T10:00:00Z"
    }
  ]
}

Only implemented and validated settings should be exposed.

16.2 PATCH /settings/{setting_key}

Purpose: Update a supported setting.

Authentication: Administrator only.

Request
{
  "setting_value": 6000,
  "expected_version": 1
}

The server must validate the setting value.

The expected version should be used to detect concurrent changes.

Response — 200 OK
{
  "data": {
    "setting_key": "default_face_absence_grace_ms",
    "setting_value": 6000,
    "version": 2,
    "updated_at": "2026-10-18T10:05:00Z"
  }
}

Important settings changes must be audited.

Active examination attempts must preserve their assigned configuration version.

17. Audit endpoints
17.1 GET /audit-logs

Purpose: Retrieve authorized administrative audit records.

Authentication: Administrator only, subject to the institution's policy.

Query parameters
actor_user_id
action_type
target_type
from
to
limit
cursor

The response must exclude passwords, authentication tokens, and unnecessary biometric data.

Audit access itself may require auditing.

18. Uploaded-video analysis endpoints

Uploaded-video analysis is separate from a live examination attempt.

It uses the same detection and event-processing pipeline while maintaining a separate analysis-session identity.

18.1 POST /video-analysis-sessions

Purpose: Create an analysis session and upload a supported video file.

Authentication: Authorized user according to the configured policy.

Content type: multipart/form-data

Form field:

file

The server must validate:

File type.
File size.
Supported encoding.
Upload authorization.
Processing limits.
Response — 202 Accepted
{
  "data": {
    "video_analysis_session_id": "00000000-0000-4000-8000-000000000100",
    "analysis_status": "queued"
  }
}

The initial implementation may process uploaded videos locally, provided that the client uses the same detection and event-processing pipeline.

If processing is local, the session and results must still be distinguishable from a live exam attempt.

18.2 GET /video-analysis-sessions/{session_id}

Purpose: Retrieve analysis status.

Authentication: Authorized creator, professor, or administrator.

Response — 200 OK

Returns the current processing status.

18.3 GET /video-analysis-sessions/{session_id}/events

Purpose: Retrieve the event timeline for a video-analysis session.

Authentication: Authorized creator, professor, or administrator.

Events must reference the analysis session, not an unrelated live examination attempt.

18.4 GET /video-analysis-sessions/{session_id}/report

Purpose: Download the analysis report.

Authentication: Authorized creator, professor, or administrator.

The report must identify the source as uploaded-video analysis.

It must not claim that the recorded person was the authenticated student in a live examination.

19. Synchronization contract requirements

The following requirements apply to every synchronization endpoint.

19.1 Stable identifiers

Operation IDs, attempt IDs, event IDs, and snapshot IDs must remain stable across retries.

19.2 Idempotency

The server must return the original result for an identical accepted operation.

The same operation ID with a different payload must be rejected.

19.3 Sequence validation

The server must validate attempt-scoped sequence numbers.

A missing sequence must be reported explicitly.

The server must not silently skip required operations.

19.4 Atomic server processing

Operation acceptance and its corresponding logical data mutation must be transactional.

The server must not acknowledge an operation whose required mutation failed.

19.5 Explicit acknowledgement

The response must identify which operations were accepted, rejected, or remain blocked.

The client must not assume that every operation in a batch was accepted.

19.6 Local-first behavior

The client must persist data locally before reporting a successful local save.

An API failure must not erase pending local operations.

19.7 Offline submission

The student may submit locally while disconnected when the examination policy permits offline continuation.

The client must synchronize the original submission operation after connectivity returns.

19.8 Evidence confirmation

A snapshot must not be marked uploaded until durable storage has been confirmed.

The server must validate snapshot checksums and metadata.

20. WebSocket contract for live monitoring

The professor dashboard may use WebSockets for timely updates.

A polling fallback must be available.

20.1 Connection

A suitable route is:

/api/v1/ws/exams/{exam_id}/monitoring

The connection must authenticate the user and verify examination access.

20.2 Example event message
{
  "type": "attempt_updated",
  "exam_id": "00000000-0000-4000-8000-000000000010",
  "attempt_id": "00000000-0000-4000-8000-000000000030",
  "data": {
    "status": "in_progress",
    "last_server_contact_at": "2026-10-18T10:20:00Z",
    "submission_received": false
  }
}

The server must publish only authorized, server-known information.

A disconnected student's new local events must not appear until they synchronize.

WebSocket failure must not interrupt the student examination.

20.3 Polling fallback

The frontend may periodically request the monitoring endpoint when WebSockets are unavailable.

Polling intervals should be configurable and must not create excessive server load.

21. API security requirements

The implementation must:

Enforce authentication on protected endpoints.
Enforce role-based authorization.
Enforce resource ownership.
Validate all incoming request bodies.
Validate file content and size.
Protect evidence endpoints.
Prevent correct answer keys from reaching student packages.
Apply rate limits to login and exam-code resolution.
Protect against brute-force exam-code attempts.
Use HTTPS in hosted environments.
Use secure password hashing.
Protect session credentials.
Apply CSRF protection where required.
Avoid exposing internal stack traces.
Avoid logging passwords or tokens.
Audit sensitive administrative actions.
Validate synchronization hashes and sequence numbers.
Enforce idempotency.
Prevent unauthorized retake creation.
Apply upload and storage limits.

A UUID is not an authorization mechanism.

Possession of an exam code, attempt ID, event ID, or snapshot ID must not independently grant access.

22. API implementation organization

The backend should implement the endpoints through separate modules.

Recommended organization:

backend/
└── app/
    ├── api/
    │   └── v1/
    │       ├── auth.py
    │       ├── users.py
    │       ├── exams.py
    │       ├── questions.py
    │       ├── attempts.py
    │       ├── sync.py
    │       ├── snapshots.py
    │       ├── monitoring.py
    │       ├── reports.py
    │       ├── retakes.py
    │       ├── settings.py
    │       ├── audit.py
    │       └── video_analysis.py
    ├── schemas/
    ├── services/
    ├── repositories/
    ├── core/
    └── db/

The route handlers should remain relatively thin.

Business rules belong in service modules.

Database access should use repositories or a consistently structured persistence layer.

The backend must validate ownership and permissions before returning private resources.

The frontend should centralize API calls in service modules instead of embedding raw fetch logic throughout UI components.

23. OpenAPI documentation

FastAPI should generate OpenAPI documentation from the implemented request and response schemas.

The generated documentation must reflect the actual implemented API.

Do not assume that writing this specification automatically creates working endpoints.

During development, verify the API using the generated interactive documentation and automated tests.

A recommended local documentation route is:

/docs

The production deployment may restrict interactive API documentation according to the security policy.

24. Implementation priorities

Implement the API in the following order.

Phase 1 — Foundation
Health endpoint.
Database connectivity.
Authentication.
Current-user endpoint.
Role and resource authorization.
Phase 2 — Examination management
Create examinations.
Manage questions.
Import and validate Excel files.
Publish examinations.
Generate six-digit codes.
Phase 3 — Attempts
Resolve exam codes.
Authorize attempts.
Download complete question packages.
Start attempts.
Enforce retake authorization.
Phase 4 — Synchronization
Retrieve synchronization state.
Accept ordered operation batches.
Validate sequence numbers.
Implement idempotency.
Return explicit acknowledgements.
Reconcile server state.
Phase 5 — Evidence
Register snapshot metadata.
Upload image bytes.
Verify checksums.
Confirm durable storage.
Retrieve authorized snapshots.
Phase 6 — Submission
Process final submission operations.
Verify final sequence boundaries.
Finalize attempts idempotently.
Return authoritative submission status.
Phase 7 — Professor dashboard
Retrieve attempts.
Retrieve event timelines.
Retrieve event counts.
Retrieve snapshot status.
Implement WebSocket updates or polling.
Phase 8 — Reports
Generate PDF reports.
Include event timelines and available evidence.
Distinguish client timestamps from server timestamps.
Display synchronization and evidence status.
Phase 9 — Administration
User management.
Role management.
System settings.
Audit records.
System-health diagnostics.
Phase 10 — Uploaded-video analysis
Create analysis sessions.
Process supported videos.
Retrieve events.
Generate analysis reports.

The implementation must follow the project's core feature priorities and testing requirements.

25. Definition of done

The API contract is ready for implementation when:

Every required endpoint has a defined purpose.
Authentication requirements are documented.
Role and resource permissions are documented.
Request and response formats are defined for core workflows.
Errors have consistent machine-readable codes.
Examination packages exclude answer keys.
Six-digit codes preserve leading zeroes.
Attempts use stable UUIDs.
Synchronization uses stable operation IDs.
Sequence gaps are reported explicitly.
Duplicate operation delivery is idempotent.
Snapshot uploads have a verifiable confirmation process.
Offline submission is supported by the local-first workflow.
Submission finalization validates preceding operations.
Professor monitoring distinguishes server-known information from pending client data.
Reports do not misrepresent evidence availability.
Uploaded-video analysis remains separate from live examination attempts.
The implemented API is covered by automated tests.

Final requirement: The API must support reliable synchronization without making an already-authorized examination dependent on continuous internet connectivity.