import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiError } from '@visin/frontend-core';
import { projectService } from '../../services/projectService';
import { visualizationService } from '../../services/visualizationService';
import type { ApiResponse, Visualization, VisualizationsGroupedResponse } from '../../types';
import type { Project } from '../../types/Project';

/** Frames offered per run, from the newest runs: enough to find a good picture, not a page of everything. */
const FRAMES_PER_RUN = 6;
const RUNS_OFFERED = 10;

interface ProjectCoverPickerProps {
  project: Project;
}

/**
 * The picture a project's card shows. It is chosen, not guessed: a run's frames are often masks or ground truth that
 * would read as a black square, so the owner looks at what the runs rendered and picks one. Without a choice the card
 * borrows the cover of the dataset the runs trained on. Saved at once, like a transfer: it is not part of the form.
 */
const ProjectCoverPicker: React.FC<ProjectCoverPickerProps> = ({ project }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Masks and ground truth often read as black squares; a type filter lets the owner look at overlays alone.
  const [type, setType] = useState('');

  const frames = useQuery({
    queryKey: ['project-cover-frames', project._id],
    queryFn: async () =>
      (await visualizationService.getVisualizationsByTraining('', {
        projectId: project._id,
        includeUrls: true,
        perTraining: FRAMES_PER_RUN,
        limit: RUNS_OFFERED,
        page: 1
      })) as ApiResponse<VisualizationsGroupedResponse>,
    enabled: open
  });

  const all: Visualization[] = useMemo(
    () =>
      (frames.data?.data?.trainings ?? [])
        .flatMap((training) => training.visualizations)
        .filter((frame) => frame.signedUrl),
    [frames.data]
  );
  const types = useMemo(() => [...new Set(all.map((frame) => frame.type))].sort(), [all]);
  const options = type ? all.filter((frame) => frame.type === type) : all;

  const save = useMutation({
    mutationFn: (cover: { visualizationUuid: string } | null) => projectService.updateProject(project._id, { cover }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      setError(null);
    },
    onError: (failure: ApiError | Error) => setError(failure.message || 'Could not change the picture')
  });

  const chosen = project.cover?.visualizationUuid;

  return (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        The picture on this project’s card in lists and Explore. Pick one of the frames its runs rendered; without a
        pick, the card uses the cover of the dataset the runs trained on, where that is visible to the reader.
      </Typography>
      {error && !open && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box
          sx={{
            width: 200,
            aspectRatio: '16 / 7',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'action.hover',
            display: 'grid',
            placeItems: 'center',
            color: 'text.secondary',
            flexShrink: 0
          }}
        >
          {project.coverUrl ? (
            <Box
              component="img"
              src={project.coverUrl}
              alt={chosen ? 'The chosen cover' : 'The dataset’s cover, used for now'}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <Typography variant="caption">No picture</Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={() => setOpen(true)}>
            {chosen ? 'Change picture' : 'Choose a picture'}
          </Button>
          {chosen && (
            <Button color="inherit" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Use the dataset’s cover
            </Button>
          )}
        </Box>
      </Box>

      <Dialog open={open} onClose={save.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Choose a picture</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {frames.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : frames.isError ? (
            <Alert severity="error">Could not load the project’s frames.</Alert>
          ) : all.length === 0 ? (
            <Typography sx={{ color: 'text.secondary' }}>
              No frames yet. They are the images a run renders, such as predictions, in its visualize stage.
            </Typography>
          ) : (
            <>
              {types.length > 1 && (
                <Box role="group" aria-label="Frame type" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {['', ...types].map((name) => (
                    <Chip
                      key={name || 'all'}
                      label={name || 'All'}
                      onClick={() => setType(name)}
                      color={type === name ? 'primary' : 'default'}
                      variant={type === name ? 'filled' : 'outlined'}
                      aria-pressed={type === name}
                    />
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.5 }}>
                {options.map((frame) => {
                  const caption = [frame.type, frame.epoch !== undefined ? `epoch ${frame.epoch}` : undefined]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <ButtonBase
                      key={frame.visualization_uuid}
                      disabled={save.isPending}
                      onClick={() => save.mutate({ visualizationUuid: frame.visualization_uuid })}
                      aria-label={`Use ${caption || frame.filename}`}
                      aria-pressed={frame.visualization_uuid === chosen}
                      sx={{
                        display: 'block',
                        textAlign: 'left',
                        borderRadius: 1,
                        outline: frame.visualization_uuid === chosen ? '2px solid' : 'none',
                        outlineColor: 'primary.main'
                      }}
                    >
                      <Box sx={{ aspectRatio: '16 / 7', borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
                        <Box
                          component="img"
                          src={frame.signedUrl}
                          alt=""
                          loading="lazy"
                          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </Box>
                      <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                        {caption}
                      </Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={save.isPending}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProjectCoverPicker;
