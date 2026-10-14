/** "12 runs", "1 run" or "No runs yet": where a project stands, said before it is opened. */
export const runsLabel = (runs: number | undefined): string | null => {
  if (runs === undefined) return null;
  if (runs === 0) return 'No runs yet';
  return `${runs.toLocaleString()} ${runs === 1 ? 'run' : 'runs'}`;
};
