import { createOwnerIdentityLookup } from '@visin/backend-core';

export type { OwnerIdentity } from '@visin/backend-core';

/** Who owns something, as far as the owner agreed to show: best effort, never fails a list. */
export const lookupOwnerIdentities = createOwnerIdentityLookup('vision-service');
