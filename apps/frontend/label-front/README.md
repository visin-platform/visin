# label-front

Frontend for the Visin labeling platform: labeling workbench + job administration.
Design and roadmap live in the repo root's `TODO-LABELING.md`.

- Dev port: `3008`
- Stack: React + Vite + MUI, auth/api-client from `@visin/frontend-core`
- Talks to `label-service` (:5008) for everything job-related and to file-service
  signed URLs for image bytes; auth via the shared `access_token` cookie.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-front
npm test --workspace=label-front
npm run test:e2e --workspace=label-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
