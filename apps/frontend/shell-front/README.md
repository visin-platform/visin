# shell-front

One page for Vision, Labeling and Account: the module-federation host that keeps the sidebar mounted while it loads
`vision-front`, `label-front` and `account-front` into the content area, so moving between them is a client-side
route change rather than a page load. Each of those apps also keeps running standalone on its own address.

- Dev port: `3010`
- Stack: React + Vite + MUI, `@module-federation/vite` host, auth/layout from `@visin/frontend-core`
- Owns the router, the sidebar, the top bar (search, Sign in / Sign up, New, account menu), the session shown in
  it, and `/`, `/explore`, `/login`, `/image-labeling/*`. Every other path belongs to the app named in
  `src/apps.ts`, whose exposed `./App` renders it.
- `/` is **Explore** for a visitor (public projects, datasets, the leaderboard and recent findings, all readable
  without an account) and the member's own home for a signed-in session, with Explore one tab over at `/explore`.
- Remote addresses are runtime config (`VISION_FRONT_URL`, `LABEL_FRONT_URL`, `ACCOUNT_FRONT_URL` in
  `config.json`); each remote serves `remoteEntry.js` at that root. An app that is down or unconfigured shows a
  retry panel in place of its pages.
- `VISION_API_URL`, `DATASET_API_URL`, `LABEL_SERVICE_URL` and `GROUP_SERVICE_URL` feed the home and Explore pages
  (each part is left out when its URL is unset). `LANDING_FRONT_URL` is where a visitor's Docs and About links go;
  unset, they are left out.

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

## Public sharing and crawlers

The public project, dataset, profile, group and leaderboard pages have Share buttons that copy HTML preview links
from the owning API. Each API needs `SHELL_FRONT_URL` pointing to this shell; without it a preview returns 404.
The shell serves `/og-image.jpg` and a plain-text `/robots.txt`. At startup, the existing `VISION_API_URL`,
`DATASET_API_URL`, `AUTH_SERVICE_URL` (public profiles) and `GROUP_SERVICE_URL` (public groups) settings supply the
sitemap links. The services check current public visibility on every request and never cache the response.
Unconfigured services have no sitemap link.

`/people` and `/people/groups` are the directory of every public profile and group, a page at a time (`?page=N`, in
handle order) with plain links for rows and page numbers, so a crawler can walk to every page. Explore and Search link
to it, and the sitemaps list it. It reads `/auth/directory` and `/api/public/directory`, and omits a kind whose service
is not configured.

Profile and group pages set their own `<title>`, description and self-referencing canonical (`usePageMeta`), which
Googlebot reads once the page has rendered. The share previews are `noindex` and name the app page as canonical. Local Vite development serves the static
robots.txt without deployment sitemap links.
