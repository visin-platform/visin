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

## Bundle import

A bundle zip is uploaded (signed PUT to file-service), then imported in two calls:

```
POST /api/bundles/:id/import/preview  { zipFileId }        → folders + suggested mapping
POST /api/bundles/:id/import          { zipFileId, mapping? } → ImportJob (poll for progress)
```

`preview` walks the zip without extracting it and reports what each folder holds; the
client shows that as the mapping table and posts back an `ImportMapping`
(`frames`, `annotations: [{ path, set }]`, `manifest`, and the `idsSuffix` /
`masksSuffix` file-name patterns). Omitting `mapping` falls back to the default layout —
`frames/`, `annotations/<set>/` (legacy `ann/` still accepted), `manifest.csv|jsonl` —
so a conventional bundle needs no mapping at all. Both paths run through
`utils/bundlePaths.ts`, the single definition of what a zip entry means.

## Changing a bundle

`PATCH /api/bundles/:id` edits `name` / `description` only. Imported images are
immutable by design: `LabelTask` rows point at `LabelImage` ids and answers point at
tasks, so overwriting an image would silently change what an already-labelled task
showed. Grow a bundle by uploading another zip (ingest skips paths already imported),
ship corrected annotations as a *new* set name rather than replacing one, and delete a
bundle only before any job uses it — `deleteBundle` refuses while a non-archived job
references it. `groupId` is not editable; moving a bundle would change who can see
every job drawing from it.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-service
npm test --workspace=label-service
```

Copy `.env.example` to `.env` and fill in secrets (JWT secret must match auth-service).
