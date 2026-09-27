import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography
} from '@mui/material';
import { DeleteForever, DeleteOutlined, History, Lock, Public, RestoreFromTrash, SwapHoriz } from '@mui/icons-material';
import { groupService } from '../../services/groupService';
import { describeEvent } from '../../types/group';

const ICONS = {
  transfer: <SwapHoriz fontSize="small" />,
  trash: <DeleteOutlined fontSize="small" />,
  restore: <RestoreFromTrash fontSize="small" />,
  purge: <DeleteForever fontSize="small" />
};

/**
 * What happened to the projects and datasets the group owns or owned, for its
 * owners and admins. Read only when asked for: most visits to the groups list
 * are about members.
 */
export default function GroupActivity({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['group-activity', groupId],
    queryFn: () => groupService.activity(groupId),
    enabled: open
  });

  if (!open) {
    return (
      <Button size="small" startIcon={<History />} onClick={() => setOpen(true)}>
        Show activity
      </Button>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Activity
      </Typography>
      {isLoading && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error.message}</Alert>}
      {data && data.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Nothing yet. Transfers, visibility changes and deletions of the group's projects and datasets appear here.
        </Typography>
      )}
      {data && data.length > 0 && (
        <List dense disablePadding aria-label="Group activity">
          {data.map((event) => (
            <ListItem key={event._id} disableGutters>
              <ListItemIcon sx={{ minWidth: 36 }}>
                {event.action === 'visibility' ? (
                  event.visibility === 'public' ? (
                    <Public fontSize="small" />
                  ) : (
                    <Lock fontSize="small" />
                  )
                ) : (
                  ICONS[event.action]
                )}
              </ListItemIcon>
              <ListItemText
                primary={describeEvent(event, groupId)}
                secondary={`${event.actorEmail ?? 'Someone no longer in the group'} · ${new Date(event.at).toLocaleString()}`}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
}
