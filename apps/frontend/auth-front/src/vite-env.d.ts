/// <reference types="vite/client" />

/** The release this build was cut from (APP_VERSION at build), or "dev". */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_AUTH_SERVICE_URL: string;
  readonly VITE_VISION_API_URL?: string;
  readonly VITE_FARO_COLLECTOR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
