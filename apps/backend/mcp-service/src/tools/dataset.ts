import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import { Caller, ToolModule, capped, count, day, explain, ok } from './module';

/**
 * The data a model was trained on.
 *
 * Read-only. There is no `create_dataset` here, and deliberately so: a dataset
 * arrives by uploading images and annotations, which is a file transfer rather
 * than an API call an assistant can make. A tool that created the record
 * without the data would leave an empty shell in the app for someone to find
 * later and wonder about.
 */

/**
 * A metadata blob, flattened to one line per scalar.
 *
 * `dataset_info`, `annotations`, `camera` and `lidar` are open records — a
 * dataset describes its own sensor rig — so nothing here names a field. Nested
 * objects are summarised rather than rendered: they are usually per-sensor
 * calibration matrices, which cost hundreds of tokens and answer nothing a
 * person asked.
 */
function describeMetadata(label: string, blob: Record<string, unknown> | undefined): string[] {
  if (!blob) return [];
  const entries = Object.entries(blob);
  if (entries.length === 0) return [];

  const lines = [`${label}:`];
  for (const [key, value] of entries) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`  ${key}: ${count(value.length)} entries`);
    } else if (typeof value === 'object') {
      lines.push(`  ${key}: ${count(Object.keys(value).length)} fields`);
    } else {
      lines.push(`  ${key}: ${String(value)}`);
    }
  }
  return lines.length > 1 ? lines : [];
}

function registerReadTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'list_datasets',
    {
      title: 'Datasets',
      description:
        'The datasets available to train on. Use to find the dataset a run used, or to answer ' +
        '"what data do we have".',
      inputSchema: {
        search: z.string().optional().describe('Free-text filter over name and description'),
        limit: z.number().int().min(1).max(100).optional().describe('How many to return (default 30)')
      }
    },
    async ({ search, limit }) => {
      try {
        const { datasets, pagination } = await vision.listDatasets(key, {
          search,
          limit: limit ?? 30
        });

        if (datasets.length === 0) return ok('No datasets match that.');

        const { shown, note } = capped(datasets, 100, 'datasets');
        const total = pagination?.total ?? datasets.length;
        const lines = shown.map((dataset) => {
          const description = dataset.description ? ` — ${dataset.description}` : '';
          return `- ${dataset.name}${description}  [${dataset.uuid ?? dataset._id}]`;
        });

        const header =
          total > datasets.length
            ? `${count(datasets.length)} of ${count(total)} datasets:`
            : `${count(datasets.length)} datasets:`;
        return ok([header, ...lines].join('\n') + note);
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'get_dataset',
    {
      title: 'One dataset',
      description:
        'A dataset and what is recorded about it: its description, when it was captured, and ' +
        'whatever sensor, annotation and camera metadata it carries. Use for "what is in this ' +
        'dataset", "how was it captured".',
      inputSchema: { dataset: z.string().describe('The dataset id, from list_datasets') }
    },
    async ({ dataset }) => {
      try {
        const details = await vision.getDataset(key, dataset);

        const lines = [details.name];
        if (details.description) lines.push(details.description);
        if (details.timestamp) lines.push(`Captured ${day(details.timestamp)}.`);

        for (const [label, blob] of [
          ['Dataset info', details.dataset_info],
          ['Annotations', details.annotations],
          ['Camera', details.camera],
          ['Lidar', details.lidar]
        ] as const) {
          const described = describeMetadata(label, blob);
          if (described.length > 0) lines.push('', ...described);
        }

        return ok(lines.join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'list_image_categories',
    {
      title: 'The classes in a dataset',
      description:
        'The image categories defined for a dataset — the label vocabulary. Use for "what ' +
        'classes does this dataset have", or to check a class name before asking about its scores.',
      inputSchema: { dataset: z.string().describe('The dataset id, from list_datasets') }
    },
    async ({ dataset }) => {
      try {
        const categories = await vision.listImageCategories(key, dataset);
        if (categories.length === 0) return ok('That dataset has no image categories defined.');

        const { shown, note } = capped(categories, 200, 'categories');
        const lines = shown.map((category) =>
          category.description ? `- ${category.name} — ${category.description}` : `- ${category.name}`
        );
        return ok([`${count(categories.length)} categories:`, ...lines].join('\n') + note);
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const datasetRead: ToolModule = { scopes: ['dataset:read'], register: registerReadTools };
