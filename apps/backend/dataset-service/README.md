# dataset-service

Datasets: a zip bundle to download, and the images imported out of it to browse.
Used by vision-front's dataset screens and by label-service, whose jobs are built
on a dataset's images.

- Port: `5010`
- Stack: Express + TypeScript + Mongoose + BullMQ, bootstrapped from `@visin/backend-core`
- Auth: JWT `access_token` cookie, `Authorization: Bearer`, or a user API key with
  the `dataset` scope. `/internal/*` is service-to-service only (`X-Internal-Token`).
- Storage: every byte lives on disk behind file-service; this service keeps the
  metadata and uses a bounded temporary file while extracting an archive.

## What a dataset is

```
name, description, visibility (public | group)
archive      the uploaded .zip — always downloadable whole
contents     what the zip holds: file types, folders, counts (read from its index)
groups       image groups imported out of it, with counts
items        one row per imported file
```

Every dataset has the zip. Images are optional: a bundle nobody has mapped still
downloads and still says what is inside it.

## Upload, then map, then import

```
POST /api/datasets/:id/archive/upload-url  { filename }   → signed chunked PUT to file-service
POST /api/datasets/:id/archive/complete                   → reads the zip index into `contents`
POST /api/datasets/:id/import  { groups: [{ folder, group }], manifest? }
DELETE /api/datasets/:id/import                           → cancel
POST /api/datasets/:id/archive/scan                       → re-measure and re-index a stored zip
```

The mapping says which zip folders become image groups. A mapped folder takes
everything beneath it and the deepest mapped folder wins, so `annotations` and
`annotations/verify` can be separate groups. Only images and JSON are stored;
anything else stays in the zip, which is still downloadable in full.

**Names carry meaning across groups.** `0001.png`, `0001.ids.png` and
`0001.masks.json` share the stem `0001` with variants none, `ids` and `masks`.
That is how the dataset page shows every view of one frame together, and how a
labeling job finds a frame's overlay, its id map and its masks.

**Images are stored exactly as they came out of the zip.** An id map's pixel
values are mask ids; re-encoding one would silently change what past labeling
answers mean.

### Import

`POST /api/datasets/:id/import` writes the mapping to the dataset and hands the id
to a BullMQ queue backed by Redis (`REDIS_URL`); a worker in the same process picks
it up (`src/queue/`). An import routinely runs for hours, far past the HTTP
response, so it cannot live in the request.

- **Progress** lands on the dataset's `import`, which the client polls.
- **Only mapped entries are decompressed** — a mapping that takes the camera
  frames never expands the lidar next to them.
- **Its own folder**: each import writes under `<prefix>items/<importId>/`, so
  replacing one is a single folder delete.
- **Retries**: three attempts with exponential backoff. Import is idempotent
  (paths already stored are skipped), so an attempt resumes where a dead one
  stopped. An archive-limit violation is `NonRetryableImportError`, which the
  worker turns into BullMQ's `UnrecoverableError` rather than re-downloading a zip
  that will fail identically.
- **Cancellation** stops the import at its next heartbeat and removes what it had
  stored, so a cancelled import leaves nothing half-imported behind.

### Archive resource limits

Defaults are 50 MiB per expanded entry, 10 GiB compressed input, 50 GiB expanded
across everything the mapping takes, 500,000 entries, 64 MiB of central-directory
records and 1 MiB per JSON sidecar. `DATASET_IMPORT_MAX_ENTRY_BYTES`,
`DATASET_IMPORT_MAX_ENTRIES` and `DATASET_IMPORT_MAX_JSON_BYTES` override the ones
a deployment outgrows; each must be a positive safe integer. The container needs
temporary disk for the largest zip it will import.

## Who can see and change a dataset

Public datasets are readable by anyone, group datasets by that group. The uploader
can always change one; for a group dataset so can that group's owners and admins.

**Holds.** Another service claims a dataset while it depends on its files:

```
PUT    /internal/datasets/:id/holds/:service/:ref
DELETE /internal/datasets/:id/holds/:service/:ref
```

label-service takes one per job. While any hold exists, deleting the dataset,
replacing its zip and re-importing are refused — those delete files a labeling
task is showing.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=dataset-service
npm test --workspace=dataset-service
```

Copy `.env.example` to `.env` and fill in the secrets (the JWT secret must match
auth-service; `INTERNAL_SERVICE_TOKEN` must match group-service and label-service).
The import queue needs Redis: `docker compose up -d mongodb redis` at the repo root
starts it alongside MongoDB, matching the default `REDIS_URL`.

Redis is shared infrastructure, not owned by this service. Run it with
`appendonly yes` and `maxmemory-policy noeviction`: a queued import lives only in
Redis until a worker takes it, so an eviction or an unsaved restart would strand it
at `queued`.
