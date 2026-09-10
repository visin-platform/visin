import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { visionApi } from '../config/visionApi';

type Kind = 'project' | 'training' | 'comparison' | 'benchmark' | 'test-result' | 'analysis' | 'dataset';

/** Missing, loading, and failed permission responses all leave controls read-only. */
export function useWriteCapabilities(kind: Kind, ids: string[]) {
  const { user, isAuthenticated } = useAuth();
  const uniqueIds = [...new Set(ids.filter(Boolean))].sort();
  const { data, isError } = useQuery({
    queryKey: ['write-capabilities', user?.id, kind, uniqueIds],
    enabled: isAuthenticated && uniqueIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const capabilities: Record<string, boolean> = {};
      for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        const response = await visionApi.get('/write-capabilities', {
          params: { kind, ids: uniqueIds.slice(offset, offset + 100).join(',') }
        });
        Object.assign(capabilities, (response.data as { data: Record<string, boolean> }).data);
      }
      return capabilities;
    }
  });
  return (id?: string) => !!(!isError && isAuthenticated && id && data?.[id]);
}
