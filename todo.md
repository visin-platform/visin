# Visin: critical codebase review and improvement backlog

Reviewed: 2026-09-10. Baseline: `987f311` (`1.2.0`).

Backlog updated: 2026-09-10. Completed fixes are removed; remaining item numbers stay stable. The assessment describes the original baseline, with follow-up validation recorded below.

Current constraints: tests belong to the project they exercise and use in-memory MongoDB when persistence is needed. Do not introduce root commands for individual tests, external testing database services, deployment environment variables, or pipeline changes. OAuth/Compose changes were reverted by the user. Project data editing is granted to assigned groups. Backwards compatibility and migration tooling are not required; the user will migrate existing records.

## Assessment

Visin has a useful, substantial implementation and a stronger foundation than a typical prototype: strict TypeScript, shared infrastructure, validation, meaningful domain logic, extensive unit tests, container builds, and CI. However, its permission boundaries and concurrent write behavior are not consistent enough for an internet-facing installation with mutually untrusted users. Those gaps should take precedence over adding features or splitting more services.

The most important problems are email-based authorization without email verification, project credentials inheriting a person's broader authority, public visibility granting write access, incomplete session revocation, and multi-step updates that cannot recover reliably from races or interruptions. Several comments describe guarantees that the implementation does not actually enforce.

This is a repository-wide manual review, not a CodeRabbit report, a penetration test, or a claim that every line and runtime behavior has been exhaustively verified. It covered all 13 workspaces at the architecture/configuration level and traced representative identity, permissions, ingestion, labeling, file transfer, analytics, export, and frontend workflows in depth. No deployed system, real user data, or live database was accessed. Product proposals below are distinguished from confirmed defects.

### Priority and evidence conventions

- **P0:** Resolve before exposing the instance to untrusted users; serious authorization boundary failures.
- **P1:** Next stabilization work; credential lifecycle, data integrity, availability, or a broken supported workflow.
- **P2:** Planned engineering/product improvement; correctness, scale, usability, maintainability, or operability.
- **P3:** Optional expansion; confirm product demand before implementation.
- **Reproduced:** Executed actual source functions/middleware against synthetic fixtures. Database interactions were mocked; this establishes application control-flow behavior, not live MongoDB concurrency behavior. The upload race used actual temporary files and streams.
- **Source-confirmed:** Directly traced in source/configuration; not reproduced through a deployed browser/API stack.
- **Design gap / proposal:** A capability or policy improvement, not necessarily a violation of the current intended product contract.

Unchecked items are remaining work. Remove an item only after its implementation and relevant validation are complete.

## P0: permission boundaries

### 01. Verify email ownership before using it to grant group access

- [ ] **P0 — Reproduced.** Registration accepts an arbitrary unused email and immediately issues a session. Group membership and role checks trust that email. An attacker who registers an invited person's address before that person has an account can inherit its group permissions without controlling the mailbox. Adding an address to a group does not require an existing verified account.
- **Evidence:** `apps/backend/auth-service/src/controllers/authController.ts:79–105`; `apps/backend/auth-service/src/models/User.ts`; `apps/backend/group-service/src/services/groupService.ts:101–128,181–188`; `apps/backend/label-service/src/services/groupAccessService.ts:17–44`.
- **Fix:** Introduce verified identities and explicit invitation acceptance. Store memberships against immutable user IDs; resolve an invitation's email only after verification. Preserve a deliberate, separately protected offline bootstrap flow. For Google sign-in, validate the email verification claim and bind the provider identity explicitly rather than relying only on the email string.
- **Acceptance:** Registering an invited email without verification grants no group access. Test invitations before and after account creation, expired/replayed verification links, Google account linking, and migration of existing email-based memberships.

## P1: identity, privacy, deployment, and durability

### 06. Enforce session revocation across services

- [ ] **P1 — Reproduced.** A token with version 1 is rejected by auth-service after the user advances to version 2, yet the same JWT still passes shared middleware used by other services. Password changes report that other sessions were signed out, but a copied token can continue calling those APIs until its 24-hour expiry. Clearing a browser cookie on logout does not revoke a copied token.
- **Evidence:** `apps/backend/auth-service/src/controllers/profileController.ts:110–132`; `middleware/authMiddleware.ts:38–49`; `services/jwtService.ts:3,20–21`; `controllers/authController.ts:189–217`; `libs/backend-core/src/middleware/authMiddleware.ts:38–60`.
- **Fix:** Establish a consistent revocation model: shared session/version validation, introspection with bounded caching, or short-lived access credentials backed by revocable sessions. Define whether password resets also revoke API keys and OAuth grants. Make user-facing wording match the implemented timing.
- **Acceptance:** Exercise a real password change and administrative invalidation, then replay the old credential against auth, group, vision, and label APIs. Assert the agreed revocation deadline at every boundary.
- **Additional source-confirmed defect:** `apps/backend/group-service/src/controllers/groupController.ts:22` calls `/api/auth/internal/invalidate-tokens`, while `apps/backend/auth-service/src/index.ts:68` mounts the matching route under `/auth/internal/invalidate-tokens`. Correct and test that inter-service request as part of revocation work.

### 07. Make OAuth refresh rotation atomic and grant-scoped

- [ ] **P1 — Reproduced control-flow race.** Refresh redemption reads a live token, saves `revokedAt`, then creates a replacement. Two callers can both read it before either save and both receive valid replacements. Reconnect also revokes existing records and inserts a new one in separate operations. These sequences do not provide the single-use/replay guarantees described in comments.
- **Evidence:** `libs/backend-core/src/oauth/service.ts:164–177,206–245`; `src/oauth/models.ts`.
- **Fix:** Use an atomic conditional claim plus a persistent grant/family identity, with transactional or recoverable replacement issuance. Make disconnect/reconnect coordinate with in-flight refreshes. Define expiry and retention for refresh records. Document the current one-hour access-token survival after disconnect, or check grant revocation on access as well.
- **Acceptance:** Concurrent redemption has one winner; replay and disconnect revoke the intended family; an interrupted rotation does not create two descendants or silently strand the client. Verify against real MongoDB, not only mocked model methods.

### 08. Finish upload validation and reconcile unverified file references

- [ ] **P1 — Remaining upload hardening.** New image, visualization, dataset, and analysis attachments now require persisted reservations bound to the uploader, resource family, parent, and target record. Stored size is checked, and conflicting, expired, stolen, and replayed references are rejected. This closes the arbitrary file-reference attachment path identified in the original review.
- **Remaining work:** Enforce allowed content types and size limits at upload time, inspect actual stored metadata/content rather than trusting declared MIME types, and reconcile historical references, thumbnails, and abandoned uploads. References without trustworthy provenance are retained during deletion until an operator reconciles them.
- **Evidence:** `apps/backend/vision-service/src/services/uploadReservationService.ts`; `services/datasetImageService.ts`; `services/visualizationService.ts`; `services/analysisService.ts`.
- **Acceptance:** Oversized and disallowed-content uploads are rejected before completion; failures cannot publish incomplete records; reconciliation identifies orphan bytes without deleting another resource's file. Preserve the passing stolen-reference and concurrent-attachment regression tests.

### 10. Separate labeling publication from job activation

