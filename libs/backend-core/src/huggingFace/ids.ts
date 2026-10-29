/**
 * How the Hugging Face Hub spells the things a service stores a pointer to. Shared so that every service that accepts
 * one applies the same rule.
 */

/** A Hub commit is a full SHA-1: a branch name moves, so it is never accepted as a revision. */
export const HF_COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/** `namespace/name`, as the Hub spells a repo id. */
export const HF_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;

/** The user or organisation part of a repo id, on its own. */
export const HF_NAMESPACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/;
