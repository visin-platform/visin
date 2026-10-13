/**
 * The editor's side of the `visin-infer` protocol (the `visin-infer` server lives in its own repo, `visin-inference`):
 * a model running on the annotator's own machine, called straight from their
 * browser. The Visin servers never see these calls.
 */

export interface ModelSettings {
  /** where the server listens, e.g. `http://localhost:8000` */
  url: string;
  /** sent as `X-Visin-Token` when the server was started with one */
  token?: string;
}

export interface ModelInfo {
  name: string;
  version: string;
  device: string;
  classes: string[];
  supports: { detect: boolean; segment: boolean };
}

export interface DetectedBox {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface SegmentResult {
  /** the mask as run-length bytes, in the form `maskCodec` reads */
  rle: Uint8Array;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  score: number;
}

export interface SegmentPrompt {
  imageId: string;
  /** sent when the server does not already hold this `imageId` */
  image?: Blob;
  points: { x: number; y: number; label: 0 | 1 }[];
  /** `[x, y, width, height]` */
  box?: [number, number, number, number];
}

/** Why a call failed, in the terms an annotator can act on. */
export type ModelFailure = 'unreachable' | 'unauthorized' | 'refused' | 'server';

export class ModelError extends Error {
  readonly kind: ModelFailure;
  constructor(kind: ModelFailure, message: string) {
    super(message);
    this.name = 'ModelError';
    this.kind = kind;
  }
}

/** The server holds no image for the id: send it and ask again. */
export class ImageNeededError extends Error {
  constructor() {
    super('The model server needs the image');
    this.name = 'ImageNeededError';
  }
}

const TIMEOUT_MS = { info: 4000, detect: 60_000, segment: 30_000 };

export const normalizeUrl = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : trimmed ? `http://${trimmed}` : '';
};

const call = async (
  settings: ModelSettings,
  path: string,
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> },
  timeoutMs: number
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${normalizeUrl(settings.url)}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers: { ...(settings.token ? { 'X-Visin-Token': settings.token } : {}), ...init.headers },
      signal: controller.signal
    });
    if (path === '/segment' && response.status === 409) throw new ImageNeededError();
    if (!response.ok) throw await readError(response);
    // Keep the deadline through the body: fetch resolves when only the headers
    // have arrived, while a model server may still be sending a large mask.
    return await response.json();
  } catch (error) {
    if (error instanceof ModelError || error instanceof ImageNeededError) throw error;
    if (error instanceof SyntaxError) throw new ModelError('server', 'The model server returned invalid JSON');
    // A refused connection, a blocked cross-origin call and a timeout all look
    // alike from a page, and all mean "start the server or check the address".
    throw new ModelError('unreachable', `Could not reach the model server at ${normalizeUrl(settings.url)}`);
  } finally {
    clearTimeout(timer);
  }
};

const readError = async (response: Response): Promise<ModelError> => {
  let message = `The model server answered ${response.status}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // keep the status message
  }
  if (response.status === 401) return new ModelError('unauthorized', 'The model server wants a token');
  if (response.status === 403) return new ModelError('refused', 'The model server does not allow this site — start it with --allow-origin');
  return new ModelError('server', message);
};

export const getInfo = async (settings: ModelSettings): Promise<ModelInfo> => {
  return (await call(settings, '/info', {}, TIMEOUT_MS.info)) as ModelInfo;
};

export const detect = async (settings: ModelSettings, image: Blob, minScore: number): Promise<DetectedBox[]> => {
  const body = await call(
    settings,
    `/detect?minScore=${encodeURIComponent(String(minScore))}`,
    { method: 'POST', body: image, headers: { 'Content-Type': image.type || 'application/octet-stream' } },
    TIMEOUT_MS.detect
  );
  return (body as { boxes: DetectedBox[] }).boxes;
};

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: spreading a megabyte into one call overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

export const segment = async (settings: ModelSettings, prompt: SegmentPrompt): Promise<SegmentResult> => {
  const response = await call(
    settings,
    '/segment',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageId: prompt.imageId,
        ...(prompt.image ? { image: await toBase64(prompt.image) } : {}),
        points: prompt.points,
        ...(prompt.box ? { box: prompt.box } : {})
      })
    },
    TIMEOUT_MS.segment
  );
  const body = response as Omit<SegmentResult, 'rle'> & { rle: string };
  return { ...body, rle: fromBase64(body.rle) };
};