- [ ] **P1 — Design gap / source-confirmed.** Active jobs are listed publicly, and task-by-ID/index endpoints return signed images without membership checks. Those task endpoints do not check whether the job is active, paused, draft, or archived. Activating work for a private group effectively publishes it; pausing/archiving does not revoke direct-link access. Raw task documents also include `answeredBy`/`leasedBy` user IDs despite an otherwise anonymous answer DTO.
- **Evidence:** `apps/backend/label-service/src/services/jobService.ts:60–85`; `controllers/taskController.ts:18–37`; `services/taskService.ts:119–125,167–189`; `models/LabelTask.ts:24–27`; `index.ts:24–34`.
- **Fix:** Add independent visibility/sharing settings and explicit, revocable share links where needed. Use allowlisted public DTOs rather than returning model documents. Enforce parent status/visibility on all task and image access paths.
- **Acceptance:** Private group work stays private when activated. Expired/revoked shares and archived/private jobs cannot be read through direct task URLs. Public responses contain only deliberately public fields.

### 11. Enforce archive and upload limits before allocating or writing all bytes

- [ ] **P1 — Source-confirmed.** Ingest calls `entry.buffer()` before checking the 50 MB entry limit. A highly compressed entry can therefore allocate far more than the limit before rejection. The entry-count cap does not bound expanded bytes. File upload streams also have no enforced cumulative size/quota in the handler; declared chunk lengths are checked only after writing.
- **Evidence:** `apps/backend/label-service/src/services/ingestService.ts:11–12,113–139,246–254`; `apps/backend/file-service/src/controllers/publicController.ts:58–146`; `controllers/signedUrlController.ts:14–19`.
- **Fix:** Count and cap decompressed bytes during streaming, including ignored entries and the archive total. Enforce upload reservations, per-file limits, disk quotas, safe integer ranges, and parser cancellation on failure. Validate mask metadata entries and duplicate IDs instead of accepting any JSON array. Keep arbitrary metadata keys while validating their required structural envelope.
- **Acceptance:** Oversized/compression-heavy archives fail with bounded memory and disk growth. Invalid mask IDs/boxes produce per-file diagnostics. Upload bodies exceeding their reservation are stopped while streaming.

### 12. Persist labeling answers and counters as one recoverable operation

- [ ] **P1 — Reproduced with an injected database interruption.** `submitAnswer` writes an answer and then updates the task's `answersCount`/`answeredBy`. If the second write fails, retry sees an existing answer and never performs the missing increment. Undo has the inverse delete-then-decrement problem. Queue eligibility, progress, completion, and export counts can permanently disagree.
- **Evidence:** `apps/backend/label-service/src/services/taskService.ts:243–308`; `models/LabelAnswer.ts:31–33`; `services/jobService.ts:111–158`.
- **Fix:** Make answer/counter transitions transactional or derive counters from a single authoritative record using an idempotent operation/reconciliation design. Include job completion in the consistency model. Supply an integrity checker to repair existing drift. Account for the standalone MongoDB deployment if adopting transactions.
- **Acceptance:** Fault injection after every persistence step, duplicate submissions, concurrent undo/submit, and retries leave counts equal to actual distinct answers and never negative. Completed jobs accurately reflect task state.

### 13. Enforce redundancy and lease rules at answer submission

- [ ] **P1 — Reproduced.** The pull endpoint checks remaining redundancy and lease ownership, but submission does neither. A new group member answer can be accepted for an already-full task while another task keeps the job active. Any submission also unsets the current lease, including another person's lease or an unrelated revision.
- **Evidence:** `apps/backend/label-service/src/services/taskService.ts:142–150` versus `243–290`; `controllers/taskController.ts:40–45`.
- **Fix:** Define separate semantics for first answers, own-answer revisions, and adjudication. Atomically enforce capacity for new answers and ownership/expiry when a lease is required. Revisions must not clear someone else's claim. Add lease renewal/release if tasks routinely exceed the configured lease duration.
- **Acceptance:** Concurrent first answers cannot exceed K. Revisions remain possible without disturbing another worker. Browsing a completed task does not create an extra independent answer.

### 14. Serialize resumable uploads and finalize files atomically

- [ ] **P1 — Reproduced using actual temporary streams/files.** Two chunk requests at the same offset both pass the file-size check before asynchronous writes begin, and both return success. A size check followed by opening a stream does not serialize writers. Whole-file uploads write directly over the final object too, so readers can observe incomplete content and failures can leave partial files.
- **Evidence:** `apps/backend/file-service/src/controllers/publicController.ts:63–82,109–146`; `utils/storage.ts:48–66`.
- **Fix:** Introduce upload sessions with exclusive/conditional offset ownership, temporary storage, chunk checksums, expected final size/hash, and atomic finalization. Coordinate across instances if multiple writers are supported. Define interrupted-chunk rollback and retry semantics explicitly.
- **Acceptance:** Concurrent writes to the same upload offset have one winner; duplicate retries are idempotent; interrupted uploads remain resumable; no download sees a partially finalized file.

### 15. Repair the documented non-localhost sign-in setup

- [ ] **P1 — Source-confirmed configuration mismatch.** Setting `PUBLIC_HOST` updates frontend/backend URLs, but the default CORS allowlist remains localhost-only. Cookies still set `Domain=localhost` when `COOKIE_DOMAIN` is empty, so a response from a LAN IP/another host cannot set the intended session cookie. The documented one-variable LAN command does not complete the required configuration.
- **Evidence:** `README.md` Run it section; `compose.yml:19–22,37–42,108–115`; `apps/backend/auth-service/src/services/sessionService.ts:6–12`; `controllers/authController.ts:189–193`.
- **Fix:** Derive allowed origins from configured public app URLs or require a validated complete configuration. Omit the cookie `domain` attribute for host-only deployments instead of defaulting to localhost. Use identical cookie attributes when clearing. Provide working localhost, LAN, and HTTPS subdomain examples.
- **Acceptance:** Exercise setup → login → account → vision → labeling → logout in real browsers using the documented localhost and LAN configurations, plus a reverse-proxy HTTPS deployment.

### 17. Make development defaults safe to expose accidentally

- [ ] **P1 — Source-confirmed deployment risk.** Root Compose publishes API ports on all interfaces while providing publicly known signing/service secrets. Startup validation checks only that values exist, so setting `NODE_ENV=production` alone still accepts those defaults. Shared Express configuration trusts one proxy hop even when Compose exposes services directly, allowing a direct caller's forwarded address to affect IP-based limits.
- **Evidence:** `compose.yml:37–46,95–185`; `libs/backend-core/src/config/env.ts:13–19,39–46`; `src/app/createBaseApp.ts:35–37`; `apps/backend/auth-service/src/index.ts:48–57`.
- **Fix:** Bind development service ports to loopback by default; provide an explicit production/proxy configuration. Reject placeholder/default secrets in production and validate required URL/numeric settings. Configure trusted proxy addresses/hops for the actual topology and close bypass paths to backend ports.
- **Acceptance:** A default local launch is not reachable from another machine. Production startup fails on development secrets. Spoofing forwarding headers on a direct connection cannot reset the login rate-limit identity.
- **Compatibility constraint:** Retiring legacy OAuth production-domain URL defaults belongs to this configuration-hardening work. Preserve existing deployment variable names and active refresh-grant audience strings, or provide an explicit migration. The OAuth/Compose proposal was reverted by the user. Existing production-domain defaults are accepted. Do not introduce deployment variables or require pipeline changes; deployment is managed outside this repository.

