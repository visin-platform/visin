import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { findingService } from '../services/findingService';
import {
  CreateFindingRequest,
  ExportFindingOptions,
  Finding,
  FindingExport
} from '../types/finding';

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

/**
 * Fetch a finding as a LaTeX section, to show for copying.
 *
 * A mutation rather than a query because it is asked for by a click, not by a
 * card being on screen — rendering a dozen findings should not fetch a dozen
 * exports nobody opened. Deliberately does not download a file: what people do
 * with this is paste it into a paper they already have open, and a file in
 * ~/Downloads is a detour on the way there.
 */
export const useExportFinding = () =>
  useMutation<FindingExport, Error, { id: string; options?: ExportFindingOptions }>({
    mutationFn: ({ id, options }) => findingService.exportLatex(id, options)
  });
