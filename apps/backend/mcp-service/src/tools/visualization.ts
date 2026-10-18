import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchWithTimeout, TRANSFER_FETCH_TIMEOUT_MS } from '@visin/backend-core';
import { z } from 'zod';
import { vision } from '../vision';
import { isHubRunModel, type StoredRunModel, type Visualization } from '../schemas';
import { paintConfidence, paintMask, readGrey, trainClasses, type OutputClass } from '../outputPixels';
import {
  Caller,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  ToolImage,
  ToolModule,
  capped,
  count,
  day,
  explain,
  licenseSentence,
  metric,
  numericResults,
  resolveTrainingUuid,
  ok,
  okWithImages
} from './module';

/**
 * The rendered frames a run produced — prediction overlays, ground-truth
 * comparisons, segmentation maps.
 *
 * The one part of this server that hands the model something other than text.
 * Everything else answers "what do the numbers say"; these answer "look at what
 * it actually got wrong", which is a different question and the one a computer
 * vision platform is oddly placed to refuse.
 */

/** What a signed URL is allowed to hand back before we stop reading it. */
const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif)$/i;

/**
 * The listing, grouped by the frame rather than by the render.
 *
 * A run renders the same frame several ways — overlay, compare, segment,
 * correct_only — and a flat list repeats the filename once per render. These
 * filenames are not short: a real one measured 79 characters, so twenty rows
 * spent about a third of the answer restating five of them.
 *
 * Grouping also matches how the frames are actually used. "Show me the overlay
 * and the ground truth for that frame" is one question about one scene, and the
 * ids to answer it now sit on one line instead of scattered down a list.
 */
