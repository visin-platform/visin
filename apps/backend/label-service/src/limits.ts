/**
 * Fixed limits of the service. Constants, not settings: nothing about a
 * deployment changes what a sensible value is, and a setting nobody has reason
 * to touch is one more thing to document and get wrong.
 */

/** How long a frame stays leased to the annotator it was handed to. */
export const TASK_LEASE_MINUTES = 5;

/** The largest labels archive an import accepts, in bytes. */
export const IMPORT_MAX_BYTES = 1024 * 1024 * 1024;
