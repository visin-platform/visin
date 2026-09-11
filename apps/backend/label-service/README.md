# label-service

Backend for the Visin labeling platform: label bundles (uploaded image sets), labeling
jobs, tasks, answers, and export.

- Port: `5008`
- Stack: Express + TypeScript + Mongoose, bootstrapped from `@visin/backend-core`
- Auth: JWT `access_token` cookie or `Authorization: Bearer`. Group members can
  read their jobs; outsiders can read only explicitly published, active jobs.
- Storage: image/zip bytes live on disk behind file-service (internal API); this
  service persists metadata and uses bounded temporary files while importing archives.

## Job visibility

New jobs are group-private, including after activation. Group owners/admins can
change sharing with `PUT /api/jobs/:id/visibility` and `{ "isPublic": true }` or
`false`, also available on the job detail page. Missing publication state is private.
Public jobs expose their definition, progress, anonymous results, and frames only
while active. Pausing, completing, archiving, or disabling sharing closes public
reads. Members retain review access to all statuses; completed-job answer revisions
and undo keep their existing rules. Labeling still requires current membership.

Detail, statistics, direct task IDs, and frame indices enforce the same rule before
reading content or issuing image URLs. Revocation is checked again on each request.
Previously issued signed image URLs remain usable until their existing expiry
(up to one hour); downloaded/cached content cannot be recalled.

## Bundle import

A bundle zip is uploaded (signed PUT to file-service), then imported in two calls:

```
POST /api/bundles/:id/import/preview  { zipFileId }        → folders + suggested mapping
POST /api/bundles/:id/import          { zipFileId, mapping? } → ImportJob (poll for progress)
```

`preview` walks the zip without extracting it and reports what each folder holds; the
client shows that as the mapping table and posts back an `ImportMapping`
(`frames`, `annotations: [{ path, set }]`, `manifest`, and the `idsSuffix` /
`masksSuffix` file-name patterns). Omitting `mapping` falls back to the default layout —
`frames/`, `annotations/<set>/` (legacy `ann/` still accepted), `manifest.csv|jsonl` —
so a conventional bundle needs no mapping at all. Both paths run through
`utils/bundlePaths.ts`, the single definition of what a zip entry means.

### Archive resource limits

Ingest downloads compressed input to a private temporary file and expands entries
one at a time. Defaults are 50 MiB per expanded entry, 10 GiB compressed input,
10 GiB total expanded data, 100,000 entries, 16 MiB of central-directory records,
and 8 MiB of combined manifest/mask JSON input retained during an import.
Per-file diagnostics stop at 1,000 records or 1 MiB of path/reason text so the
terminal report stays small enough to persist. All
entries count, including ignored paths and directory payloads. Existing
`INGEST_MAX_ENTRY_BYTES` and `INGEST_MAX_ENTRIES` overrides must be positive safe
integers; no additional environment variables are required.

Exceeding a limit stops the entire import without retrying the same archive.
Previously stored images remain available for the existing resume workflow.
Download progress refreshes the import heartbeat before extraction starts.
Streams are closed and the temporary file is removed on completion, failure, or
consumer cancellation. Each concurrent import may temporarily use up to 10 GiB of
local disk; these per-import limits do not enforce file-service upload quotas.
Abrupt process termination can leave temporary files for operational cleanup.

### The import queue

`POST /api/bundles/:id/import` creates the `ImportJob` document and hands the id to a
BullMQ queue backed by Redis (`REDIS_URL`); a worker in the same process picks it up
(`src/queue/`). The ingest routinely runs for minutes, far past the HTTP response, so
it cannot live in the request — and a redeploy mid-ingest has to leave the work
somewhere durable rather than dropping it.

- **Progress** still lands on the `ImportJob` the client polls. Nothing about the API
  changed; only where the work runs.
- **Retries**: three attempts with exponential backoff. Ingest is idempotent (already
  imported paths are skipped), so an attempt resumes where the dead one stopped.
  `runImport` therefore records a fatal error and rethrows rather than marking the job
  failed — the worker owns that verdict, because flipping the document to `failed`
  between attempts would tell the polling client the import is over when it isn't.
  An archive limit violation throws `NonRetryableIngestError`, which the worker turns into
  BullMQ's `UnrecoverableError` so the budget isn't spent re-downloading it.
- **Crashes**: BullMQ redelivers a job whose worker died (twice, then it fails for
  good). The `updatedAt` heartbeat and the `IMPORT_STALE_MINUTES` window in
  `bundleService` remain as the backstop for anything the queue loses.
- **Cancellation**: superseding a stale import, deleting an import, and deleting a
  bundle all call `removeQueuedImport`, so nothing gets picked up later and run
  against a bundle that has moved on.
- **Redis down**: `startImport` fails the `ImportJob` it just created and returns 502
  rather than leaving it at `pending` with nothing to run it.

Redis is shared infrastructure, not owned by this service — the root `compose.yml`
runs one, and a deployment can point `REDIS_URL` at any instance. Run it with
`appendonly yes` and `maxmemory-policy noeviction`: a queued import lives only in
Redis until a worker takes it, so an eviction or an unsaved restart would strand its
`ImportJob` at `pending`.

## Changing a bundle

`PATCH /api/bundles/:id` edits `name` / `description` only. Imported images are
immutable by design: `LabelTask` rows point at `LabelImage` ids and answers point at
tasks, so overwriting an image would silently change what an already-labelled task
showed. Grow a bundle by uploading another zip (ingest skips paths already imported),
ship corrected annotations as a *new* set name rather than replacing one, and delete a
bundle only before any job uses it — `deleteBundle` refuses while a non-archived job
references it. `groupId` is not editable; moving a bundle would change who can see
every job drawing from it.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-service
npm test --workspace=label-service
```

Copy `.env.example` to `.env` and fill in secrets (JWT secret must match auth-service).
The import queue needs Redis: `docker compose up -d mongodb redis` at the repo root
starts it alongside MongoDB, matching the default `REDIS_URL`.
