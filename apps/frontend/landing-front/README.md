# landing-front

Public marketing site: product pitch, contact form, and the entry link into
`vision-front`. No sign-in of its own.

- Dev port: `3000`
- Stack: React + Vite + MUI
- The contact form posts directly to `vision-service`'s `/api/contacts`
  (:4010, no auth cookie); the "Get started" CTA links to `vision-front`.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=landing-front
npm test --workspace=landing-front
npm run test:e2e --workspace=landing-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
