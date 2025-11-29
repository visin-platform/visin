/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VISION_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
