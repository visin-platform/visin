import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { apiKeyService } from '../services/apiKeyService';
import { ApiKey, CreateApiKeyRequest, CreatedApiKey } from '../types/apiKey';

export const apiKeyKeys = {
  mine: ['api-keys', 'mine'] as const
};

export const useApiKeys = () => useQuery({ queryKey: apiKeyKeys.mine, queryFn: apiKeyService.list });

/** Every mutation here changes the one list, so they all invalidate it. */
const useApiKeyMutation = <TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>
): UseMutationResult<TResult, Error, TArgs> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.mine });
    }
  });
};

/*
 * Each service call is wrapped in an arrow rather than passed by reference.
 * React Query hands `mutationFn` a second, internal context argument, and a
 * bare reference would forward it into the service — harmless today, but it
 * ties the service's call signature to a library internal. Same shape as
 * useGroups.
 */
export const useCreateApiKey = () =>
  useApiKeyMutation<CreateApiKeyRequest, CreatedApiKey>((request: CreateApiKeyRequest) =>
    apiKeyService.create(request)
  );

export const useRevokeApiKey = () =>
  useApiKeyMutation<string, ApiKey>((id: string) => apiKeyService.revoke(id));

export const useDeleteApiKey = () =>
  useApiKeyMutation<string, void>((id: string) => apiKeyService.remove(id));

/**
 * Revealing does not invalidate the list.
 *
 * It changes only `revealCount` and `lastRevealedAt`, neither of which the
 * listing shows — refetching every key to display one secret would be work
 * nobody sees.
 */
export const useRevealApiKey = () =>
  useMutation<string, Error, string>({ mutationFn: (id: string) => apiKeyService.reveal(id) });
