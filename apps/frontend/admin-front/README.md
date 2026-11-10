# Visin Admin

Standalone platform-admin frontend on port 3016. Copy `.env.example` to `.env` for local development (the defaults
already point at the other apps on their fixed ports), then run `npm run dev --workspace=admin-front` from the
repository root. Docker generates `config.json` at startup from the public `ADMIN_SERVICE_URL`, `AUTH_SERVICE_URL`,
`AUTH_FRONT_URL`, and the optional `SHELL_FRONT_URL` ("Back to Visin") and `GRAFANA_URL`.

It uses the shared Visin layout, theme and SSO cookie: the rail names an area (Users, Vivi, History), the bar above the
page lists its sections, and the account menu signs out. Sections have their own addresses (`/users`, `/vivi`,
`/policies`, `/usage`, `/runs`, `/history`); the old `/?view=…` addresses redirect. A visitor, an account that is not an
administrator, and an unreachable Admin API each get a page that says so.

The API enforces administrator access; hiding a page is not an authorization boundary. See
[admin-service](../../backend/admin-service/README.md) for what the gateway forwards and audits. System dashboards
stay in Grafana.
