# landing-front

Public site: the pitch at `/` and `/about`, the docs at `/docs`, the API reference. No sign-in of its own, and no
backend of its own; its leaderboard preview and "try it" read vision-service anonymously.

- Dev port: `3000`
- Stack: React + Vite + MUI
- Production: `about.visin.eu` serves this site; `visin.eu` serves `shell-front`.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=landing-front
npm test --workspace=landing-front
npm run test:e2e --workspace=landing-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
