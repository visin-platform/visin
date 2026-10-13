import { NotFoundError } from '@visin/backend-core';
import type { IProject } from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import EpochVisualization from '../models/EpochVisualization';
import { getSignedUrl } from '../clients/fileServiceClient';
import { fetchDatasetCovers } from '../clients/datasetCoversClient';

/** Datasets tried per project, most-used first, before its card gives up and shows the plain tile. */
const DATASETS_TRIED = 3;
const URL_MINUTES = 60;

type CoverSource = Pick<IProject, '_id' | 'cover'>;

/**
 * The picture each project's card shows, by project id. A chosen cover wins; otherwise the cover of the Visin
 * dataset most of the project's runs trained on, as the reader may see it, so a private dataset behind a public
 * project gives the public nothing. A project with neither is left out, and its card draws a plain tile.
 *
 * A frame a run rendered is never picked here: ground truth and segmentation maps are often near-black, and what a
 * card shows has to have been chosen, or be a picture someone chose to introduce a dataset.
 */
export async function coverUrlsFor(projects: CoverSource[], userId: string | undefined): Promise<Map<string, string>> {
  const found = new Map<string, string>();

  await Promise.all(
    projects.map(async (project) => {
      if (!project.cover) return;
      const signed = await getSignedUrl(project.cover.fileId, URL_MINUTES);
      if (signed?.signedUrl) found.set(String(project._id), signed.signedUrl);
    })
  );

  const rest = projects.map((project) => String(project._id)).filter((id) => !found.has(id));
  if (rest.length === 0) return found;

  const used = await Training.aggregate<{ _id: { projectId: string; datasetId: string }; runs: number }>([
    // Older runs kept only datasetId. A new external reference takes precedence over any stale legacy id.
    { $match: { projectId: { $in: rest }, deletedAt: null, $or: [{ 'dataset.source': 'visin' }, { dataset: null }] } },
    { $project: { projectId: 1, datasetId: { $ifNull: ['$dataset.id', '$datasetId'] } } },
    { $match: { datasetId: { $type: 'string' } } },
    { $group: { _id: { projectId: '$projectId', datasetId: '$datasetId' }, runs: { $sum: 1 } } },
    { $sort: { runs: -1 } }
  ]);
  const candidates = new Map<string, string[]>();
  for (const row of used) {
    const list = candidates.get(row._id.projectId) ?? [];
    if (list.length < DATASETS_TRIED) candidates.set(row._id.projectId, [...list, row._id.datasetId]);
  }

  const covers = await fetchDatasetCovers([...new Set([...candidates.values()].flat())], userId);
  for (const [projectId, datasetIds] of candidates) {
    const first = datasetIds.find((datasetId) => covers[datasetId]);
    if (first) found.set(projectId, covers[first]);
  }
  return found;
}

/**
 * Chooses the project's cover from a visualization one of its own runs rendered, or clears it with `null`. Anything
 * that is not such a visualization reads as not found, so asking tells nothing about another project's frames.
 */
export async function chooseCover(
  project: Pick<IProject, '_id'>,
  visualizationUuid: string | null
): Promise<IProject['cover']> {
  if (visualizationUuid === null) return undefined;
  const notFound = () => new NotFoundError('Visualization not found in this project');

  const visualization = await EpochVisualization.findOne({ visualization_uuid: visualizationUuid });
  if (!visualization) throw notFound();
  const epoch = await Epoch.findOne({ epoch_uuid: visualization.epoch_uuid, deletedAt: null }).select('trainingId');
  if (!epoch) throw notFound();
  const training = await Training.findOne({ _id: epoch.trainingId, deletedAt: null }).select('projectId');
  if (!training || training.projectId !== String(project._id)) throw notFound();

  return { visualizationUuid, fileId: visualization.fileId };
}
