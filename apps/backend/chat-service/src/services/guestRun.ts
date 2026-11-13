import {
  fetchWithTimeout,
  ForbiddenError,
  ServiceUnavailableError,
  TRANSFER_FETCH_TIMEOUT_MS
} from '@visin/backend-core';
import { MAX_IMAGE_INPUT_BYTES, type ImageInput } from './imageInput';

/** Frames a guest answer may look at: enough to compare two, few enough to stay cheap. */
export const GUEST_FRAMES = 2;
const LISTED_FRAMES = 12;
const LISTED_METRICS = 12;
const FRAME_MIME = /^image\/(png|jpeg|webp|gif)$/;
/** A question about what a picture shows, in the words visitors use for the frames on a run's page. */
const ABOUT_IMAGES =
  /\b(image|images|picture|pictures|photo|frame|frames|visuali[sz]ation|visuali[sz]ations|overlay|overlays|mask|prediction|predictions|shown|see|look)\b/i;

interface Frame {
  file: string;
  type: string;
  epoch?: number;
  url?: string;
}
export interface PublicRunContext {
  /** What the model reads about the run: its identity, metrics and which frames exist. */
  run: {
    name: string;
    link: string;
    status?: string;
    dataset?: string;
    tags?: string[];
    epochs?: number;
    metrics: { metric: string; better: string; best?: string; last?: string }[];
    frames?: { total: number; newest: { file: string; type: string; epoch?: number }[]; attached: string[] };
  };
  /** The frames attached for the model to look at, in the order `run.frames.attached` names them. */
  images: ImageInput[];
}

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const point = (value: unknown): string | undefined => {
  const at = value as { epoch?: unknown; value?: unknown } | undefined;
  return typeof at?.value === 'number' && typeof at.epoch === 'number'
    ? `${Number(at.value.toPrecision(4))} at epoch ${at.epoch}`
    : undefined;
};

/** One of vision's public reads, asked with no credential: what it refuses, a visitor may not be told. */
async function visionJson(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(new URL(path, process.env.VISION_SERVICE_URL), {
    redirect: 'error',
    cache: 'no-store',
    signal,
    serviceName: 'vision-service'
  });
  if ([401, 403, 404].includes(response.status)) throw new ForbiddenError('This run is not publicly available');
  if (!response.ok) throw new ServiceUnavailableError('Public run data is unavailable right now');
  const body = (await response.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  if (!body?.data) throw new ServiceUnavailableError('Public run data is unavailable right now');
  return body.data;
}

/** Which project a run belongs to, for a question that links a run without saying where it lives. */
export async function runProjectId(trainingId: string, signal: AbortSignal): Promise<string | undefined> {
  const summary = await visionJson(`/api/trainings/${encodeURIComponent(trainingId)}/summary`, signal);
  const projectId = String((summary.training as Record<string, unknown> | undefined)?.projectId ?? '');
  return /^[a-f\d]{24}$/i.test(projectId) ? projectId : undefined;
}

/** A Visin page a question links or pastes: the run or project in its path. Only the path is read, never fetched. */
export function linkedPage(question: string): { trainingId?: string; projectId?: string } {
  const run = /\/trainings\/([a-f\d]{24})(?![a-f\d])/i.exec(question)?.[1];
  const project = /\/projects\/([a-z0-9][a-z0-9_-]{0,119})/i.exec(question)?.[1];
  return { ...(run ? { trainingId: run } : {}), ...(project ? { projectId: project } : {}) };
}

async function frameImage(frame: Frame, signal: AbortSignal): Promise<ImageInput | null> {
  if (!frame.url) return null;
  try {
    const response = await fetchWithTimeout(frame.url, {
      timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
      signal,
      serviceName: 'file-service'
    });
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!response.ok || !FRAME_MIME.test(mime)) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.byteLength > MAX_IMAGE_INPUT_BYTES) return null;
    return { name: frame.file, mime, data: data.toString('base64') };
  } catch {
    // A frame that cannot be fetched is left out; the answer goes on from the run's numbers.
    return null;
  }
}

/**
 * The run on a visitor's page, as anyone may see it: its name, data, each metric's best and last epoch, and the
 * frames it rendered. It must belong to the public project the page was checked as, so a run id cannot reach into
 * another project. When the question is about a picture, up to GUEST_FRAMES frames come with it for the model to
 * look at: the ones the question names by file, otherwise the newest.
 */
export async function publicRun(input: {
  trainingId: string;
  projectId: string;
  question: string;
  signal: AbortSignal;
}): Promise<PublicRunContext> {
  const summary = await visionJson(`/api/trainings/${encodeURIComponent(input.trainingId)}/summary`, input.signal);
  const training = (summary.training ?? {}) as Record<string, unknown>;
  if (String(training.projectId) !== input.projectId) throw new ForbiddenError('This run is not publicly available');
  const uuid = text(training.uuid, 64);

  let frames: Frame[] = [];
  let total = 0;
  if (/^[\w-]{8,64}$/.test(uuid)) {
    const listed = await visionJson(
      `/api/visualizations/training/${uuid}?limit=${LISTED_FRAMES * 2}`,
      input.signal
    ).catch(() => ({}) as Record<string, unknown>);
    total = typeof listed.total === 'number' ? listed.total : 0;
    frames = (Array.isArray(listed.visualizations) ? listed.visualizations : []).flatMap((item) => {
      const frame = item as Record<string, unknown>;
      const file = text(frame.filename, 120);
      return file
        ? [
            {
              file,
              type: text(frame.type, 40),
              ...(typeof frame.epoch === 'number' ? { epoch: frame.epoch } : {}),
              ...(typeof frame.signedUrl === 'string' ? { url: frame.signedUrl } : {})
            }
          ]
        : [];
    });
  }

  const asked = input.question.toLowerCase();
  const named = frames.filter((frame) => asked.includes(frame.file.toLowerCase()));
  const chosen = (named.length ? named : ABOUT_IMAGES.test(input.question) ? frames : []).slice(0, GUEST_FRAMES);
  const images = (await Promise.all(chosen.map((frame) => frameImage(frame, input.signal)))).filter(
    (image): image is ImageInput => image !== null
  );

  const dataset = (training.dataset ?? {}) as Record<string, unknown>;
  return {
    run: {
      name: text(training.name, 200),
      link: `/trainings/${input.trainingId}`,
      ...(text(training.status, 30) ? { status: text(training.status, 30) } : {}),
      ...(text(dataset.name, 100) ? { dataset: text(dataset.name, 100) } : {}),
      ...(Array.isArray(training.tags) && training.tags.length
        ? { tags: training.tags.slice(0, 8).map((tag) => text(tag, 40)) }
        : {}),
      ...(typeof summary.epochCount === 'number' ? { epochs: summary.epochCount } : {}),
      metrics: (Array.isArray(summary.metrics) ? summary.metrics : []).slice(0, LISTED_METRICS).map((item) => {
        const metric = item as Record<string, unknown>;
        return {
          metric: text(metric.path, 60),
          better: text(metric.direction, 10),
          ...(point(metric.best) ? { best: point(metric.best) } : {}),
          ...(point(metric.last) ? { last: point(metric.last) } : {})
        };
      }),
      ...(frames.length
        ? {
            frames: {
              total: total || frames.length,
              newest: frames.slice(0, LISTED_FRAMES).map(({ file, type, epoch }) => ({ file, type, epoch })),
              attached: images.map((image) => image.name)
            }
          }
        : {})
    },
    images
  };
}
