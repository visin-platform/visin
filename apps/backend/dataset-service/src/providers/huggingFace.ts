import { z } from '@visin/backend-core';

/**
 * Everything about Hugging Face as a place a dataset can be kept: its id, how it spells a repo and a commit, and what
 * a dataset records of it. A second store is a second file like this one, plus one entry in `index.ts`.
 *
 * The Hub's id rules are repeated from vision-service rather than shared: a lib change would need its own release.
 */

/** The provider's id, as it is stored and sent. */
export const HUB = 'hf' as const;
/** How the provider is named to a person. */
export const HUB_NAME = 'Hugging Face';

/** A dataset kept on the Hub instead of (or as well as) a zip here: a pointer, pinned to a full commit hash. */
export const hubSourceSchema = z.object({
  provider: z.literal(HUB),
  repo: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/, 'Expected a repo id like "org/name"'),
  revision: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[0-9a-f]{40}$/.test(value), 'Expected the full 40-character commit hash, not a branch or tag')
});
export type HubSource = z.infer<typeof hubSourceSchema>;

/** The fields a Hub source adds to a stored dataset source; `hubSourceSchema` is what requires them of a Hub one. */
export const hubSourcePaths = { repo: String, revision: String };

/** What a client may see of a Hub source. */
export const hubSourceView = (source: HubSource) => ({ provider: source.provider, repo: source.repo, revision: source.revision });