function describeFrames(visualizations: Visualization[]): string[] {
  const groups = new Map<string, Visualization[]>();

  for (const visualization of visualizations) {
    const key = `${visualization.epoch ?? '?'}\u0000${visualization.filename ?? ''}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(visualization);
    groups.set(key, bucket);
  }

  return [...groups.values()].flatMap((frames) => {
    const [first] = frames;
    const epoch = first.epoch !== undefined ? `epoch ${first.epoch}` : 'epoch ?';
    const header = `- ${epoch}${first.filename ? ` — ${first.filename}` : ''}`;

    const renders = [...frames]
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((frame) => `${frame.type} [${frame.visualization_uuid}]`)
      .join(' · ');

    return [header, `    ${renders}`];
  });
}

/**
 * Fetch one frame from the signed URL the listing came with.
 *
 * A direct call to file-service, deliberately outside `callService`: the
 * signature in the URL *is* the credential, so there is no `/api` prefix and no
 * bearer token to send. The same exception vision-front makes for uploads, for
 * the same reason. It still goes through `fetchWithTimeout` — this moves file
 * bytes, so it gets the transfer deadline rather than the control-plane one.
 */
async function fetchImage(url: string): Promise<ToolImage | string> {
  const response = await fetchWithTimeout(url, {
    timeoutMs: TRANSFER_FETCH_TIMEOUT_MS,
    serviceName: 'file-service'
  });

  if (!response.ok) {
    return `the image could not be fetched (HTTP ${response.status})`;
  }

  const mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!IMAGE_MIME.test(mimeType)) {
    // A signed URL that has expired answers with an error page, not a picture.
    return `the stored file is not an image (${mimeType || 'no content type'})`;
  }

  const data = Buffer.from(await response.arrayBuffer());
  if (data.byteLength > MAX_IMAGE_BYTES) {
    return `the image is ${count(data.byteLength)} bytes, too large to return`;
  }

  return { data, mimeType };
}

/** The checkpoints a run keeps on Visin, from its summary; a run that cannot be read has none. */
async function storedModels(key: string, training: string): Promise<StoredRunModel[]> {
  const summary = await vision.getTrainingSummary(key, training);
  return summary.models.filter((model): model is StoredRunModel => !isHubRunModel(model));
}

/** The classes a run's masks index at `epoch`: from that epoch's checkpoint when it names any, else any that does. */
const classesAt = (models: StoredRunModel[], epoch: number | undefined): OutputClass[] => {
  const naming = models.filter((model) => trainClasses(model.modelInfo).length > 0);
  const chosen = naming.find((model) => epoch !== undefined && model.epoch === epoch) ?? naming[0];
  return trainClasses(chosen?.modelInfo);
};

/**
 * A mask or a confidence map, painted so it can be read, with what its colours mean. Anything else, or a file that is
 * not a grey PNG, is returned as it is.
 */
function legible(type: string, image: ToolImage, classes: OutputClass[]): { image: ToolImage; legend?: string } {
  if ((type !== 'mask' && type !== 'confidence') || image.mimeType !== 'image/png') return { image };
  const grey = readGrey(image.data);
  if (!grey) return { image, legend: type === 'mask' ? 'shown as stored (it carries its own colours)' : undefined };
  const painted = type === 'mask' ? paintMask(grey, classes) : paintConfidence(grey, classes.length);
  if (painted.image.byteLength > MAX_IMAGE_BYTES) return { image, legend: 'shown as stored (too large to paint)' };
  return { image: { data: painted.image, mimeType: 'image/png' }, legend: painted.legend };
}

const plural = (value: number, one: string, many = `${one}s`) => `${count(value)} ${value === 1 ? one : many}`;
const sizeOf = (bytes: number | undefined): string => {
  if (bytes === undefined) return '';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

function registerTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_visualizations',
    {
      title: 'Frames a run rendered',
      description:
        'The rendered frames attached to a training run — prediction overlays, ground-truth ' +
        'comparisons, segmentation maps — with the id needed to actually view one. Use to find ' +
        'something worth looking at before calling view_visualizations. A model\'s outputs are the ' +
        'kinds "segment", "mask" and "confidence"; give the epoch to see that checkpoint\'s frames.',
      inputSchema: {
        training: z.string().describe('Training id or uuid, from list_trainings'),
        epoch: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Only this epoch\'s frames. Without it, the newest frames of any epoch come first.'),
        type: z
          .string()
          .optional()
          .describe('Only this kind of frame, e.g. "overlay" or "compare". Omit to see all kinds.'),
        limit: z.number().int().min(1).max(50).optional().describe('How many to list (default 20)')
      }
    },
    async ({ training, epoch, type, limit }) => {
      try {
        const uuid = await resolveTrainingUuid((id) => vision.getTraining(key, id), training);

        const [{ visualizations, total }, { types }] = await Promise.all([
          vision.listVisualizations(key, uuid, { type, limit: limit ?? 20, ...(epoch === undefined ? {} : { epoch }) }),
          vision.listVisualizationTypes(key, uuid)
        ]);

        if (visualizations.length === 0) {
          if (epoch !== undefined && types.length > 0) {
            return ok(`No frames${type ? ` of kind ${type}` : ''} at epoch ${epoch}. This run has these kinds: ${types.join(', ')}.`);
          }
          return ok(
            types.length > 0
              ? `No frames match that. This run has these kinds: ${types.join(', ')}.`
              : 'This run rendered no visualizations.'
          );
        }

        const { shown, note } = capped(visualizations, 50, 'frames');
        const header =
          total && total > visualizations.length
            ? `${count(visualizations.length)} of ${count(total)} frames`
            : `${count(visualizations.length)} frames`;

        return ok(
          [
            `${header} (kinds available: ${types.join(', ') || 'unknown'}):`,
            ...describeFrames(shown),
            '',
            'Pass one or more of these ids to view_visualizations to look at them.'
          ].join('\n') + note
        );
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'view_visualizations',
    {
      title: 'Look at rendered frames',
      description:
        'Returns the actual images so you can see them — what the model predicted, where it ' +
        'disagrees with the ground truth. Use after list_visualizations to inspect failure ' +
        'modes a metric cannot describe: which objects are missed, whether errors cluster at ' +
        'range, in shadow, or on a particular class. Masks and confidence maps come back painted, ' +
        'with a caption saying which colour is which class and how sure the model was.',
      inputSchema: {
        training: z
          .string()
          .optional()
          .describe('The training id the frames belong to, so a mask\'s classes are named from its stored weights'),
        visualizations: z
          .array(z.string())
          .min(1)
          .max(MAX_IMAGES)
          .describe(
            `Visualization ids from list_visualizations. Up to ${MAX_IMAGES} at once — ask for ` +
              'the few worth comparing rather than a whole epoch.'
          )
      }
    },
    async ({ visualizations, training }) => {
      try {
        const records = await Promise.all(
          visualizations.map(async (uuid) => ({ uuid, record: await vision.getVisualization(key, uuid) }))
        );
        // Names for a mask's classes are context, never a reason to lose the frames.
        const decodes = records.some(({ record }) => record.type === 'mask' || record.type === 'confidence');
        const models = training && decodes ? await storedModels(key, training).catch(() => []) : [];

        const images: ToolImage[] = [];
        const captions: string[] = [];

        for (const { uuid, record } of records) {
          if (!record.signedUrl) {
            captions.push(`- ${uuid}: no download URL was issued for this frame`);
            continue;
          }

          const fetched = await fetchImage(record.signedUrl);
          if (typeof fetched === 'string') {
            captions.push(`- ${uuid}: ${fetched}`);
            continue;
          }

          const shown = legible(record.type, fetched, classesAt(models, record.epoch));
          images.push(shown.image);
          // Captioned in the order the images follow, so the model can tell one
          // frame from the next — several overlays of the same scene are
          // otherwise indistinguishable.
          captions.push(
            `- image ${images.length}: [${record.type}]` +
              (record.epoch !== undefined ? ` epoch ${record.epoch}` : '') +
              (record.filename ? ` — ${record.filename}` : '') +
              (shown.legend ? `: ${shown.legend}` : '')
          );
        }

        if (images.length === 0) {
          return ok(['None of those frames could be shown:', ...captions].join('\n'));
        }

        return okWithImages(
          [`Showing ${count(images.length)} frame(s):`, ...captions].join('\n'),
          images
        );
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_model_outputs',
    {
      title: 'What a stored model produced',
      description:
        'A checkpoint Visin keeps for a run: its file, licence and digest, the classes and input it ' +
        'expects, the data it was trained and predicted on, how many outputs (segment, mask, ' +
        'confidence) it has, what its epoch reported and the tests it was scored on. Answers "which ' +
        'model is this and can I use it", and says how to look at its frames.',
      inputSchema: {
        training: z.string().describe('The training id, from list_trainings'),
        model: z
          .string()
          .optional()
          .describe('The model id, when the run keeps several checkpoints. Without it, the newest one that is served.')
      }
    },
    async ({ training, model }) => {
      try {
        const models = await storedModels(key, training);
        if (models.length === 0) {
          return ok('This run keeps no model on Visin. A model on Hugging Face, if any, is named by get_training.');
        }
        const served = models
          .filter((entry) => entry.status === 'ready' && entry.license && entry._id)
          // The newest epoch first, and of one checkpoint its weights before an export.
          .sort((a, b) => (b.epoch ?? -1) - (a.epoch ?? -1) || Number(b.format === 'pth') - Number(a.format === 'pth'));
        const chosen = model ? models.find((entry) => entry._id === model) : served[0];
        if (!chosen) {
          if (model) return ok(`This run has no stored model ${model}. Its models: ${models.map((entry) => `${entry.filename ?? entry.format} [${entry._id}]`).join(', ')}.`);
          const why = models.map((entry) => {
            const reason = entry.status !== 'ready' ? `is ${entry.status ?? 'not verified'}` : 'has no licence stated';
            return `${entry.filename ?? `${entry.format} checkpoint`} ${reason}`;
          });
          return ok(`None of this run's models is served yet, so their outputs are not either: ${why.join('; ')}.`);
        }

        const outputs = await vision.getModelOutputs(key, training, chosen._id!);
        const { run, metrics } = outputs;
        const info = outputs.model;
        const classes = trainClasses(info.modelInfo);
        const lines = [
          `${info.filename ?? `${info.format} checkpoint`}: the checkpoint from epoch ${run.epoch} of "${run.name}"` +
            `${run.project ? ` in ${run.project.name}` : ''}.`,
          `Format ${info.format}${info.size === undefined ? '' : `, ${sizeOf(info.size)}`}. ` +
            licenseSentence(
              info.license ? { name: info.license.name ?? info.license.id, url: info.license.url } : undefined,
              info.credit
            ),
          `Weights: GET ${info.file} on this deployment's API.` +
            (outputs.sameCheckpoint.length
              ? ` Also stored as ${outputs.sameCheckpoint.map((other) => `${other.format}${other.size === undefined ? '' : ` (${sizeOf(other.size)})`}`).join(', ')}.`
              : ''),
          `Checkpoint SHA-256: ${outputs.checkpoint.sha256 ?? 'not recorded'}.`
        ];
        if (info.parity) {
          lines.push(
            `The ONNX export agrees with the weights: ${(info.parity.argmaxMismatchFraction * 100).toFixed(2)}% of pixels ` +
              `change class, largest output difference ${info.parity.maxAbsDiff.toPrecision(2)} (on ${plural(info.parity.frames, 'frame')}).`
          );
        }
        lines.push(
          classes.length ? `Classes: ${classes.map((entry) => `${entry.index} ${entry.name}`).join(', ')}.` : 'Classes: not named by the weights.'
        );
        const transforms = info.modelInfo?.transforms;
        if (transforms && typeof transforms === 'object') {
          const parts = Object.entries(transforms as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'number' || Array.isArray(value))
            .map(([name, value]) => `${name} ${Array.isArray(value) ? value.join('/') : value}`);
          if (parts.length) lines.push(`Preprocessing: ${parts.join(', ')}.`);
        }

        const dataset = (ref: { id?: string; name?: string; revision?: string; archiveRevision?: string } | null | undefined) => {
          if (!ref) return 'a dataset the upload did not name';
          const revision = ref.archiveRevision ?? ref.revision;
          return `${ref.name ?? ref.id ?? 'an unnamed dataset'}${revision ? ` @ ${revision}` : ''}`;
        };
        lines.push('', `Trained on: ${outputs.trainedOn ? dataset(outputs.trainedOn) : 'not recorded'}.`);
        lines.push(
          outputs.predictedOn.length
            ? `Predicted on: ${outputs.predictedOn.map(({ dataset: ref, frames }) => `${dataset(ref)}, ${plural(frames.length, 'frame')}`).join('; ')}.`
            : 'Predicted on: nothing uploaded yet.'
        );
        const totals = ['segment', 'mask', 'confidence'].map((kind) => `${count(outputs.totals[kind] ?? 0)} ${kind}`);
        lines.push(
          `Outputs at epoch ${run.epoch}: ${totals.join(', ')}. To look at them: list_visualizations with this training ` +
            `and epoch ${run.epoch}, then view_visualizations with the training so masks are painted with class names.`
        );

        const reported = numericResults(metrics.results ?? {});
        if (reported.length) {
          lines.push('', `What epoch ${metrics.epoch} reported: ${reported.map(([path, value]) => `${path} ${metric(value)}`).join(', ')}.`);
        }
        if (metrics.evaluations.length) {
          const tests = metrics.evaluations.map((evaluation) => {
            const samples = Object.values(evaluation.sampleCounts ?? {}).reduce((sum, value) => sum + value, 0);
            const details = [evaluation.executedAt ? day(evaluation.executedAt) : undefined, samples ? plural(samples, 'sample') : undefined].filter(Boolean);
            return `${evaluation.suite ? `${evaluation.suite.slug}@${evaluation.suite.version}` : 'a test without a suite'}${details.length ? ` (${details.join(', ')})` : ''}`;
          });
          lines.push(`Tests of this checkpoint: ${tests.join('; ')}. get_test_results gives the per-condition detail.`);
        } else {
          lines.push('No test you can see scored this checkpoint.');
        }

        const others = served.filter((entry) => entry !== chosen && entry.epoch !== chosen.epoch);
        if (!model && others.length) {
          lines.push('', `Other checkpoints: ${others.map((entry) => `${entry.filename ?? entry.format}, epoch ${entry.epoch ?? '?'} [${entry._id}]`).join('; ')}.`);
        }
        return ok(lines.join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const visualizationRead: ToolModule = {
  scopes: ['vision:read'],
  register: registerTools
};
