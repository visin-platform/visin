# Visin

Computer vision and analytics platform: manage datasets, train models, label
images, and compare results. Self-hosted, MIT licensed, no hosted tier.

Six backend services and five React frontends in an npm workspace. Each app has
its own `package.json`, `Dockerfile` and `compose.yml`, and depends on nothing
outside its own directory at build or run time.

| Workspace        | Port | Purpose                                           |
| ---------------- | ---- | ------------------------------------------------- |
| `vision-service` | 4010 | Datasets, training, analysis, benchmarks          |
| `auth-service`   | 5001 | Authentication, JWT, user management              |
| `file-service`   | 5002 | File upload and download with signed URLs         |
| `group-service`  | 5006 | User groups                                       |
| `label-service`  | 5008 | Labeling bundles, jobs, tasks, answers, export    |
| `mcp-service`    | 5009 | MCP server exposing Visin data to AI assistants   |
| `landing-front`  | 3000 | Public landing page                               |
| `auth-front`     | 3004 | Sign-in                                           |
| `account-front`  | 3007 | Account settings                                  |
| `label-front`    | 3008 | Labeling workbench and job administration         |
| `vision-front`   | 3012 | Main application UI                               |

MongoDB is used by every service except file-service, and Redis by
label-service's import queue. The root `compose.yml` runs both.

## Run it

Docker is the only requirement.

```sh
git clone https://github.com/visin-platform/visin.git
cd visin
docker compose up -d
```

Open <http://localhost:3000>. **No configuration is needed** — every secret has a
working development default, so a fresh clone boots as-is. The first run builds
the images and takes a few minutes.

To reach it from another machine, give it an address that machine can resolve:

```sh
PUBLIC_HOST=http://192.168.1.10 docker compose up -d
```

Before putting it on a network, override `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`,
`FILE_SERVICE_API_KEY` and `FILE_SERVICE_HMAC_SECRET` in a `.env` beside
`compose.yml`, and set `NODE_ENV=production` — which also enables `Secure`
cookies, so serve it over HTTPS.

`docker compose down` stops everything; add `-v` to discard the database and
uploaded files too.

## Develop on it

Hot reload additionally needs **Node.js 26+**, matching CI and the images.

```sh
npm install

# one .env per app, from the templates beside them
for f in apps/backend/*/.env.example apps/frontend/*/.env.example; do cp -n "$f" "${f%.example}"; done

docker compose up -d mongodb redis   # data stores only; the apps run on the host
npm run dev
```

Fill in the `<change-me>` values in the copied `.env` files. Mongo and Redis are
published on `127.0.0.1` only, so host-run apps reach them at `localhost:27017`
and `localhost:6379` while nothing is exposed to the network.

`npm run dev:back` and `npm run dev:front` start each half separately. Add
`--profile tools` to the compose command for mongo-express on
<http://localhost:8081>.

### Commands

```sh
npm run lint            # ESLint, zero warnings allowed
npm run typecheck       # tsc --noEmit per workspace
npm test                # Jest (backends) + Vitest (frontends)
npm run test:coverage   # every workspace enforces a coverage floor
npm run format          # Prettier
```

Shared libraries are consumed from npm, not from the workspace, because a
service's Docker build never sees the monorepo. After changing one, publish it
and let `npm run sync:libs` re-pin consumers; `npm run lockfiles` then refreshes
the per-service lockfiles their images install from. CI fails on drift in either.

Architecture notes — auth, inter-service calls, project privacy, error handling —
are in [CLAUDE.md](CLAUDE.md).

## Production deployment

The root `compose.yml` from [Quickstart](#run-it) is a complete deployment: set
the four secrets it names, `NODE_ENV=production`, and a `PUBLIC_HOST` your users
can reach, and put TLS in front of it.

To run services individually instead — separate hosts, a subset of the platform,
or your own orchestrator — each has its own `compose.yml` and multi-stage
`Dockerfile`, and depends on nothing outside its own directory:

```sh
cp .env.example .env
# fill in .env values
docker compose -f apps/backend/auth-service/compose.yml up -d
# repeat for other services
```

Those files run the published images from
`ghcr.io/visin-platform`, which carry builds for both `linux/amd64` and
`linux/arm64`, so the same tag works on a laptop and on a Raspberry Pi.

`TAG` defaults to `latest`. Pin a release instead — `latest` moves, and a
deployment that tracks it cannot be rolled back or identified after the fact:

```sh
TAG=1.0.0 docker compose -f apps/backend/auth-service/compose.yml up -d
```

`REGISTRY` points somewhere else, if you mirror the images or build your own.
Both variables work on the root `compose.yml` too.

Serving the frontends and APIs on separate hostnames needs a reverse proxy in
front; any will do. If you use one shared parent domain, set `COOKIE_DOMAIN` to
it so the session cookie reaches every subdomain.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and branch naming, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards. Security
issues: please follow [SECURITY.md](SECURITY.md) instead of opening a public
issue.

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
