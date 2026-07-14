# Auth Service

Authentication API for Google sign-in, JWT cookies, profile lookup, and group refresh.

## Local Development

```bash
npm install
npm run dev --workspace=auth-service
```

The service listens on `PORT` and defaults to `5001`.

## Environment

Copy `.env.example` to `.env` and set:

- `PORT`: HTTP port, usually `5001`.
- `NODE_ENV`: `development` or `production`.
- `MONGODB_URI`: MongoDB database used for users.
- `JWT_SECRET`: shared JWT signing secret. Must match services that verify auth JWTs.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `CORS_ORIGIN`: comma-separated browser origins.
- `COOKIE_DOMAIN`: cookie domain for the `access_token` cookie.
- `INTERNAL_SERVICE_TOKEN`: shared service-to-service token. Must match `group-service`.
- `GROUP_SERVICE_URL`: URL for group lookup and refresh, usually `http://localhost:5006`.

## Commands

```bash
npm run build --workspace=auth-service
npm run start --workspace=auth-service
npm run test --workspace=auth-service
npm run lint --workspace=auth-service
npm run typecheck --workspace=auth-service
```

## Docker Compose

```bash
docker compose -f apps/backend/auth-service/compose.yml up --build
```

The compose file expects the same env vars to be present in the shell or an env file, and joins the external `visinnet` network.
