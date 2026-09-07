# label-service

Backend for the Visin labeling platform: label bundles (uploaded image sets), labeling
jobs, tasks, answers, and export.

- Port: `5008`
- Stack: Express + TypeScript + Mongoose, bootstrapped from `@visin/backend-core`
- Auth: every `/api` route requires a signed-in user (JWT `access_token` cookie or
  `Authorization: Bearer`); there are no anonymous or public data routes.
- Storage: image/zip bytes live on disk behind file-service (internal API); this
  service stores metadata only.

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
  A structurally bad zip throws `NonRetryableIngestError`, which the worker turns into
  BullMQ's `UnrecoverableError` so the budget isn't spent re-downloading it.
- **Crashes**: BullMQ redelivers a job whose worker died (twice, then it fails for
  good). The `updatedAt` heartbeat and the `IMPORT_STALE_MINUTES` window in
  `bundleService` remain as the backstop for anything the queue loses.
- **Cancellation**: superseding a stale import, deleting an import, and deleting a
  bundle all call `removeQueuedImport`, so nothing gets picked up later and run
  against a bundle that has moved on.
- **Redis down**: `startImport` fails the `ImportJob` it just created and returns 502
  rather than leaving it at `pending` with nothing to run it.

Redis is shared infrastructure (`apps/infra/redis/`), deployed on its own from the
"Deploy Infrastructure Service" workflow and reached over `visinnet`. It runs with
`appendonly yes` and `maxmemory-policy noeviction` on purpose: a queued import lives
only in Redis until a worker takes it, so an eviction or an unsaved restart would
strand its `ImportJob` at `pending`.

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
