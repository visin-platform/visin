/**
 * Module-federation settings every Visin front has to agree on. shell-front is
 * the host; vision-front, label-front and account-front are remotes it loads at
 * runtime from their own origins.
 *
 * The shared singletons are the libraries that hold React context or global
 * state. A remote running its own copy of React breaks hooks outright, and its
 * own copy of the router, Emotion or React Query reads an empty context instead
 * of the one the host's providers filled — so every app must take the single
 * copy the host loaded. The list lives here rather than in four vite configs
 * because drift between those copies is precisely that failure.
 *
 * Plain data with no React imports: each `vite.config.ts` loads it in Node.
 */
export const VISIN_FEDERATION_SHARED = {
  react: { singleton: true },
  'react-dom': { singleton: true },
  'react-router-dom': { singleton: true },
  '@emotion/react': { singleton: true },
  '@emotion/styled': { singleton: true },
  '@mui/material': { singleton: true },
  '@tanstack/react-query': { singleton: true }
};

/** File each remote serves its federation entry as, at the root of its origin. */
export const VISIN_REMOTE_ENTRY = 'remoteEntry.js';

/** The module every remote exposes: its routes wrapped in its own providers. */
export const VISIN_REMOTE_MODULE = './App';

/**
 * Vision's upload corner, which the shell renders on every page so a running
 * zip upload stays visible outside Vision. Only the vision remote exposes it.
 */
export const VISIN_UPLOADS_MODULE = './Uploads';
