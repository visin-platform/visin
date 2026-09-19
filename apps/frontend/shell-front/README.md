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

## Installable app (PWA)

The shell is what installs as an app on a phone or desktop: `public/manifest.webmanifest`, icons in `public/`
(`icon-192.png`/`icon-512.png` double as maskable — the logo sits inside the safe zone — plus
`apple-touch-icon.png`), and `public/sw.js`, registered from `src/pwa.ts` in production builds only.

The service worker caches no app code on purpose: vision, label and account are loaded from their own deployments
at runtime, so a cached shell would pair stale host code with fresh remotes. It only serves `offline.html` when a
navigation fails. nginx serves `sw.js` and the manifest uncached so an update is picked up on the next load. After
changing `favicon.svg`, re-render the PNGs from it (e.g. with `sharp`, flattened on white).
