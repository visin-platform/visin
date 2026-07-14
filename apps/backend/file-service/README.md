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