### 18. Stop logging signed bearer URLs and strengthen audit coverage

- [ ] **P1 — Source-confirmed.** The common request logger logs `req.originalUrl`, including query strings. File-service uses query parameters for download/upload signatures, so requests place replayable signed URLs into logs for their remaining validity period. Current MCP audit support is useful, but does not replace domain audit records for ordinary destructive/admin actions.
- **Evidence:** `libs/backend-core/src/middleware/requestLogger.ts:5–8`; `apps/backend/file-service/src/controllers/signedUrlController.ts:17–19,40–42`; `libs/backend-core/src/audit/`; `apps/backend/mcp-service/src/tools/module.ts`.
- **Fix:** Log the path and allowlisted non-sensitive metadata, redacting signed URLs, codes, tokens, cookies, and authorization headers. Propagate a request/correlation ID. Record actor, credential kind, resource, outcome, and before/after summaries for authorization changes and destructive writes.
- **Acceptance:** Synthetic credentials cannot be found in application logs. A password/role change, deletion, and assistant write can be traced across services without exposing secrets.

### 19. Define deletion, restoration, and orphan cleanup consistently

- [ ] **P1 — Source-confirmed.** Training deletion soft-deletes the parent and some descendants, but epoch read paths use `findById`/unfiltered queries and still expose deleted records. Project deletion removes only the project, stranding child resources behind a now-missing parent. Dataset-image deletion now retains the record when file deletion fails; durable cleanup and reconciliation across other resource families remain incomplete.
- **Evidence:** `apps/backend/vision-service/src/services/trainingService.ts:420–460`; `services/epochService.ts:59–85,116–132`; `services/projectService.ts:148–156`; `services/datasetImageService.ts:581–604`.
- **Fix:** Specify a lifecycle per resource: tombstone, restore, retention, and eventual purge. Apply parent/deleted filters consistently. Persist cleanup work and retry external file deletion. Decide how references in comparisons, findings, benchmarks, and visualizations survive deletion.
- **Acceptance:** Deleted content is absent through every direct/list/export path; partial deletions resume; restoration behaves predictably; an integrity report detects orphan database records and files.

### 20. Protect import and task-materialization state transitions

- [ ] **P1 — Source-confirmed race/recovery gaps.** Import start checks for a running job and then inserts a new one without an atomic per-bundle claim. Task materialization checks draft status, deletes the previous tasks, inserts replacements, and finally saves the job. Concurrent start/materialize/activate requests or a process failure can create overlapping imports, partial task sets, or stale task counts.
- **Evidence:** `apps/backend/label-service/src/services/bundleService.ts:188–228`; `services/materializationService.ts:124–136,231–255`; `services/jobService.ts:193–215`; `queue/importWorker.ts`.
- **Fix:** Use conditional version/status transitions and a single active import identity per bundle. Build a new task-set generation, verify it, then switch the job's active generation atomically. Coordinate activation with materialization. Preserve retry behavior already present in the worker rather than replacing it with an in-memory lock.
- **Acceptance:** Competing operations produce one valid state transition; activation never observes a partial task set; interruption and retries do not duplicate tasks or overwrite a newer import's status.

### 21. Keep independent labeling independent

- [ ] **P1 for evaluation-quality use — Design gap / source-confirmed.** The API returns the most recent other user's answer, and the workbench uses it to prefill a labeler's first answer. For redundancy K intended to measure independent judgments, this anchors later labelers to earlier decisions and undermines agreement/consensus as a quality signal.
- **Evidence:** `apps/backend/label-service/src/services/taskService.ts:94–103`; `apps/frontend/label-front/src/pages/WorkbenchPage.tsx:105–135`; `apps/backend/label-service/src/services/exportService.ts:56–64,89–117`.
- **Fix:** Separate blind annotation from review/adjudication. In blind mode, withhold others' verdicts server-side until the caller submits; restoring the caller's own answer remains useful. Clearly label consensus policy, ties, insufficient responses, and adjudicated outcomes.
- **Acceptance:** A second labeler cannot obtain the first verdict before submitting in blind mode. Review mode intentionally exposes it. Export distinguishes independent answers from revisions/adjudication and states whether “consensus” means plurality or a strict majority.

## P2: functional correctness, scale, and engineering quality

### 22. Make workbench saves and navigation race-safe

- [ ] **P2 — Source-confirmed.** `useWorkQueue.answer` has no submission lock; keyboard/button submissions can overlap. A save in browse mode applies its result to whichever item is current when it resolves, even if navigation has moved to another frame. Navigation also discards unsaved marks without a save/discard guard. A successful save followed by failed prefetch is surfaced as an action error, obscuring whether the answer was stored.
- **Evidence:** `apps/frontend/label-front/src/workbench/useWorkQueue.ts:170–208,236–258`; `pages/WorkbenchPage.tsx:124–135,210–229,274–284,524–529`.
- **Fix:** Track pending saves, bind response updates to task ID/request generation, and disable conflicting operations. Separate save errors from next-frame fetch errors. Preserve a per-task draft or request a deliberate discard on navigation. Support retry without double-counting.
- **Acceptance:** Rapid Enter/clicks create one submission; navigating during an in-flight save cannot mark another frame saved; a prefetch failure preserves the acknowledged answer and offers a next-frame retry.

### 23. Distinguish workbench loading, failure, permission denial, and temporarily unavailable work

- [ ] **P2 — Source-confirmed.** The job query's error is ignored; `!job` renders an indefinite loader even after a 404/network failure. The UI assumes any signed-in user may pull/label an active job, though the server requires group membership. A null queue pull is treated as done even when all eligible tasks are only temporarily leased by other workers.
- **Evidence:** `apps/frontend/label-front/src/pages/WorkbenchPage.tsx:45–63,299–312`; `workbench/useWorkQueue.ts:134–160,198–205`; `apps/backend/label-service/src/services/taskService.ts:142–155`.
- **Fix:** Return explicit caller capabilities and queue outcomes (`available`, `leased_elsewhere`, `completed_for_user`, `job_closed`). Render actionable error/permission states, retry controls, and a bounded wait/refresh state for busy work.
- **Acceptance:** Missing job, forbidden pull, expired session, network outage, all-tasks-leased, and actual completion produce distinct correct messages and recovery paths.

### 24. Restore normal keyboard navigation and verify accessibility

- [ ] **P2 — Source-confirmed behavior; browser accessibility audit still needed.** The workbench's window-level handler intercepts Tab/Shift+Tab to cycle masks, preventing normal focus traversal while the handler is active. Only `INPUT` targets are excluded, leaving buttons, selects, textareas, and editable elements exposed to global shortcuts.
- **Evidence:** `apps/frontend/label-front/src/pages/WorkbenchPage.tsx:247–297`; `src/workbench/FrameViewer.tsx`.
- **Fix:** Scope annotation shortcuts to a focused viewer or explicit shortcut mode; retain a reliable escape and standard focus order. Handle all editable/control targets, expose shortcut help and equivalent controls, and announce save/error state accessibly. Check narrow/touch layouts and color-independent mask/metric cues.
- **Acceptance:** Complete a labeling session using only a keyboard, including leaving the viewer and using navigation/dialogs. Run automated accessibility checks plus manual focus and screen-reader checks.

