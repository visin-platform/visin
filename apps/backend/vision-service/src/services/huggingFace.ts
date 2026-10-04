import { z } from '@visin/backend-core';

/**
 * Everything specific to Hugging Face lives here: its id, its name, how it spells a repo and a commit, the schema of
 * each thing that can point at it, and how each is keyed and shown. A second store is a second file like this one,
 * plus one entry in each list and registry in `sourceRegistry.ts` and one variant in each union in `validation/`.
 * Nothing outside this file spells the provider's id.
 */

/** The provider's id, as it is stored and sent. */
export const HUB = 'hf' as const;
/** How the provider is named to a person. */
export const HUB_NAME = 'Hugging Face';

/** A Hub commit is a full SHA-1: a branch name moves, so it is never accepted as a revision. */
export const HF_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
/** `namespace/name`, as the Hub spells a repo id. */
export const HF_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
/** The user or organisation part of a repo id, on its own. */
export const HF_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;

export const hubRepoSchema = z.string().regex(HF_REPO_PATTERN, 'Expected a repo id like "org/name"');

const hubCommitSchema = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => HF_COMMIT_PATTERN.test(value), message);

/** A path inside a repo: a file or folder, never one that leaves it. */
const hubPathSchema = z
  .string()
  .max(500)
  .refine((value) => !value.startsWith('/') && !value.split('/').includes('..'), 'Path must stay inside the repo');

// ---- project storage

/**
 * A project that keeps its files on the Hub. `settings.namespace` is only the default owner for repos a pipeline
 * creates; it is validated here because only this provider knows what a namespace is.
 */
export const hubStorageSchema = z.strictObject({
  provider: z.literal(HUB),
  settings: z
    .strictObject({
      namespace: z.string().regex(HF_NAMESPACE_PATTERN, 'Not a valid Hugging Face user or organisation').optional()
    })
    .optional()
});

// ---- a model linked to a run

/** A pointer to a model on the Hub, pinned to the exact commit a run used. */
export const hubModelLinkSchema = z.object({
  provider: z.literal(HUB),
  kind: z.literal('model').default('model'),
  repo: hubRepoSchema,
  revision: hubCommitSchema('Expected the full 40-character commit hash, not a branch or tag'),
  /** a file or folder inside the repo, when the model is not the whole of it */
  path: hubPathSchema.optional(),
  /** the epoch this checkpoint came from */
  epoch: z.number().int().min(0).optional()
});
export type HubModelLink = z.infer<typeof hubModelLinkSchema> & {
  /** a demo Space on the Hub where anyone can try the model: `org/name` */
  space?: string;
};

/**
 * The fields a Hub link adds to a stored model link. Optional here because another provider's links lack them:
 * `hubModelLinkSchema` is what requires them of a Hub link.
 */
export const hubModelLinkPaths = { repo: String, revision: String, path: String, space: String };

/** What makes two links the same: the filter that finds an existing one. `path: null` matches one stored without. */
export const hubModelLinkIdentity = (link: Pick<HubModelLink, 'provider' | 'repo' | 'revision'> & { path?: string | null }) => ({
  provider: link.provider,
  repo: link.repo,
  revision: link.revision,
  path: link.path ?? null
});

/** How a linked Hub model is named to a person, and what a search matches it by. */
export const hubModelLinkLabel = (link: { repo: string }): string => link.repo;

/** The model links of a run that sit in one Hub repo (case does not matter): what a Hub model card is about. */
export const hubLinksOfRepo = <L extends { provider: string; repo?: string }>(links: L[], repo: string): L[] =>
  links.filter((link) => link.provider === HUB && link.repo?.toLowerCase() === repo.toLowerCase());

// ---- a checkpoint an evaluation scored

export const hubCheckpointSchema = z.strictObject({
  kind: z.literal(HUB),
  repo: hubRepoSchema,
  commit: hubCommitSchema('Expected the full 40-character commit hash, not a branch or tag'),
  path: hubPathSchema.optional()
});
export type HubCheckpoint = z.infer<typeof hubCheckpointSchema>;

/** A Hub checkpoint is its repo (case does not matter), its full commit and the file inside it (absent is empty). */
export const hubCheckpointKey = (checkpoint: HubCheckpoint): string =>
  `${HUB}:${checkpoint.repo.toLowerCase()}@${checkpoint.commit}:${checkpoint.path ?? ''}`;

/** What a public page may say of a Hub checkpoint: the pin, never more. */
export const hubCheckpointView = (checkpoint: HubCheckpoint) => ({
  kind: HUB,
  repo: checkpoint.repo,
  commit: checkpoint.commit,
  ...(checkpoint.path ? { path: checkpoint.path } : {})
});
export type PublicHubCheckpoint = ReturnType<typeof hubCheckpointView>;

/** The checkpoint a linked Hub model stands for. */
export const hubLinkCheckpoint = (link: { repo: string; revision: string; path?: string | null }): HubCheckpoint => ({
  kind: HUB,
  repo: link.repo,
  commit: link.revision,
  ...(link.path ? { path: link.path } : {})
});

// ---- the data a suite pins, and the data an evaluator reports having read

/** A Hub dataset, pinned to a full commit: what a suite declares, and what an evaluator reports having read. */
export const hubDataSchema = z.strictObject({
  kind: z.literal(HUB),
  repo: hubRepoSchema,
  commit: hubCommitSchema('Expected the full 40-character commit hash')
});
export type HubData = z.infer<typeof hubDataSchema>;

/** The field in which two pins of a Hub dataset differ, or `undefined` when they are the same data. */
export function hubDatasetMismatch(declared: Pick<HubData, 'repo' | 'commit'>, observed: Pick<HubData, 'repo' | 'commit'>): string | undefined {
  if (declared.repo.toLowerCase() !== observed.repo.toLowerCase()) return 'repo';
  return declared.commit === observed.commit ? undefined : 'commit';
}

/** What a public page may say of a Hub dataset: the pin. */
export const hubDatasetView = (data: Pick<HubData, 'repo' | 'commit'>) => ({ kind: HUB, repo: data.repo, commit: data.commit });
export type PublicHubData = ReturnType<typeof hubDatasetView>;
