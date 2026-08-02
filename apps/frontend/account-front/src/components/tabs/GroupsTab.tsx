import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import { GroupAdd } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import {
  useAddMember,
  useCreateGroup,
  useDeleteGroup,
  useDeleteGroupForever,
  useDeletedGroups,
  useMyGroups,
  useRemoveMember,
  useRenameGroup,
  useRestoreGroup,
  useUpdateMemberRole
} from '../../hooks/useGroups';
import { Group, GroupRole } from '../../types/group';
import GroupCard from '../groups/GroupCard';
import DeletedGroups from '../groups/DeletedGroups';
import { ConfirmDialog, CreateGroupDialog } from '../groups/GroupDialogs';

type PendingConfirm =
  | { kind: 'deleteGroup'; group: Group }
  | { kind: 'deleteForever'; group: Group }
  | { kind: 'removeMember'; group: Group; email: string };

const GroupsTab: React.FC = () => {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const groups = useMyGroups();
  const deletedGroups = useDeletedGroups(trashOpen);

  const createGroup = useCreateGroup();
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();
  const restoreGroup = useRestoreGroup();
  const deleteForever = useDeleteGroupForever();
  const addMember = useAddMember();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const mutations = [
    createGroup,
    renameGroup,
    deleteGroup,
    restoreGroup,
    deleteForever,
    addMember,
    updateMemberRole,
    removeMember
  ];
  const busy = mutations.some(mutation => mutation.isPending);
  // group-service returns a specific message for each rejection (last owner,
  // duplicate member, insufficient role) — surface it rather than a generic
  // "something went wrong".
  const mutationError = mutations.find(mutation => mutation.error)?.error;

  const confirmCopy = (pending: PendingConfirm) => {
    switch (pending.kind) {
      case 'deleteGroup':
        return {
          title: `Delete ${pending.group.name}?`,
          message: 'The group moves to deleted groups, where an owner can restore it.',
          confirmLabel: 'Delete'
        };
      case 'deleteForever':
        return {
          title: `Permanently delete ${pending.group.name}?`,
          message: 'This cannot be undone. The group and its membership are removed for good.',
          confirmLabel: 'Delete forever'
        };
      case 'removeMember':
        return {
          title:
            pending.email === user?.email?.toLowerCase()
              ? `Leave ${pending.group.name}?`
              : `Remove ${pending.email}?`,
          message: `They lose access to everything shared with ${pending.group.name}.`,
          confirmLabel: 'Remove'
        };
    }
  };

  const runConfirmed = () => {
    if (!confirm) return;
    if (confirm.kind === 'deleteGroup') deleteGroup.mutate(confirm.group._id);
    if (confirm.kind === 'deleteForever') deleteForever.mutate(confirm.group._id);
    if (confirm.kind === 'removeMember') {
      removeMember.mutate({ groupId: confirm.group._id, email: confirm.email });
    }
    setConfirm(null);
  };

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4, gap: 2 }}>
          <Box>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
              Groups
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Groups control who you share datasets and labelling work with. Owners and admins can
              rename a group and manage its members.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<GroupAdd />}
            onClick={() => setCreateOpen(true)}
            sx={{ borderRadius: 2, flexShrink: 0 }}
          >
            New group
          </Button>
        </Box>

        {mutationError && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {mutationError.message}
          </Alert>
        )}

        {groups.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : groups.isError ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            Could not load your groups. {(groups.error as Error).message}
          </Alert>
        ) : groups.data && groups.data.length > 0 ? (
          groups.data.map(group => (
            <GroupCard
              key={group._id}
              group={group}
              currentUserEmail={user?.email}
              busy={busy}
              onRename={(groupId, name) => renameGroup.mutate({ groupId, name })}
              onDelete={target => setConfirm({ kind: 'deleteGroup', group: target })}
              onAddMember={(groupId, email, role: GroupRole) =>
                addMember.mutate({ groupId, email, role })
              }
              onChangeRole={(groupId, email, role) => updateMemberRole.mutate({ groupId, email, role })}
              onRemoveMember={(groupId, email) => {
                const target = groups.data.find(candidate => candidate._id === groupId);
                if (target) setConfirm({ kind: 'removeMember', group: target, email });
              }}
            />
          ))
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
            You are not in any groups yet. Create one to start sharing work.
          </Typography>
        )}
      </Paper>

      <Box sx={{ mt: 4 }}>
        <DeletedGroups
          groups={deletedGroups.data ?? []}
          loading={trashOpen && deletedGroups.isLoading}
          busy={busy}
          currentUserEmail={user?.email}
          expanded={trashOpen}
          onToggle={setTrashOpen}
          onRestore={groupId => restoreGroup.mutate(groupId)}
          onDeleteForever={group => setConfirm({ kind: 'deleteForever', group })}
        />
      </Box>

      <CreateGroupDialog
        open={createOpen}
        busy={createGroup.isPending}
        onClose={() => setCreateOpen(false)}
        onCreate={name => createGroup.mutate(name, { onSuccess: () => setCreateOpen(false) })}
      />

      {confirm && (
        <ConfirmDialog
          open
          busy={busy}
          {...confirmCopy(confirm)}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
        />
      )}
    </Box>
  );
};

export default GroupsTab;
