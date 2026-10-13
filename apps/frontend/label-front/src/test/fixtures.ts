import type { BoxObject, JobClass, LabelJob, WorkItem } from '../types';

/** Classes are stored with a `#rrggbb` colour; written here as digits so it is clearly data. */
const stored = (digits: string): string => `#${digits}`;

export const carClass: JobClass = { key: 'car', name: 'Car', color: stored('2a78d6'), hotkey: '1', tools: ['box', 'mask'], maskIndex: 1 };
export const roadClass: JobClass = { key: 'road', name: 'Road', color: stored('eb6834'), hotkey: '2', tools: ['mask'], maskIndex: 2 };
export const signClass: JobClass = { key: 'sign', name: 'Sign', color: stored('1baf7a'), hotkey: '3', tools: ['box'], maskIndex: 3 };

export const box = (id: string, bbox: BoxObject['bbox'] = [10, 10, 40, 30], extra: Partial<BoxObject> = {}): BoxObject => ({
  id,
  classKey: 'car',
  bbox,
  source: 'human',
  ...extra
});

export const makeItem = (taskId = 't1', overrides: Partial<WorkItem> = {}): WorkItem => ({
  task: { _id: taskId, jobId: 'j1', order: 0 },
  images: { frame: { url: `https://files.example.test/${taskId}.jpg`, width: 200, height: 100, stem: `frame_${taskId}` }, sensors: [] },
  position: { index: 0, total: 5 },
  annotation: { count: 0, mine: null, latest: null },
  suggestions: null,
  ...overrides
});

export const makeJob = (overrides: Partial<LabelJob> = {}): LabelJob => ({
  _id: 'j1',
  name: 'Street scenes',
  datasetId: 'd1',
  taskType: 'annotate',
  classes: [carClass, roadClass, signClass],
  sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
  redundancy: 1,
  status: 'active',
  canLabel: true,
  canManage: true,
  tasksCount: 5,
  createdBy: { userId: 'u0', email: 'owner@example.test' },
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  progress: { tasks: 5, completed: 1, done: 1, skipped: 0, myDone: 1 },
  ...overrides
});
