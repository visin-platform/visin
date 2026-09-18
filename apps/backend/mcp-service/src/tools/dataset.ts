import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { datasets } from '../datasets';
import type { Dataset } from '../schemas';
import { Caller, ToolModule, capped, count, explain, ok } from './module';

/**
 * The data a model was trained on.
 *
 * Read-only. There is no `create_dataset` here, and deliberately so: a dataset
 * arrives by uploading a zip, which is a file transfer rather than an API call
 * an assistant can make. A tool that created the record without the data would
 * leave an empty shell in the app for someone to find later and wonder about.
 */

const bytes = (value: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? size : size.toFixed(1)} ${units[unit]}`;
};

// Top-level folders only: a zip with a folder per sequence has thousands, and
// the first level is what says how the data is organised.
const MAX_FOLDERS = 20;
const MAX_EXTENSIONS = 10;

/** What the zip holds and which images were imported from it, in as few lines as say it. */
function describeDataset(dataset: Dataset): string[] {
  const lines = [dataset.name];
  if (dataset.description) lines.push(dataset.description);

  const facts = [
    dataset.archive ? `${dataset.archive.filename}, ${bytes(dataset.archive.size)}` : 'no zip uploaded yet',
    `${count(dataset.imageCount)} images imported`
  ];
  if (dataset.import && dataset.import.status !== 'done') facts.push(`last import ${dataset.import.status}`);
  lines.push(`${facts.join('; ')}.`);

  if (dataset.groups.length > 0) {
    lines.push('', 'Image groups:');
    for (const group of dataset.groups) {
      lines.push(`  ${group.name}: ${count(group.images)} images${group.jsons ? `, ${count(group.jsons)} JSON sidecars` : ''}`);
    }
  }

  if (dataset.contents) {
    const { contents } = dataset;
    lines.push('', `Zip contents: ${count(contents.entries)} files, ${bytes(contents.totalBytes)} uncompressed.`);
    const types = contents.extensions.slice(0, MAX_EXTENSIONS).map((ext) => `${ext.ext} ${count(ext.files)}`);
    if (types.length > 0) lines.push(`  by type: ${types.join(', ')}`);
    const folders = contents.folders.filter((folder) => folder.depth === 1);
    for (const folder of folders.slice(0, MAX_FOLDERS)) {
      lines.push(`  ${folder.path}/: ${count(folder.files)} files, ${count(folder.images)} images`);
    }
    if (folders.length > MAX_FOLDERS) lines.push(`  …and ${count(folders.length - MAX_FOLDERS)} more folders`);
  }
  return lines;
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
        search: z.string().optional().describe('Filter by name'),
        limit: z.number().int().min(1).max(100).optional().describe('How many to return (default 30)')
      }
    },
    async ({ search, limit }) => {
      try {
        const { datasets: found, pagination } = await datasets.list(key, { search, limit: limit ?? 30 });
        if (found.length === 0) return ok('No datasets match that.');

        const { shown, note } = capped(found, 100, 'datasets');
        const total = pagination?.total ?? found.length;
        const lines = shown.map((dataset) => {
          const description = dataset.description ? ` — ${dataset.description.split('\n')[0]}` : '';
          const size = dataset.archive ? `, ${bytes(dataset.archive.size)}` : '';
          return `- ${dataset.name}${description} (${count(dataset.imageCount)} images${size})  [${dataset._id}]`;
        });

        const header = total > found.length ? `${count(found.length)} of ${count(total)} datasets:` : `${count(found.length)} datasets:`;
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
        'A dataset and what it holds: its description, its zip (size, file types, top-level ' +
        'folders) and the image groups imported from it. Use for "what is in this dataset".',
      inputSchema: { dataset: z.string().describe('The dataset id, from list_datasets') }
    },
    async ({ dataset }) => {
      try {
        return ok(describeDataset(await datasets.get(key, dataset)).join('\n'));
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const datasetRead: ToolModule = { scopes: ['dataset:read'], register: registerReadTools };
