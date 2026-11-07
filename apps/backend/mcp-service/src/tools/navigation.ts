import type { Training } from '../schemas';
import { ok } from './module';

/** References come from resource fields selected by this code, never from descriptions or config blobs. */
export interface NavigationReference {
  place: 'project' | 'training' | 'dataset';
  id: string;
}
export const trainingReferences = (training: Pick<Training, '_id'> & Partial<Training>): NavigationReference[] => [
  { place: 'training', id: training._id },
  ...(training.uuid ? [{ place: 'training' as const, id: training.uuid }] : []),
  ...(training.projectId ? [{ place: 'project' as const, id: training.projectId }] : []),
  ...(training.datasetId ? [{ place: 'dataset' as const, id: training.datasetId }] : [])
];
export const navigable = (text: string, navigation: NavigationReference[]) => ({
  ...ok(text),
  structuredContent: { navigation: navigation.slice(0, 400) }
});
