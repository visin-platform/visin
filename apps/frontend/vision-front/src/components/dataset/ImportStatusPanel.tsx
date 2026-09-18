import React, { useState } from 'react';
import { Alert, Box, Button, Collapse, LinearProgress, List, ListItem, ListItemText, Typography } from '@mui/material';
import type { DatasetImport } from '../../services/datasetService';

interface ImportStatusPanelProps {
  imported: DatasetImport;
  canWrite: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onRemap: () => void;
}

/** Where the last import is at: progress while it runs, and its per-file problems once it ends. */
const ImportStatusPanel: React.FC<ImportStatusPanelProps> = ({ imported, canWrite, cancelling, onCancel, onRemap }) => {
  const [showErrors, setShowErrors] = useState(false);
  const active = imported.status === 'queued' || imported.status === 'running';
  const errors = imported.errors ?? [];

  if (active) {
    return (
      <Alert
        severity="info"
        action={canWrite && <Button color="inherit" size="small" onClick={onCancel} disabled={cancelling}>Cancel</Button>}
        sx={{ mb: 3 }}
      >
        <Typography variant="body2" sx={{ mb: 1 }}>
          {imported.status === 'queued'
            ? 'Import queued — it starts when the import worker is free.'
            : `Importing images… ${imported.processed.toLocaleString()} stored${imported.skipped ? `, ${imported.skipped.toLocaleString()} already there` : ''}.`}
        </Typography>
        <LinearProgress sx={{ width: { xs: 200, sm: 360 } }} />
      </Alert>
    );
  }

  const severity = imported.status === 'failed' ? 'error' : imported.status === 'cancelled' || errors.length > 0 || imported.stale ? 'warning' : 'success';
  const summary =
    imported.status === 'failed'
      ? 'The last import failed.'
      : imported.status === 'cancelled'
        ? 'The last import was cancelled.'
        : `Imported ${imported.processed.toLocaleString()} files${errors.length ? ` with ${errors.length} problem${errors.length === 1 ? '' : 's'}` : ''}.`;

  // A clean, current import needs no banner — the images speak for themselves.
  if (severity === 'success') return null;

  return (
    <Alert
      severity={severity}
      sx={{ mb: 3 }}
      action={
        <Box sx={{ display: 'flex', gap: 1 }}>
          {errors.length > 0 && (
            <Button color="inherit" size="small" onClick={() => setShowErrors((shown) => !shown)}>
              {showErrors ? 'Hide' : 'Details'}
            </Button>
          )}
          {canWrite && (
            <Button color="inherit" size="small" onClick={onRemap}>
              Import again
            </Button>
          )}
        </Box>
      }
    >
      {summary}
      {imported.stale && ' The zip has been replaced since — these images come from the previous one.'}
      <Collapse in={showErrors}>
        <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
          {errors.slice(0, 200).map((error, index) => (
            <ListItem key={`${error.path}-${index}`} disableGutters>
              <ListItemText primary={error.reason} secondary={error.path} slotProps={{ secondary: { sx: { fontFamily: 'monospace' } } }} />
            </ListItem>
          ))}
        </List>
      </Collapse>
    </Alert>
  );
};

export default ImportStatusPanel;
