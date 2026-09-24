# CLAUDE.md

Visin: a computer vision & analytics platform (datasets, training runs, results, image labeling). An
npm-workspaces monorepo:

```
apps/backend/{auth,file,group,vision,dataset,label,mcp}-service  Express + TypeScript + Mongoose
apps/frontend/{landing,auth,account,vision,label,shell}-front  React + Vite + MUI
libs/backend-core     @visin/backend-core   — shared Express middleware/app bootstrap
libs/frontend-core    @visin/frontend-core  — shared auth/API-client/React components
compose.yml           the whole stack, zero-config; per-service compose.yml alongside each app
```

Each workspace has its own `package.json`, `Dockerfile` and `compose.yml`, and never depends on the monorepo root
at deploy time.

## Commands

```sh
npm install                          # one install at the root covers every workspace
npm run dev                          # all backends + frontends (dev:back / dev:front for one half)
docker compose up -d mongodb redis   # data stores for local dev
npm run lint | typecheck | test | test:coverage | format
npm test --workspace=vision-service  # scope any script to one workspace
```

## Before finishing a change

Don't report work as done until these pass for every workspace the change touches. A change to a lib touches every
workspace that depends on it: rebuild the lib first (`npm run build` in it), then check those workspaces too.

1. `npm run lint --workspace=<ws>` (zero warnings)
2. `npm run typecheck --workspace=<ws>`
3. `npm run test:coverage --workspace=<ws>` (includes the MongoMemoryServer integration suites and coverage floors)
4. `npm run build --workspace=<ws>` (what the Dockerfile runs; also catches bundling/federation errors)
5. `npm run test:e2e --workspace=<ws>` for a front with an `e2e/` suite (account, auth, label, landing, vision)

If a step can't run here, say so; don't count it as passed. In the report, list what ran and the results,
including any failures.

## Libraries, releases, CI

- Workspaces resolve the libs through `dist/`, so a lib edit is invisible to its consumers until you rebuild it.
- **Deployed images install the libs from npm.** A new lib export reaches a service only after `npm run release` in
  the lib and the service pinning that version.
- **Pin lib versions exactly, never a range.** A range leaves Docker's cached `npm i` layer in place, which fails as
  `has no exported member`. `npm run release` syncs the pins, and CI's `lib-versions` job fails on drift.
- **Dependencies:** each image builds from its own directory and lockfile, so every dependency must be in that
  workspace's `package.json`. Workspace hoisting hides a missing one until the Docker build.
- **Releases:** one manual run of `release.yml`, which publishes the libs, then changelog/tag, then images.
  - It builds only services that changed since the last `v*` tag, per `scripts/release-plan.mjs`, which ignores
    tests, e2e and Markdown. The other services are re-tagged onto the new version, so every service exists at
    every version.
- **Coverage floors** sit just below current coverage. Raise them when you add coverage; never lower one to pass.
- **CI** runs checks only for the workspaces a change touches; a lib change triggers every consumer.

## Architecture

### Auth

- **Where the token lives:** auth-service sets the JWT as an httpOnly `access_token` cookie on the shared parent
  domain (`COOKIE_DOMAIN`). backend-core's `authenticateToken`/`optionalAuth` read the cookie first and fall back to
  `Authorization: Bearer`.
- **The Bearer path is also used by other credentials:** vision-service's project API tokens (opaque, no dots,
  matched before the JWT middleware), user API keys and OAuth access tokens. Each has its own verification path.
- **Checks on every request:** both middlewares check the account's id, email and `tokenVersion` against `users` on
  the primary, uncached. Required auth fails closed on a database error with a 503, never a 401 (fronts treat
  401 as signed out); optional auth continues anonymously.
- **Sessions:** every browser sign-in is a `user_sessions` document (`auth-service/src/models/Session.ts`), named by
  the JWT's `sid` claim. Both middlewares require it to exist and be unexpired, so deleting it revokes the session.
  - Create sessions only through `sessionService.startSession`: a new session per sign-in, never a reused id.
  - Lifetime: 30 days idle, slid forward by `/auth/verify`, capped at 90 days after sign-in. `tokenVersion` stays
    the revoke-everything switch.
