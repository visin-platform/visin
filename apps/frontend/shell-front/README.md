# shell-front

One page for Vision, Labeling and Account: the module-federation host that keeps the sidebar mounted while it loads
`vision-front`, `label-front` and `account-front` into the content area, so moving between them is a client-side
route change rather than a page load. Each of those apps also keeps running standalone on its own address.

- Dev port: `3010`
- Stack: React + Vite + MUI, `@module-federation/vite` host, auth/layout from `@visin/frontend-core`
- Owns the router, the sidebar, the session shown in it, and `/`, `/login`, `/image-labeling/*`. Every other path
  belongs to the app named in `src/apps.ts`, whose exposed `./App` renders it.
- Remote addresses are runtime config (`VISION_FRONT_URL`, `LABEL_FRONT_URL`, `ACCOUNT_FRONT_URL` in
  `config.json`); each remote serves `remoteEntry.js` at that root. An app that is down or unconfigured shows a
  retry panel in place of its pages.

## Develop

```sh
npm install                                 # from the repo root
npm run dev --workspace=vision-front        # the remotes it should load (any subset)
npm run dev --workspace=label-front
npm run dev --workspace=account-front
npm run dev --workspace=shell-front         # then open http://localhost:3010
npm test --workspace=shell-front
```

Copy `.env.example` to `.env` for local URLs. `npm run dev:front` at the root starts all of them.