### 25. Bound queries, aggregation payloads, and export memory

- [ ] **P2 — Source-confirmed scale risk; no load benchmark performed.** Several list limits are optional or lack maximums; projects and job lists are unbounded. Exports load all tasks, answers, frames, and output rows into memory. The generic file service performs synchronous filesystem traversal/stat/delete operations. These costs grow with real datasets and block or pressure the same processes serving interactive requests.
- **Evidence:** `apps/backend/vision-service/src/validation/trainingSchemas.ts:20–28`; `validation/datasetImageSchemas.ts:4–16`; `services/projectService.ts:26–37`; `apps/backend/label-service/src/services/jobService.ts:40–56,79–85`; `services/exportService.ts:37–53,78–121,140–147`; `apps/backend/file-service/src/utils/storage.ts:127–204`.
- **Fix:** Add bounded defaults/maxima and stable cursor pagination; move large exports to streaming/background jobs. Batch signed-URL work, use lean/projection queries where appropriate, and replace blocking filesystem scans with asynchronous/bounded work. Avoid quadratic array-copy accumulation in mask selection. Measure query plans and representative dataset sizes before choosing indexes or caches.
- **Acceptance:** Publish p95 latency, memory, export throughput, and queue-lag budgets against a documented fixture size. Load tests prove large exports/imports do not starve sign-in or labeling.

### 28. Tighten ingestion contracts and make retries idempotent

- [ ] **P2 — Source-confirmed.** Parent UUIDs now derive from the resolved training across ordinary, batch, and JSON ingestion (fixed with project-token isolation). Remaining contract gaps: Epoch numbers/time values lack useful range/integer constraints, batch length is unbounded, and result values can be any non-null JSON value. Retrying inserts with generated UUIDs can duplicate measurements; duplicate UUIDs can leave partially committed batches.
- **Evidence:** `apps/backend/vision-service/src/services/epochService.ts:135–159,190–224,233–262`; `validation/epochSchemas.ts:13–28,50–58`; `models/Epoch.ts:20–54`; `validation/trainingSchemas.ts:55–78`.
- **Fix:** Resolve parent identity once and derive canonical identifiers. Validate bounded structural envelopes, finite/nonnegative timings, supported status values, and integer epoch numbers while retaining open metric names. Define idempotency keys/upsert behavior and batch partial-success semantics. Preserve original raw payloads separately if needed for debugging.
- **Acceptance:** Mismatched parent identifiers fail or normalize consistently; retries do not duplicate measurements; partially failed batches can be retried safely; custom class/condition names still round-trip.

### 29. Generate/check API contracts so docs, clients, and servers do not drift

- [ ] **P2 — Source-confirmed drift.** The vision OpenAPI document still describes `weatherCondition` and its old fixed enum, whereas current validation and code use free-form `condition`. The same system maintains handwritten frontend types, backend types/Zod schemas, MCP response schemas, and OpenAPI documents. Strict TypeScript cannot catch disagreement between independently declared HTTP contracts.
- **Evidence:** `apps/backend/vision-service/docs/openapi.yml:173–175,683,754,853,943`; `src/validation/datasetImageSchemas.ts:9,26,59,69`; `apps/backend/mcp-service/src/schemas.ts`; `apps/frontend/vision-front/src/types/`.
- **Fix:** Pick a canonical contract source and derive or validate OpenAPI and typed clients against it. Document error shapes, auth modes/scopes, pagination, identifiers, file upload completion, and custom taxonomy behavior. Add compatibility checks to releases and retain explicit migrations for schema changes.
- **Acceptance:** A generated client can complete the upload/ingest/query workflow. Contract tests reject the old enum/name where unsupported and verify every exposed route's response envelope and authorization requirements.

### 30. Add real workflow and persistence tests alongside the unit suite

- [ ] **P2, required validation for P0/P1 fixes — Source-confirmed coverage gap.** There is substantial unit coverage and useful HTTP middleware testing, including an OAuth middleware-chain suite. However, the inspected Playwright suites only check that the app shell loads without an uncaught error. They do not prove sign-in, cross-service cookies, a complete OAuth connection through deployed services, group policy, import completion, or concurrent database invariants. Mocked persistence allows the reproduced defects to coexist with passing tests.
- **Evidence:** `apps/frontend/vision-front/e2e/smoke.spec.ts:3–10`; `apps/frontend/label-front/e2e/smoke.spec.ts:3–10`; other frontend smoke suites; `.github/workflows/test.yml`; backend service/model tests.
- **Fix:** Add a small seeded Compose integration suite and browser journeys: bootstrap/login, register/invite/verify, private/public ACLs, A/B token isolation, OAuth consent/tool/disconnect, upload/import/materialize/label/revise/export, and deletion/recovery. Use real MongoDB/Redis for conditional-write and queue tests. Include concurrency and fault injection rather than merely asserting which model method was called.
- **Acceptance:** The fixes above fail their corresponding regression tests on this baseline and pass after correction. Test data resets predictably and CI does not use production services or credentials.

### 31. Correct CI dependency selection and validate release artifacts

- [ ] **P2 — Source-confirmed gaps; remote branch protection was not inspected.** `landing-front` depends on `@visin/frontend-core`, but its change filter uses `shared` instead of `frontend-shared`, so library-only changes omit that consumer's checks. Backend-only changes do not trigger relevant frontend end-to-end checks. The image publication workflow can run from tags/manual dispatch without an explicit successful-test dependency for the exact built revision; local workspace symlinks also differ from published-library consumption in images.
- **Evidence:** `.github/workflows/test.yml:30–81` and e2e matrix; `apps/frontend/landing-front/package.json`; `.github/workflows/publish-images.yml:20–23,55–56,101–151`; `README.md` shared-library release instructions.
- **Fix:** Derive dependency-aware affected targets, fix the landing filter, and map integration journeys to both their frontends and backends. Require checks for the exact release revision, smoke-test built images with registry-resolved libraries, and prevent manual runs from silently replacing an existing version with different content. Keep digest provenance and add dependency/image scanning without treating scan output as automatically exploitable findings.
- **Acceptance:** A frontend-core-only change tests all five consumers; an auth change runs sign-in integration tests; a failed revision cannot produce a release through the supported workflow; published image provenance identifies the exact source/dependency set.

### 32. Make health, shutdown, backups, and recovery operationally useful