- **Session tokens are typed:** `typ: 'session'` (`SESSION_TOKEN_TYPE`), which is what separates them from MCP access
  tokens signed with the same key. A test fixture that hand-builds a session JWT needs `typ`, a `sid`, and a matching
  unexpired `user_sessions` document.
- **Frontends never touch the JWT.** `createApiClient` sends `credentials: 'include'`; there is no `localStorage`
  token, so don't add one.
- **Auth components are factories:** `createProtectedRoute(useAuth)` and `createLoginRedirect(useAuth,
  { redirectTo })`. Each front has its own auth context, and a context imported inside the lib would always be
  empty.
- **Resume re-check:** `AuthProvider` re-verifies when a backgrounded app returns after an hour. A check that fails
  to reach the server keeps the session.

### Service-to-service

- **Internal token gates:** inter-service calls carry `X-Internal-Token`. Every new internal route needs one of two
  gates; skipping it opens the route to any logged-in user.
  - `requireInternalServiceToken`: service callers only.
  - `validateInternalServiceToken` + `allowUserOrInternalService`: a user or a service. Mount `validate*` on the
    router and `allow*` per route, after user auth.
  - Two routes use their own credential instead: file-service's `/internal/*` takes `X-Internal-Api-Key`
    (`FILE_SERVICE_API_KEY`), and group-service's `/api/internal/project-groups` takes a 30-second HMAC assertion
    signed with `JWT_SECRET` (`vision-service/src/clients/projectGroupsClient.ts`). That assertion is read-only;
    don't reuse it on a route that writes.
- **Always `fetchWithTimeout`, never bare `fetch`:** a stalled peer otherwise hangs the caller for minutes.
  - Use `TRANSFER_FETCH_TIMEOUT_MS` for calls that move file bytes.
  - An expired deadline becomes a 504 `GatewayTimeoutError`.
- **Required env vars:** each service asserts them at the top of `index.ts` with `assertRequiredEnv`. A new one goes
  in that list, the service's `compose.yml` and `.env.example`. Under `NODE_ENV=production` it also refuses the
  `dev-only-…` and `<change-me>` placeholders.
- **Public URLs (OAuth issuer, MCP resource, front/API URLs) come from config only.** Never fall back to a real
  domain: Visin is self-hosted, and a fallback sends another deployment's users there.
  - Examples use `example.com`, test fixtures `example.test`.

### vision-service project privacy

- **Every project-scoped read calls `checkProjectAccess(userId, projectId)`** (`services/projectAccessService.ts`),
  or it leaks private projects.
- **Endpoints with no project filter** still scope to `getVisibleProjectIds`/`getVisibleTrainingIds`.
- **Project API tokens** are confined to their own project on writes by `isWithinTokenScope`.
- **Per-row checks** use `createProjectAccessChecker(userId)`: one per request, never hoisted to module scope, or
  privacy changes are served from a stale memo.

### Results taxonomy (vision)

- **Results are open blobs, and readers discover their contents.** `Epoch.results` and `TestResult.test_results`
  are `Mixed`; `taxonomy/discover.ts` finds conditions, classes and metrics.
- **`Project.taxonomy` only decorates** (labels, colours, order, metric `direction`) and never gates a write.
- **`taskType` only seeds presets at creation**; nothing branches on it.
- **`direction` decides "best"**: for a loss or a latency, best is the minimum.
- **No literal class or condition names** (`'day_fair'`, `'vehicle'`) in vision-front application code; ESLint fails
  on them. Fixtures may use them.
- **`DatasetImage.condition` is a free string.**

### Project cost rates

- **No default rate.** `Project.costing` (`cpuRatePerHour`, `gpuRatePerHour`, `currency`) prices a project only
  when both rates are set.
  - Otherwise `resolveCosting` returns `null`, the API omits the money fields and the UI shows `-`.
- **Resolve rates per row** (`costingByProject` / `costingFor`): one query can span projects.
- **Mixed currencies** in a total report `currency: 'MIXED'`.
- **Format money with `Intl.NumberFormat`**, never a hard-coded symbol.

### Backend layering and errors

