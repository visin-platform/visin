import React from 'react';
import {
  Box,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { PersonRemove } from '@mui/icons-material';
import { Group, GroupPermissions, GroupRole, isLastOwner } from '../../types/group';

const ROLES: GroupRole[] = ['owner', 'admin', 'member'];

interface GroupMembersProps {
  group: Group;
  permissions: GroupPermissions;
  currentUserEmail?: string;
  busy: boolean;
  onChangeRole: (email: string, role: GroupRole) => void;
  onRemove: (email: string) => void;
}

/**
 * Mirrors group-service's own guards so the UI doesn't offer actions the API
 * will reject: only an owner may touch another owner, and the last owner can
 * neither be demoted nor removed. Leaving (removing yourself) stays available
 * to plain members.
 */
const GroupMembers: React.FC<GroupMembersProps> = ({
  group,
  permissions,
  currentUserEmail,
  busy,
  onChangeRole,
  onRemove
}) => {
  const me = currentUserEmail?.toLowerCase();

  const roleBlockedReason = (memberEmail: string, memberRole: GroupRole): string | null => {
    if (isLastOwner(group, memberEmail)) return 'A group must keep at least one owner';
    if (memberRole === 'owner' && !permissions.canManageOwners) return 'Only an owner can change an owner';
    return null;
  };

  const removeBlockedReason = (memberEmail: string, memberRole: GroupRole): string | null => {
    if (isLastOwner(group, memberEmail)) return 'A group must keep at least one owner';
    if (memberEmail === me) return null;
    if (!permissions.canManageMembers) return 'Only an owner or admin can remove members';
    if (memberRole === 'owner' && !permissions.canManageOwners) return 'Only an owner can remove an owner';
    return null;
  };

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Member</TableCell>
          <TableCell sx={{ width: 160 }}>Role</TableCell>
          <TableCell align="right" sx={{ width: 64 }} />
        </TableRow>
      </TableHead>
      <TableBody>
        {group.members.map(member => {
          const roleBlocked = roleBlockedReason(member.email, member.role);
          const removeBlocked = removeBlockedReason(member.email, member.role);
          const canEditRole = permissions.canManageMembers && !roleBlocked;

          return (
            <TableRow key={member.email}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2">{member.email}</Typography>
                  {member.email === me && <Chip label="You" size="small" variant="outlined" />}
                </Box>
              </TableCell>
              <TableCell>
                {canEditRole ? (
                  <Select
                    size="small"
                    fullWidth
                    value={member.role}
                    disabled={busy}
                    inputProps={{ 'aria-label': `Role for ${member.email}` }}
                    onChange={event => onChangeRole(member.email, event.target.value as GroupRole)}
                  >
                    {ROLES.map(role => (
                      <MenuItem key={role} value={role}>
                        {role}
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <Tooltip title={roleBlocked ?? ''}>
                    <Chip label={member.role} size="small" />
                  </Tooltip>
                )}
              </TableCell>
              <TableCell align="right">
                <Tooltip title={removeBlocked ?? (member.email === me ? 'Leave group' : 'Remove member')}>
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      disabled={busy || removeBlocked !== null}
                      aria-label={member.email === me ? 'Leave group' : `Remove ${member.email}`}
                      onClick={() => onRemove(member.email)}
                    >
                      <PersonRemove fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default GroupMembers;
