import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, TextField } from '@mui/material';
import type { JobClass } from '../types';
import { setModelClassMapping } from '../services/jobService';

interface Props {
  jobId: string;
  classes: JobClass[];
  modelClasses?: string[];
  onClose: () => void;
}

/** Job managers choose the names their detector uses, including after activation. */
const ModelClassMappingDialog: React.FC<Props> = ({ jobId, classes, modelClasses = [], onClose }) => {
  const boxClasses = classes.filter((entry) => entry.tools.includes('box'));
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(boxClasses.map((entry) => [entry.key, entry.modelClass ?? ''])));
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => setModelClassMapping(jobId, Object.fromEntries(boxClasses.map((entry) => [entry.key, (names[entry.key] ?? entry.modelClass ?? '').trim() || null]))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      onClose();
    }
  });
  return (
    <Dialog open onClose={() => { if (!save.isPending) onClose(); }} fullWidth maxWidth="sm">
      <DialogTitle>Model class mapping</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Choose the model name for each box class. For example, person → human or car → vehicle.
            Leave a field blank to match the job class by its own name. Unmatched detections are hidden.
          </Typography>
          {boxClasses.map((entry) => (
            <Autocomplete key={entry.key} freeSolo options={modelClasses} inputValue={names[entry.key] ?? entry.modelClass ?? ''} disabled={save.isPending}
              onInputChange={(_event, value) => setNames((previous) => ({ ...previous, [entry.key]: value }))}
              renderInput={(params) => <TextField {...params} label={`Model class for ${entry.name}`} placeholder={entry.name} helperText={`Detected objects become ${entry.name} boxes`} />}
            />
          ))}
          {boxClasses.length === 0 && <Alert severity="info">This job has no box classes to match.</Alert>}
          {save.error && <Alert severity="error">{save.error.message}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={save.isPending || boxClasses.length === 0}>
          {save.isPending ? 'Saving…' : 'Save mappings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModelClassMappingDialog;
