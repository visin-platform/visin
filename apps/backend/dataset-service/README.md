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
POST /api/datasets/:id/archive/upload-url  { filename, size?, lastModified? } → signed chunked PUT to file-service
DELETE /api/datasets/:id/archive/upload                   → discard an interrupted upload and its partial bytes
POST /api/datasets/:id/archive/complete                   → swaps the zip in, queues reading its index
POST /api/datasets/:id/import  { groups: [{ folder, group }], manifest? }
DELETE /api/datasets/:id/import                           → cancel
POST /api/datasets/:id/archive/scan                       → re-measure and re-index a stored zip
```

Reading a zip's index (`contents`) runs on the same queue as imports, so the
uploader can close the browser as soon as the last byte is sent. The dataset's
`scan` reports `queued`/`running`/`done`/`failed`; a newer upload supersedes a scan
still running for the old zip. `complete` only needs the file to be stored, so a
browser that left before calling it can call it later.

**Resuming.** An interrupted upload stays on the dataset as `uploading`. Asking
for an upload URL for the same file again (same name, size and modification
time) returns the same reservation: file-service answers the first chunk with
the offset it already holds, and the client continues from there. If every byte
had arrived, the answer is `uploaded: true` and only `complete` is left. A
different file starts a new reservation and deletes the abandoned one's bytes.

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
- **Cancellation** stops the import at its next heartbeat. What it had stored
  stays and shows (counts, groups, cover), as it does for an import that failed.
- **Resume**: `POST /api/datasets/:id/import/resume` queues a cancelled or failed
  import again under its own id, so the worker skips every file it already
  stored. Refused once the zip has been replaced; import anew then.

### Archive resource limits

Defaults are 50 MiB per expanded entry, 10 GiB compressed input, 50 GiB expanded
across everything the mapping takes, 500,000 entries, 64 MiB of central-directory
records and 1 MiB per JSON sidecar. `DATASET_IMPORT_MAX_ENTRY_BYTES`,
`DATASET_IMPORT_MAX_ENTRIES` and `DATASET_IMPORT_MAX_JSON_BYTES` override the ones
a deployment outgrows; each must be a positive safe integer. The container needs
temporary disk for the largest zip it will import.

### Deleting

`DELETE /api/datasets/:id` answers `202` at once: it marks the dataset
(`deletingAt`), which hides it from every reader and refuses new holds, cancels a
running import, and queues a `delete` job. The worker removes the files (one
folder delete in file-service, which retires them in bulk), the item rows, and
the record last — so an attempt that dies part-way leaves the mark, and startup
queues every marked dataset again.

### Removing one image group

`DELETE /api/datasets/:id/groups/:group` answers `202`: the group goes on
`removingGroups`, which leaves it out of the dataset's groups, counts and item
listings (public and internal) at once, and a `remove-group` job deletes its
files (file-service's batch `POST /internal/delete-files`) and rows a thousand at
a time, then recounts, re-picks the cover and drops the group from the recorded
mapping. Refused while a labeling job holds the dataset or an import runs; an
import waits until the removal is done. Like deletions, unfinished removals are
queued again at startup.

### Cover image

The dataset card shows an automatic cover (the first frame) unless someone
picks one: `PUT /api/datasets/:id/cover { itemId }`, or `{ itemId: null }` to go
back. The pick is kept by path (`coverPath`), so a re-import that stores the
same image again keeps it; one the new images no longer hold is forgotten.

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
