import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@visin/frontend-core';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types/Project';

/** What the service accepts. */
const MAX_ANALYST_NOTES = 1500;

/**
 * What the chat analyst is told about this project before it answers: a note to a line, in the words of the people who
 * run it (which metric decides, which run is the baseline, what is known to be odd). The analyst reads them as
 * background, not as instructions and not as results. Anyone who can see the project can read them, so a public
 * project's notes are public.
 */
const ProjectAnalystNotes: React.FC<{ project: Project }> = ({ project }) => {
  const queryClient = useQueryClient();
  const saved = project.analystNotes ?? '';
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  // A save elsewhere (or this one) changes what "unchanged" means.
  useEffect(() => setDraft(saved), [saved]);

  const save = useMutation({
    mutationFn: (analystNotes: string) => projectService.updateProject(project._id, { analystNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      setError(null);
    },
    onError: (failure: ApiError | Error) => setError(failure.message || 'Could not save the notes')
  });

  return (
    <Paper elevation={0} component="section" aria-label="Notes for the analyst" sx={{ border: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 3 }, mt: 3 }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
        Notes for the analyst
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        One note to a line. The analyst reads them before it answers a question about this project, so it need not
        rediscover them: the metric that decides, the baseline run, known quirks.
        {project.visibility === 'public' ? ' This project is public, so these notes are public too.' : ''}
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <TextField
        fullWidth
        multiline
        minRows={4}
        label="Notes"
        value={draft}
        disabled={save.isPending}
        onChange={(event) => setDraft(event.target.value)}
        slotProps={{ htmlInput: { maxLength: MAX_ANALYST_NOTES } }}
        helperText={`${draft.length.toLocaleString()} / ${MAX_ANALYST_NOTES.toLocaleString()}`}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
        {save.isSuccess && draft.trim() === saved.trim() && (
          <Typography role="status" variant="body2" sx={{ color: 'text.secondary' }}>
            Saved. The analyst reads them from the next question.
          </Typography>
        )}
        <Button variant="contained" disabled={save.isPending || draft.trim() === saved.trim()} onClick={() => save.mutate(draft)}>
          {save.isPending ? 'Saving…' : 'Save notes'}
        </Button>
      </Box>
    </Paper>
  );
};

export default ProjectAnalystNotes;
