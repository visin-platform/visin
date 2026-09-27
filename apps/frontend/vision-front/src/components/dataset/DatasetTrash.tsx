import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack
} from '@mui/material';
import { DeleteForever as DeleteForeverIcon, RestoreFromTrash as RestoreIcon } from '@mui/icons-material';
import { EmptyState, OwnerChip, Panel, type OwnerGroup } from '@visin/frontend-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dataset, deleteDatasetForever, listTrash, restoreDataset } from '../../services/datasetService';
import { formatDate } from '../../utils';

/** How long a trashed dataset waits before it is deleted for good (dataset-service `TRASH_DAYS`). */
const TRASH_DAYS = 30;

const purgeDate = (trashedAt: string) =>
  new Date(new Date(trashedAt).getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();

interface DatasetTrashProps {
  userId?: string;
  groups: OwnerGroup[];
}

/**
 * Datasets in the trash that the user manages. Only an owner (the person, or
 * the owning group's owner) restores or deletes one; the rest see it waiting.
 */
const DatasetTrash: React.FC<DatasetTrashProps> = ({ userId, groups }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error: loadError } = useQuery({ queryKey: ['datasets', 'trash'], queryFn: listTrash });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Dataset | null>(null);

  const act = async (dataset: Dataset, action: () => Promise<unknown>, fallback: string) => {
    setBusyId(dataset._id);
    setError(null);
    try {
      await action();
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ['datasets'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {(error || loadError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || (loadError instanceof Error ? loadError.message : 'Failed to load the trash')}
        </Alert>
      )}
      {data && data.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<RestoreIcon />}
            title="The trash is empty."
            description={`A dataset moved to the trash waits here for ${TRASH_DAYS} days before it is deleted.`}
          />
        </Panel>
      ) : (
        <Panel sx={{ p: 0 }}>
          <List disablePadding>
            {data?.map((dataset) => (
              <ListItem key={dataset._id} divider sx={{ flexWrap: 'wrap', gap: 1 }}>
                <ListItemText
                  primary={dataset.name}
                  secondary={
                    dataset.permissions.own
                      ? `Deleted for good on ${formatDate(purgeDate(dataset.trashedAt!))}`
                      : `Deleted for good on ${formatDate(purgeDate(dataset.trashedAt!))}. Only its owner can restore it.`
                  }
                  sx={{ minWidth: 200, flex: '1 1 240px' }}
                />
                <OwnerChip owner={dataset.owner} userId={userId} groups={groups} ownerName={dataset.owner.name} />
                {dataset.permissions.own && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={<RestoreIcon />}
                      disabled={busyId !== null}
                      onClick={() => act(dataset, () => restoreDataset(dataset._id), 'Failed to restore the dataset')}
                    >
                      Restore
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      startIcon={<DeleteForeverIcon />}
                      disabled={busyId !== null}
                      onClick={() => {
                        setError(null);
                        setConfirming(dataset);
                      }}
                    >
                      Delete forever
                    </Button>
                  </Stack>
                )}
              </ListItem>
            ))}
          </List>
        </Panel>
      )}

      <Dialog open={Boolean(confirming)} onClose={busyId ? undefined : () => setConfirming(null)}>
        <DialogTitle>Delete forever</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete "{confirming?.name}", its zip and every imported image now? This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)} disabled={Boolean(busyId)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={Boolean(busyId)}
            onClick={() =>
              confirming && act(confirming, () => deleteDatasetForever(confirming._id), 'Failed to delete the dataset')
            }
          >
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DatasetTrash;
