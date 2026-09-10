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

Ownership changes require an existing owner. Admins can manage ordinary members
and other admins, but cannot create or promote owners. To hand over ownership,
add or promote the replacement first, then demote or remove the previous owner.
The last owner cannot leave or be demoted.

Membership and group lifecycle writes use optimistic concurrency. A concurrent
change returns HTTP 409; reload the group and reconsider the action before
retrying. Permanent deletion also checks the authorized revision and deleted state.

### Database regression tests

The ownership concurrency suite uses `mongodb-memory-server` and runs as part of
the normal test command locally and in CI:

```bash
npm test --workspace=group-service -- --runInBand
```

It starts and stops its own isolated database, with no Docker or external MongoDB
configuration. The first run downloads MongoDB 8.2.11 to the package's binary cache.
The tests exercise real conditional writes, simultaneous demotions/removals,
legacy duplicate memberships, imported groups without a version key, stale
authorization, restore/delete races, and ordinary ownership handover.

## Docker Compose

```bash
docker compose -f apps/backend/group-service/compose.yml up --build
```

The compose file expects the same env vars to be present in the shell or an env file, and joins the external `visinnet` network.

## Project editor membership lookup

Vision-service uses `POST /api/internal/project-groups` to obtain only the IDs and
names of live groups for an authenticated user's email. The request contains
`userId`, `email`, `issuedAt` (epoch milliseconds), and `signature` (hex HMAC-SHA256).
The signed payload is `JSON.stringify(["vision-project-groups", userId, email, issuedAt])`
using the existing shared `JWT_SECRET`. Assertions outside a 30-second window or
with altered fields are rejected. This endpoint is read-only, returns no member
list, and does not authenticate requests to ordinary group-management routes.
No additional deployment environment variable is required.
