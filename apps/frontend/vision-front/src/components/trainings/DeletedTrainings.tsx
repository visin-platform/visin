import React, { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography
} from '@mui/material';
import { ExpandMore, RestoreFromTrash } from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingService } from '../../services/trainingService';
import { formatDateTime } from '../../utils/dateUtils';

// Newest deletions first, so one page covers any mistake someone noticed in time.
const DELETED_TRAININGS_LIMIT = 50;

// Prefixes: this list, the paginated and fetch-all training listings, and the tag list.
const REFRESHED_AFTER_RESTORE = [['trainings-deleted'], ['trainings'], ['trainings-all'], ['training-tags']];

const DeletedTrainings: React.FC = () => {
  // Collapsed by default and only fetched once opened — deleted runs are a
  // recovery path, not something to load on every visit to the list.
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['trainings-deleted'],
    queryFn: () => trainingService.getDeletedTrainings({ limit: DELETED_TRAININGS_LIMIT }),
    enabled: expanded
  });

  const restore = useMutation({
    mutationFn: (id: string) => trainingService.restoreTraining(id),
    onSuccess: () => {
      for (const queryKey of REFRESHED_AFTER_RESTORE) {
        queryClient.invalidateQueries({ queryKey });
      }
    }
  });

  const trainings = data?.data.trainings ?? [];
  const total = data?.data.pagination.total ?? 0;
  const failure = restore.error ?? error;

  return (
    <Accordion
      disableGutters
      variant="outlined"
      expanded={expanded}
      onChange={(_event, isExpanded) => setExpanded(isExpanded)}
      sx={{ borderRadius: 3, '&:before': { display: 'none' }, overflow: 'hidden' }}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Deleted trainings
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        {expanded && (
          <>
            {failure && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {failure.message}
              </Alert>
            )}
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : trainings.length === 0 ? (
              !error && (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  No deleted trainings.
                </Typography>
              )
            ) : (
              <>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  Restoring brings a run back with the epochs and test results deleted along with it. Comparisons it
                  was removed from are not updated.
                </Typography>
                <List disablePadding>
                  {trainings.map(training => (
                    <ListItem
                      key={training._id}
                      disableGutters
                      secondaryAction={
                        <Button
                          size="small"
                          startIcon={<RestoreFromTrash />}
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(training._id)}
                          sx={{ borderRadius: 2 }}
                        >
                          Restore
                        </Button>
                      }
                    >
                      <ListItemText
                        primary={training.name}
                        secondary={training.deletedAt ? `Deleted ${formatDateTime(training.deletedAt)}` : undefined}
                      />
                    </ListItem>
                  ))}
                </List>
                {total > trainings.length && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Showing the {trainings.length} most recently deleted of {total}.
                  </Typography>
                )}
              </>
            )}
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
};

export default DeletedTrainings;
