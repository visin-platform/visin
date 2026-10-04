import type { Checkpoint, PublicCheckpoint } from '../../types/evaluation';
import type { SuiteDataKind } from '../../types/providers';
import { HUB, hubCheckpointView, hubDataDescription } from '../../providers/huggingFace';

/**
 * How each kind of place a checkpoint or a suite's data can live is shown. A registry is keyed by the kind, so a new
 * kind added to its list (`types/providers.ts`) fails to compile until it says how it reads, and no page branches on a
 * provider's id. A store's own wording and addresses are in its module (`providers/huggingFace.ts`).
 */

type AnyCheckpoint = Checkpoint | PublicCheckpoint;

export interface CheckpointSourceView<C> {
  /** what a person calls it */
  label(checkpoint: C): string;
  /** where to open it, when it lives somewhere that can be opened */
  href?(checkpoint: C): string;
  /** the identifying fact worth showing beside the label */
  detail?(checkpoint: C): string;
  /** a note on where it is held, for kinds Visin cannot open */
  note?: string;
}

export const checkpointSources: { [K in AnyCheckpoint['kind']]: CheckpointSourceView<Extract<AnyCheckpoint, { kind: K }>> } = {
  [HUB]: hubCheckpointView,
  local: {
    label: checkpoint => checkpoint.label,
    detail: checkpoint => `sha256 ${checkpoint.sha256}`,
    note: 'Held outside Visin'
  }
};

export const checkpointSource = (checkpoint: AnyCheckpoint): CheckpointSourceView<AnyCheckpoint> =>
  checkpointSources[checkpoint.kind] as CheckpointSourceView<AnyCheckpoint>;

/** What a person calls a checkpoint: its Hub repo and commit, or the label it was given. */
export const checkpointLabel = (checkpoint: AnyCheckpoint | undefined): string =>
  checkpoint ? checkpointSource(checkpoint).label(checkpoint) : 'Unknown checkpoint';

/** The data a suite pins, as the protocol, a public page or an evaluator's evidence spells it. */
export interface DataLike {
  kind: SuiteDataKind;
  repo?: string;
  commit?: string;
  label?: string;
  datasetId?: string;
  archiveSha256?: string;
  manifestSha256?: string;
}

interface DataDescribeOptions {
  /** the whole commit or digest, for a place a person may copy it from */
  full?: boolean;
}

const dataSources: { [K in DataLike['kind']]: (data: DataLike, options: DataDescribeOptions) => string } = {
  [HUB]: hubDataDescription,
  external: data => data.label ?? (data.manifestSha256 ? `Sample manifest ${data.manifestSha256}` : 'External data'),
  visin: data => (data.datasetId ? `Visin dataset ${data.datasetId}` : data.archiveSha256 ? `Visin dataset archive ${data.archiveSha256}` : 'A Visin dataset')
};

/** What the data is, in a line. A public page knows a Visin dataset only as one: its id is not public. */
export const describeData = (data: DataLike, options: DataDescribeOptions = {}): string => dataSources[data.kind](data, options);
