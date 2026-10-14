# label-service

Backend for the Visin labeling platform: annotation jobs, frames, the boxes and masks
annotators draw on them, and export and import of those labels in the usual formats.
The images a job shows come from a dataset in dataset-service.

- Port: `5008`
- Stack: Express + TypeScript + Mongoose, bootstrapped from `@visin/backend-core`
- Auth: JWT `access_token` cookie or `Authorization: Bearer`. Group members can
  read their jobs; outsiders can read only explicitly published, active jobs.
- Storage: masks are the only bytes it writes, as one small PNG per labeled frame
  under `label/<jobId>/` in file-service. A task carries the file ids of the frame and
  sensors it shows, and this service signs them through file-service.

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

A dataset has its own visibility in dataset-service (public, or one group). A
published job serves its frames to anyone through signed URLs, because the job
was published; that does not make the dataset itself readable there.

## What a job is

A job asks annotators to **draw** on the frames of a dataset: boxes, and a semantic
mask (one class per pixel). It is built from the dataset's image groups, joined by
file stem:

```
POST /api/jobs                  { datasetId, sensors: [...], classes: [...], redundancy? }
POST /api/jobs/:id/materialize  { kind: 'manifest' | 'filter', ... }
GET  /api/me/datasets           datasets this caller can build a job on
```

- **`sensors`**: exactly one `camera` (an image group, the frames annotators label) and
  optionally `lidar` and `radar`, each a dataset group. A sensor is `kind: 'image'`
  (`0001.png`) or `'points'` (a JSON sidecar of `[{ u, v, range }]` or `[[u, v, value]]`
  per frame). **LiDAR and radar are overlays**: they must be projected into the camera's
  pixel space — the same width and height, lined up — because labels are drawn once, in
  camera coordinates. A `variant` picks `0001.lidar.png` out of a group that also holds
  the camera. A point sidecar is imported by dataset-service like any JSON, so one larger
  than its 1 MiB limit (`DATASET_IMPORT_MAX_JSON_BYTES` there) is skipped at import; a frame
  shows at most 20,000 points (`MAX_POINTS_PER_FRAME`).
- **`classes`**: a `name`, whether it takes a `box`, a `mask` or both, and optionally a
  colour, hotkey and the name a detector knows it by. The server fills in the key, a
  colour, a hotkey (1–9 by position) and the class's **`maskIndex`**, the pixel value
  it has in a mask. Mask indexes are fixed when a class is created and never reused, so
  a stored mask keeps its meaning when classes are added.

**Materialization copies what a task shows.** `materializeTasks` reads the dataset's
items once, then stores the frame's file id, path, stem and size on the task, along with
each sensor's file id (or its points). Serving a task is then one query here and never a
call to dataset-service — which matters because that path runs for every frame an
annotator sees. It also means a task keeps showing the same image even as the dataset
moves on.

**A job holds its dataset.** Creating a job claims the dataset
(`PUT /internal/datasets/:id/holds/label-service/:jobId` in dataset-service);
deleting the job releases it after task cleanup. While a hold exists, that dataset
cannot be purged, re-imported or have its zip replaced — its files are what the
tasks show. Creation persists an internal `creating` intent before claiming the
dataset and exposes the draft only after confirmation. An uncertain request,
including a lost acknowledgement, retains the intent and retries the same hold
reference; the recovered draft may appear in the manager's job list later.

Deletion persists a `deleting` intent and hides the job before removing its files,
labels, suggestions and tasks. Only then does it release the dataset hold and
remove the job record. Failed stages remain retryable. Recovery runs at startup
and every minute with per-job ownership tokens; a crashed operation's lease
expires after ten minutes. These timings are code constants. Existing jobs with
no lifecycle field continue to work without a migration.

Task materialization now fences publication against activation and deletion, and
an expired build's late rows remain inaccessible and are collected by recovery.
Mask uploads and label imports that began before deletion still need operation
fencing. Historical orphan holds also need separate reconciliation; see item 4
in the repository's `todo.md`.

## Labels

```
POST /api/jobs/:id/next                    the next frame for this annotator (leases it)
GET  /api/tasks/:id                        a frame by id
PUT  /api/jobs/:id/model-mapping           { mapping: { jobClassKey: modelClassName | null } }
GET  /api/jobs/:id/tasks/at/:index         a frame by position (stepping back and forward)
PUT  /api/tasks/:id/annotation             { objects, elapsedMs? }   autosave of the boxes
PUT  /api/tasks/:id/annotation/mask        the mask, as run-length bytes (below)
DELETE /api/tasks/:id/annotation/mask      clear it
POST /api/tasks/:id/annotation/done        finish the frame (counts toward the job)
POST /api/tasks/:id/annotation/skip        not this one — not counted, not offered again
```

- **One annotation per annotator per frame** (`label_annotations`). Autosave replaces
  the whole box list; a `done` frame stays done while it is edited. With `redundancy`
  K a frame is finished once K annotators have done it; exports take the most recently
  finished set. Concurrent Done requests and imports count each annotator only once.
