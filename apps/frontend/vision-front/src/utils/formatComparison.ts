export const formatTime = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
};

export const formatNumber = (value: number | undefined, decimals: number = 2, multiplier: number = 100): string => {
  if (typeof value === 'number' && !isNaN(value)) {
    return (value * multiplier).toFixed(decimals);
  }
  return 'N/A';
};