- [ ] **P2 — Source-confirmed gaps / operational proposal.** Vision's `/health` uses the helper's default `checkMongo: false`, so it stays healthy after a database disconnection. Label health does not report Redis/worker readiness. Most services lack coordinated graceful shutdown, and there is no documented tested restore procedure for Mongo + local file storage + queued imports. Docker volumes alone are not a recovery plan.
- **Evidence:** `apps/backend/vision-service/src/index.ts:86–103`; `libs/backend-core/src/health/createHealthCheckHandler.ts:16–30`; `apps/backend/label-service/src/index.ts:17–22,54–66`; `apps/backend/auth-service/src/index.ts:90–97`; `compose.yml` volumes.
- **Fix:** Distinguish liveness from readiness, with bounded dependency checks and worker/queue status. Add service healthchecks and uniform drain/close deadlines. Define backup schedules, retention, restore ordering, acceptable data loss/recovery times, file/DB consistency checks, and a restore drill. Run containers as a non-root user with required writable volume permissions; expose build revision in health/version responses.
- **Acceptance:** Dependency loss changes readiness appropriately; deploy shutdown drains/retries work within a bounded window; a clean host can restore a documented backup and complete a label/export workflow.

### 33. Improve upload/import recovery in the frontend

- [ ] **P2 — Source-confirmed.** Import polling uses `setInterval` with an async callback, so slow requests can overlap and resolve out of order. A transient polling error stops tracking and marks the UI failed even if the server job continues. Cancellation resets local state but does not abort in-flight upload/inspection; stale callbacks can update a newer operation's UI.
- **Evidence:** `apps/frontend/label-front/src/hooks/useBundleUpload.ts:28–40,53–67,89–130`.
- **Fix:** Use serial/cancellable polling or a query with operation-scoped identity and retry/backoff. Separate transport uncertainty from terminal server failure. Persist/resume the import ID, restore progress after reload, and make cancellation semantics explicit for upload, mapping, and queued/running import phases.
- **Acceptance:** Slow/out-of-order responses cannot regress progress; one network outage does not report a running job as failed; reload reconnects to the job; cancelled/stale operations cannot overwrite current state.

### 34. Make exports safe, reproducible, and precise

- [ ] **P2 — Source-confirmed gaps / product improvement.** CSV escaping handles commas/quotes/newlines but not formula-leading strings or carriage returns. Arbitrary frame/stratum/mask metadata can therefore be interpreted as a formula by spreadsheet software. Findings export reads live epochs each time, so an old written conclusion can later acquire a different table after underlying measurements change. Current answers overwrite previous verdicts without an immutable revision history.
- **Evidence:** `apps/backend/label-service/src/services/exportService.ts:124–147`; `services/taskService.ts:259–272`; `apps/backend/vision-service/src/services/latexExport.ts:3–11`; `services/findingService.ts` export path.
- **Fix:** Provide an explicitly spreadsheet-safe CSV representation and test quoting/line endings while preserving raw machine-readable exports. Include schema version, source IDs, selection policy, export time, and content hashes/checkpoint IDs. Snapshot report evidence or distinguish live exports from frozen ones. Retain answer revisions when auditability/research reproducibility requires them.
- **Acceptance:** Formula-looking values export as literal data in the safe format; JSON retains exact values; a frozen report can be regenerated identically; answer corrections are attributable without changing the meaning of previously exported evidence.

### 35. Carry taxonomy meaning through APIs, MCP, and comparisons

- [ ] **P2 — Design gap / source-confirmed inconsistency.** The UI knows configured metric direction, but MCP instructions still say the server cannot know whether a metric is better high or low. Neutral ranges are useful; discarding known project semantics forces assistants to guess. Different projects can also use identical metric keys for different definitions, scales, or evaluation sets.
- **Evidence:** `apps/frontend/vision-front/src/taxonomy/resolveTaxonomy.ts:89,143`; `apps/backend/mcp-service/src/app.ts:49–55`; `src/tools/module.ts` metric range helpers; `apps/backend/vision-service/src/models/taxonomy.ts`.
- **Fix:** Expose the resolved configured vocabulary, direction, units, provenance, and evaluation split to MCP/exports. Separate per-metric extrema from a single selected checkpoint. Flag incomparable runs instead of silently treating matching names as equivalent. Add uncertainty/replicate summaries where enough data exists; do not invent significance from single runs.
- **Acceptance:** A configured lower-is-better metric is interpreted consistently in UI, assistant output, and exports. A checkpoint comparison uses one actual epoch per run, and incompatible metric definitions are disclosed.

### 36. Reduce duplicated policies and large mixed-responsibility modules

- [ ] **P2 — Maintainability improvement.** Shared middleware/factories are a strength, but policy is still split among global middleware, route guards, controllers, and services. There are separate identity/token paths with implicit handoffs. Large modules mix querying, authorization, aggregation, formatting, and UI state. Long comments sometimes assert stronger invariants than the code proves: setup exclusivity, upload serialization, rotation single-use, and owner-only writes are examples above.
- **Evidence:** `apps/backend/vision-service/src/services/trainingService.ts` (766 lines); `services/testResultService.ts` (699); `apps/backend/mcp-service/src/tools/vision.ts` (742); `apps/frontend/label-front/src/pages/WorkbenchPage.tsx` (573); `libs/backend-core/src/middleware/authMiddleware.ts`; the conflicting guarantees cited in items 02–07 and 14.
- **Fix:** Extract narrow policy and domain operations around the defects being fixed, with typed principal/capability inputs and focused tests. Use one HTTP boundary contract and consistent error handling. Remove obsolete comments/imports/helpers when touched, document architectural decisions separately, and keep comments focused on current constraints. Measure whether five separate frontends and six services justify their release/SSO overhead before adding more boundaries; a wholesale rewrite is not warranted by this review.
- **Acceptance:** New endpoints declare required capability and credential kind centrally. Tests cover policies once plus route wiring, and representative controllers/components become easier to change without touching unrelated behavior.

## P3: product improvements to validate with users

### 37. Add account recovery and deliberate instance administration

- [ ] **P3 after identity fixes — Proposal.** Provide verified password-reset/recovery flows, an owner-controlled registration/invitation policy, session management, user disabling, and clear ownership transfer. Current auth routes offer setup/register/login/password change but not a complete account lifecycle. For offline deployments, a documented administrative recovery CLI may be preferable to requiring email infrastructure.
- **Evidence:** `apps/backend/auth-service/src/routes/authRoutes.ts`; `apps/frontend/account-front/src/`.
- **Acceptance:** Document and test lost-password, lost-admin, departing-owner, disabled-user, and offline-installation workflows. Do not make disabling a user a frontend-only state.

### 38. Close the dataset–labeling–experiment loop

- [ ] **P3 — Proposal.** Add explicit, versioned lineage between dataset images, labeling bundles/jobs, exported labels, dataset splits, and training runs. Current services have useful separate workflows, but moving from label review to a reproducible next training dataset relies on exports and external pipeline conventions. Add adjudication queues, quality sampling/gold tasks, and labeler agreement summaries if these are core user needs.
- **Evidence:** Separate `Dataset`/`DatasetImage`, `LabelBundle`/`LabelJob`/`LabelAnswer`, and `Training` models; `apps/backend/label-service/src/services/exportService.ts`; `apps/backend/vision-service/src/models/Training.ts`.
- **Acceptance:** A user can trace a reported result to the exact dataset/split/annotation version and reproduce the export that created it. Original labels, independent review, and adjudication remain distinguishable.

### 39. Clarify whether “train models” means execution or experiment tracking

