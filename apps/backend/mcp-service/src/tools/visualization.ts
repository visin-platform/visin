import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchWithTimeout, TRANSFER_FETCH_TIMEOUT_MS } from '@visin/backend-core';
import { z } from 'zod';
import { vision } from '../vision';
import type { Visualization } from '../schemas';
import {
  Caller,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  ToolImage,
  ToolModule,
  capped,
  count,
  explain,
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

function registerTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_visualizations',
    {
      title: 'Frames a run rendered',
      description:
        'The rendered frames attached to a training run — prediction overlays, ground-truth ' +
        'comparisons, segmentation maps — with the id needed to actually view one. Use to find ' +
        'something worth looking at before calling view_visualizations.',
      inputSchema: {
        training: z.string().describe('Training id or uuid, from list_trainings'),
        type: z
          .string()
          .optional()
          .describe('Only this kind of frame, e.g. "overlay" or "compare". Omit to see all kinds.'),
        limit: z.number().int().min(1).max(50).optional().describe('How many to list (default 20)')
      }
    },
    async ({ training, type, limit }) => {
      try {
        const uuid = await resolveTrainingUuid((id) => vision.getTraining(key, id), training);

        const [{ visualizations, total }, { types }] = await Promise.all([
          vision.listVisualizations(key, uuid, { type, limit: limit ?? 20 }),
          vision.listVisualizationTypes(key, uuid)
        ]);

        if (visualizations.length === 0) {
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
        'range, in shadow, or on a particular class.',
      inputSchema: {
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
    async ({ visualizations }) => {
      try {
        const records = await Promise.all(
          visualizations.map(async (uuid) => ({ uuid, record: await vision.getVisualization(key, uuid) }))
        );

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

          images.push(fetched);
          // Captioned in the order the images follow, so the model can tell one
          // frame from the next — several overlays of the same scene are
          // otherwise indistinguishable.
          captions.push(
            `- image ${images.length}: [${record.type}]` +
              (record.epoch !== undefined ? ` epoch ${record.epoch}` : '') +
              (record.filename ? ` — ${record.filename}` : '')
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
}

export const visualizationRead: ToolModule = {
  scopes: ['vision:read'],
  register: registerTools
};
