import { useQuery } from '@tanstack/react-query';
import { paperService } from '../services/paperService';

/** How often to ask while the PDF is being read. It takes seconds for most papers. */
const POLL_MS = 3000;

/** Where a paper's PDF stands, asked again while it is being read. Shared by the page and its reader. */
export function usePaperDocument(paperId: string) {
  return useQuery({
    queryKey: ['papers', 'document', paperId],
    queryFn: () => paperService.document(paperId),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_MS : false),
    enabled: Boolean(paperId),
    retry: false
  });
}
