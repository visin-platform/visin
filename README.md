# Visin

Advanced Computer Vision & Analytics Platform — manage datasets, train models, and analyze results.

## Architecture

Visin is a monorepo of microservices and frontends:

| Service | Port | Description |
|---|---|---|
| `auth-service` | 5001 | Authentication (Google SSO), JWT, user management |
| `file-service` | 5002 | File upload/download with signed URLs |
| `group-service` | 5006 | User group management |
| `vision-service` | 4010 | Datasets, training, analysis, benchmarks |
| `auth-front` | 3004 | Sign-in page |
| `vision-front` | 3012 | Main application UI |
| `landing-front` | 3000 | Public landing page |
| `account-front` | 3007 | Account settings |

Infrastructure in `apps/infra/`: Nginx reverse proxy, MongoDB, Cloudflare DDNS cron.

## Prerequisites

- Node.js 20+
- MongoDB (local or Docker)
- Docker (for infrastructure services)

## Local Development

1. **Copy and fill in environment variables for each service:**

   ```sh
   cp apps/backend/auth-service/.env.example    apps/backend/auth-service/.env
   cp apps/backend/file-service/.env.example    apps/backend/file-service/.env
   cp apps/backend/group-service/.env.example   apps/backend/group-service/.env
   cp apps/backend/vision-service/.env.example  apps/backend/vision-service/.env
   cp apps/frontend/auth-front/.env.example     apps/frontend/auth-front/.env
   cp apps/frontend/vision-front/.env.example   apps/frontend/vision-front/.env
   cp apps/frontend/landing-front/.env.example  apps/frontend/landing-front/.env
   cp apps/frontend/account-front/.env.example  apps/frontend/account-front/.env
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

3. **Start all services:**

   ```sh
   npm run dev
   ```

   Or start backends and frontends separately:

   ```sh
   npm run dev:back
   npm run dev:front
   ```

## Production Deployment

Each service has its own `compose.yml`. A shared root `.env` (copied from `.env.example`) provides secrets to all containers.

```sh
cp .env.example .env
# fill in .env values
docker compose -f apps/backend/auth-service/compose.yml up -d
# repeat for other services
```

See `apps/infra/visin-proxy/` for the Nginx reverse proxy setup.

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
