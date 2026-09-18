import React, { useState } from 'react';
import { Box, Button, Collapse, IconButton, LinearProgress, Link, Paper, Stack, Typography } from '@mui/material';
import {
  CheckCircle as DoneIcon,
  Close as CloseIcon,
  ErrorOutlined as FailedIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import {
  cancelUpload,
  DatasetUpload,
  dismissUpload,
  isActive,
  retryUpload,
  useDatasetUploads
} from '../../services/datasetUploads';
import { useWarnOnLeave } from '../../hooks/useWarnOnLeave';
import { formatBytes } from '../../utils/datasetMapping';

const statusText = (upload: DatasetUpload): string => {
  switch (upload.status) {
    case 'uploading':
      return `${Math.round(upload.progress * 100)}% · ${formatBytes(upload.progress * upload.size)} of ${formatBytes(upload.size)}`;
    case 'finishing':
      return 'Finishing the upload…';
    case 'done':
      return 'Uploaded — its contents are being read on the server.';
    case 'cancelled':
      return 'Stopped. Resume to continue from where it stopped.';
    default:
      return upload.error ?? 'Upload failed';
  }
};

const UploadRow: React.FC<{ upload: DatasetUpload }> = ({ upload }) => {
  const active = isActive(upload);
  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        {upload.status === 'done' && <DoneIcon color="success" fontSize="small" />}
        {(upload.status === 'failed' || upload.status === 'cancelled') && <FailedIcon color="warning" fontSize="small" />}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Link component={RouterLink} to={`/datasets/${upload.datasetId}`} variant="body2" noWrap sx={{ display: 'block', fontWeight: 600 }}>
            {upload.datasetName}
          </Link>
          <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
            {upload.filename}
          </Typography>
        </Box>
        {!active && (
          <IconButton size="small" aria-label={`Dismiss ${upload.filename}`} onClick={() => dismissUpload(upload.datasetId)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>
      {active && (
        <LinearProgress
          variant={upload.status === 'uploading' ? 'determinate' : 'indeterminate'}
          value={upload.progress * 100}
          sx={{ my: 0.75 }}
        />
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={{ color: upload.status === 'failed' ? 'error.main' : 'text.secondary' }}>
          {statusText(upload)}
        </Typography>
        {upload.status === 'uploading' && (
          <Button size="small" onClick={() => cancelUpload(upload.datasetId)}>
            Cancel
          </Button>
        )}
        {(upload.status === 'failed' || upload.status === 'cancelled') && (
          <Button size="small" onClick={() => retryUpload(upload.datasetId)}>
            Resume
          </Button>
        )}
      </Stack>
    </Box>
  );
};

/**
 * Zip uploads in the corner of every page, so a multi-GB transfer never holds
 * the page hostage. The browser asks before leaving while one is sending: the
 * bytes come from this tab, and only this tab can send them.
 */
const UploadPanel: React.FC = () => {
  const uploads = useDatasetUploads();
  const [open, setOpen] = useState(true);
  const sending = uploads.filter(isActive);
  useWarnOnLeave(sending.length > 0);
  if (uploads.length === 0) return null;

  const title = sending.length
    ? `Uploading ${sending.length} zip${sending.length === 1 ? '' : 's'} — keep this tab open`
    : `Upload${uploads.length === 1 ? '' : 's'}`;

  return (
    <Paper
      elevation={8}
      role="region"
      aria-label="Uploads"
      sx={{
        position: 'fixed',
        bottom: 16,
        right: { xs: 16, sm: 24 },
        left: { xs: 16, sm: 'auto' },
        width: { sm: 360 },
        zIndex: (theme) => theme.zIndex.snackbar,
        borderRadius: 2,
        overflow: 'hidden'
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <IconButton size="small" aria-label={open ? 'Collapse uploads' : 'Expand uploads'} onClick={() => setOpen((value) => !value)}>
          {open ? <ExpandIcon fontSize="small" /> : <CollapseIcon fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ px: 2, maxHeight: 320, overflowY: 'auto' }}>
          {uploads.map((upload) => (
            <UploadRow key={upload.datasetId} upload={upload} />
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default UploadPanel;
