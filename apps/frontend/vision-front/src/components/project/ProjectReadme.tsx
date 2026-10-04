import React, { useState } from 'react';
import { Alert, Box, Button, Paper, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Markdown, MAX_MARKDOWN_LENGTH, type ApiError } from '@visin/frontend-core';
import { projectService } from '../../services/projectService';
import type { Project } from '../../types/Project';

/**
 * The project's front page: what it is, written by whoever manages it, for whoever finds it. Shown as Markdown
 * (text, links, lists, tables; never raw HTML or images). A manager can write or change it here; for everyone else
 * a project with no readme simply shows none.
 */
const ProjectReadme: React.FC<{ project: Project }> = ({ project }) => {
  const queryClient = useQueryClient();
  const canManage = project.permissions.manage;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (readme: string) => projectService.updateProject(project._id, { readme }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
      setError(null);
    },
    onError: (failure: ApiError | Error) => setError(failure.message || 'Could not save the readme')
  });

  const startEditing = () => {
    setDraft(project.readme ?? '');
    setView('write');
    setError(null);
    setEditing(true);
  };

  if (editing) {
    return (
      <Paper elevation={0} component="section" aria-label="Edit readme" sx={{ border: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 3 }, mb: 3 }}>
        <Tabs value={view} onChange={(_event, next) => setView(next)} aria-label="Readme editor" sx={{ mb: 2 }}>
          <Tab value="write" label="Write" />
          <Tab value="preview" label="Preview" />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {view === 'write' ? (
          <TextField
            fullWidth
            multiline
            minRows={10}
            label="Readme"
            value={draft}
            disabled={save.isPending}
            onChange={(event) => setDraft(event.target.value)}
            slotProps={{ htmlInput: { maxLength: MAX_MARKDOWN_LENGTH } }}
            helperText={`Markdown: headings, lists, tables, links and code. ${draft.length.toLocaleString()} / ${MAX_MARKDOWN_LENGTH.toLocaleString()}. Images are not shown, and raw HTML is shown as text.`}
          />
        ) : draft.trim() ? (
          <Box aria-label="Preview">
            <Markdown>{draft}</Markdown>
          </Box>
        ) : (
          <Typography sx={{ color: 'text.secondary' }}>Nothing to preview yet.</Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
          <Button disabled={save.isPending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={save.isPending || draft === (project.readme ?? '')} onClick={() => save.mutate(draft)}>
            {save.isPending ? 'Saving…' : 'Save readme'}
          </Button>
        </Box>
      </Paper>
    );
  }

  if (!project.readme) {
    if (!canManage) return null;
    return (
      <Paper elevation={0} component="section" aria-label="Readme" sx={{ border: '1px dashed', borderColor: 'divider', p: { xs: 2, sm: 3 }, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Add a readme
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          What the project is, how its runs were made and what to read first. It is the first thing someone sees when they open it
          {project.visibility === 'public' ? ', and this project is public.' : '.'}
        </Typography>
        <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={startEditing}>
          Write a readme
        </Button>
      </Paper>
    );
  }

  return (
    <Paper elevation={0} component="section" aria-label="Readme" sx={{ border: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 3 }, mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Typography component="h2" sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
          Readme
        </Typography>
        {canManage && (
          <Button size="small" startIcon={<EditIcon />} onClick={startEditing}>
            Edit readme
          </Button>
        )}
      </Box>
      <Markdown>{project.readme}</Markdown>
    </Paper>
  );
};

export default ProjectReadme;
