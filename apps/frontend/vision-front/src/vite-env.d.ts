/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VISION_API_URL: string;
  readonly VITE_DATASET_API_URL: string;
  readonly VITE_LANDING_FRONT_URL?: string;
  readonly VITE_SHELL_FRONT_URL?: string;
  readonly VITE_HF_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
