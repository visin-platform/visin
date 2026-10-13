import type { LabelDataset } from '../types';

type DatasetGroup = LabelDataset['groups'][number];

/** The sensors a dataset's group names suggest, so most wizards need no choosing. */
export const guessSensors = (groups: DatasetGroup[]): { camera: string; lidar: string; radar: string } => {
  const names = groups.filter((group) => group.images > 0 || group.jsons > 0).map((group) => group.name);
  const find = (...needles: string[]): string | undefined =>
    names.find((name) => needles.some((needle) => name.toLowerCase().includes(needle)));
  const imageNames = groups.filter((group) => group.images > 0).map((group) => group.name);
  return {
    camera: find('camera', 'frames', 'image', 'rgb') ?? imageNames[0] ?? '',
    lidar: find('lidar', 'depth') ?? '',
    radar: find('radar') ?? ''
  };
};
