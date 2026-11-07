import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPARE_TABS, SCREEN_TOOL, TRAINING_TABS, screenRequestSchema } from '../../services/screen';

const A = 'a'.repeat(24);

it('names the tabs Vision’s training page has', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../../frontend/vision-front/src/components/training/trainingTabs.ts'),
    'utf8'
  );
  expect([...TRAINING_TABS]).toEqual([...source.matchAll(/\['([a-z-]+)',\s*'[^']+'\]/g)].map((m) => m[1]));
});

it('accepts every place the shell can open', () => {
  for (const request of [
    { place: 'projects' },
    { place: 'project', id: A },
    { place: 'trainings' },
    { place: 'trainings', project: A },
    { place: 'training', id: A, tab: 'config', model: A },
    { place: 'compare', ids: [A, A], tab: COMPARE_TABS[0] },
    { place: 'datasets' },
    { place: 'dataset', id: A },
    { place: 'models' },
    { place: 'benchmarks' },
    { place: 'evaluation', id: A },
    { place: 'suite', slug: 'city-scenes', version: 'v1.0' },
    { place: 'visualizations', ids: [A, A] },
    { place: 'paper', id: A }
  ])
    expect(screenRequestSchema.safeParse(request).success).toBe(true);
});

it('rejects a project filter that is not an entity id', () => {
  expect(screenRequestSchema.safeParse({ place: 'trainings', project: '../../admin' }).success).toBe(false);
});

it('offers the model only places a tool result can name', () => {
  const places = SCREEN_TOOL.schema.properties.place.enum;
  for (const hidden of ['evaluation', 'suite', 'paper']) expect(places).not.toContain(hidden);
  expect(Object.keys(SCREEN_TOOL.schema.properties)).not.toEqual(expect.arrayContaining(['model', 'slug', 'version']));
});