- **Layers:** `routes/` → `controllers/` → `services/` → `models/`.
- **Validation:** Zod schemas in `validation/`, applied by `validateRequest`, which also coerces and fills defaults.
  Controller tests should parse their request through the same schema.
- **Errors:** controllers throw backend-core `HttpError` subclasses (`BadRequestError`, `NotFoundError`, …), and the
  shared `errorHandler` maps them. A plain `Error` for an expected condition is reported as a 500.
  - Middleware refuses with `next(new UnauthorizedError(…))`, not `res.status().json()` and not `throw`: a wrapper
    that calls it without awaiting would turn a throw into an unhandled rejection.
- **Startup:** `index.ts` starts listening with backend-core's `serve`, which drains requests on SIGTERM. Pass
  `onShutdown` for anything else that must finish first, like a queue worker.
- **Request ids:** `requestLogger` gives each request an `X-Request-Id`, which is on every log line and forwarded by
  `fetchWithTimeout`. Log through `logger` and call peers through `fetchWithTimeout`, and the id follows.

### shell-front (module federation)

- **Structure:** vision-, label- and account-front run standalone and also as remotes of `shell-front`.
  - The shell owns the router, the one `AppLayout`, and the routes `/`, `/login`, `/image-labeling/*`.
  - Every other path goes to the app named in `shell-front/src/apps.ts`, which renders its
    `src/federation/RemoteApp.tsx` (no router, no layout).
- **Paths are one namespace.** A new top-level route in a remote must not overlap another app's and must be added
  to `apps.ts`.
- **Singletons (React, router, Emotion, React Query…) are declared once** in `VISIN_FEDERATION_SHARED`
  (`@visin/frontend-core/federation`), never in one app's config.
- **Remote code runs on the shell's origin.** Remotes load `config.json` through `import.meta.url` and import assets
  instead of using `/public` paths.
- **Remote URLs are runtime config** (the shell's `config.json`). An unreachable remote shows a retry panel.
- **The shell is the installable PWA.** `public/sw.js` caches no app code (a cached host would run against newly
  deployed remotes) and only serves `offline.html`. Don't add precaching.
- **Tests:** the federation plugin is off under Vitest.

### Theme and colour (fronts)

- **One theme, light and dark:** `VisinThemeProvider` (`@visin/frontend-core`) in each front's `ConfigProvider`.
  Colours are CSS variables switched by `data-color-scheme` on `<html>`, so the shell's switch restyles its remotes.
  - The choice is kept under `visin-mode`. Each front's `index.html` reads it in a pre-paint script that sets the
    attribute and `theme-color`; a new front needs the same script, or dark pages flash white.
  - landing-front is light only, by design.
- **No colour literals:** ESLint fails on hex, `rgb()` and `hsl()` outside tests.
  - In `sx`: palette paths (`'text.secondary'`) and tokens (`ink`, `surface`, `glass`, `chrome`, `onImage`).
  - In JS: `livePalette(theme)`, never `theme.palette` (it holds the light values in both schemes). Mix with
    `theme.alpha` or `tint`, never MUI's `alpha()`, which cannot parse a variable.
  - A new token needs values for both schemes; `theme/theme.test.ts` fails any text colour under WCAG AA.
- **Glass only on chrome and floating surfaces** (rail, bars, menus, popovers). Tables, lists, charts and dialogs
  stay solid.
- **Charts:** series colours from `useChartColors()`, in slot order (training slot 1, validation slot 2); `adapt()`
  for a stored class colour.
  - One unit per chart, never two y-axes.
  - A reading an epoch did not report is `null` (a gap), never `0`.
  - Past eight lines, `withDistinctDashes` + `dashedSeriesSx` (vision-front `components/charts/seriesDashes.ts`).

### Frontend data fetching

- **vision-front API calls go through `config/visionApi.ts`.** The exception is the direct PUT to a file-service
  signed URL, which bypasses it on purpose.
- **Use React Query.** Convert a hand-rolled `useEffect` fetch when you touch it; `useEffect`s that don't fetch
  stay.
- **Stored-file references are `fileId`** (`thumbnailFileId`); `minioFileId` is gone. File-service stores on local
  disk.
