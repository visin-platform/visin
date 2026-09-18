/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VISION_API_URL: string;
  readonly VITE_DATASET_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
