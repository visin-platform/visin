import { useQuery } from '@tanstack/react-query';
import { toolUsageService } from '../services/toolUsageService';

export const toolUsageKeys = {
  summary: (days: number) => ['tool-usage', 'summary', days] as const,
  recent: ['tool-usage', 'recent'] as const
};

export const useToolUsage = (days: number) =>
  useQuery({
    queryKey: toolUsageKeys.summary(days),
    queryFn: () => toolUsageService.summary(days)
  });

export const useRecentToolCalls = () =>
  useQuery({ queryKey: toolUsageKeys.recent, queryFn: () => toolUsageService.recent(50) });