- [ ] **P3 — Product decision.** The repository stores training runs/results and expects an external pipeline to generate measurements; no training scheduler/executor was found in the reviewed service routes. The README's “train models” wording can imply execution that the application does not supply.
- **Evidence:** `README.md` introduction; `apps/backend/vision-service/src/routes/trainingRoutes.ts`; `services/trainingService.ts:317–373`; `apps/backend/mcp-service/src/app.ts:38–42`.
- **Fix:** If tracking is the product, describe it accurately and provide a small documented ingestion client/example pipeline with retries and lineage. If execution is required, design scheduling, artifact/checkpoint storage, worker isolation, cancellation, resource quotas, and progress/error reporting as a separately scoped feature.
- **Acceptance:** A new user knows which system actually runs training and can complete one documented dataset → external run → metrics → comparison workflow.

## Engineer skill assessment

**Most defensible assessment: strong mid-level full-stack implementation ability, with some senior-level practices, but inconsistent evidence of senior-level security and production-systems ownership.** Confidence is moderate for the demonstrated code practices and low for any assessment of an individual person.

This is an assessment of this repository snapshot, not a measurement of the author's intelligence, years of experience, hiring suitability, or overall ability. The code may reflect multiple contributors, generated code, legacy constraints, time pressure, and deliberate public-data assumptions. None of those can be reliably inferred from style or comments. Repository authorship alone would not establish who implemented each behavior.

| Area                      | Evidence of strength                                                                                                    | What limits the assessment                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Full-stack delivery       | A coherent product across React, Express, MongoDB, file transfer, labeling, analytics, OAuth/MCP, and deployment        | Important cross-service workflows are not tested as complete user journeys                                       |
| TypeScript and structure  | Strict compiler settings, validation schemas, shared auth/API factories, typed errors, request-scoped access caching    | Repeated HTTP types and `req.user` shortcuts permit inconsistent contracts and authorization                     |
| Domain/problem solving    | Generic taxonomy discovery, deterministic sampling, mask review, resumable transfer, range summaries, generated exports | Blind-review quality, mixed-currency math, lineage, and checkpoint semantics need stronger product reasoning     |
| Testing discipline        | Broad unit test suite and enforced CI coverage floors; meaningful edge-case tests are present                           | Mock-heavy persistence tests and shell-only E2E miss races, topology/config mismatches, and privilege boundaries |
| Security reasoning        | Password hashing, signed URLs, hashed project tokens, scopes, PKCE, token-version concepts, role checks                 | Several individually sound mechanisms compose into authorization bypasses; negative policy tests are incomplete  |
| Reliability/data modeling | Retry-aware import worker, heartbeat/staleness handling, timeout wrapper, useful indexes                                | Read-check-write races, partial updates, inconsistent deletion, missing recovery/restore proof                   |
| Operations                | Workspace CI, pinned action revisions, multi-architecture images, per-app lockfiles                                     | Development exposure, readiness, release qualification, backup procedures, and runtime least privilege need work |

**Why not call this beginner work?** The breadth and implementation detail demonstrate substantial practical knowledge. The shared libraries, ingestion workflow, data-driven taxonomy, and test infrastructure show more than basic CRUD assembly.

**Why not confidently call it senior production engineering?** Senior ownership requires guarantees to hold across endpoints, credentials, concurrent requests, process failure, and deployment topology. Here, the same missing invariant appears repeatedly despite comments and tests. The largest opportunity is stronger reasoning about trust, ownership, atomicity, and recovery, rather than learning another framework.

### Suggested development priorities for the engineer/team

1. Write a principal/resource/action authorization matrix before implementing permission fixes; include anonymous, user, admin, project token, user API key, and OAuth credentials.
2. For each multi-step write, enumerate concurrent calls and interruption points, then define an invariant and recovery mechanism.
3. Turn the reproductions in this report into real integration regressions. Treat coverage percentages as a guardrail rather than proof of correctness.
4. Own one complete workflow from browser through services to persistent state and deployment, including failed/retried operations.
5. Practice domain-specific correctness: independent labeling, meaningful currency totals, explicit checkpoint selection, and reproducible evidence.
6. Replace claimed guarantees in comments with tests and enforced boundaries, retaining concise rationale where it helps future changes.

## Delivery order

1. **Authorization stabilization:** 01 and 03, with the relevant tests from 30; then 06–08, 10, and 18. Public read versus write permission (03) is the next direct application-boundary fix. Shared libraries remain public/non-confidential by explicit policy; their private training association is protected.
2. **Deployment-related observations:** 15 and 17 remain documented, but deployment is owned outside this repository. Preserve the accepted production-domain defaults and existing variables; do not change Compose or require pipeline updates as part of application fixes.
3. **Durability and labeling correctness:** 11–14, 19–23, and 33, using fault/concurrency tests and a real database/queue.
4. **Operational and contract quality:** 24–25, 28–32, and 34–36, with measured performance and a restore drill.
5. **Product expansion:** 37–39 only after validating user demand and stabilizing the foundations.

These are work packages, not time estimates. Size them after the permission policy and persistence strategy are agreed; several items share a root cause and should be fixed together.

## Original review verification

- Reviewed the clean repository snapshot at `987f311`, with no pre-existing tracked modifications.
- Runtime available: Node.js `v26.8.1`, npm `11.19.0`; dependencies were already installed.
- `npm run lint`: passed across all workspaces.
- `npm run typecheck`: passed across all workspaces.
- `npm run sync:libs:check`: passed.
- `npm run lockfiles:check`: passed for all 11 applications.
- `npm test`: the initial full run recorded **3,518 passed and 49 failed** across 13 workspaces. All failures were confined to three HTTP suites that could not open local test-server sockets in the sandbox (`listen EPERM`, followed by setup/test timeouts). Reran only those suites outside that restriction: **49/49 passed**, with exit code 0 for each. Thus all **3,567 tests** have passing results across the full run and targeted reruns; the original sandboxed command itself exited 1. No product-test assertion failures remained.
- Eleven targeted synthetic reproductions succeeded: public-training mutation, A→B token minting, unverified email membership, admin-created owner, double setup, inconsistent JWT revocation, concurrent refresh redemption, unrepaired answer-counter drift, answer beyond K/another lease, concurrent same-offset upload success, and local OAuth audience mismatch.
- Reproduction harness/logs are temporary local review artifacts at `/tmp/visin-review-repro.cjs` and `/tmp/visin-review-repro.log`. Test/lint/typecheck logs are `/tmp/visin-review-tests.log`, `/tmp/visin-review-lint.log`, and `/tmp/visin-review-typecheck.log`; the HTTP suite rerun log is `/tmp/visin-review-http-retest.log`. The defect descriptions and acceptance criteria above are the durable record.
- Not performed: coverage collection, production/container deployment, complete browser workflows, real-database race tests, load tests, recovery drills, dependency vulnerability audit, external penetration testing, or remote CI/branch-protection verification. Their absence is a verification limitation, not evidence that those checks would fail.

## Verification after fixes

