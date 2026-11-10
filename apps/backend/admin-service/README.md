# Admin API

The platform administrator gateway listens on port 5016. It authenticates the
existing Visin SSO session and reads the current platform-admin role on every
request. Auth-service owns account changes; group-service owns membership changes; chat-service owns Vivi configuration,
policies, runs and usage. No API keys or internal-service tokens grant admin access.

Copy `.env.example` for local development. Add the Admin frontend origin to
`CORS_ORIGIN` on Admin, Auth, Group and Chat. Runtime URLs point to internal services;
provider credentials remain in Chat's encrypted storage. `/api/admin/audit` records
actor, operation and outcome without request bodies or secrets. Pending/uncertain
writes require refreshing state before retrying. `/health` is operational readiness;
Grafana remains the system monitoring interface.

## Layout

```
src/routes/        adminRoutes (guards, /me, /audit, 404) + one router per owner: user, group, vivi
src/middleware/    requirePlatformAdmin (role on the primary, 503 on a DB error), adminRequestGuard (no-store, origin, JSON writes)
src/controllers/   forwardController (audit around a forwarded write), adminController (/me, /audit)
src/services/      upstreamService (owner URLs, fetchWithTimeout), auditService
src/models/        AdminAudit
src/validation/    Zod schemas for route params and the audit query
```

A new operation is one line in the owner's router; anything not listed there is a
404 and never reaches an owner. Each owner still checks the administrator itself.
