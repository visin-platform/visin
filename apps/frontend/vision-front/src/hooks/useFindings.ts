import { useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
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

const PAGE_SIZE = 50;

export const useFindings = (params: { project?: string; training?: string }) => {
  const query = useInfiniteQuery({
    queryKey: [...findingKeys.list(params.project, params.training), 'pages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => findingService.list({ ...params, limit: PAGE_SIZE, before: pageParam }),
    getNextPageParam: (lastPage, _pages, lastCursor) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      const cursor = `${last.createdAt}_${last._id}`;
      // An older API may ignore `before`; stop if it does not advance.
      return cursor === lastCursor ? undefined : cursor;
    },
    enabled: Boolean(params.project || params.training),
  });
  const rows = query.data?.pages.flat();
  const seen = new Set<string>();
  const data = rows?.filter(row => {
    if (seen.has(row._id)) return false;
    seen.add(row._id);
    return true;
  });
  return { ...query, data };
};

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