- Group ownership: the original admin-created-owner trigger now returns 403 through the shared service boundary. Optimistic saves and conditional permanent deletion return 409 for stale authorization or lifecycle state. Post-mutation checks preserve an effective owner even with legacy duplicate emails. Legitimate admin membership operations, owner handover, activity updates, and deletion/restoration remain covered.
- Group regression tests use `mongodb-memory-server` 11.2.0 with MongoDB 8.2.11. They run automatically with the ordinary tests; no Docker database or external MongoDB configuration is required. The temporary Docker setup used during initial investigation was removed.
- `MONGOMS_DOWNLOAD_DIR=/tmp/visin-mongodb-binaries npm run test:coverage --workspace=group-service -- --runInBand`: **114/114 passed**, with **100% statements, branches, functions, and lines**. This includes 14 real-persistence integration cases. The cache environment variable is local to this verification environment, not a required service setting.
- Repeated all 114 group tests from an isolated `/tmp` copy installed with the service's exact `package-lock.json`: **114/114 passed** with the deployment's Mongoose 9.9.5, in addition to the workspace's Mongoose 9.7.3.
- A fresh read-only patch review found a surviving legacy duplicate-membership case; four new database regressions reproduced it before the final correction and now pass. Earlier regression failures were intentional pre-fix reproductions. Full group logs: `/tmp/visin-group-memory-coverage.log` and `/tmp/visin-group-locked-tests.log`.
- Cost statistics: service regressions verify separate EUR/USD subtotals, no mixed-currency scalar, partial pricing coverage, completely unpriced runs, and valid zero rates. Component tests verify the subtotals and coverage text. Single-currency scalar fields remain compatible; older mixed-currency scalars are suppressed. API documentation explicitly describes these as estimates at current project rates.
- `npm run test:coverage --workspace=vision-service -- --runInBand`: **507/507 passed**; coverage floors passed (97.60% statements, 88.84% branches, 96.74% functions, 98.08% lines). The run included its localhost HTTP tests outside the socket-restricted sandbox. Log: `/tmp/visin-vision-coverage.log`.
- `npm run test:coverage --workspace=vision-front -- --maxWorkers=2`: **1,268/1,268 passed** in 182 files; coverage floors passed (90.79% statements, 80.77% branches, 86.78% functions, 91.82% lines). The initial unrestricted-worker run showed three unrelated timeouts under heavy CPU load and was stopped; the complete limited-worker rerun passed. Log: `/tmp/visin-front-coverage-limited.log`.
- `npm run typecheck`, `npm run lint`, and `npm run build` each passed with `--workspace=group-service`, `--workspace=vision-service`, and `--workspace=vision-front`. `npm run lockfiles:check`, `npm run sync:libs:check`, and `git diff --check` passed. Both lockfiles preserve existing dependency versions; only the new test dependency tree was added. The edited OpenAPI document also passed YAML parsing.
- First-run bootstrap: **fixed**. Setup inserts the administrator and a unique bootstrap marker as one document. Startup explicitly creates indexes before listening, including when automatic indexing is disabled. This closes simultaneous setup without requiring transactions or a replica set. Ordinary registration waits for an existing account; OAuth optional authentication requires an existing matching identity and token version and never recreates a missing user.
- Bootstrap recovery preserves random account IDs: interrupted requests can retry before insertion or sign in after insertion, including a lost database acknowledgement. The local `recover:admin` command restores the admin role on an explicitly selected existing account, preserving its password and other roles. Legacy nonempty instances stay closed to public setup. Implementation and operator instructions are in `apps/backend/auth-service/src/services/bootstrapService.ts`, `src/models/User.ts`, `src/controllers/authController.ts`, `src/middleware/authMiddleware.ts`, `src/index.ts`, `src/scripts/recoverAdmin.ts`, `README.md`, and `docs/openapi.yml`.
- Bootstrap validation: three original failures reproduced before the fix (multiple administrators, registration consuming setup, and an old OAuth session recreating the first account). They now pass with 12 in-memory MongoDB integration cases covering concurrency, interruption, recovery, legacy accounts, and valid/revoked Google sessions. Controller/middleware regressions and six command tests cover legitimate password registration/login, recovery errors, and connection cleanup. The fresh read-only candidate review found no concrete surviving bypass or introduced regression.
- `MONGOMS_DOWNLOAD_DIR=/tmp/visin-mongodb-binaries npm test --workspace=auth-service -- --runInBand --runTestsByPath src/__tests__/integration/bootstrap.test.ts src/__tests__/controllers/passwordAuth.test.ts src/__tests__/middleware/authMiddleware.test.ts src/__tests__/scripts/recoverAdmin.test.ts`: **48/48 passed**. `MONGOMS_DOWNLOAD_DIR=/tmp/visin-mongodb-binaries npm run test:coverage --workspace=auth-service -- --runInBand`: **205/205 passed**, with coverage floors passed (99.34% statements, 93.90% branches, 100% functions, 99.43% lines). Bootstrap service, recovery command, and auth middleware each have 100% coverage. Logs: `/tmp/visin-bootstrap-before.log`, `/tmp/visin-bootstrap-focused.log`, `/tmp/visin-bootstrap-coverage.log`.
- Auth `npm run typecheck`, `npm run lint`, and `npm run build` each passed with `--workspace=auth-service`; lockfile consistency, shared-library version checks, OpenAPI YAML parsing, and `git diff --check` passed. Repeated all **205 auth tests** and the build in an isolated `/tmp` copy using `npm ci --ignore-scripts` with the service's deployment lockfile and published shared library: **passed** with Mongoose 9.9.5, alongside workspace verification with 9.7.3. Logs: `/tmp/visin-auth-locked-tests.log`, `/tmp/visin-auth-locked-build.log`. Auth persistence tests also use `mongodb-memory-server` 11.2.0 / MongoDB 8.2.11 automatically, without a separate database service.
- Finding pagination: **fixed**. The original database fixture returned zero rows with 101 newer private findings ahead of 55 visible findings; it now returns a full 50-row visible page. `findingService.ts` applies `getVisibleProjectIds` before sorting/limiting, preserves project slug/ID and subject-or-citation filters, and uses `(createdAt, _id)` descending cursor pagination. The response data remains an array. The cursor parser rejects malformed dates and IDs; a cursor never substitutes for current visibility. The model adds a compound index for visible-project pages.
- Ten automatic in-memory MongoDB integration cases cover the original missing-results trigger, multiple full pages without omissions/duplicates, equal timestamps and older dates, insertion between pages, deletion of the cursor row, soft deletion, anonymous/public/private access, permission changes, subject/citation filters, and invalid query/cursor input. The expanded timestamp fixture passed a final targeted rerun. Tests use `mongodb-memory-server` 11.2.0 / MongoDB 8.2.11 with no separate database service.
- The analysis panel now loads older findings, retains displayed rows when a page fails, and retries the same cursor. Its tests also verify duplicate suppression and stopping when an older API ignores pagination. MCP `list_findings` accepts and supplies continuation cursors and distinguishes the end of pagination from an initially empty list. Frontend service parameters, operator README, and the OpenAPI list contract were updated. Pagination reapplies current visibility rather than providing a snapshot; refresh to see new or newly visible findings above the cursor.
- Focused findings checks passed: **38 backend tests**, **35 frontend tests**, and **22 MCP tests**. Logs: `/tmp/visin-finding-before.log` (intentional pre-fix failure), `/tmp/visin-finding-focused.log`, `/tmp/visin-finding-front-focused.log`, `/tmp/visin-finding-mcp-focused.log`, and `/tmp/visin-finding-final-integration.log`.
- Full findings-package verification passed: `MONGOMS_DOWNLOAD_DIR=/tmp/visin-mongodb-binaries npm run test:coverage --workspace=vision-service -- --runInBand` — **517/517 tests**, coverage 97.60% statements / 88.88% branches / 96.75% functions / 98.09% lines; `npm run test:coverage --workspace=mcp-service -- --runInBand` — **254/254 tests**, coverage 97.02% / 91.58% / 97.61% / 97.39%; `npm run test:coverage --workspace=vision-front -- --maxWorkers=2` — **1,271/1,271 tests in 182 files**, coverage 90.83% / 80.82% / 86.86% / 91.84%. All existing coverage floors passed. Logs: `/tmp/visin-finding-back-coverage.log`, `/tmp/visin-finding-mcp-coverage.log`, `/tmp/visin-finding-front-coverage.log`.
- `typecheck`, `lint`, and `build` passed for vision-service, vision-front, and mcp-service. Lockfile consistency, shared-library version consistency, OpenAPI YAML parsing, and `git diff --check HEAD` passed. Existing deployment dependency versions were preserved. The **38 focused backend tests and build** also passed in an isolated copy installed with the service's deployment lockfile and published shared library (Mongoose 9.9.5), in addition to workspace verification with 9.7.3. Logs: `/tmp/visin-finding-locked-tests.log`, `/tmp/visin-finding-locked-build.log`.
- OAuth/Compose changes and the cross-service OAuth test were reverted by the user. They are not part of the current fix set. Tests remain in their respective projects; existing production URL defaults are accepted, and this repository does not own service deployment. No new deployment variables or pipeline changes are planned.
- Project-token isolation (02): **fixed** in vision-service. Verified project credentials carry request-local scope through service authorization; lists, statistics, direct reads/writes, distinct values, parent replacements, comparison/finding/benchmark references, and training-deletion comparison cleanup stay inside the token project. Project and credential administration reject project credentials explicitly. Missing/unscoped parents fail closed. Global dataset/config libraries retain their existing policy.
- Epoch ordinary/batch ingestion now derives the UUID from its resolved training. Visualization queries for project credentials use canonical training IDs. ObjectId-shaped project references cannot be reinterpreted through a colliding slug. The fresh independent review identified the slug-collision and benchmark-epoch-reference gaps; both were reproduced with failing integration tests and fixed.
- Project-token verification: **539/539 vision-service tests**, including **22 HTTP integration cases with in-memory MongoDB**, passed; coverage **98.26% statements / 91.48% branches / 97.87% functions / 98.70% lines**, above all existing floors. Lint, type checking, build, and diff whitespace checks passed. Full log: `/tmp/visin-project-scope-final-coverage.log`. The 22 integration cases and build also passed against the existing isolated deployment-lockfile installation; logs: `/tmp/visin-project-scope-locked-tests.log` and `/tmp/visin-project-scope-locked-build.log`. Tests use only the owning project's declared dependencies and normal test command; no extra root command, environment setting, shared-library release, Compose, or pipeline change was introduced.
- Independent file-upload investigation confirmed item 14 remains open: both public/internal writes target published files, pathname-based download stat/open can select different file versions, and current clients trust 409 offsets as completion progress. A complete fix must keep committed upload progress separate from final-file size, coordinate across processes, bind metadata/read streams to one file descriptor, and recover interruption around publication. No partial locking patch was applied.
- Training-config privacy and shared-library policy (09): **fixed**. The relationship endpoint now uses the existing live-training read boundary with optional authentication and forwarded identity. Anonymous/unrelated requests cannot inspect private associations, even when no config is attached; deleted/missing trainings return 404. Owners, public viewers, standalone trainings, empty/dangling references, and project-token constraints retain their intended behavior.
- The existing public/non-confidential library policy is explicit in all project privacy controls, training attachment selectors, config/dataset upload screens, README, and OpenAPI. Configs, dataset analyses, images, and archives remain publicly available when selected by private projects. Upload guidance requires removing secrets before ingestion; arbitrary payloads are not automatically redacted. The endpoint's documented response now matches `{ configs, total }` and its authentication methods. Broader private library ownership is not introduced.
- Final validation for 02 and 09: **546/546 vision-service tests** in 28 suites, including **29 HTTP integration cases using in-memory MongoDB**; coverage **98.26% statements / 91.51% branches / 97.87% functions / 98.69% lines**, all floors passed. **64/64 affected vision-front tests** passed in seven files. Both workspaces passed lint, type checking, and build; OpenAPI parsing/references and `git diff --check HEAD` passed. The two backend integration suites (**29 tests**) and build also passed against the service's pinned dependency installation. The fresh privacy candidate review found no concrete surviving bypass or introduced regression.
- Logs: `/tmp/visin-config-privacy-before.log` (three reproduced pre-fix failures), `/tmp/visin-config-privacy-coverage.log`, `/tmp/visin-config-privacy-front.log`, `/tmp/visin-config-privacy-front-build.log`, `/tmp/visin-config-privacy-locked-tests.log`, `/tmp/visin-config-privacy-locked-build.log`. No live deployment, external database, or pipeline modification was involved.

