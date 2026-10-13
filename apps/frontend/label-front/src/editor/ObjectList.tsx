import React, { useSyncExternalStore } from 'react';
import { Box, IconButton, List, ListItemButton, ListItemText, Stack, Tooltip, Typography } from '@mui/material';
import { Close, DeleteOutlined } from '@mui/icons-material';
import type { JobClass } from '../types';
import type { EditorDocument } from './EditorDocument';

export interface ObjectListProps {
  doc: EditorDocument;
  classes: JobClass[];
  colorOf: (jobClass: JobClass) => string;
  onClose: () => void;
  readOnly: boolean;
}

/**
 * The boxes on this frame, in a side panel the annotator opens when they need it
 * (`O`): to find a small box among many, to see which a model drew and how sure
 * it was, or to delete one that is hard to click.
 */
const ObjectList: React.FC<ObjectListProps> = ({ doc, classes, colorOf, onClose, readOnly }) => {
  useSyncExternalStore(doc.subscribe, doc.getVersion);
  const classOf = new Map(classes.map((entry) => [entry.key, entry]));

  return (
    <Box
      data-testid="object-list"
      sx={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider', minHeight: 0 }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', px: 1.5, py: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Objects ({doc.boxes.length})
        </Typography>
        <IconButton size="small" aria-label="close objects" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </Stack>
      {doc.boxes.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 1.5 }}>
          No boxes on this frame.
        </Typography>
      ) : (
        <List dense sx={{ overflowY: 'auto', flexGrow: 1, py: 0 }}>
          {doc.boxes.map((box) => {
            const jobClass = classOf.get(box.classKey);
            const [, , w, h] = box.bbox;
            const origin =
              box.source === 'model'
                ? `model${box.score !== undefined ? ` ${Math.round(box.score * 100)}%` : ''}`
                : box.source === 'import'
                  ? 'imported'
                  : 'drawn';
            return (
              <ListItemButton
                key={box.id}
                selected={box.id === doc.selectedId}
                onClick={() => doc.select(box.id === doc.selectedId ? null : box.id)}
                sx={{ pr: 0.5 }}
              >
                <Box
                  component="span"
                  sx={{ width: 10, height: 10, borderRadius: '50%', mr: 1, flexShrink: 0, bgcolor: jobClass ? colorOf(jobClass) : 'text.disabled' }}
                />
                <ListItemText
                  primary={jobClass?.name ?? box.classKey}
                  secondary={`${Math.round(w)}×${Math.round(h)} · ${origin}`}
                  slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                />
                {!readOnly && (
                  <Tooltip title="Delete (Del)">
                    <IconButton
                      size="small"
                      aria-label={`delete ${jobClass?.name ?? box.classKey}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        doc.deleteBox(box.id);
                      }}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default ObjectList;
