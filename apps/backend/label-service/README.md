# label-service

Backend for the Visin labeling platform: label bundles (uploaded image sets), labeling
jobs, tasks, answers, and export. Design and roadmap live in the repo root's
`TODO-LABELING.md`.

- Port: `5008`
- Stack: Express + TypeScript + Mongoose, bootstrapped from `@visin/backend-core`
- Auth: every `/api` route requires a signed-in user (JWT `access_token` cookie or
  `Authorization: Bearer`); there are no anonymous or public data routes.
- Storage: image/zip bytes live on disk behind file-service (internal API); this
  service stores metadata only.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-service
npm test --workspace=label-service
```

Copy `.env.example` to `.env` and fill in secrets (JWT secret must match auth-service).
