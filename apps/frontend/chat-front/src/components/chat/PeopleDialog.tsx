import { Close, Logout, PersonAddOutlined, PersonRemoveOutlined, BlockOutlined } from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import type { AuthUser } from '@visin/frontend-core';
import { authService } from '../../contexts/AuthContext';
import { useEffect, useId, useState } from 'react';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { chatService } from '../../services/chatService';
import type { Participant } from '../../types/chat';

const STATUS: Record<Participant['state'], string> = {
  active: 'Joined',
  invited: 'Invited',
  left: 'Left',
  blocked: 'Blocked'
};
const ROLE: Record<string, string> = { owner: 'Owner', admin: 'Administrator', member: 'Member', assistant: 'AI assistant' };
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase() || '?';

export function PeopleDialog() {
  const titleId = useId();
  const [ownProfile, setOwnProfile] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteHandle, setInviteHandle] = useState('');
  const { showPeople, setShowPeople, c, me, user, perform, selected, refreshList, membership, error, setError } =
    useChatWorkspaceContext();
  useEffect(() => {
    if (showPeople) {
      setInviteHandle('');
      setError('');
    }
  }, [showPeople, c?._id, setError]);
  useEffect(() => {
    if (!showPeople || !user?.id) return;
    let cancelled = false;
    setOwnProfile(null);
    void authService.getProfile().then((profile) => {
      if (!cancelled && profile?.id === user.id) setOwnProfile(profile);
    });
    return () => { cancelled = true; };
  }, [showPeople, user?.id]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await perform(operation);
    } finally {
      setBusy(false);
    }
  };
  const close = () => setShowPeople(false);
  const participants: Participant[] = c?.kind === 'assistant'
    ? [...c.participants, {
        userId: `assistant:${c.assistantId || c._id}`,
        name: c.profile?.name || c.title,
        state: 'active',
        role: 'assistant',
        readSeq: 0
      }]
    : c?.participants || [];
  const canInvite = c?.kind === 'room' && ['owner', 'admin'].includes(me?.role || '');
  const invite = () =>
    void run(async () => {
      await chatService.invite(selected!, inviteHandle.trim().replace(/^@/, ''));
      setInviteHandle('');
      await refreshList();
    });

  return (
    <Dialog
      open={showPeople}
      onClose={close}
      fullWidth
      maxWidth="xs"
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: { borderRadius: 3, m: 2, width: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle id={`${titleId}-header`} component="div" sx={{ px: 3, pt: 2.5, pb: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography id={titleId} component="h2" variant="h6" sx={{ fontWeight: 700 }}>
              People
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {c?.kind === 'assistant'
                ? 'Private chat · you and this assistant'
                : c?.groupId
                ? 'Group membership controls access'
                : `${participants.filter((p) => p.state === 'active').length} joined · ${participants.filter((p) => p.state === 'invited').length} invited`}
            </Typography>
          </Box>
          <IconButton aria-label="Close people" onClick={close} edge="end">
            <Close fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ px: 3, py: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <List disablePadding aria-label="Conversation members">
          {participants.map((p) => {
            const own = p.userId === user?.id;
            const identity = own
              ? (ownProfile?.id === user?.id ? ownProfile : user)
              : p.role === 'assistant' || c?.profile?.id === p.userId ? c?.profile : undefined;
            const profileHref = identity?.handle ? `/u/${encodeURIComponent(identity.handle)}` : undefined;
            const avatar = (
              <Avatar
                src={identity?.picture}
                alt={p.name}
                sx={{
                  width: 38, height: 38, fontSize: 14, fontWeight: 600,
                  bgcolor: 'action.selected', color: own ? 'primary.main' : 'text.secondary'
                }}
              >
                {initials(p.name)}
              </Avatar>
            );
            const departed = p.state === 'left' || p.state === 'blocked';
            return (
              <ListItem
                key={p.userId}
                disableGutters
                sx={{ py: 1.5, gap: 1, opacity: departed ? 0.65 : 1, alignItems: 'center' }}
              >
                <ListItemAvatar sx={{ minWidth: 48 }}>
                  {profileHref ? (
                    <Link href={profileHref} aria-label={own ? 'View your profile' : `View ${p.name} profile`} sx={{ display: 'inline-flex', borderRadius: '50%' }}>
                      {avatar}
                    </Link>
                  ) : avatar}
                </ListItemAvatar>
                <ListItemText
                  sx={{ minWidth: 0, m: 0 }}
                  disableTypography
                  primary={
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Typography variant="body2" noWrap title={p.name} sx={{ fontWeight: 600 }}>
                        {p.name}
                      </Typography>
                      {own && (
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          You
                        </Typography>
                      )}
                    </Stack>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {ROLE[p.role] || 'Member'}
                    </Typography>
                  }
                />
                <Chip
                  label={STATUS[p.state]}
                  size="small"
                  variant="outlined"
                  color={p.state === 'invited' ? 'warning' : 'default'}
                  sx={{
                    flexShrink: 0,
                    height: 24,
                    fontSize: 11,
                    borderColor: p.state === 'invited' ? undefined : 'divider'
                  }}
                />
                {c?.kind === 'room' && me?.role === 'owner' && !own && !departed && (
                  <Tooltip title={`Remove ${p.name}`}>
                    <IconButton
                      size="small"
                      disabled={busy}
                      aria-label={`Remove ${p.name}`}
                      onClick={() =>
                        void run(async () => {
                          await chatService.removeParticipant(selected!, p.userId);
                          await refreshList();
                        })
                      }
                    >
                      <PersonRemoveOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItem>
            );
          })}
        </List>
        {!participants.length && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Members are managed in the owning group.
          </Typography>
        )}
        {canInvite && (
          <Box
            component="form"
            sx={{ pt: 2, pb: 1.5, borderTop: 1, borderColor: 'divider' }}
            onSubmit={(event) => {
              event.preventDefault();
              if (inviteHandle.trim()) invite();
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Invite someone
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextField
                size="small"
                fullWidth
                disabled={busy}
                label="Public profile handle"
                placeholder="@handle"
                value={inviteHandle}
                onChange={(event) => setInviteHandle(event.target.value)}
              />
              <Button
                type="submit"
                variant="outlined"
                disabled={busy || !inviteHandle.trim()}
                startIcon={<PersonAddOutlined />}
                sx={{ height: 40 }}
              >
                Invite
              </Button>
            </Stack>
          </Box>
        )}
        {c?.groupId && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
            Access follows current membership of the owning group.
          </Typography>
        )}
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 2.5, py: 2, gap: 0.5, flexWrap: 'wrap' }}>
        {c && ['room', 'direct'].includes(c.kind) && (
          <>
            <Button
              color="inherit"
              startIcon={<Logout fontSize="small" />}
              onClick={() => {
                close();
                void membership('leave');
              }}
            >
              Leave
            </Button>
            {c.kind === 'direct' && (
              <Button
                color="error"
                startIcon={<BlockOutlined fontSize="small" />}
                onClick={() => {
                  close();
                  void membership('block');
                }}
              >
                Block
              </Button>
            )}
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disableElevation onClick={close}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
