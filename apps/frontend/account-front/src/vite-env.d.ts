/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_SERVICE_URL: string;
  readonly VITE_AUTH_FRONT_URL: string;
  readonly VITE_VISION_FRONT_URL: string;
  readonly VITE_LABEL_FRONT_URL: string;
  readonly VITE_GROUP_SERVICE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
