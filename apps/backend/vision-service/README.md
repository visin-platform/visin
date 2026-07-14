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

## Docker Compose

```bash
docker compose -f apps/backend/vision-service/compose.yml up --build
```

The compose file expects MongoDB and file-service configuration through env vars, and joins the external `visinnet` network.
