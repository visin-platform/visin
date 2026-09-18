import { Types } from 'mongoose';
import { BackupData, migrateBundlesToDatasets } from '../../migration/bundlesToDatasets';

const oid = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));
const BUNDLE = oid('b1');
const JOB = oid('30b1');
const FRAME = oid('f1');
const LAYER = oid('a1');
const IDMAP = oid('d1');
const TASK = oid('7a51');
const ANSWER = oid('a751');

const masks = [{ id: 1, class: 'vehicle', stratum: 'rare' }];

const backup = (overrides: Partial<BackupData> = {}): BackupData => ({
  bundles: [
    {
      _id: BUNDLE,
      name: 'VLM',
      description: 'Mask review set',
      groupId: 'g1',
      createdBy: { userId: 'u1', email: 'owner@example.test' },
      annotationSets: ['verify'],
      createdAt: new Date('2026-08-10T13:56:15.095Z'),
      updatedAt: new Date('2026-08-10T14:28:04.912Z')
    }
  ],
  images: [
    {
      _id: FRAME,
      bundleId: BUNDLE,
      path: 'frames/frame_000012.jpg',
      stem: 'frame_000012',
      kind: 'frame',
      fileId: 'label-bundles/b/frames/frame_000012.jpg',
      thumbnailFileId: 'label-bundles/b/thumbs/frame_000012.jpg',
      width: 1363,
      height: 768,
      size: 123266,
      mimetype: 'image/jpeg'
    },
    {
      _id: LAYER,
      bundleId: BUNDLE,
      path: 'annotations/verify/frame_000012.png',
      stem: 'frame_000012',
      kind: 'layer',
      annotationSet: 'verify',
      fileId: 'label-bundles/b/annotations/verify/frame_000012.png',
      size: 10,
      mimetype: 'image/png'
    },
    {
      _id: IDMAP,
      bundleId: BUNDLE,
      path: 'annotations/verify/frame_000012.ids.png',
      stem: 'frame_000012',
      kind: 'idmap',
      annotationSet: 'verify',
      fileId: 'label-bundles/b/annotations/verify/frame_000012.ids.png',
      size: 6415,
      mimetype: 'image/png',
      metadata: { masks }
    }
  ],
  imports: [
    { _id: oid('1'), bundleId: BUNDLE, zipFileId: 'label-bundles/b/upload-1786370187958.zip', status: 'done', finishedAt: new Date('2026-08-10T14:28:04.935Z') },
    { _id: oid('2'), bundleId: BUNDLE, zipFileId: 'label-bundles/b/older.zip', status: 'failed' }
  ],
  jobs: [{ _id: JOB, name: 'VLM', bundleId: BUNDLE, groupId: 'g1', status: 'active', taskType: 'mask_toggle', annotationSets: ['verify'], tasksCount: 1 }],
  tasks: [
    {
      _id: TASK,
      jobId: JOB,
      labelImageId: FRAME,
      order: 7,
      stratum: 'night',
      answersCount: 1,
      answeredBy: ['u9'],
      payload: { layers: [{ set: 'verify', imageId: LAYER }], maskMap: { imageId: IDMAP, masks } },
      createdAt: new Date('2026-08-10T14:29:07.983Z'),
      updatedAt: new Date('2026-08-13T10:43:20.221Z')
    }
  ],
  answers: [{ _id: ANSWER, taskId: TASK, jobId: JOB, userId: 'u9', userEmail: 'worker@example.test', rejectedMaskIds: [1] }],
  ...overrides
});

