jest.mock('../../models/LabelTask', () => ({ LabelTask: { find: jest.fn() } }));
jest.mock('../../models/LabelAnnotation', () => ({ LabelAnnotation: { find: jest.fn() } }));
jest.mock('../../clients/fileServiceClient', () => ({ getFile: jest.fn() }));

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { streamExport } from '../../services/bundleService';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnnotation } from '../../models/LabelAnnotation';
import * as files from '../../clients/fileServiceClient';
import { openZip } from '../../utils/zip';
import { encodeGrayscalePng } from '../../utils/png';
import type { ILabelJob } from '../../models/LabelJob';

const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnnotation = LabelAnnotation as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;

const job = {
  _id: 'j1',
  name: 'Street',
  classes: [
    { key: 'car', name: 'Car', color: '#ff0000', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'sign', name: 'Sign', color: '#0000ff', tools: ['box'], maskIndex: 2 },
  ],
} as unknown as ILabelJob;

const task = (id: string, stem: string, size: { width?: number; height?: number } = { width: 4, height: 2 }) => ({
  _id: id,
  frame: { fileId: `f-${id}`, path: `camera/${stem}.jpg`, stem, ...size },
});

const annotation = (taskId: string, overrides: Record<string, unknown> = {}) => ({
  taskId,
  status: 'done',
  objects: [{ id: `o-${taskId}`, classKey: 'car', bbox: [0, 0, 2, 2], source: 'human' }],
  ...overrides,
});

const stub = (tasks: unknown[], annotations: unknown[]) => {
  mockedAnnotation.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(annotations) });
  mockedTask.find.mockReturnValue({
    sort: () => ({
      cursor: async function* () {
        yield* tasks;
      },
    }),
  });
};

/** Run an export and read the archive back. */
const run = async (format: Parameters<typeof streamExport>[1], include: 'done' | 'all' = 'done') => {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (chunk: Buffer) => chunks.push(chunk));
  const result = await streamExport(job, format, include, out);
  out.end();
  const folder = await mkdtemp(join(tmpdir(), 'bundle-test-'));
  try {
    const path = join(folder, 'out.zip');
    await writeFile(path, Buffer.concat(chunks));
    const archive = await openZip(path);
    const entries: Record<string, Buffer> = {};
    for (const entry of archive.entries) entries[entry.name] = await archive.read(entry);
    await archive.close();
    return { ...result, entries };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('streamExport', () => {
  it('writes a zip of the finished frames in task order, with the format’s own files', async () => {
    stub([task('t1', 'a'), task('t2', 'b'), task('t3', 'c')], [annotation('t3'), annotation('t1')]);

    const { frames, entries } = await run('yolo');

    expect(frames).toBe(2);
    expect(Object.keys(entries)).toEqual(['labels/a.txt', 'labels/c.txt', 'data.yaml']);
    expect(entries['labels/a.txt'].toString()).toBe('0 0.25 0.5 0.5 1\n');
    expect(mockedAnnotation.find.mock.calls[0][0]).toEqual({ jobId: 'j1', status: { $in: ['done'] } });
  });

  it('fetches a frame’s mask and hands the format its class indices', async () => {
    mockedFiles.getFile.mockResolvedValue(encodeGrayscalePng(4, 2, Uint8Array.from([0, 1, 1, 0, 0, 0, 1, 1])));
    stub([task('t1', 'a')], [annotation('t1', { mask: { fileId: 'f-mask', width: 4, height: 2 } })]);

    const { entries } = await run('semantic-png');

    expect(mockedFiles.getFile).toHaveBeenCalledWith('f-mask');
    expect(Object.keys(entries)).toEqual(['masks/a.png', 'classes.json']);
  });

  it('keeps a finished frame with nothing on it, as a negative example', async () => {
    stub([task('t1', 'a')], [annotation('t1', { objects: [] })]);

    const { frames, entries } = await run('yolo');

    expect(frames).toBe(1);
    expect(entries['labels/a.txt'].toString()).toBe('');
  });

  it('exports drafts too on request, but not an empty draft', async () => {
    stub(
      [task('t1', 'a'), task('t2', 'b'), task('t3', 'c')],
      [annotation('t1', { status: 'draft' }), annotation('t2', { status: 'draft', objects: [] }), annotation('t3')]
    );

    const { entries } = await run('yolo', 'all');

    expect(mockedAnnotation.find.mock.calls[0][0]).toEqual({ jobId: 'j1', status: { $in: ['done', 'draft'] } });
    expect(Object.keys(entries)).toEqual(['labels/a.txt', 'labels/c.txt', 'data.yaml']);
  });

  it('prefers the finished labels when a frame has several', async () => {
    stub(
      [task('t1', 'a')],
      [
        annotation('t1', { status: 'draft', objects: [{ id: 'd', classKey: 'sign', bbox: [0, 0, 1, 1], source: 'human' }] }),
        annotation('t1', { objects: [{ id: 'x', classKey: 'car', bbox: [0, 0, 4, 2], source: 'human' }] }),
        annotation('t1', { status: 'draft', objects: [{ id: 'e', classKey: 'sign', bbox: [0, 0, 1, 1], source: 'human' }] }),
      ]
    );

    const { entries } = await run('yolo', 'all');

    expect(entries['labels/a.txt'].toString()).toBe('0 0.5 0.5 1 1\n');
  });

  it('exports every format without a frame, as a valid empty archive of their summary files', async () => {
    stub([], []);

    expect(Object.keys((await run('coco')).entries)).toEqual(['annotations.json']);
    expect(Object.keys((await run('voc')).entries)).toEqual(['labelmap.txt']);
    expect(Object.keys((await run('visin')).entries)).toEqual(['annotations.jsonl', 'job.json']);
  });

  it('fails when a mask cannot be read, rather than writing a silently incomplete export', async () => {
    mockedFiles.getFile.mockRejectedValue(new Error('file-service down'));
    stub([task('t1', 'a')], [annotation('t1', { mask: { fileId: 'f-mask' } })]);

    await expect(run('semantic-png')).rejects.toThrow('file-service down');
  });
});
