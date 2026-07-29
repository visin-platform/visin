# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Visin: a computer vision & analytics platform (manage datasets, train models, analyze results, label images). An
npm-workspaces monorepo of 5 independently-deployable backend services and 5 React frontends, plus 2 shared
libraries.

```
apps/backend/{auth,file,group,vision,label}-service   Express + TypeScript + Mongoose
apps/frontend/{landing,auth,account,vision,label}-front  React + Vite + MUI
libs/backend-core     @visin/backend-core   — shared Express middleware/app bootstrap
libs/frontend-core    @visin/frontend-core  — shared auth/API-client/React components
apps/infra/visin-proxy  Nginx reverse proxy config
```

Each service/front has its own `package.json`, `Dockerfile`, and `compose.yml` and never depends on the monorepo
root at runtime or deploy time — only at dev time via npm workspace hoisting.

## Commands

```sh
npm install                          # one install at the root covers every workspace
npm run dev                          # all backends + frontends, hot reload
npm run dev:back / npm run dev:front # backends only / frontends only
docker compose -f docker-compose.dev.yml up -d   # MongoDB for local dev (add --profile tools for mongo-express)

npm run lint        # ESLint, flat config, zero warnings allowed anywhere
npm run typecheck   # tsc --noEmit per workspace
npm test            # Jest (backends) + Vitest (frontends)
npm run test:coverage
npm run format      # Prettier
```

Scope any script to one workspace: `npm test --workspace=vision-service`, or `cd` into the workspace and run
directly (`npx jest path/to/file.test.ts`, `npx vitest run path/to/file.test.ts`). Backend libs/services must be
rebuilt (`npm run build` inside `libs/backend-core` or `libs/frontend-core`) after editing their source for
consuming workspaces to see the change — they resolve each other via `dist/`, not source, per `package.json`
`main`/`types`.

Every workspace enforces a jest/vitest `coverageThreshold`/`thresholds` floor (see each `jest.config.ts` /
`vite.config.ts`) — set just below current coverage so CI catches regressions. Ratchet the floor up when you add
meaningful coverage; don't lower it to make a failing build pass.

CI (`.github/workflows/test.yml`) runs lint/typecheck/test only for workspaces a commit's changed paths actually
touch (via `dorny/paths-filter`) — `libs/backend-core` or `libs/frontend-core` changes trigger every service/front
that depends on them.

## Architecture

### Auth: cookie primary, header fallback

`auth-service` issues a JWT as an httpOnly `access_token` cookie on Google sign-in (`COOKIE_DOMAIN` is a shared
parent domain across every Visin subdomain in production, e.g. `.visin.eu`, so the cookie reaches every service).
`libs/backend-core`'s `authenticateToken`/`optionalAuth` middleware (used directly or wrapped by group/file/vision-
service) reads `req.cookies?.access_token` first, falling back to the `Authorization: Bearer` header — the header
path exists for non-browser callers, notably vision-service's project-scoped API tokens (`apiTokenMiddleware`),
which are a *different* credential (opaque hex token, DB-checked) from a user JWT and are matched by a
"contains no dot" heuristic before the JWT middleware ever runs.

