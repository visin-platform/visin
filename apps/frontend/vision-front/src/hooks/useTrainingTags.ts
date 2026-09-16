import { useQuery } from '@tanstack/react-query';
import { trainingService } from '../services/trainingService';

/**
 * The tag suggestions every training form offers.
 *
 * One query key for all of them, so opening a form after the trainings list has
 * loaded costs nothing. `enabled` lets a dialog hold the request until it is
 * actually open, and the tags are stale-tolerant — a tag added elsewhere in the
 * last few minutes only means one missing suggestion, never a wrong save.
 */
export const useTrainingTags = (enabled: boolean = true) => {
  const { data, refetch } = useQuery({
    queryKey: ['training-tags'],
    queryFn: async () => (await trainingService.getTrainingTags()).data,
    staleTime: 5 * 60 * 1000,
    enabled
  });

  return { availableTags: data ?? [], refetchTags: refetch };
};
