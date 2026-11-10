import type { ExploreDataset, ExploreProject } from '../../services/exploreApi';

export interface CatalogueFigure {
  label: string;
  value: number;
}

/** Page totals are authoritative. Sum child records only when the entire public catalogue is present. */
export function catalogueFigures({
  projects,
  projectTotal,
  datasets,
  datasetTotal,
  modelTotal
}: {
  projects: ExploreProject[];
  projectTotal?: number;
  datasets: ExploreDataset[];
  datasetTotal?: number;
  modelTotal?: number;
}): CatalogueFigure[] {
  projects = [...new Map(projects.map((project) => [project._id, project])).values()];
  datasets = [...new Map(datasets.map((dataset) => [dataset._id, dataset])).values()];
  const figures: CatalogueFigure[] = [];
  if (projectTotal !== undefined) {
    figures.push({ label: 'Public projects', value: projectTotal });
    if (projects.length === projectTotal && projects.every((project) => Number.isFinite(project.runs)))
      figures.push({ label: 'Recorded runs', value: projects.reduce((sum, project) => sum + project.runs!, 0) });
  }
  if (datasetTotal !== undefined) {
    if (datasets.length === datasetTotal && datasets.every((dataset) => Number.isFinite(dataset.imageCount)))
      figures.push({ label: 'Public images', value: datasets.reduce((sum, dataset) => sum + dataset.imageCount, 0) });
    else figures.push({ label: 'Public datasets', value: datasetTotal });
  }
  if (modelTotal !== undefined) figures.push({ label: 'Model artifacts', value: modelTotal });
  return figures;
}
