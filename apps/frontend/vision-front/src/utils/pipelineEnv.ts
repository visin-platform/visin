import { visionApiOrigin } from '../config/visionApi';

/** The lines a training script reads its address and key from, named as the quickstart names them. */
export const pipelineEnv = (token: string): string => `export VISIN_URL=${visionApiOrigin()}\nexport VISIN_TOKEN=${token}`;
