import { useEffect } from 'react';
import type { SharedAssistantSettings } from '../../types/assistant';
import { Alert, Button, Collapse, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSharedAssistants } from '../../hooks/useSharedAssistants';
export function SharedAssistants({
  conversationId,
  target,
  onTarget,
  busy,
  onSettings
}: {
  conversationId: string;
  target: string;
  onTarget: (id: string) => void;
  busy: boolean;
  onSettings?: (settings: SharedAssistantSettings | undefined) => void;
}) {
  const { view, open, own, error, saving, change, toggle } = useSharedAssistants(conversationId, target, onTarget);
  useEffect(() => {
    onSettings?.(view);
  }, [view, onSettings]);
  return (
    <Stack spacing={1} sx={{ px: 2, py: 1 }}>
      {error && <Alert severity="warning">{error}</Alert>}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" onClick={toggle}>
          Shared assistants {view?.lockedOff ? 'locked off' : view?.enabled ? 'on' : 'off'}
        </Button>
        {view?.enabled && (
          <TextField
            select
            size="small"
            label="Message audience"
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            value={target}
            disabled={busy || saving}
            sx={{ minWidth: 180 }}
            onChange={(event) => onTarget(event.target.value)}
          >
            <MenuItem value="">People only</MenuItem>
            {view.bots
              .filter((b) => b.available)
              .map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  Ask {b.name}
                </MenuItem>
              ))}
          </TextField>
        )}
      </Stack>
      <Collapse in={open}>
        <Stack spacing={1}>
          <Typography variant="body2">
            Replies are visible to everyone here. Assistants use only this chat and cannot access projects or datasets.
            Select an assistant explicitly to ask it; ordinary messages stay between people.
          </Typography>
          {view?.policy === 'unanimous' ? (
            <>
              <Typography variant="body2">
                Everyone must agree after the audience or assistant list changes. Pending:{' '}
                {view.pending.join(', ') || 'none'}.
              </Typography>
              <Button
                disabled={saving || !view.bots.length || view.lockedOff}
                onClick={() => void change({ action: 'consent', enabled: !view.agreed })}
              >
                {view.agreed ? 'Withdraw agreement' : 'Agree to shared assistants'}
              </Button>
            </>
          ) : (
            view && <Typography variant="body2">Group administrators control enablement.</Typography>
          )}
          {view && (
            <Typography variant="body2">
              {view.whoCanAdd === 'everyone'
                ? 'All members may add their own assistants.'
                : 'Only conversation administrators may add assistants.'}
            </Typography>
          )}
          {view?.canSetAdditionPolicy && (
            <TextField
              select
              size="small"
              label="Who may add assistants"
              value={view.whoCanAdd || 'admins'}
              disabled={saving || busy}
              onChange={(event) =>
                void change({ action: 'addition-policy', whoCanAdd: event.target.value as 'everyone' | 'admins' })
              }
            >
              <MenuItem value="admins">Administrators only</MenuItem>
              <MenuItem value="everyone">All members</MenuItem>
            </TextField>
          )}
          {view?.bots.map((bot) => (
            <Stack key={bot.id} spacing={0.5}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {bot.name}
                {bot.available ? '' : ' (paused or removed)'}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {bot.personality || 'Default research communication instructions'}
              </Typography>
              {view.canManage && (
                <Button disabled={saving} onClick={() => void change({ action: 'remove', assistantId: bot.id })}>
                  Remove {bot.name} from chat
                </Button>
              )}
            </Stack>
          ))}
          {view?.canManage && (
            <>
              {view.policy === 'admins' && (
                <Button
                  disabled={saving || view.lockedOff || !view.bots.length}
                  onClick={() => void change({ action: 'switch', enabled: !view.enabled })}
                >
                  Turn shared assistants {view.enabled ? 'off' : 'on'}
                </Button>
              )}
              {view.canLock && (
                <Button disabled={saving} onClick={() => void change({ action: 'lock', enabled: !view.lockedOff })}>
                  {view.lockedOff ? 'Unlock assistants' : 'Lock assistants off'}
                </Button>
              )}
            </>
          )}
          {view && (view.canAdd ?? view.canManage) && (
            <>
              {' '}
              <Typography variant="body2">
                Adding shares a copy of its current instructions. Private edits do not change this copy. Create
                assistants from New chat.
              </Typography>
              {own
                .filter((a) => !a.paused && !view.bots.some((b) => b.id === a._id))
                .map((a) => (
                  <Button
                    key={a._id}
                    disabled={saving || view.lockedOff}
                    onClick={() => void change({ action: 'add', assistantId: a._id })}
                  >
                    Share {a.name} in this chat
                  </Button>
                ))}
            </>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
}
