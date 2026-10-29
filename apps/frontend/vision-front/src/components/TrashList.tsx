import { useState } from 'react';
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
import { EmptyState, OwnerChip, Panel, type OwnerGroup, type OwnerRef } from '@visin/frontend-core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../utils';

/** How long a trashed item waits before it is deleted for good (the services' `TRASH_DAYS`). */
const TRASH_DAYS = 30;

const purgeDate = (trashedAt: string) =>
  new Date(new Date(trashedAt).getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();

export interface TrashItem {
  _id: string;
  name: string;
  owner: OwnerRef & { name?: string };
  trashedAt?: string;
  permissions: { own: boolean };
}

interface TrashListProps<T extends TrashItem> {
  /** What the items are called, singular and lower case: "project", "dataset". */
  noun: string;
  userId?: string;
  groups: OwnerGroup[];
  queryKey: readonly unknown[];
  load: () => Promise<T[]>;
  /** Root of the cache entries to refresh after a restore or a delete. */
  invalidateKey: readonly unknown[];
  restore: (item: T) => Promise<unknown>;
  deleteForever: (item: T) => Promise<unknown>;
  /** What deleting for good takes with it, completing "Delete "<name>", …". */
  deleteConsequence: string;
}

/**
 * Items in the trash that the user manages. Only an owner (the person, or the
 * owning group's owner) restores or deletes one; the rest see it waiting.
 */
function TrashList<T extends TrashItem>({
  noun,
  userId,
  groups,
  queryKey,
  load,
  invalidateKey,
  restore,
  deleteForever,
  deleteConsequence
}: TrashListProps<T>) {
  const queryClient = useQueryClient();
  const { data, isLoading, error: loadError } = useQuery({ queryKey, queryFn: load });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<T | null>(null);

  const act = async (item: T, action: () => Promise<unknown>, fallback: string) => {
    setBusyId(item._id);
    setError(null);
    try {
      await action();
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: invalidateKey });
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
            description={`A ${noun} moved to the trash waits here for ${TRASH_DAYS} days before it is deleted.`}
          />
        </Panel>
      ) : (
        <Panel sx={{ p: 0 }}>
          <List disablePadding>
            {data?.map((item) => (
              <ListItem key={item._id} divider sx={{ flexWrap: 'wrap', gap: 1 }}>
                <ListItemText
                  primary={item.name}
                  secondary={
                    item.permissions.own
                      ? `Deleted for good on ${formatDate(purgeDate(item.trashedAt!))}`
                      : `Deleted for good on ${formatDate(purgeDate(item.trashedAt!))}. Only its owner can restore it.`
                  }
                  sx={{ minWidth: 200, flex: '1 1 240px' }}
                />
                <OwnerChip owner={item.owner} userId={userId} groups={groups} ownerName={item.owner.name} />
                {item.permissions.own && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      startIcon={<RestoreIcon />}
                      disabled={busyId !== null}
                      onClick={() => act(item, () => restore(item), `Failed to restore the ${noun}`)}
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
                        setConfirming(item);
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
            Delete "{confirming?.name}", {deleteConsequence} now? This cannot be undone.
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
            onClick={() => confirming && act(confirming, () => deleteForever(confirming), `Failed to delete the ${noun}`)}
          >
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default TrashList;