- **Model class mappings** may be changed by the job's managers, including after activation.
  Each class has one optional detector name (`modelClass`); null restores name matching.
  Updates preserve class keys, mask values and existing labels. Unknown keys and duplicate explicit
  names for box classes are refused.
- **Boxes** are `[x, y, width, height]` in the frame's pixels, clamped to the frame. A
  box says where it came from (`human`, `model`, `import`), which is how acceptance of
  suggestions can later be measured.
- **The mask** travels as run-length bytes, not a PNG: `"VMSK"`, version `1`, width and
  height (`u32le`), then `(value u8, length LEB128)` runs. A 1080p mask is a few hundred
  bytes to a few kilobytes that way, small enough for every autosave, and the server —
  which writes the grayscale PNG, one class index per pixel, `0` unlabeled — can check
  size and values before storing anything. Each save is a new file and the one it
  replaces is removed after, so a failed upload leaves the old mask intact.
- **Suggestions** (`label_suggestions`) are labels waiting for confirmation: an import,
  or an old job's masks. They are not annotations, count toward no progress, and are
  offered only on a frame the annotator has not started.

The editor's autosave sends about one request a second while someone draws. Behind a
shared address that is well inside the default `RATE_LIMIT_PER_MINUTE` (500) for a
person, but a classroom behind one NAT may want it raised.

## Formats

Labels leave and enter as a zip in a format other tools read. One module per format
in `src/formats/`, each with the same two halves — write a job's frames out, read a
bundle back — so a new format is one file.

| id | Format | Boxes | Masks |
|---|---|---|---|
| `yolo` | `labels/<stem>.txt` (class cx cy w h, normalised) + `data.yaml` | ✓ | — |
| `coco` | `annotations.json`; masks as one RLE region per class per image | ✓ | ✓ |
| `voc` | Pascal VOC `Annotations/*.xml` + `SegmentationClass/*.png` (palette) + `labelmap.txt` | ✓ | ✓ |
| `semantic-png` | `masks/<stem>.png` + `classes.json` (Cityscapes style) | — | ✓ |
| `visin` | `annotations.jsonl` + masks + `job.json`: lossless | ✓ | ✓ |

```
GET  /api/jobs/formats                          the table above, from the modules
GET  /api/jobs/:id/export?format=yolo&include=done|all     a zip (or format=manifest)
POST /api/jobs/:id/import?dryRun=true&as=suggestions|done&classMap=<json>   body: the zip
```

- **Export** streams one frame at a time (a mask is fetched, converted and written
  before the next is read), so a large export never sits in memory. A frame finished
  with nothing drawn is exported with no objects: that is the negative example a
  detector needs.
- **Import** detects the format from the archive (or takes `format=`), matches its
  frames to the job's by file stem and its classes to the job's by name, and answers
  with what it found. `dryRun=true` stores nothing, so a dialog can show the match
  first; the real request then carries `classMap` — each imported class to a job class
  key, `"+"` to add it as a new class, or `null` to leave it out. Archives of other
  tools' labels are read, not trusted: entries are size-capped, nothing is extracted to
  disk, and a hostile zip cannot inflate without bound.
- Importing **as done** preserves explicitly empty frames as negative training
  examples. Labels dropped by class mapping or malformed input do not mark a frame done.
- The body is spooled to a temporary file (at most 1 GiB, `src/limits.ts`) and
  the request is sent twice — once to look, once to import — which keeps the server
  free of half-finished imports.

Zip and PNG handling is on `node:zlib` alone (`src/utils/`), so the service carries no
image or archive dependency.

## Changing a job's images

You cannot: tasks are immutable once materialized, because labels point at tasks.
Re-map or re-import the dataset and build a new job from it. Materializing again
is draft-only and replaces the whole task set.

Replacement builds a separate generation in batches of 100, preserving the
current tasks and labels until one conditional Mongo update publishes the new
generation, count and selection together. Activation, deletion and another
materialization are refused while a build owns the job. A ten-minute lease,
renewed before each batch, allows recovery after a crash. Late publication from
an expired build is refused.

Every task read, position, progress query, import and export selects the published
generation. Retired tasks, their annotations/suggestions and their mask files are
collected at startup and every minute, with failed file cleanup retried. Existing
jobs with no generation keep their current tasks until their first replacement;
no database migration or replica-set transaction is needed. A lost publication
acknowledgement can fail the request even though the new set was published;
reloading shows the committed generation.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-service
npm test --workspace=label-service
```

Copy `.env.example` to `.env` and fill in secrets (the JWT secret must match
auth-service, and `INTERNAL_SERVICE_TOKEN` must match group-service and
dataset-service). `DATASET_SERVICE_URL` points at dataset-service; `docker compose
up -d mongodb` at the repo root covers the database.
