import type { CheckpointForm, CheckpointFormValues } from '../components/evaluations/checkpointForms';
import type { CheckpointSourceView } from '../components/evaluations/sources';
import type { StorageProviderView } from '../components/project/storageProviders';
import { hubModelUrl, shortRevision } from '../utils/hubLinks';

/**
 * Everything the app knows about Hugging Face as a place something can live: its id, the shape of each pointer to it,
 * and how each is shown, asked for and linked. A second store is a second file like this one, plus its id in the lists
 * of `types/providers.ts` and one entry in each registry that is keyed by them (`checkpointSources`,
 * `checkpointForms`, `modelLinkSources`, `dataSources`, `storageProviders`). No page spells the provider's id.
 *
 * Its addresses (the Hub, or a mirror set by `HF_ENDPOINT`) and short commits are in `utils/hubLinks.ts`.
 */

/** The provider's id, as the API stores and sends it. */
export const HUB = 'hf' as const;
export const HUB_NAME = 'Hugging Face';

/** A checkpoint on the Hub, pinned to a full commit. */
export interface HubCheckpoint {
  kind: typeof HUB;
  repo: string;
  commit: string;
  path?: string;
}

/** A dataset on the Hub, pinned to a full commit: what a suite pins, and what an evaluator reports having read. */
export interface HubData {
  kind: typeof HUB;
  repo: string;
  commit: string;
}

/** A model on the Hub, pinned to the commit a run produced. */
export interface HubModelLink {
  provider: typeof HUB;
  kind: 'model';
  /** `org/name` */
  repo: string;
  /** the full commit hash, never a branch */
  revision: string;
  /** a file or folder inside the repo, when the model is not all of it */
  path?: string;
  /** a demo Space on the Hub where anyone can try the model: `org/name` */
  space?: string;
}

/** A dataset kept on the Hub: Visin stores only this pointer. */
export interface HubDatasetSource {
  provider: typeof HUB;
  repo: string;
  /** the full commit hash */
  revision: string;
}

export const hubCheckpointView: CheckpointSourceView<HubCheckpoint> = {
  label: checkpoint => `${checkpoint.repo} @ ${shortRevision(checkpoint.commit)}${checkpoint.path ? ` · ${checkpoint.path}` : ''}`,
  href: checkpoint => hubModelUrl({ repo: checkpoint.repo, revision: checkpoint.commit, path: checkpoint.path })
};

export const hubDataDescription = (data: { repo?: string; commit?: string }, { full }: { full?: boolean }): string =>
  `Hub dataset ${data.repo} @ ${full ? data.commit : (data.commit ?? '').slice(0, 7)}`;

const text = (values: CheckpointFormValues, key: string) => (values[key] ?? '').trim();

export const hubCheckpointForm: CheckpointForm = {
  choice: 'On the Hub',
  fields: [
    { key: 'repo', label: 'Repo', required: true, placeholder: 'org/name' },
    { key: 'commit', label: 'Commit', required: true, helperText: 'The full 40-character commit hash, not a branch.' },
    { key: 'path', label: 'File in the repo' }
  ],
  build: values => ({ kind: HUB, repo: text(values, 'repo'), commit: text(values, 'commit'), ...(text(values, 'path') ? { path: text(values, 'path') } : {}) })
};

/**
 * The checkpoint a run's Hub link stands for. The link calls the commit `revision`; a checkpoint calls it `commit`, and
 * the conversion is explicit so neither is ever guessed from the other.
 */
export const hubLinkCheckpoint = (link: Pick<HubModelLink, 'repo' | 'revision' | 'path'>): HubCheckpoint => ({
  kind: HUB,
  repo: link.repo,
  commit: link.revision,
  ...(link.path ? { path: link.path } : {})
});

/** The answers a run's Hub link gives to the Hub checkpoint form. */
export const hubLinkAnswers = (link: Pick<HubModelLink, 'repo' | 'revision' | 'path'>): CheckpointFormValues => ({
  repo: link.repo,
  commit: link.revision,
  path: link.path ?? ''
});

export const hubStorageView: StorageProviderView = {
  label: 'Hugging Face Hub',
  summary:
    'Runs can link models and use datasets on the Hub. Visin keeps only a pointer to the exact commit; the checkpoint is uploaded from the training machine with your own Hub token.',
  settings: [{ key: 'namespace', label: 'Hub user or organisation', placeholder: 'acme', helperText: 'Optional. Where a pipeline creates model repos by default.' }]
};
