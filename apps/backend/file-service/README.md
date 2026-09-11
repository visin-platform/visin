# File Service

File storage service for internal uploads, public file access, and signed URLs.

## Local Development

```bash
npm install
npm run dev --workspace=file-service
```

The service listens on `PORT` and defaults to `5002`.

## Environment

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`: existing platform MongoDB connection string.
- `PORT`: HTTP port, usually `5002`.
- `NODE_ENV`: `development` or `production`.
- `FILE_SERVICE_DATA_DIR`: storage directory. In dev this is usually `./data`; Docker uses `/data`.
- `FILE_SERVICE_URL`: externally reachable service URL used when generating URLs.
- `FILE_SERVICE_API_KEY`: shared API key for internal callers.
- `FILE_SERVICE_HMAC_SECRET`: secret used for signed URL HMAC validation.
- `CORS_ORIGIN`: comma-separated browser origins.

## Commands

```bash
npm run build --workspace=file-service
npm run start --workspace=file-service
npm run test --workspace=file-service
npm run lint --workspace=file-service
npm run typecheck --workspace=file-service
```

## Docker Compose

```bash
docker compose -f apps/backend/file-service/compose.yml up --build
```

The compose file stores data in the `file_data` volume, bound to `FILE_DATA_PATH` or `./data`, and joins the external `visinnet` network.

## Upload safety and recovery

Signed upload URLs identify a persistent reservation. Its server-selected content
format and byte allowance cannot be changed by the browser. The same limits apply
to whole bodies and the cumulative size of a chunked upload; an oversized buffer
is rejected before reaching disk. `Content-Range` and `Content-Length` must contain
safe integers and agree. Existing 64 MiB chunk clients keep their protocol: 409
responses for stale offsets report the last committed `size`.

Application limits live in backend-core's upload policy: archives (ZIP, TAR,
GZIP/TGZ) up to 10 GiB, raster images/PDF up to 50 MiB, MP4/MOV up to 1 GiB.
Internal streaming uploads have a 10 GiB ceiling. Internal callers may reserve a
smaller `maxBytes`; they cannot enlarge the policy ceiling. Unknown browser MIME
is accepted only with a supported filename. Active HTML/SVG and unknown formats
are rejected. A bounded signature check runs before public publication; archive
entry/decompression checks remain the responsibility of ingest. These are per-file
allowances, not an account-wide storage quota or a full media decoder.

MongoDB's `file_uploads` collection holds reservations, committed offsets,
writer leases and the pointer to each published version. File-service connects
using the existing `MONGODB_URI` setting before accepting requests; its standalone
Compose file now passes that setting through. No separate database service or new
configuration name is introduced. MongoDB failures fail requests closed.

File bytes stay on the existing volume, under `FILE_SERVICE_DATA_DIR/.uploads`.
All file-service instances using this collection must share that same data volume.
Each request writes its own immutable file. A conditional MongoDB update requiring
the current, unexpired owner commits its progress or publishes its completed
version, with majority acknowledgement. A writer whose lease expired cannot
change the visible version, even if it resumes later. Leases use MongoDB's clock,
last 30 seconds and renew every 10 seconds. A killed writer can be retried after
its lease expires; a stalled request times out after five minutes.

Chunks are assembled once at completion, then checked and synced before MongoDB
publishes their pointer. Uploads allow at most 4,096 chunks. Normal 64 MiB clients
stay well below that limit. Assembly temporarily needs room for both the parts
and the complete file. Public uploads are immutable after completion: whole-body
retries return the stored result, and chunk retries report the final offset.
An invalid multi-chunk file may require a fresh reservation to correct an already
committed prefix.

Internal replacements retain the prior complete version until publication.
Readers open one descriptor for metadata, ranges and content. Internal writes
cannot overwrite a reserved public file. Deletion cancels pending reservations
and retains a tombstone, so an old signed URL cannot recreate it. The private
storage namespace cannot be signed, downloaded or listed as user files.

A lost MongoDB acknowledgement may mean the pointer update committed. Candidate
files are therefore retained on errors. On the next attempt, the new owner
collects old candidates absent from the authoritative state. Unreferenced files
from interrupted work otherwise remain until retry or deletion; no background
retention service was added. Back up the MongoDB records and the data volume
together: new published files depend on both. Existing files at their original
paths remain readable without a file migration.

Existing upload URLs without a reservation identity must be reissued. Legacy
vision reservations need a user-managed byte-allowance migration or a new upload;
existing download URLs and published-file reads retain their behavior. Release
backend-core and its consumers through the ordinary package/service release path.

The project tests use in-memory MongoDB, real temporary files, HTTP streams and a separate Node
writer process. The worker loads current source through the project's existing
`ts-node` development dependency; tests do not require an extra build step.
