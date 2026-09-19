import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionService } from '../services/sessionService';

export const sessionKeys = {
  mine: ['sessions', 'mine'] as const
};

export const useSessions = () => useQuery({ queryKey: sessionKeys.mine, queryFn: sessionService.list });

export const useRevokeSession = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id: string) => sessionService.revoke(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.mine })
  });
};

export const useRevokeOtherSessions = () => {
  const queryClient = useQueryClient();
  return useMutation<number, Error, void>({
    mutationFn: () => sessionService.revokeOthers(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionKeys.mine })
  });
};
