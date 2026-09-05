import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import { API_KEY_SCOPES, ApiKeyScope, SCOPE_DESCRIPTIONS } from '../../types/apiKey';

interface CreateApiKeyDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, scopes: ApiKeyScope[], expiresInDays?: number) => void;
}

/** Never expires is a real choice, so it is an option rather than the absence of one. */
const EXPIRY_OPTIONS = [
  { value: 0, label: 'Never' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: 'A year' }
];

export const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({
  open,
  busy,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('');
  // Read-only by default: it is the grant most people want, and the one that
  // stays safe if the key leaks.
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['vision:read', 'dataset:read']);
  const [expiresInDays, setExpiresInDays] = useState(0);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && scopes.length > 0;

  const close = () => {
    setName('');
    setScopes(['vision:read', 'dataset:read']);
    setExpiresInDays(0);
    onClose();
  };

  const toggle = (scope: ApiKeyScope) =>
    setScopes(current =>
      current.includes(scope) ? current.filter(held => held !== scope) : [...current, scope]
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onCreate(trimmed, scopes, expiresInDays || undefined);
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>New API key</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            A key lets software act as you — an assistant connected over MCP, a script, a CI job. It
            can only reach what you can already see, and only what you tick below.
          </DialogContentText>

          <TextField
            autoFocus
            fullWidth
            size="small"
            label="What is it for?"
            placeholder="Claude Code"
            value={name}
            disabled={busy}
            onChange={event => setName(event.target.value)}
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Permissions
          </Typography>
          <Box sx={{ mb: 3 }}>
            {API_KEY_SCOPES.map(scope => (
              <FormControlLabel
                key={scope}
                sx={{ display: 'flex', alignItems: 'flex-start', mb: 1, ml: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={scopes.includes(scope)}
                    disabled={busy}
                    onChange={() => toggle(scope)}
                    slotProps={{ input: { 'aria-label': scope } }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {SCOPE_DESCRIPTIONS[scope].label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {SCOPE_DESCRIPTIONS[scope].detail}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </Box>

          <TextField
            select
            size="small"
            label="Expires"
            value={expiresInDays}
            disabled={busy}
            onChange={event => setExpiresInDays(Number(event.target.value))}
            sx={{ minWidth: 160 }}
          >
            {EXPIRY_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !canSubmit}>
            Create key
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

interface ShowTokenDialogProps {
  open: boolean;
  token: string;
  /** Set when this is a fresh key rather than a reveal of an existing one. */
  isNew: boolean;
  onClose: () => void;
}

/**
 * The one place a key is ever shown.
 *
 * The copy button is the point: a key is 50-odd characters of base64url and
 * transcribing one by hand is how people end up pasting a truncated
 * credential and reporting it as a broken server.
 */
export const ShowTokenDialog: React.FC<ShowTokenDialogProps> = ({ open, token, isNew, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // A denied clipboard permission is not worth an error state — the token
      // is on screen and selectable, which is the fallback.
    }
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{isNew ? 'Your new API key' : 'API key'}</DialogTitle>
      <DialogContent>
        {isNew && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            Copy this now. You can read it back later from this page, but it is never shown in the
            list.
          </Alert>
        )}
        <TextField
          fullWidth
          size="small"
          value={token}
          slotProps={{
            htmlInput: { readOnly: true, 'aria-label': 'API key', style: { fontFamily: 'monospace' } },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={copy} edge="end" aria-label="Copy API key">
                    <ContentCopy fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }
          }}
        />
        {copied && (
          <Typography variant="caption" sx={{ color: 'success.main', mt: 1, display: 'block' }}>
            Copied to clipboard.
          </Typography>
        )}
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3 }}>
          Send it as a bearer token: <code>Authorization: Bearer &lt;key&gt;</code>. To connect an
          assistant over MCP, point it at <code>https://mcp.visin.eu/mcp</code> with this key.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} variant="contained">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};
