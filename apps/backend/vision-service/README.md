# Vision Service

Main Vision API for projects, trainings, epochs, test results, comparisons, visualizations, benchmarks, configs, and API tokens. Datasets (zips, imported images) live in dataset-service; a training's `datasetId` names one there.

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
- `FILE_SERVICE_INTERNAL_URL` (optional): file-service on a private network, preferred for this service's own calls.
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
using `mongodb-memory-server` 11.2.0 with MongoDB 8.3.9. They need no separate
MongoDB service or Docker container. The first run downloads and caches the binary.

## API docs

`docs/openapi.yml` is served by Swagger UI at `/api/docs`. Request bodies and query parameters are not written
there by hand: they `$ref` `docs/generated/request-schemas.json`, which is generated from the Zod schemas in
`src/validation/`. A test (`src/__tests__/openapi/`) fails when a route is missing from the spec, the spec lists a
route that no longer exists, an operation refers to a schema other than the one its route validates with, or the
generated file is stale. After changing a validation schema, run `npm run docs:generate --workspace=vision-service`
and commit the result.

`src/__tests__/integration/apiContract.test.ts` walks an integrator's path (a project and token, a run, its epochs,
test results and benchmarks, and the errors a script meets) against the real routes, and checks every response's
status and body against the spec.

At the repo root, `npm run openapi:lint` lints the spec, and `npm run openapi:bundle` writes the self-contained copy
the docs site renders at `/docs/api` (`apps/frontend/landing-front/public/openapi/vision.json`). CI's `api-docs` job
fails when that copy is older than the spec, so bundle and commit it with any spec change.

## Project token permissions

A project API token can read and ingest its project's trainings, epochs, test
results, benchmarks, visualizations, comparisons, and findings. Lists and statistics
include only that project. Child resources and comparison/finding references must
resolve to that project; standalone or missing parents are rejected. Epoch ingestion
stores the training UUID from the resolved training, including batch submissions.

Project tokens cannot create, change, or delete projects, or create, list, or revoke
credentials. Use a user session for project and token administration. The shared config
library retains its existing behavior. This policy requires no new
environment variables or deployment configuration.

## Shared library visibility

Configurations are a public shared library. Their direct lookups, lists, downloads, and exports
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

## Project ownership and permissions

Every project has an `owner` — a person, or a group — plus a `visibility`
(`private` or `public`) and `createdBy` (attribution only). What a caller may do
is one of `read`, `contribute`, `manage` and `own`:

- the owning person has `own`; for a group-owned project, the caller's current
  role in the group decides (member `contribute`, admin `manage`, owner `own`);
- **editor groups** (`editorGroupIds`) share a project with other groups: their
  current members get `contribute`;
- `public` gives anyone `read`.

`contribute` adds runs, results, comparisons and findings, and changes what the
caller added; `manage` changes project settings and anyone's runs and moves the
project to the trash; `own` changes visibility, transfers the project
(`PUT /api/projects/:id/owner`), restores it or deletes it for good. Every run
belongs to a project. Group membership is read from group-service once per
request, so a removal takes effect on the next request; a failed lookup grants
nothing. A key limited to a project stays inside that project.

A project in the trash (`DELETE /api/projects/:id`) takes its live runs with it
and comes back with exactly those (`POST /api/projects/:id/restore`). A sweeper
(backend-core `startSweeper`) deletes projects and runs that have been in the
trash for 30 days, with their visualization files.

The browser reads `GET /api/write-capabilities?kind=training&ids=<comma-separated IDs>`
(up to 100 IDs) to gate controls; supported kinds also include project, comparison,
benchmark, and test-result. This is a session-only UI endpoint;
API credentials still use each operation's independent scope checks. The group
picker uses `GET /api/write-capabilities/groups`.

The membership client calls group-service's read-only
`POST /api/internal/project-groups` at `GROUP_SERVICE_URL`. Production requires it
(there is no hosted default — Compose points it at the in-network group-service);
development falls back to `http://localhost:5006`. Its purpose-bound, 30-second HMAC
assertion uses the already-shared `JWT_SECRET`; it is not a session credential.

## Upload ownership

Continue the existing upload-URL → file upload → resource creation/completion flow.
New stored-file references require a persisted reservation matching the uploader,
resource family, and parent. First attachment expires after 24 hours; signed upload
URLs still expire after 15 minutes. Attachment verifies the stored file's size and,
when supplied by visualization clients, its declared size and reserved media
type. A reservation cannot be transferred to another record. These checks do not
inspect content bytes for actual MIME type or enforce storage quotas.

Historical file references without verified reservations are retained during
record deletion for explicit operator cleanup. Broader upload
limits and cleanup reconciliation still require operator planning.

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

Copy `apps/backend/vision-service/.env.example` to `apps/backend/vision-service/.env`
and fill in the values. Create the external network only if it does not exist yet.

```bash
docker network create visinnet  # once per Docker host
docker compose --env-file apps/backend/vision-service/.env -f apps/backend/vision-service/compose.yml up --build
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
