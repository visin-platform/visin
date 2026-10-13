import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { importLabels } from '../services/jobService';
import { ImportReport, JobClass } from '../types';

export interface ImportDialogProps {
  open: boolean;
  jobId: string;
  classes: JobClass[];
  onClose: () => void;
}

// Not an empty string: a Select shows an empty value as no choice at all, and
// "leave out" is a choice worth reading.
const SKIP = '__skip__';
const NEW_CLASS = '+';

/**
 * Bring labels from a zip into the job, in whichever format they are in.
 *
 * The archive is sent once to be read and described — its format, how many of
 * its frames the job has, which of its classes match — and again, with the
 * annotator's choices, to be imported. Sending it twice keeps the server free
 * of half-finished imports to clean up; archives of labels are small.
 */
const ImportDialog: React.FC<ImportDialogProps> = ({ open, jobId, classes, onClose }) => {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [as, setAs] = useState<'suggestions' | 'done'>('suggestions');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setResult(null);
    setChoices({});
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const classMap = (): Record<string, string | null> =>
    Object.fromEntries(Object.entries(choices).map(([name, choice]) => [name, choice === SKIP ? null : choice]));

  const preview = async (chosen: File) => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const described = await importLabels(jobId, chosen, { as, dryRun: true });
      setReport(described);
      setChoices(Object.fromEntries(described.classes.map((plan) => [plan.name, plan.target ?? SKIP])));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const done = await importLabels(jobId, file, { as, dryRun: false, classMap: classMap() });
      setResult(done);
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-stats', jobId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nothingToImport = report !== null && report.frames.matched === 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="md">
      <DialogTitle>Import labels</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {result ? (
            <Alert severity="success">
              Imported {result.boxes.toLocaleString()} boxes and {result.maskFrames.toLocaleString()} masks onto{' '}
              {result.frames.matched.toLocaleString()} frames
              {result.as === 'suggestions' ? ' as suggestions — annotators confirm them as they work.' : ' as finished labels.'}
              {result.createdClasses.length > 0 && ` Added ${result.createdClasses.length} new class(es).`}
            </Alert>
          ) : (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                A zip in YOLO, COCO, Pascal VOC, semantic PNG or Visin format. Its format is detected, and its frames
                are matched to this job&apos;s by file name.
              </Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Button variant="outlined" component="label" disabled={busy}>
                  {file ? 'Choose another file' : 'Choose a .zip'}
                  <input
                    ref={input}
                    hidden
                    type="file"
                    accept=".zip,application/zip"
                    aria-label="labels archive"
                    onChange={(event) => {
                      const chosen = event.target.files?.[0] ?? null;
                      reset();
                      setFile(chosen);
                      if (chosen) void preview(chosen);
                    }}
                  />
                </Button>
                {file && <Typography variant="body2">{file.name}</Typography>}
              </Stack>

              {report && (
                <>
                  <Alert severity={nothingToImport ? 'warning' : 'info'}>
                    Looks like <strong>{report.formatName}</strong>: {report.frames.matched.toLocaleString()} of{' '}
                    {report.frames.inFile.toLocaleString()} frames in the file are in this job
                    {report.frames.unmatched > 0 && ` (not in the job: ${report.frames.unmatchedSample.join(', ')}${report.frames.unmatched > report.frames.unmatchedSample.length ? ', …' : ''})`}
                    .
                  </Alert>

                  {report.classes.length > 0 && (
                    <Table size="small" aria-label="class mapping">
                      <TableHead>
                        <TableRow>
                          <TableCell>In the file</TableCell>
                          <TableCell align="right">Boxes</TableCell>
                          <TableCell align="right">Mask frames</TableCell>
                          <TableCell>Becomes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {report.classes.map((plan) => (
                          <TableRow key={plan.name}>
                            <TableCell>{plan.name}</TableCell>
                            <TableCell align="right">{plan.boxes}</TableCell>
                            <TableCell align="right">{plan.maskFrames}</TableCell>
                            <TableCell sx={{ minWidth: 220 }}>
                              <TextField
                                select
                                size="small"
                                fullWidth
                                value={choices[plan.name] ?? SKIP}
                                onChange={(event) => setChoices((previous) => ({ ...previous, [plan.name]: event.target.value }))}
                                slotProps={{ htmlInput: { 'aria-label': `class for ${plan.name}` } }}
                              >
                                <MenuItem value={SKIP}>Leave out</MenuItem>
                                <MenuItem value={NEW_CLASS}>Add as a new class</MenuItem>
                                {classes.map((entry) => (
                                  <MenuItem key={entry.key} value={entry.key}>
                                    {entry.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {report.warnings.length > 0 && (
                    <Alert severity="warning">
                      {report.warnings.slice(0, 3).join(' · ')}
                      {report.warnings.length > 3 && ` · and ${report.warnings.length - 3} more`}
                    </Alert>
                  )}

                  <RadioGroup row value={as} onChange={(event) => setAs(event.target.value as 'suggestions' | 'done')}>
                    <FormControlLabel
                      value="suggestions"
                      control={<Radio size="small" />}
                      label="As suggestions — annotators confirm them"
                    />
                    <FormControlLabel
                      value="done"
                      control={<Radio size="small" />}
                      label="As finished labels — already checked"
                    />
                  </RadioGroup>
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && (
          <Button variant="contained" onClick={runImport} disabled={busy || !report || nothingToImport}>
            {busy && report ? 'Importing…' : 'Import'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;
