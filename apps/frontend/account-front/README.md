# account-front

Account settings: profile, security, and data management for a signed-in user.

- Dev port: `3007`
- Stack: React + Vite + MUI, auth/api-client from `@visin/frontend-core`
- Talks to `auth-service` (:5001) for profile/session data; redirects to
  `auth-front` to sign in. Its sidebar carries the same Vision and Labeling
  sections as `vision-front` and `label-front` (linking across via
  `VISION_FRONT_URL` / `LABEL_FRONT_URL`), with its own Account sections below.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=account-front
npm test --workspace=account-front
npm run test:e2e --workspace=account-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
