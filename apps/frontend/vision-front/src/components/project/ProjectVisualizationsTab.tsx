import React, { useMemo, useState } from 'react';
import { ListSkeleton } from '@visin/frontend-core';
import { Box, Typography, Button, Card, CardContent, Checkbox, Chip, Alert } from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { comparisonService } from '../../services/comparisonService';
import { visualizationService } from '../../services/visualizationService';
import type { ApiResponse, TrainingVisualizations, VisualizationsGroupedResponse } from '../../types';

interface ProjectVisualizationsTabProps {
  /** The project's id. */
  projectId: string;
}

/** Frames shown per run; a run's own page has the rest. */
const FRAMES_PER_RUN = 4;
/** Runs asked for at a time: each frame shown is a signed address, so a project's whole history is not one request. */
const RUNS_PER_PAGE = 12;

/**
 * What the project's runs rendered, as a gallery: a few of each run's newest
 * frames under its name, one type at a time if you want. Looking at frames is
 * how "what is it getting wrong" gets answered, so the images are the list.
 */
const ProjectVisualizationsTab: React.FC<ProjectVisualizationsTabProps> = ({ projectId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['project-visualizations', projectId, type],
    queryFn: async ({ pageParam }) =>
      (await visualizationService.getVisualizationsByTraining('', {
        projectId,
        includeUrls: true,
        perTraining: FRAMES_PER_RUN,
        limit: RUNS_PER_PAGE,
        page: pageParam,
        ...(type ? { type } : {})
      })) as ApiResponse<VisualizationsGroupedResponse>,
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const pages = last.data?.pagination;
      return pages && pages.page < pages.pages ? pages.page + 1 : undefined;
    },
    placeholderData: keepPreviousData
  });

  const trainings: TrainingVisualizations[] = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.data?.trainings ?? []),
    [data]
  );

  // The types there are, with how many frames each: the counts are the runs' own whichever type is showing.
  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const training of trainings) {
      for (const [name, count] of Object.entries(training.type_counts ?? {})) {
        counts.set(name, (counts.get(name) ?? 0) + count);
      }
    }
    return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
  }, [trainings]);
  const all = types.reduce((sum, [, count]) => sum + count, 0);

  // A run with no frame of what is showing has nothing to look at here.
  const runs = trainings.filter((training) => training.visualizations.length > 0);

  // Create comparison mutation
  const createComparisonMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      comparisonService.createComparison({
        name: `Comparison of ${itemIds.length} trainings (from visualizations)`,
        type: 'trainings',
        itemIds,
        projectId
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['project-comparisons', projectId] });
      navigate(`/comparisons/${response.data.uuid}`);
    }
  });

  const toggle = (uuid: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(uuid)) next.add(uuid);
      return next;
    });

  return (
    <Box sx={{ px: { xs: 0, sm: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, minHeight: 36 }}>
        <Typography variant="h6">Visualizations</Typography>
        {selected.size > 0 && (
          <Button
            variant="contained"
            startIcon={<CompareIcon />}
            onClick={() => createComparisonMutation.mutate(Array.from(selected))}
          >
            Compare Selected ({selected.size})
          </Button>
        )}
      </Box>

      {isLoading ? (
        <ListSkeleton rows={4} label="Loading visualizations" />
      ) : isError ? (
        <Alert severity="error">Could not load the visualizations.</Alert>
      ) : (
        <>
          {types.length > 0 && (
            <Box role="group" aria-label="Visualization type" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <Chip
                label={`All (${all})`}
                color={type === '' ? 'primary' : 'default'}
                variant={type === '' ? 'filled' : 'outlined'}
                onClick={() => setType('')}
                aria-pressed={type === ''}
              />
              {types.map(([name, count]) => (
                <Chip
                  key={name}
                  label={`${name} (${count})`}
                  color={type === name ? 'primary' : 'default'}
                  variant={type === name ? 'filled' : 'outlined'}
                  onClick={() => setType(type === name ? '' : name)}
                  aria-pressed={type === name}
                />
              ))}
            </Box>
          )}

          {runs.length > 0 ? (
            runs.map((training) => {
              const count = training.visualization_count ?? training.visualizations.length;
              return (
                // The whole card opens the run's visualizations: the name is the
                // link, stretched over the card, with the checkbox lifted above it.
                <Card
                  key={training.training_uuid}
                  sx={{
                    mb: 3,
                    position: 'relative',
                    '&:hover': { borderColor: 'primary.main' },
                    '&:focus-within': { borderColor: 'primary.main' }
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
                      <Checkbox
                        sx={{ position: 'relative', zIndex: 1 }}
                        slotProps={{ input: { 'aria-label': `Select ${training.training_name}` } }}
                      checked={selected.has(training.training_id)}
                      onChange={() => toggle(training.training_id)}
                      />
                      <Typography
                        variant="h6"
                        component={RouterLink}
                        to={`/trainings/${training.training_id}?tab=visualizations`}
                        sx={{
                          ml: 1,
                          color: 'inherit',
                          textDecoration: 'none',
                          '&::after': { content: '""', position: 'absolute', inset: 0 }
                        }}
                      >
                        {training.training_name}
                      </Typography>
                      <Chip
                        label={`${count} visualization${count !== 1 ? 's' : ''}`}
                        size="small"
                        sx={{ ml: 2 }}
                      />
                    </Box>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                        gap: 1.5
                      }}
                    >
                      {training.visualizations.map((frame) => {
                        const caption = [frame.type, frame.epoch !== undefined ? `epoch ${frame.epoch}` : undefined]
                          .filter(Boolean)
                          .join(' · ');
                        return (
                          <Box key={frame._id} component="figure" sx={{ m: 0, minWidth: 0 }}>
                            <Box
                              sx={{
                                aspectRatio: '4 / 3',
                                borderRadius: 1,
                                overflow: 'hidden',
                                bgcolor: 'action.hover'
                              }}
                            >
                              {frame.signedUrl && (
                                <Box
                                  component="img"
                                  src={frame.signedUrl}
                                  alt={caption}
                                  loading="lazy"
                                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                              )}
                            </Box>
                            <Typography
                              component="figcaption"
                              variant="caption"
                              noWrap
                              sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}
                            >
                              {caption}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    {count > training.visualizations.length && (
                      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                        Showing the newest {training.visualizations.length} of {count}.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : hasNextPage ? (
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              None of the newest runs rendered {type ? `${type} ` : ''}frames.
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {type
                ? `No ${type} visualizations yet.`
                : 'No visualizations yet. They are images a run renders, such as predictions or ground truth, in its visualize stage.'}
            </Typography>
          )}
          {hasNextPage && (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Show older runs'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default ProjectVisualizationsTab;
