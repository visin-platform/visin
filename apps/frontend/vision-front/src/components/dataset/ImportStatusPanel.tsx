import React, { useState } from 'react';
import { Alert, Box, Button, Collapse, LinearProgress, List, ListItem, ListItemText, Typography } from '@mui/material';
import type { DatasetImport } from '../../services/datasetService';
import { formatBytes } from '../../utils/datasetMapping';

interface ImportStatusPanelProps {
  imported: DatasetImport;
  /** the zip's size, to show how far copying it has got */
  archiveBytes?: number;
  canWrite: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onRemap: () => void;
}

/** Where the last import is at: progress while it runs, and its per-file problems once it ends. */
/**
 * What a running import is doing. It first copies the whole zip to the
 * server's work disk — minutes for a multi-GB one, with nothing stored yet —
 * then extracts the mapped files.
 */
const runningProgress = (imported: DatasetImport, archiveBytes?: number): { text: string; percent?: number } => {
  const done = imported.processed + imported.skipped;
  const copying = done === 0 && archiveBytes !== undefined && (imported.copiedBytes ?? 0) < archiveBytes;
  if (copying) {
    const copied = imported.copiedBytes ?? 0;
    return {
      text: `Preparing: copying the zip to the server… ${formatBytes(copied)} of ${formatBytes(archiveBytes)}. Images are stored once it is copied.`,
      percent: (copied / archiveBytes) * 100
    };
  }
  const already = imported.skipped ? `, ${imported.skipped.toLocaleString()} already there` : '';
  if (imported.expected) {
    return {
      text: `Importing images… ${imported.processed.toLocaleString()} of ${imported.expected.toLocaleString()} stored${already}.`,
      percent: Math.min(100, (done / imported.expected) * 100)
    };
  }
  return { text: `Importing images… ${imported.processed.toLocaleString()} stored${already}.` };
};

const ImportStatusPanel: React.FC<ImportStatusPanelProps> = ({ imported, archiveBytes, canWrite, cancelling, onCancel, onRemap }) => {
  const [showErrors, setShowErrors] = useState(false);
  const active = imported.status === 'queued' || imported.status === 'running';
  const errors = imported.errors ?? [];

  if (active) {
    const progress = imported.status === 'running' ? runningProgress(imported, archiveBytes) : undefined;
    return (
      <Alert
        severity="info"
        action={canWrite && <Button color="inherit" size="small" onClick={onCancel} disabled={cancelling}>Cancel</Button>}
        sx={{ mb: 3 }}
      >
        <Typography variant="body2" sx={{ mb: 1 }}>
          {progress ? progress.text : 'Import queued — it starts when the import worker is free.'}
        </Typography>
        <LinearProgress
          variant={progress?.percent !== undefined ? 'determinate' : 'indeterminate'}
          value={progress?.percent}
          sx={{ width: { xs: 200, sm: 360 } }}
        />
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          This runs on the server — you can close the page and come back.
        </Typography>
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