- Group-based write policy (03): project owners assign `editorGroupIds` in Project Settings; current members can read private projects and create/modify their trainings and results. Project settings, deletion, and token administration remain owner-only. Standalone trainings/comparisons/benchmarks and shared libraries use creator ownership; unowned records stay read-only. No compatibility fallback or migration command was added; existing records will be migrated by the user.
- Service guards now distinguish reading from writing across trainings, epochs, test results, benchmarks, comparisons, visualizations, findings, analyses, image categories, images, configs, and datasets. Browser controls use per-resource server capabilities. Group memberships are resolved per request through a purpose-bound signed lookup using the existing JWT secret; both new endpoints use route/controller/service separation. No OAuth, Compose, deployment-variable, pipeline, or package-script changes were made for this work.
- File-reference protection completed alongside 03: new stored-file attachments require single-resource reservations with uploader/family/parent checks and stored-size verification. Stolen, expired, conflicting, and concurrently replayed attachments are rejected. The independent candidate review found two regressions, both fixed and covered: public comparison viewing no longer attempts a write, and archive replacement clears stale aliases while preserving analysis metrics. Remaining upload-content limits and reconciliation are tracked in 08.
- Backend validation for the group write policy: **580/580 vision-service tests** in 30 suites, coverage **98.15% statements / 91.62% branches / 97.78% functions / 98.84% lines**; **121/121 group-service tests** in nine suites with **100% coverage**, all configured floors passed. Persistence tests use in-memory MongoDB. The permission/client/project-token suites also passed **56/56 tests** against vision-service's pinned dependencies, along with its build. All three affected workspaces passed lint, type checking, and builds. OpenAPI YAML/references and whitespace checks passed.
- Frontend validation for 03: **1,278/1,278 vision-front tests** in 183 files, coverage **90.82% statements / 80.76% branches / 86.78% functions / 91.84% lines**, all configured floors passed. The nine Project Settings tests also passed after isolating the group-picker cache by project owner. Completed item **03** has been removed from the remaining backlog.
