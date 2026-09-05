import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { findingService } from '../services/findingService';
import { CreateFindingRequest, Finding } from '../types/finding';

export const findingKeys = {
  list: (project?: string, training?: string) => ['findings', project, training] as const
};

export const useFindings = (params: { project?: string; training?: string }) =>
  useQuery({
    queryKey: findingKeys.list(params.project, params.training),
    queryFn: () => findingService.list(params),
    enabled: Boolean(params.project || params.training)
  });

const useFindingMutation = <TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) => {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TArgs>({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] });
    }
  });
};

export const useCreateFinding = () =>
  useFindingMutation<CreateFindingRequest, Finding>((request) => findingService.create(request));

export const useDeleteFinding = () =>
  useFindingMutation<string, void>((id) => findingService.remove(id));
