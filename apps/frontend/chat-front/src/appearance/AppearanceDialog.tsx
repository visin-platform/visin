import { Check, Close } from '@mui/icons-material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { livePalette } from '@visin/frontend-core';
import { COLOR_SETS, appearanceSx } from './chatAppearance';
import type { useChatAppearance } from './useChatAppearance';

export function AppearanceDialog({
  open,
  onClose,
  appearance
}: {
  open: boolean;
  onClose: () => void;
  appearance: ReturnType<typeof useChatAppearance>;
}) {
  const { settings, update, reset } = appearance;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="chat-appearance-title"
      slotProps={{ paper: { sx: (theme) => ({ ...appearanceSx(theme, settings), backgroundImage: 'none' }) } }}
    >
      <DialogTitle id="chat-appearance-title" sx={{ pr: 7 }}>
        Chat appearance
        <IconButton
          aria-label="Close appearance settings"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your style, across your chats on this browser. Colors follow the app’s light or dark theme.
        </Typography>
        <Box
          role="radiogroup"
          aria-label="Chat color set"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}
        >
          {COLOR_SETS.map((set) => (
            <Button
              key={set.id}
              role="radio"
              aria-checked={settings.color === set.id}
              aria-label={set.name}
              tabIndex={settings.color === set.id ? 0 : -1}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index = COLOR_SETS.findIndex((item) => item.id === set.id);
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? COLOR_SETS.length - 1
                      : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + COLOR_SETS.length) %
                        COLOR_SETS.length;
                update({ color: COLOR_SETS[next].id });
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
              }}
              onClick={() => update({ color: set.id })}
              sx={(theme) => ({
                display: 'flex',
                flexDirection: 'column',
                p: 1,
                gap: 0.75,
                border: 2,
                borderColor: settings.color === set.id ? livePalette(theme)[set.palette].main : 'divider',
                borderRadius: 3,
                textTransform: 'none',
                color: 'text.primary',
                minWidth: 0
              })}
            >
              <Box
                aria-hidden
                sx={(theme) => ({
                  ...appearanceSx(theme, { ...settings, color: set.id }),
                  width: '100%',
                  height: 54,
                  borderRadius: 2,
                  p: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                  justifyContent: 'center'
                })}
              >
                <Box
                  sx={(theme) => ({
                    width: '65%',
                    height: 9,
                    bgcolor: livePalette(theme).background.paper,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2
                  })}
                />
                <Box
                  sx={{
                    width: '55%',
                    height: 9,
                    bgcolor: 'var(--chat-accent)',
                    alignSelf: 'flex-end',
                    borderRadius: 2
                  }}
                />
              </Box>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25, fontSize: '0.8rem' }}>
                {settings.color === set.id && <Check sx={{ fontSize: 14 }} />}
                {set.name}
              </Stack>
            </Button>
          ))}
        </Box>
        <Box
          aria-label="Appearance preview"
          sx={(theme) => ({
            ...appearanceSx(theme, settings),
            borderRadius: 3,
            border: 1,
            borderColor: 'divider',
            mt: 2,
            p: 2
          })}
        >
          <Typography variant="caption" color="text.secondary">
            Preview
          </Typography>
          <Box
            sx={{
              bgcolor: 'var(--chat-message-bg)',
              border: 1,
              borderColor: 'divider',
              borderRadius: '16px 16px 16px 5px',
              px: 1.5,
              py: 1,
              mt: 1,
              width: 'fit-content'
            }}
          >
            <Typography variant="body2">What shall we explore?</Typography>
          </Box>
          <Box
            sx={{
              bgcolor: 'var(--chat-accent)',
              color: 'var(--chat-accent-ink)',
              borderRadius: '16px 16px 5px 16px',
              px: 1.5,
              py: 1,
              mt: 1,
              ml: 'auto',
              width: 'fit-content'
            }}
          >
            <Typography variant="body2">Show me something interesting.</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={reset} color="inherit">
          Reset
        </Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
