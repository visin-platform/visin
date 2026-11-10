import { expect, it } from 'vitest';
import { catalogueFigures } from './catalogueFigures';
import type { ExploreProject, ExploreDataset } from '../../services/exploreApi';
const project = (runs?: number) => ({ _id: String(runs), runs }) as ExploreProject;
const dataset = (imageCount: number) => ({ _id: String(imageCount), imageCount }) as ExploreDataset;
it('uses complete public records for run and image totals, and server pagination for catalogue counts', () => {
  expect(
    catalogueFigures({
      projects: [project(118), project(88)],
      projectTotal: 2,
      datasets: [dataset(4600), dataset(4800)],
      datasetTotal: 2,
      modelTotal: 12
    })
  ).toEqual([
    { label: 'Public projects', value: 2 },
    { label: 'Recorded runs', value: 206 },
    { label: 'Public images', value: 9400 },
    { label: 'Model artifacts', value: 12 }
  ]);
});
it('does not pass a partial page or unavailable legacy field off as a complete total', () => {
  expect(
    catalogueFigures({ projects: [project(3)], projectTotal: 40, datasets: [dataset(10)], datasetTotal: 20 })
  ).toEqual([
    { label: 'Public projects', value: 40 },
    { label: 'Public datasets', value: 20 }
  ]);
  expect(
    catalogueFigures({ projects: [project()], projectTotal: 1, datasets: [dataset(NaN)], datasetTotal: 1 })
  ).toEqual([
    { label: 'Public projects', value: 1 },
    { label: 'Public datasets', value: 1 }
  ]);
});
it('omits counts until their source responds', () => {
  expect(catalogueFigures({ projects: [], datasets: [] })).toEqual([]);
});
