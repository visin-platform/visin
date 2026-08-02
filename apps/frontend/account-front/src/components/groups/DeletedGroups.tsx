import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography
} from '@mui/material';
import { DeleteForever, ExpandMore, RestoreFromTrash } from '@mui/icons-material';
import { Group, permissionsFor, roleOf } from '../../types/group';

interface DeletedGroupsProps {
  groups: Group[];
  loading: boolean;
  busy: boolean;
  currentUserEmail?: string;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onRestore: (groupId: string) => void;
  onDeleteForever: (group: Group) => void;
}

const DeletedGroups: React.FC<DeletedGroupsProps> = ({
  groups,
  loading,
  busy,
  currentUserEmail,
  expanded,
  onToggle,
  onRestore,
  onDeleteForever
}) => (
  // Collapsed by default, and the list is only fetched once opened — deleted
  // groups are a recovery path, not something to load on every page view.
  <Accordion
    disableGutters
    variant="outlined"
    expanded={expanded}
    onChange={(_event, isExpanded) => onToggle(isExpanded)}
    sx={{ borderRadius: 3, '&:before': { display: 'none' }, overflow: 'hidden' }}
  >
    <AccordionSummary expandIcon={<ExpandMore />}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Deleted groups
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : groups.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No deleted groups.
        </Typography>
      ) : (
        <List disablePadding>
          {groups.map(group => {
            const canManage = permissionsFor(roleOf(group, currentUserEmail)).canDeleteGroup;
            return (
              <ListItem
                key={group._id}
                disableGutters
                secondaryAction={
                  canManage && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        startIcon={<RestoreFromTrash />}
                        disabled={busy}
                        onClick={() => onRestore(group._id)}
                        sx={{ borderRadius: 2 }}
                      >
                        Restore
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteForever />}
                        disabled={busy}
                        onClick={() => onDeleteForever(group)}
                        sx={{ borderRadius: 2 }}
                      >
                        Delete forever
                      </Button>
                    </Box>
                  )
                }
              >
                <ListItemText
                  primary={group.name}
                  secondary={`${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </AccordionDetails>
  </Accordion>
);

export default DeletedGroups;
