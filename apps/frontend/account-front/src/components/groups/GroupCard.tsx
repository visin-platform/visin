import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Check, Close, Delete, Edit, ExpandMore } from '@mui/icons-material';
import { Group, GroupRole, permissionsFor, roleOf } from '../../types/group';
import GroupMembers from './GroupMembers';
import AddMemberForm from './AddMemberForm';

interface GroupCardProps {
  group: Group;
  currentUserEmail?: string;
  busy: boolean;
  onRename: (groupId: string, name: string) => void;
  onDelete: (group: Group) => void;
  onAddMember: (groupId: string, email: string, role: GroupRole) => void;
  onChangeRole: (groupId: string, email: string, role: GroupRole) => void;
  onRemoveMember: (groupId: string, email: string) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({
  group,
  currentUserEmail,
  busy,
  onRename,
  onDelete,
  onAddMember,
  onChangeRole,
  onRemoveMember
}) => {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(group.name);

  const myRole = roleOf(group, currentUserEmail);
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
    <Accordion
      disableGutters
      variant="outlined"
      sx={{ borderRadius: 3, '&:before': { display: 'none' }, mb: 2, overflow: 'hidden' }}
    >
      <AccordionSummary expandIcon={<ExpandMore />} aria-label={`Toggle ${group.name}`}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, pr: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {group.name}
          </Typography>
          {myRole && <Chip label={myRole} size="small" color={myRole === 'member' ? 'default' : 'primary'} />}
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
            {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
          </Typography>
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 3, pb: 3 }}>
        {permissions.canRename && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            {editingName ? (
              <>
                <TextField
                  size="small"
                  label="Group name"
                  value={name}
                  disabled={busy}
                  onChange={event => setName(event.target.value)}
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
              <Button
                size="small"
                startIcon={<Edit />}
                onClick={() => setEditingName(true)}
                sx={{ borderRadius: 2 }}
              >
                Rename group
              </Button>
            )}
          </Box>
        )}

        <GroupMembers
          group={group}
          permissions={permissions}
          currentUserEmail={currentUserEmail}
          busy={busy}
          onChangeRole={(email, role) => onChangeRole(group._id, email, role)}
          onRemove={email => onRemoveMember(group._id, email)}
        />

        {permissions.canManageMembers && (
          <Box sx={{ mt: 3 }}>
            <AddMemberForm
              busy={busy}
              canAddOwner={permissions.canManageOwners}
              onAdd={(email, role) => onAddMember(group._id, email, role)}
            />
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
                sx={{ borderRadius: 2 }}
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
