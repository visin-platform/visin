# label-service

Backend for the Visin labeling platform: labeling jobs, tasks, answers and export.
The images a job shows come from a dataset in dataset-service.

- Port: `5008`
- Stack: Express + TypeScript + Mongoose, bootstrapped from `@visin/backend-core`
- Auth: JWT `access_token` cookie or `Authorization: Bearer`. Group members can
  read their jobs; outsiders can read only explicitly published, active jobs.
- Storage: no bytes of its own. A task carries the file ids of the frame, layers
  and id map it shows, and this service signs them through file-service.

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

## Datasets

A job is built on a dataset: `datasetId`, the dataset image group holding the
frames (`framesGroup`), and the groups whose layers are drawn over them
(`annotationSets`). Within an annotation group the file-name variants mean what
they always have — `0001.png` is the layer, `0001.ids.png` the id map whose pixel
values are mask ids, `0001.masks.json` those masks' metadata.

```
POST /api/jobs                  { datasetId, framesGroup, annotationSets, ... }
POST /api/jobs/:id/materialize  { kind: 'manifest' | 'filter', ... }
GET  /api/me/datasets           datasets this caller can build a job on
GET  /api/me/datasets/:id/mask-fields?set=  groupable mask fields, for slicing a job
```

**Materialization copies what a task shows.** `materializeTasks` reads the
dataset's items once, then stores the frame's file id, path, stem and size on the
task, along with each layer's file id and the selected masks. Serving a task is
then one query here and never a call to dataset-service — which matters because
that path runs for every frame a labeler sees. It also means a task keeps showing
the same image even as the dataset moves on.

**A job holds its dataset.** Creating a job claims the dataset
(`PUT /internal/datasets/:id/holds/label-service/:jobId` in dataset-service);
deleting the job releases it. While a hold exists, that dataset cannot be deleted,
re-imported or have its zip replaced — its files are what the tasks show. A job
whose claim cannot be made is not created, and a job whose claim cannot be
released is not deleted, so a retry is always the right move.

## Changing a job's images

You cannot: tasks are immutable once materialized, because answers point at tasks.
Re-map or re-import the dataset and build a new job from it. Materializing again
is draft-only and replaces the whole task set.

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
