import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography
} from '@mui/material';
import { downloadExport, getFormats } from '../services/jobService';
import { JobClass, LabelFormatId } from '../types';

export interface ExportDialogProps {
  open: boolean;
  jobId: string;
  classes: JobClass[];
  onClose: () => void;
}

/**
 * Pick a label format and download the job's labels in it.
 *
 * Each format says what it can hold, and the dialog says plainly what the
 * chosen one will leave out for this job — an annotator drew masks, and YOLO has
 * none, so exporting YOLO drops them. Better told here than found missing later.
 */
const ExportDialog: React.FC<ExportDialogProps> = ({ open, jobId, classes, onClose }) => {
  const { data: formats, error: formatsError } = useQuery({
    queryKey: ['label-formats'],
    queryFn: getFormats,
    enabled: open
  });
  const [format, setFormat] = useState<LabelFormatId>('yolo');
  const [include, setInclude] = useState<'done' | 'all'>('done');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = formats?.find((entry) => entry.id === format);
  const usesBoxes = classes.some((entry) => entry.tools.includes('box'));
  const usesMasks = classes.some((entry) => entry.tools.includes('mask'));
  const drops = [
    ...(chosen && usesBoxes && !chosen.boxes ? ['boxes'] : []),
    ...(chosen && usesMasks && !chosen.masks ? ['masks'] : [])
  ];

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadExport(jobId, format, include);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Export labels</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {(error || formatsError) && <Alert severity="error">{error ?? (formatsError as Error).message}</Alert>}
          <FormControl>
            <FormLabel>Format</FormLabel>
            <RadioGroup value={format} onChange={(event) => setFormat(event.target.value as LabelFormatId)}>
              {(formats ?? []).map((entry) => (
                <FormControlLabel
                  key={entry.id}
                  value={entry.id}
                  control={<Radio size="small" />}
                  sx={{ alignItems: 'flex-start', mb: 1 }}
                  label={
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 600 }}>{entry.name}</Typography>
                        {entry.boxes && <Chip size="small" label="boxes" variant="outlined" />}
                        {entry.masks && <Chip size="small" label="masks" variant="outlined" />}
                      </Stack>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {entry.description}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
          {drops.length > 0 && (
            <Alert severity="warning">
              {chosen?.name} has no {drops.join(' or ')}, so the job&apos;s {drops.join(' and ')} are left out of this
              export.
            </Alert>
          )}
          <FormControl>
            <FormLabel>Frames</FormLabel>
            <RadioGroup row value={include} onChange={(event) => setInclude(event.target.value as 'done' | 'all')}>
              <FormControlLabel value="done" control={<Radio size="small" />} label="Finished frames only" />
              <FormControlLabel value="all" control={<Radio size="small" />} label="Include frames in progress" />
            </RadioGroup>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={download} disabled={busy || !formats}>
          {busy ? 'Preparing…' : 'Download'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportDialog;
