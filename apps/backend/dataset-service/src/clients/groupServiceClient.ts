import { createGroupServiceClient } from '@visin/backend-core';

export type { GroupRole, GroupMembership, MyGroup } from '@visin/backend-core';

export const { checkMembership, getMyGroups } = createGroupServiceClient('dataset-service');
