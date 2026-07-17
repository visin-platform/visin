# auth-front

Google sign-in landing page: kicks off OAuth, then redirects back to whichever
front sent the user here once `auth-service` has set the `access_token` cookie.

- Dev port: `3004`
- Stack: React + Vite + MUI, auth/api-client from `@visin/frontend-core`
- Talks to `auth-service` (:5001) for the sign-in flow; no direct calls to any
  other backend.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=auth-front
npm test --workspace=auth-front
npm run test:e2e --workspace=auth-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs and the Google OAuth client ID.
