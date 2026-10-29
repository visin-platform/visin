import React from 'react';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import type { Dataset } from '../../services/datasetService';
import type { DatasetUpload } from '../../services/datasetUploads';
import type { DatasetDialogName } from './datasetDialogs';

interface DatasetStatusAlertsProps {
  dataset: Dataset;
  /** The upload this tab is running or has just finished, if any. */
  upload?: DatasetUpload;
  sending: boolean;
  busy: boolean;
  importing: boolean;
  scanning: boolean;
  held: boolean;
  onOpenDialog: (name: DatasetDialogName) => void;
  onDiscardUpload: () => void;
  onScan: () => void;
}

/** What is happening to the dataset's zip: uploading, left half-done, or not read yet. */
const DatasetStatusAlerts: React.FC<DatasetStatusAlertsProps> = ({
  dataset,
  upload,
  sending,
  busy,
  importing,
  scanning,
  held,
  onOpenDialog,
  onDiscardUpload,
  onScan
}) => (
  <>
      {sending && (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
          {upload!.status === 'finishing'
            ? `Finishing the upload of ${upload!.filename}…`
            : `Uploading ${upload!.filename} — ${Math.round(upload!.progress * 100)}%.`}{' '}
          You can keep using the site; progress stays in the corner. Keep this tab open until it is done.
        </Alert>
      )}

      {/* An upload this tab still holds is resumed from the corner, with the file in hand. */}
      {dataset.uploading && dataset.permissions.contribute && !busy && (!upload || upload.status === 'done') && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                color="inherit"
                size="small"
                onClick={() => onOpenDialog('replace')}
                disabled={importing || scanning || held}
              >
                Resume
              </Button>
              <Button color="inherit" size="small" onClick={onDiscardUpload}>
                Discard
              </Button>
            </Stack>
          }
        >
          The upload of {dataset.uploading.filename} stopped before it finished. Resume it by choosing the same zip, or
          discard it to free the space its partial upload takes.
          {dataset.archive ? ' The current zip stays in place either way.' : ''}
        </Alert>
      )}

      {scanning ? (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>
          Reading the zip's contents in the background. This can take a few minutes for a large zip — you can leave this
          page.
        </Alert>
      ) : (
        dataset.archive &&
        !dataset.contents && (
          <Alert
            severity={dataset.scan?.status === 'failed' ? 'error' : 'info'}
            sx={{ mb: 3 }}
            action={
              dataset.permissions.contribute && (
                <Button color="inherit" size="small" onClick={onScan} disabled={busy}>
                  {dataset.scan?.status === 'failed' ? 'Scan again' : 'Scan zip'}
                </Button>
              )
            }
          >
            {dataset.scan?.status === 'failed'
              ? `The zip could not be read: ${dataset.scan.error ?? 'unknown error'}`
              : 'This zip has not been scanned yet, so its size and contents are unknown.'}
          </Alert>
        )
      )}
  </>
);

export default DatasetStatusAlerts;
