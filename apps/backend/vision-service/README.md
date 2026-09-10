# Vision Service

Main Vision API for projects, datasets, trainings, epochs, test results, comparisons, visualizations, benchmarks, configs, and API tokens.

## Local Development

```bash
npm install
npm run dev --workspace=vision-service
```

The service listens on `PORT` and defaults to `4010`.

## Environment

Copy `.env.example` to `.env` and set:

- `PORT`: HTTP port. The Docker compose file sets `4010`.
- `NODE_ENV`: `development` or `production`.
- `MONGODB_URI`: MongoDB database used for Vision data.
- `JWT_SECRET`: shared JWT verification secret. Must match `auth-service`.
- `CORS_ORIGIN`: comma-separated browser origins.
- `FILE_SERVICE_URL`: file-service URL, usually `http://localhost:5002` locally.
- `FILE_SERVICE_API_KEY`: shared API key for calls to `file-service`.
- `FILE_SERVICE_HMAC_SECRET`: shared HMAC secret for signed file URLs.

## Commands

```bash
npm run build --workspace=vision-service
npm run start --workspace=vision-service
npm run test --workspace=vision-service
npm run lint --workspace=vision-service
npm run typecheck --workspace=vision-service
```

The finding pagination and project-token integration tests run automatically under `npm test`
using `mongodb-memory-server` 11.2.0 with MongoDB 8.2.11. They need no separate
MongoDB service or Docker container. The first run downloads and caches the binary.

## Project token permissions

A project API token can read and ingest its project's trainings, epochs, test
results, benchmarks, visualizations, comparisons, and findings. Lists and statistics
include only that project. Child resources and comparison/finding references must
resolve to that project; standalone or missing parents are rejected. Epoch ingestion
stores the training UUID from the resolved training, including batch submissions.

Project tokens cannot create, change, or delete projects, or create, list, or revoke
credentials. Use a user session for project and token administration. Shared dataset
and config libraries retain their existing behavior. This policy requires no new
environment variables or deployment configuration.

## Shared library visibility

Configurations, dataset metadata, dataset analyses, images, and dataset archives
are public shared libraries. Their direct lookups, lists, downloads, and exports
remain public when a private training selects them. Use these libraries only for
non-confidential content. Remove passwords, API keys, tokens, and other secrets
from configuration payloads and archive contents before ingestion; the service
does not automatically redact arbitrary JSON or uploaded files.

The relationship between a training and its selected config follows the training's
project visibility. `GET /api/trainings/:id/configs` allows anonymous readers of
public/standalone trainings and authorized editors of a private training, subject to the
additional project-token scope. Unrelated readers receive 403. Missing/deleted
trainings return 404, and visible trainings with no available config return
`{ configs: [], total: 0 }`. Making a project private protects this relationship;
it does not withdraw the selected content from the public libraries.

## Project groups and write permission

Public visibility grants read access. A project owner can assign **Editor groups**
in project settings. Any current member of an assigned, live group can read the
private project and create, update, or delete its trainings, epochs, test results,
benchmarks, visualizations, comparisons, and findings. The project owner alone
controls project settings, group grants, deletion, and project tokens. A project
credential remains restricted to its project.

`editorGroupIds` is an array of group IDs on project create/update. Owners may add
groups they currently belong to and remove existing grants. Group membership is
verified against group-service once per request; token `groupRoles` are not used
as permission grants. Removing a member, deleting a group, or removing the project
grant takes effect on the next request. A failed membership lookup grants no access.
Membership uses immutable account IDs accepted through group invitations. The
separate Google-account-linking and session-revocation backlog still applies.

Standalone trainings, benchmarks, comparisons, and shared libraries record their
creator in `ownerId`. Dataset images and categories inherit the owner of their
`DatasetAnalysis` parent. Unowned records are read-only; there is no first-editor
claim or migration command. Existing records and references require an explicit
operator migration, which is managed outside this change.

The browser reads `GET /api/write-capabilities?kind=training&ids=<comma-separated IDs>`
(up to 100 IDs) to gate controls; supported kinds also include project, comparison,
benchmark, test-result, analysis, and dataset. This is a session-only UI endpoint;
API credentials still use each operation's independent scope checks. The group
picker uses `GET /api/write-capabilities/groups`.

The membership client calls group-service's read-only
`POST /api/internal/project-groups` at `https://group-api.visin.eu` in production,
and `http://localhost:5006` in development. Its purpose-bound, 30-second HMAC
assertion uses the already-shared `JWT_SECRET`; it is not a session credential.
There are no additional deployment variables, Compose changes, or shared-library
exports. Both services need the corresponding application code.

## Upload ownership

Continue the existing upload-URL → file upload → resource creation/completion flow.
New stored-file references require a persisted reservation matching the uploader,
resource family, and parent. First attachment expires after 24 hours; signed upload
URLs still expire after 15 minutes. Attachment verifies the stored file's size and,
when supplied by image/visualization clients, its declared size and reserved media
type. A reservation cannot be transferred to another record. These checks do not
inspect content bytes for actual MIME type or enforce storage quotas.

Archive replacement clears the previous download-reference alias while preserving
analysis data. Dataset metadata downloads require an explicit location; no path is
inferred from a dataset name. Historical file references and thumbnails without
verified reservations are retained during record deletion for explicit operator
cleanup. File deletion failures retain image records for retry. Broader upload
limits and cleanup reconciliation remain tracked in `todo.md`.

## Finding pagination

`GET /api/findings` filters visible projects before taking a page (default 50,
maximum 200). Results sort by `createdAt` and `_id`, both descending. For the next
page, keep the same filters and pass `before` as the last row's ISO `createdAt`,
an underscore, and its `_id`. Stop at a short or empty page. A cursor does not
grant access: each request checks current visibility. Newly inserted findings
above the cursor appear after refreshing. The analysis panel supports loading
more and retrying a failed page; MCP `list_findings` supplies continuation cursors.
See `docs/openapi.yml` for the query and response contract.

## Docker Compose

```bash
docker compose -f apps/backend/vision-service/compose.yml up --build
```

The compose file expects MongoDB and file-service configuration through env vars, and joins the external `visinnet` network.

## Result read boundaries

Test-result filters intersect the caller's visible live trainings/epochs. Supplying
an epoch number, UUID list, training or project never replaces this constraint;
pagination counts use the same predicate. Metadata lists apply the same visibility.
Result and visualization detail reads require a live epoch and training before
returning data or signing files. Missing/deleted training filters fail closed for
visualizations and benchmarks. Only benchmarks without any training or epoch
reference are treated as public standalone hardware benchmarks.
