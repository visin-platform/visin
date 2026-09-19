import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Check, Close, Delete, Edit, ExpandMore } from '@mui/icons-material';
import { Group, GroupRole, permissionsFor, roleOf } from '../../types/group';
import GroupMembers from './GroupMembers';
import GroupInvitations from './GroupInvitations';

interface GroupCardProps {
  group: Group;
  currentUserId?: string;
  busy: boolean;
  onRename: (groupId: string, name: string) => void;
  onDelete: (group: Group) => void;
  onChangeRole: (groupId: string, userId: string, role: GroupRole) => void;
  onRemoveMember: (groupId: string, userId: string) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({
  group,
  currentUserId,
  busy,
  onRename,
  onDelete,
  onChangeRole,
  onRemoveMember
}) => {
  const theme = useTheme();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);

  const myRole = roleOf(group, currentUserId);
  const permissions = permissionsFor(myRole);
  const trimmed = name.trim();

  const commitRename = () => {
    if (trimmed && trimmed !== group.name) {
      onRename(group._id, trimmed);
    }
    setEditingName(false);
  };

  const cancelRename = () => {
    setName(group.name);
    setEditingName(false);
  };

  return (
    // A row of the groups panel: flat, with a hairline above every row but the first.
    <Accordion
      disableGutters
      elevation={0}
      square
      sx={{
        bgcolor: 'transparent',
        '&:before': { display: 'none' },
        '& + &': { borderTop: 1, borderColor: 'divider' }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        aria-label={`Toggle ${group.name}`}
        sx={{ px: 2, minHeight: 68, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1, minWidth: 0, pr: 1 }}>
          <Avatar
            variant="rounded"
            sx={{ width: 40, height: 40, borderRadius: '12px', fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.12), color: 'primary.main' }}
          >
            {group.name.trim().charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography noWrap sx={{ fontWeight: 600 }}>
              {group.name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
            </Typography>
          </Box>
          {myRole && (
            <Chip
              label={myRole}
              size="small"
              color={myRole === 'member' ? 'default' : 'primary'}
              variant={myRole === 'member' ? 'outlined' : 'filled'}
              sx={{ textTransform: 'capitalize', flexShrink: 0 }}
            />
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: { xs: 2, sm: 3 }, pb: 3, pt: 1, bgcolor: 'background.default', borderTop: 1, borderColor: 'divider' }}>
        {permissions.canRename && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            {editingName ? (
              <>
                <TextField
                  size="small"
                  label="Group name"
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  sx={{ flexGrow: 1, maxWidth: 360 }}
                />
                <IconButton aria-label="Save name" disabled={busy || !trimmed} onClick={commitRename}>
                  <Check fontSize="small" />
                </IconButton>
                <IconButton aria-label="Cancel rename" disabled={busy} onClick={cancelRename}>
                  <Close fontSize="small" />
                </IconButton>
              </>
            ) : (
              <Button size="small" startIcon={<Edit />} onClick={() => setEditingName(true)}>
                Rename group
              </Button>
            )}
          </Box>
        )}

        <GroupMembers
          group={group}
          permissions={permissions}
          currentUserId={currentUserId}
          busy={busy}
          onChangeRole={(userId, role) => onChangeRole(group._id, userId, role)}
          onRemove={(userId) => onRemoveMember(group._id, userId)}
        />

        {permissions.canManageMembers && (
          <Box sx={{ mt: 3 }}>
            <GroupInvitations groupId={group._id} canInviteOwner={permissions.canManageOwners} />
          </Box>
        )}

        {permissions.canDeleteGroup && (
          <>
            <Divider sx={{ my: 3 }} />
            {/* describeChild: otherwise MUI uses the tooltip as the button's
                aria-label, replacing "Delete group" as its accessible name. */}
            <Tooltip describeChild title="Moves the group to deleted groups, where it can be restored">
              <Button
                size="small"
                color="error"
                startIcon={<Delete />}
                disabled={busy}
                onClick={() => onDelete(group)}
              >
                Delete group
              </Button>
            </Tooltip>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default GroupCard;
