# account-front

Account settings: profile, security, and data management for a signed-in user.

- Dev port: `3007`
- Stack: React + Vite + MUI, auth/api-client from `@visin/frontend-core`
- Talks to `auth-service` (:5001) for profile/session data; redirects to
  `auth-front` to sign in and links back to `vision-front` ("Back to Vision").

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=account-front
npm test --workspace=account-front
npm run test:e2e --workspace=account-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
