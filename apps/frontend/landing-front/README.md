# landing-front

Public site: the pitch at `/about`, the docs at `/docs`, the API reference. No sign-in of its own, and no
backend of its own; its leaderboard preview and "try it" read vision-service anonymously.

- Dev port: `3000`
- Stack: React + Vite + MUI
- `/` sends visitors on to `shell-front` (`SHELL_FRONT_URL`), where Explore shows what people have made public.
  A deployment with no shell address keeps the pitch at `/`, so the site still has a front door.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=landing-front
npm test --workspace=landing-front
npm run test:e2e --workspace=landing-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
