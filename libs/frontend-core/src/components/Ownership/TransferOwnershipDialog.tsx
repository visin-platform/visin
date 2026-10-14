import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography
} from '@mui/material';
import { Group as GroupIcon, Person as PersonIcon } from '@mui/icons-material';
import { ownerLabel, transferTargets, type OwnerGroup, type OwnerRef, type OwnerRole } from './types';

export interface TransferOwnershipDialogProps {
  open: boolean;
  /** what is being moved, for the title: "Road scenes" */
  resourceName: string;
  /** what kind of thing it is, so the copy can say what moves with it */
  resourceKind?: 'project' | 'dataset';
  current: OwnerRef;
  userId: string;
  groups: OwnerGroup[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onTransfer: (to: OwnerRef) => void;
}

const keyOf = (owner: OwnerRef) => `${owner.kind}:${owner.id}`;

const CONTENTS: Record<NonNullable<TransferOwnershipDialogProps['resourceKind']>, string> = {
  project: 'Its runs, results, models and settings move with it.',
  dataset: 'Its images and labeling jobs move with it.'
};

/** What a person can do once a group owns it, by their role in that group. */
const ROLE_AFTER: Record<OwnerRole, string> = {
  owner: 'As the group’s owner you keep full control, and only the group’s owner can move it again.',
  admin: 'As an admin you can manage it, but only the group’s owner can move it again.',
  member: 'As a member you can add to it and change what you added. Admins manage it, and only the group’s owner can move it again.'
};

const ROLE_NAME: Record<OwnerRole, string> = { owner: 'an owner', admin: 'an admin', member: 'a member' };

const OwnerIcon = ({ owner }: { owner: OwnerRef }) =>
  owner.kind === 'group' ? <GroupIcon fontSize="small" /> : <PersonIcon fontSize="small" />;

/** One line under a destination saying what choosing it means, before it is chosen. */
function describeTarget(option: OwnerRef, groups: OwnerGroup[]): string {
  if (option.kind === 'user') return 'Only you can see and change it, unless it is public.';
  const role = groups.find((group) => group.id === option.id)?.role;
  return role ? `You are ${ROLE_NAME[role]} of this group.` : '';
}

/**
 * Hand a project or dataset, with everything in it, to another owner: a person or one of the user's groups. It
 * offers only the moves the user may make (the server still decides), says what each one means, and with none,
 * says why.
 */
export function TransferOwnershipDialog({
  open,
  resourceName,
  resourceKind,
  current,
  userId,
  groups,
  busy,
  error,
  onClose,
  onTransfer
}: TransferOwnershipDialogProps) {
  const targets = transferTargets(current, userId, groups);
  const [chosen, setChosen] = useState('');
  // The page closes the dialog itself after a transfer, so a choice is cleared whenever it closes, not only on
  // Cancel: reopened, it would otherwise point at the old owner's options.
  useEffect(() => {
    if (!open) setChosen('');
  }, [open]);
  const target = targets.find((option) => keyOf(option) === chosen);
  const targetRole = target?.kind === 'group' ? groups.find((group) => group.id === target.id)?.role : undefined;
  const targetName = target ? ownerLabel(target, userId, groups) : '';

  const close = () => {
    setChosen('');
    onClose();
  };

  const currentLabel = ownerLabel(current, userId, groups);

  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="sm">
      <DialogTitle>Transfer {resourceName}</DialogTitle>
      <DialogContent>
        {targets.length === 0 ? (
          <DialogContentText>
            {current.kind === 'user'
              ? 'Only its owner can transfer it.'
              : "Only the owning group's owner can transfer it."}
          </DialogContentText>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: 'text.secondary' }}>
              <Typography variant="body2">Owned by</Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.primary' }}>
                <OwnerIcon owner={current} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {currentLabel}
                </Typography>
              </Box>
            </Box>

            <Typography id="transfer-target-label" variant="subtitle2" sx={{ mb: 0.5 }}>
              New owner
            </Typography>
            <RadioGroup
              aria-labelledby="transfer-target-label"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              sx={{ gap: 1 }}
            >
              {targets.map((option) => {
                const selected = keyOf(option) === chosen;
                return (
                  <FormControlLabel
                    key={keyOf(option)}
                    value={keyOf(option)}
                    disabled={busy}
                    control={<Radio sx={{ alignSelf: 'flex-start', mt: 0.25 }} />}
                    sx={{
                      m: 0,
                      alignItems: 'flex-start',
                      border: '1px solid',
                      borderColor: selected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      pr: 2,
                      py: 0.5
                    }}
                    label={
                      <Box sx={{ py: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <OwnerIcon owner={option} />
                          <Typography sx={{ fontWeight: 600 }}>{ownerLabel(option, userId, groups)}</Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          {describeTarget(option, groups)}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </RadioGroup>

            <Box component="section" aria-label="What changes" sx={{ mt: 2.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                What changes
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', '& li': { mb: 0.5 } }}>
                <li>
                  <Typography variant="body2">
                    {resourceKind ? CONTENTS[resourceKind] : 'Everything in it moves with it.'}
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    Who can see and change it follows the new owner
                    {target?.kind === 'group' ? `: ${targetName}’s roles decide.` : target ? ': only you.' : '.'}
                  </Typography>
                </li>
                {target?.kind === 'group' && targetRole && (
                  <li>
                    <Typography variant="body2">{ROLE_AFTER[targetRole]}</Typography>
                  </li>
                )}
                {target?.kind === 'user' && (
                  <li>
                    <Typography variant="body2">
                      The group’s members lose access to it, unless you make it public.
                    </Typography>
                  </li>
                )}
                {!target && current.kind === 'user' && (
                  <li>
                    <Typography variant="body2">
                      Once it belongs to a group, only that group’s owner can move it again.
                    </Typography>
                  </li>
                )}
              </Box>
            </Box>
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          {targets.length === 0 ? 'Close' : 'Cancel'}
        </Button>
        {targets.length > 0 && (
          <Button variant="contained" disabled={!target || busy} onClick={() => target && onTransfer(target)}>
            {busy ? 'Transferring…' : target ? `Transfer to ${targetName}` : 'Transfer'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
