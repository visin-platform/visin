import { Chip } from '@mui/material';
import { Group, Person } from '@mui/icons-material';
import { ownerLabel, type OwnerGroup, type OwnerRef } from './types';

export interface OwnerChipProps {
  owner: OwnerRef;
  userId?: string;
  groups: OwnerGroup[];
  /** the owning group's name when the user is not in it, if the API sent one */
  ownerName?: string;
}

/** Who owns this, at a glance: "Me" or the group's name. */
export function OwnerChip({ owner, userId, groups, ownerName }: OwnerChipProps) {
  const label = ownerName && !(owner.kind === 'user' && owner.id === userId) ? ownerName : ownerLabel(owner, userId, groups);
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={owner.kind === 'group' ? <Group /> : <Person />}
      label={label}
      aria-label={`Owner: ${label}`}
    />
  );
}