describe('migrateBundlesToDatasets', () => {
  it('turns a bundle into a dataset over the files it already has', () => {
    const { datasets, report } = migrateBundlesToDatasets(backup());

    expect(datasets).toHaveLength(1);
    expect(datasets[0]).toMatchObject({
      _id: BUNDLE,
      name: 'VLM',
      description: 'Mask review set',
      ownerId: 'u1',
      visibility: 'group',
      groupId: 'g1',
      // Nothing is copied on file-service; the dataset records where the files are.
      storagePrefix: `label-bundles/${BUNDLE.toString()}/`,
      imageCount: 3,
      coverFileId: 'label-bundles/b/thumbs/frame_000012.jpg',
      groups: [
        { name: 'frames', images: 1, jsons: 0 },
        { name: 'verify', images: 2, jsons: 1 }
      ]
    });
    // The zip of the last finished import, with its size left for the app to scan.
    expect(datasets[0].archive).toEqual({
      fileId: 'label-bundles/b/upload-1786370187958.zip',
      filename: 'upload-1786370187958.zip',
      uploadedAt: new Date('2026-08-10T14:28:04.935Z')
    });
    // The job holds the dataset, so it cannot be deleted or re-imported.
    expect(datasets[0].holds).toEqual([{ service: 'label-service', ref: JOB.toString(), createdAt: expect.any(Date) }]);
    expect(report.warnings).toEqual([]);
  });

  it('keeps every image, and turns id-map masks into the JSON sidecar a mask job reads', () => {
    const { dataset_items, report } = migrateBundlesToDatasets(backup());

    expect(report.datasetItems).toEqual({ images: 3, json: 1 });
    const byPath = Object.fromEntries(dataset_items.map((item) => [item.path as string, item]));
    expect(byPath['frames/frame_000012.jpg']).toMatchObject({
      _id: FRAME,
      datasetId: BUNDLE,
      group: 'frames',
      kind: 'image',
      stem: 'frame_000012',
      fileId: 'label-bundles/b/frames/frame_000012.jpg',
      thumbnailFileId: 'label-bundles/b/thumbs/frame_000012.jpg',
      width: 1363,
      height: 768
    });
    expect(byPath['frames/frame_000012.jpg']).not.toHaveProperty('variant');
    expect(byPath['annotations/verify/frame_000012.ids.png']).toMatchObject({ group: 'verify', variant: 'ids' });
    expect(byPath['annotations/verify/frame_000012.masks.json']).toMatchObject({
      group: 'verify',
      variant: 'masks',
      kind: 'json',
      stem: 'frame_000012',
      data: masks
    });
  });

  it('points the job at the dataset and gives each task the files it shows', () => {
    const { label_jobs, label_tasks, label_answers } = migrateBundlesToDatasets(backup());

    expect(label_jobs[0]).toMatchObject({ _id: JOB, datasetId: BUNDLE.toString(), framesGroup: 'frames', status: 'active' });
    expect(label_jobs[0]).not.toHaveProperty('bundleId');

    // Same task id, order, counters and masks: the answers still point at it and
    // the labeler's place in the job is unchanged.
    expect(label_tasks[0]).toEqual({
      _id: TASK,
      jobId: JOB,
      frame: {
        fileId: 'label-bundles/b/frames/frame_000012.jpg',
        path: 'frames/frame_000012.jpg',
        stem: 'frame_000012',
        width: 1363,
        height: 768
      },
      order: 7,
      stratum: 'night',
      payload: {
        layers: [{ set: 'verify', fileId: 'label-bundles/b/annotations/verify/frame_000012.png' }],
        maskMap: { fileId: 'label-bundles/b/annotations/verify/frame_000012.ids.png', masks }
      },
      answersCount: 1,
      answeredBy: ['u9'],
      createdAt: new Date('2026-08-10T14:29:07.983Z'),
      updatedAt: new Date('2026-08-13T10:43:20.221Z')
    });
    expect(label_answers[0]).toEqual(backup().answers[0]);
  });

  it('carries a job with no dataset, and a task with nothing drawn over the frame', () => {
    const plainTask = { _id: TASK, jobId: JOB, labelImageId: FRAME, order: 0 };
    const { label_jobs, label_tasks } = migrateBundlesToDatasets({
      ...backup(),
      bundles: [],
      imports: [],
      jobs: [{ _id: JOB, name: 'Draft', groupId: 'g1' }],
      tasks: [plainTask],
      answers: []
    });

    expect(label_jobs[0]).not.toHaveProperty('datasetId');
    expect(label_tasks[0]).not.toHaveProperty('payload');
    expect(label_tasks[0]).toMatchObject({ answersCount: 0, answeredBy: [] });
  });

  it('reports what must still be true after loading', () => {
    const { report } = migrateBundlesToDatasets(backup());

    expect(report).toMatchObject({ datasets: 1, jobs: 1, tasks: 1, answers: 1 });
    expect(report.perJob).toEqual([
      { jobId: JOB.toString(), datasetId: BUNDLE.toString(), tasks: 1, answers: 1, answersCountDistribution: { '1': 1 } }
    ]);
  });

  it('refuses rather than writing a partial answer', () => {
    const data = backup();
    expect(() =>
      migrateBundlesToDatasets({ ...data, images: data.images.filter((image) => image._id !== LAYER) })
    ).toThrow(/Tasks reference images that are not in the backup/);

    expect(() => migrateBundlesToDatasets({ ...data, jobs: [] })).toThrow(/Tasks belong to jobs that are not in the backup/);

    expect(() => migrateBundlesToDatasets({ ...data, tasks: [] })).toThrow(/Answers belong to tasks that are not in the backup/);
  });

  it('warns about counters that do not match the answers, without refusing', () => {
    const data = backup();
    const { report } = migrateBundlesToDatasets({
      ...data,
      tasks: [{ ...data.tasks[0], answersCount: 4, answeredBy: ['someone-else'] }],
      jobs: [{ _id: JOB, name: 'VLM', bundleId: oid('dead') }]
    });

    expect(report.warnings).toEqual([
      `task ${TASK.toString()} counts 4 answers but 1 exist`,
      `task ${TASK.toString()} lists different labelers than its answers do`,
      `job ${JOB.toString()} references bundle ${oid('dead').toString()}, which is not in the backup`
    ]);
  });

  it('names a masks sidecar after an id map that does not follow the .ids.png convention', () => {
    const data = backup();
    const { dataset_items } = migrateBundlesToDatasets({
      ...data,
      images: data.images.map((image) => (image._id === IDMAP ? { ...image, path: 'annotations/verify/odd' } : image))
    });

    expect(dataset_items.some((item) => item.path === 'annotations/verify/odd.masks.json')).toBe(true);
  });

  it('fills sensible defaults from a sparse backup', () => {
    const data = backup();
    const layerNoSet = { ...data.images[1], annotationSet: undefined };
    const bareFrame = { ...data.images[0], width: undefined, height: undefined, thumbnailFileId: undefined };
    const { datasets, dataset_items, label_tasks } = migrateBundlesToDatasets({
      bundles: [{ ...data.bundles[0], description: undefined, createdAt: undefined, updatedAt: undefined }],
      images: [bareFrame, layerNoSet],
      imports: [
        { _id: oid('3'), bundleId: BUNDLE, zipFileId: 'label-bundles/b/old.zip', status: 'done', finishedAt: new Date('2026-01-01') },
        { _id: oid('4'), bundleId: BUNDLE, zipFileId: 'label-bundles/b/new.zip', status: 'done', finishedAt: new Date('2026-02-01') },
        { _id: oid('5'), bundleId: BUNDLE, zipFileId: 'label-bundles/b/undated.zip', status: 'done' }
      ],
      jobs: data.jobs,
      tasks: [{ _id: TASK, jobId: JOB, labelImageId: FRAME, order: 0, payload: { layers: [{ set: 'x', imageId: LAYER }] } }],
      answers: []
    });

    expect(datasets[0]).not.toHaveProperty('description');
    expect(datasets[0].createdAt).toBeInstanceOf(Date);
    // The newest finished import names the zip.
    expect((datasets[0].archive as { fileId: string }).fileId).toBe('label-bundles/b/new.zip');
    // With no thumbnail the cover is the frame itself.
    expect(datasets[0].coverFileId).toBe(bareFrame.fileId);
    // A layer that named no set falls into the frames group rather than vanishing.
    expect(dataset_items.find((item) => item._id === LAYER)?.group).toBe('frames');
    expect(label_tasks[0]).toMatchObject({ payload: { layers: [{ set: 'x', fileId: layerNoSet.fileId }] }, answersCount: 0, answeredBy: [] });
    expect(label_tasks[0].frame).toEqual({ fileId: bareFrame.fileId, path: bareFrame.path, stem: bareFrame.stem });
  });

  it('summarizes long lists of offenders', () => {
    const data = backup();
    const tasks = Array.from({ length: 7 }, (_, i) => ({ ...data.tasks[0], _id: oid(`e${i}`), labelImageId: oid(`dead${i}`) }));
    expect(() => migrateBundlesToDatasets({ ...data, tasks, answers: [] })).toThrow(/\(\+2 more\)/);
  });

  it('makes a dataset without a zip when the bundle never finished an import', () => {
    const { datasets } = migrateBundlesToDatasets({ ...backup(), imports: [] });
    expect(datasets[0]).not.toHaveProperty('archive');
  });
});
