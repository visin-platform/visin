/**
 * The few metrics worth a number on the run's front page: the first one where lower is
 * better (a loss) and the first where higher is, so the pair says both how hard the run is
 * still working and how good it has got. A run with only one kind gets its first metrics
 * instead. `keys` are in the order the run reported them.
 */
export const pickHeadlineMetrics = (keys: string[], isLowerBetter: (key: string) => boolean, count = 2): string[] => {
  const lower = keys.find(isLowerBetter);
  const higher = keys.find(key => !isLowerBetter(key));
  const picked = [lower, higher].filter((key): key is string => key !== undefined);
  const rest = keys.filter(key => !picked.includes(key));
  return [...picked, ...rest].slice(0, count);
};
