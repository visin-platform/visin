import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionService } from '../services/connectionService';

export const connectionKeys = {
  mine: ['connections', 'mine'] as const
};

export const useConnections = () =>
  useQuery({ queryKey: connectionKeys.mine, queryFn: connectionService.list });

export const useRevokeConnection = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    // Wrapped rather than passed by reference: React Query hands `mutationFn` a
    // second internal argument, and forwarding it into the service would tie
    // the service's signature to a library internal.
    mutationFn: (clientId: string) => connectionService.revoke(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: connectionKeys.mine });
    }
  });
};
