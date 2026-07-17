# vision-front

Main Visin app: projects, datasets, trainings, epochs, test results,
comparisons, benchmarks, and visualizations.

- Dev port: `3012`
- Stack: React + Vite + MUI, React Query for data fetching, auth/api-client
  from `@visin/frontend-core`
- Talks to `vision-service` (:4010) for all project-scoped data, `auth-service`
  (:5001) for sign-in, and `group-service` (:5006) for group membership; links
  out to `account-front` and `label-front`. Visualization/dataset uploads go
  direct to file-service signed URLs, bypassing `vision-service`.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=vision-front
npm test --workspace=vision-front
npm run test:e2e --workspace=vision-front   # playwright smoke
```

Copy `.env.example` to `.env` for local URLs.
