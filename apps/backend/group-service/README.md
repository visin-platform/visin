# Group Service

Group membership API used by auth flows and protected backend routes.

## Local Development

```bash
npm install
npm run dev --workspace=group-service
```

The service listens on `PORT` and defaults to `5006`.

## Environment

Copy `.env.example` to `.env` and set:

- `PORT`: HTTP port, usually `5006`.
- `NODE_ENV`: `development` or `production`.
- `MONGODB_URI`: MongoDB database used for groups.
- `JWT_SECRET`: shared JWT verification secret. Must match `auth-service`.
- `INTERNAL_SERVICE_TOKEN`: shared service-to-service token. Must match `auth-service`.
- `AUTH_SERVICE_URL`: auth service URL, usually `http://localhost:5001`.
- `CORS_ORIGIN`: comma-separated browser origins.

## Commands

```bash
npm run build --workspace=group-service
npm run start --workspace=group-service
npm run test --workspace=group-service
npm run lint --workspace=group-service
npm run typecheck --workspace=group-service
```

## Docker Compose

```bash
docker compose -f apps/backend/group-service/compose.yml up --build
```

The compose file expects the same env vars to be present in the shell or an env file, and joins the external `visinnet` network.