`auth-service` layers its own `authenticateToken` (in its own `middleware/authMiddleware.ts`, not backend-core's)
on top of the same cookie/header extraction, adding a `tokenVersion` check against the `User` collection so a
security-relevant change can invalidate every outstanding JWT immediately — that DB dependency is why it isn't
folded into the shared, stateless backend-core version.

Frontends never touch the JWT directly: `libs/frontend-core`'s `createApiClient` defaults every request to
`credentials: 'include'`, and `createAuthService`/`createAuthContext` (wrapping it) is what every front's own
`authService.ts`/`AuthContext.tsx` thinly re-exports. There is no `localStorage` token — don't reintroduce one.
The two auth-shaped route components are shared the same way: `createProtectedRoute(useAuth)` and
`createLoginRedirect(useAuth, { redirectTo })` are factories, not plain components, because each front builds its
own auth context — a context imported inside the lib would be a different, always-empty one. `redirectTo` has no
default on purpose: the fronts' post-login routes genuinely differ (`/account` vs. `/jobs`).

### Internal-service-to-service auth

Separate from user auth: services call each other over HTTP using an `X-Internal-Token` header, checked by
`backend-core`'s `requireInternalServiceToken` (hard-gates a route to service-only callers) or
`validateInternalServiceToken` + `allowUserOrInternalService` (lets a route serve *either* a logged-in user or
another internal service — mount the `validate*` one globally on the router, then the `allow*` gate per-route
after user auth middleware). Adding a new inter-service route means picking the right one of these two patterns;
skipping the gate on a route meant to be internal-only silently opens it to any authenticated user.

Every outbound inter-service `fetch` goes through `backend-core`'s `fetchWithTimeout`, never bare `fetch`: undici
leaves a stalled peer hanging the caller for minutes, long enough to exhaust the caller's own capacity while a
dependency is degraded. It defaults to `DEFAULT_FETCH_TIMEOUT_MS` (control-plane JSON calls) and takes
`TRANSFER_FETCH_TIMEOUT_MS` for calls that move file bytes, since the deadline covers reading the body too. An
expired deadline becomes a `GatewayTimeoutError` (504), so the shared `errorHandler` reports it as an upstream
failure rather than a 500 server bug.

Each service asserts its required env vars at the top of `index.ts` via `backend-core`'s `assertRequiredEnv`,
which logs every missing name at once and exits. Without it a service missing e.g. `INTERNAL_SERVICE_TOKEN` boots
healthy and then 500s on every internal call — a config error surfacing as a runtime outage. Adding a new required
var means adding it to that list, to the service's `compose.yml`, and to `.env.example`.

### vision-service project privacy

Almost every vision-service resource (trainings, epochs, test results, comparisons, benchmarks, visualizations)
hangs off a `Project`, which is public or private. `services/projectAccessService.ts`'s `checkProjectAccess(userId,
projectId)` is the single source of truth for "can this caller see this project" and is called from controllers or
services throughout — a new endpoint that reads project-scoped data needs this check, or it leaks private-project
data. `isWithinTokenScope(reqProjectId, resourceProjectId)` additionally confines a project-scoped API token to its
own project on writes. Endpoints with no explicit project filter must still scope to `getVisibleProjectIds`/
`getVisibleTrainingIds` (see `testResultService`/`comparisonController`) rather than returning everything.

Checking access row by row uses `createProjectAccessChecker(userId)` instead of a bare `checkProjectAccess` per
row: each bare call re-runs `resolveProject` (up to two indexed queries), so a 100-row comparison issued ~200
lookups for a handful of distinct projects. The checker is per-request by design — never hoist it to module scope,
or a privacy change gets served from a stale memo.

### Layering (vision-service, and the pattern the other backends follow)

`routes/` (thin, wires validation + controller) → `controllers/` (request/response shape, calls services or, in
several older controllers, Mongoose models directly) → `services/` (business logic, the project-access checks
above) → `models/` (Mongoose schemas). `validation/*Schemas.ts` are Zod schemas applied via backend-core's
`validateRequest` middleware, which also supplies defaults/coercion — controller-level tests that build a request
object should parse it through the same schema first (see `__tests__/controllers/*.test.ts`) so the test matches
what the controller actually receives.

### Frontend data fetching

`vision-front`'s API calls go through `config/visionApi.ts` (wraps `@visin/frontend-core`'s `createApiClient`),
which every `services/*Service.ts` file calls — don't hand-roll `fetch` for a vision-service endpoint. The one
legitimate exception is uploading via a file-service signed URL (`uploadFileToSignedUrl`,
`visualizationService.uploadFile`): that's a direct-to-storage PUT against file-service with the signature as the
credential, not a vision-service API call, so it deliberately bypasses `visionApi` (no `/api` prefix, no auth
cookie). File-service stores files on local disk — there is no object-storage backend to configure.

The stored-file reference is called `fileId` (`thumbnailFileId` for thumbnails) everywhere: Mongo, the HTTP API,
and file-service itself. It was once called `minioFileId`, back when storage was object-based; that rename is
finished end to end — the persisted fields were migrated, the migration script was removed, and the
request/response compat shim that used to translate the old spelling is gone too. `fileId` is now the only
accepted spelling: a caller posting `minioFileId` gets a 400, and responses no longer mirror the old key.
Nothing in the repo should reference the old name again.

Data fetching is React Query (`useQuery`/`useMutation`) throughout; a `useEffect` that calls a service function and
sets loading/data state by hand is legacy and should be converted when touched. Not every `useEffect` is a fetch,
though — plenty are legitimate (URL-param sync, debounce, resetting local form state when a dialog opens); only
migrate ones that duplicate what `useQuery`'s `enabled`/`isLoading`/`data` already gives you.

### Error handling (backend)

Controllers throw a typed error from `libs/backend-core`'s `errors/HttpError.ts` (`BadRequestError`,
`NotFoundError`, `ForbiddenError`, ...) instead of hand-rolling try/catch + status codes; the shared `errorHandler`
(mounted last in each service's `index.ts`) classifies known error types (the `HttpError` hierarchy, plus Mongoose's
`ValidationError`/`CastError`) into the right status/response shape and treats everything else as an unexpected 500.
Throwing a plain `Error` for an expected condition (like an invalid CORS origin) means it gets logged and reported
as a server bug rather than the client-facing status it should be — use or add an `HttpError` subclass instead.
