import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import type { LocalModel } from '../localModel/useLocalModel';

export interface ModelDialogProps {
  open: boolean;
  model: LocalModel;
  onClose: () => void;
  onConfigureClasses?: () => void;
}

const DEFAULT_URL = 'http://localhost:8000';

/**
 * Connect the editor to a model server on this machine.
 *
 * One address, with the command that starts the server shown ready to copy. The
 * command names *this* site (`window.location.origin`) as the one allowed to
 * use the server, which is what keeps another web page from using the GPU.
 */
const ModelDialog: React.FC<ModelDialogProps> = ({ open, model, onClose, onConfigureClasses }) => {
  const [url, setUrl] = useState(model.settings.url || DEFAULT_URL);
  const [token, setToken] = useState(model.settings.token ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setUrl(model.settings.url || DEFAULT_URL);
      setToken(model.settings.token ?? '');
      setCopied(false);
    }
  }, [open, model.settings.url, model.settings.token]);

  const command = `visin-infer serve --allow-origin ${window.location.origin}`;
  const connected = model.status === 'connected' && model.info;

  const copy = () => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Use a model on this computer</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Detection and click-to-segment run on your own GPU. Your browser talks to a small server on this
            machine; nothing is sent anywhere else.
          </Typography>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              1. Start it
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box
                component="code"
                data-testid="model-command"
                sx={{ flexGrow: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover', fontSize: 13, overflowX: 'auto', whiteSpace: 'nowrap' }}
              >
                {command}
              </Box>
              <Tooltip title={copied ? 'Copied' : 'Copy'}>
                <IconButton aria-label="copy command" onClick={copy} size="small">
                  <ContentCopy fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              <code>pip install visin-infer</code> first, or use the Docker image. Weights download on first start.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              2. Connect
            </Typography>
            <Stack spacing={1.5}>
              <TextField label="Address" size="small" value={url} onChange={(event) => setUrl(event.target.value)} />
              <TextField
                label="Token (only if you started it with --token)"
                size="small"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </Stack>
          </Box>

          {connected && model.info && (
            <Alert severity="success">
              Connected · {model.info.device}
              {model.info.classes.length > 0 && ` · detects ${model.info.classes.length} classes`}
              {model.info.supports.segment ? ' · click-to-segment on' : ''}
            </Alert>
          )}
          {model.status === 'unreachable' && model.error && <Alert severity="warning">{model.error}</Alert>}

          {onConfigureClasses && <Button variant="outlined" onClick={onConfigureClasses}>Configure class mappings</Button>}

          {connected && (
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={model.settings.autoDetect}
                    onChange={(event) => model.update({ autoDetect: event.target.checked })}
                  />
                }
                label="Suggest boxes when a frame opens"
              />
              <TextField
                label="Show boxes at least this sure"
                type="number"
                size="small"
                value={model.settings.minScore}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) model.update({ minScore: Math.min(1, Math.max(0, value)) });
                }}
                slotProps={{ htmlInput: { min: 0, max: 1, step: 0.05 } }}
                sx={{ width: 240 }}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {model.settings.url && (
          <Button color="inherit" onClick={model.disconnect}>
            Disconnect
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          disabled={model.status === 'connecting' || !url.trim()}
          onClick={() => void model.connect({ url, token: token.trim() || undefined })}
        >
          {model.status === 'connecting' ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelDialog;
