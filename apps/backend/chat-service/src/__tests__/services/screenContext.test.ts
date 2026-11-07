import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROJECT_TABS } from '../../services/screen';
import { pageContext } from '../../services/screenContext';
const A = 'a'.repeat(24),
  B = '123e4567-e89b-12d3-a456-426614174000';
it('recognizes the run and tab, and the complete comparison selection', () => {
  expect(pageContext(`/trainings/${A}?tab=epochs`)).toEqual({ place: 'training', trainingIds: [A], tab: 'epochs' });
  expect(pageContext(`/trainings/${A}`)).toMatchObject({ tab: 'overview' });
  expect(pageContext(`/trainings/compare?ids=${A},${B}`)).toMatchObject({ tab: 'training-runs' });
  expect(pageContext(`/trainings/compare?ids=${A},${B}&tab=benchmarks`)).toEqual({
    place: 'compare',
    trainingIds: [A, B],
    tab: 'benchmarks'
  });
});
it.each([
  undefined,
  '',
  '//evil.test/trainings/x',
  'https://evil.test/trainings/x',
  '/trainings/../admin',
  `/trainings/${A}?tab=made-up`,
  `/trainings/${A}#instructions`,
  '/trainings/compare?ids=x,y',
  `/trainings/compare?ids=${A}`,
  `/trainings/compare?ids=${Array(9).fill(A).join(',')}`,
  `/trainings/compare?ids=${A},${B}&tab=epochs`,
  '/projects/x',
  `/projects/${A}?tab=made-up`,
  `/projects/${A}/settings`,
  `/visualizations/compare-trainings?ids=${A}`,
  `/visualizations/compare-trainings?ids=${A},${A}`,
  `/trainings/compare?ids=${A},${A}`,
  '/'.repeat(501)
])('ignores an unsupported page %s', (path) => {
  expect(pageContext(path)).toBeUndefined();
});

it('recognizes a project page and its tab', () => {
  expect(pageContext(`/projects/${A}`)).toEqual({ place: 'project', projectId: A, tab: 'overview' });
  expect(pageContext(`/projects/${B}?tab=trainings`)).toEqual({ place: 'project', projectId: B, tab: 'trainings' });
});
it('recognizes the runs whose visualizations are being compared', () => {
  expect(pageContext(`/visualizations/compare-trainings?ids=${A},${B}`)).toEqual({
    place: 'visualizations',
    trainingIds: [A, B]
  });
});
it('keeps its tab lists in step with the project page', () => {
  const source = readFileSync(
    resolve(process.cwd(), '../../frontend/vision-front/src/components/project/projectTabs.ts'),
    'utf8'
  );
  const keys = /PROJECT_TAB_KEYS = \[([^\]]+)\]/
    .exec(source)![1]
    .match(/'([a-z-]+)'/g)!
    .map((k) => k.slice(1, -1));
  expect([...PROJECT_TABS]).toEqual(keys);
});
