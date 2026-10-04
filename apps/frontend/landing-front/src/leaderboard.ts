/** The id of Hugging Face as the API sends it: the only place this app spells it. */
const HUB = 'hf' as const;

/** What a public page may say of a checkpoint: the pin of a Hub model, or the label of weights held elsewhere. */
export type PublicCheckpoint = { kind: typeof HUB; repo: string; commit: string } | { kind: 'local'; label: string };

/** How each kind of checkpoint is named. Keyed by the kind, so a new kind cannot be added without saying how it reads. */
const checkpointNames: { [K in PublicCheckpoint['kind']]: (checkpoint: Extract<PublicCheckpoint, { kind: K }>) => string } = {
  [HUB]: checkpoint => `${checkpoint.repo} @ ${checkpoint.commit.slice(0, 7)}`,
  local: checkpoint => checkpoint.label
};

export const checkpointName = (checkpoint: PublicCheckpoint | undefined): string =>
  checkpoint ? (checkpointNames[checkpoint.kind] as (c: PublicCheckpoint) => string)(checkpoint) : 'Unknown model';

export type Verification = 'all' | 'verified' | 'unverified';

/** Anonymous recorded scores, including migrated tests from readable public projects. */
export interface RecordedLeaderboard {
  metric?: string;
  direction: 'max' | 'min';
  entries: {
    rank: number;
    evaluationId: string;
    checkpoint?: PublicCheckpoint;
    run?: { name: string };
    project: { name: string };
    dataset?: string;
    epoch?: number;
    value: number;
    verified: boolean;
  }[];
}

export async function fetchRecordedLeaderboard(apiUrl: string, verification: Verification, signal?: AbortSignal): Promise<RecordedLeaderboard> {
  const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/evaluations/leaderboard?verification=${verification}&limit=5`, {
    credentials: 'omit', cache: 'no-store', signal
  });
  if (!response.ok) throw new Error(`The leaderboard answered ${response.status}`);
  return ((await response.json()) as { data: RecordedLeaderboard }).data;
}

/** A score as four decimals, so a column lines up and a zero reads as the zero it is. */
export const formatScore = (value: number): string => value.toFixed(4);
