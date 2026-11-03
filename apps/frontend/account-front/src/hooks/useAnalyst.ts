import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analystService } from '../services/analystService';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';
import type { AnalystPriceTable, AnalystProviderId, AnalystSettings, AnalystSettingsUpdate } from '../types/analyst';

export const analystKeys = {
  capabilities: ['analyst', 'capabilities'] as const,
  settings: ['analyst', 'settings'] as const,
  models: (provider: AnalystProviderId) => ['analyst', 'models', provider] as const,
  usage: ['analyst', 'usage'] as const
};

/** Whether chat is set up here at all: without its address there is nothing to ask. */
export const useChatConfigured = (): boolean => Boolean(getGlobalConfig().CHAT_SERVICE_URL);

export const useAnalystCapabilities = () => {
  const { user } = useAuth();
  const configured = useChatConfigured();
  return useQuery({
    queryKey: [...analystKeys.capabilities, user?.id],
    queryFn: analystService.capabilities,
    enabled: configured && !!user?.id,
    // Whether someone is an administrator rarely changes in a session; a down chat service must not hold up Account.
    staleTime: 5 * 60_000,
    retry: false
  });
};

/** Whether to offer the Analyst section: the service says so, and a failed check says no. */
export const useCanConfigureAnalyst = (): boolean => useAnalystCapabilities().data?.canConfigure === true;

export const useAnalystSettings = (enabled: boolean) =>
  useQuery({ queryKey: analystKeys.settings, queryFn: analystService.settings, enabled });

/** What answered questions used in the last `days` days, and what that costs at the prices entered. */
export const useAnalystUsage = (days: number, enabled: boolean) =>
  useQuery({
    queryKey: [...analystKeys.usage, days],
    queryFn: () => analystService.usage(days),
    enabled,
    staleTime: 30_000,
    // Changing the period keeps the last report on screen while the next one loads, rather than blanking the page.
    placeholderData: (previous) => previous
  });

export const useAnalystModels = (provider: AnalystProviderId, enabled: boolean) =>
  useQuery({ queryKey: analystKeys.models(provider), queryFn: () => analystService.models(provider), enabled });

/** What every change touches: the settings as the service now has them, and whether the analyst is ready. */
const useSettingsMutation = <TArgs>(
  mutationFn: (args: TArgs) => Promise<AnalystSettings>,
  keyOf?: (args: TArgs) => AnalystProviderId
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (settings, args) => {
      queryClient.setQueryData(analystKeys.settings, settings);
      // An open chat on the same page (the shell keeps it mounted) reads whether the analyst answers again.
      window.dispatchEvent(new CustomEvent('visin:analyst-settings-changed'));
      // A key changes which models the provider lists.
      if (keyOf) void queryClient.invalidateQueries({ queryKey: analystKeys.models(keyOf(args)) });
      void queryClient.invalidateQueries({ queryKey: analystKeys.capabilities });
    }
  });
};

export const useSaveAnalystSettings = () =>
  useSettingsMutation((update: AnalystSettingsUpdate) => analystService.save(update));

export const useSaveProviderKey = () =>
  useSettingsMutation(
    ({ provider, key }: { provider: AnalystProviderId; key: string }) => analystService.saveKey(provider, key),
    (args) => args.provider
  );

export const useRemoveProviderKey = () =>
  useSettingsMutation(
    (provider: AnalystProviderId) => analystService.removeKey(provider),
    (provider) => provider
  );

/** Saving prices re-prices every window, so every cached report is read again. */
export const useSaveAnalystPrices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prices: AnalystPriceTable) => analystService.savePrices(prices),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analystKeys.usage })
  });
};

/** Fetches current prices from the price list, for the models that have answered questions. */
export const useRefreshAnalystPrices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analystService.refreshPrices(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analystKeys.usage })
  });
};

/** Prices answered questions that were asked before their model had a price, at today's price. */
export const useBackfillAnalystPrices = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analystService.backfillPrices(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: analystKeys.usage })
  });
};
