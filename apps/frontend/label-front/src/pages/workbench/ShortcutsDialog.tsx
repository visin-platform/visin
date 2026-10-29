import React from 'react';
import { Dialog, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';

const SHORTCUTS: [string, string][] = [
  ['1–9', 'Pick a class'],
  ['B / P / E', 'Box, brush, eraser'],
  ['[ / ]', 'Smaller / larger brush'],
  ['Shift + paint', 'Paint over other classes'],
  ['Del', 'Delete the selected box'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Enter', 'Done — save and open the next frame'],
  ['K', 'Skip this frame'],
  ['← / →', 'Previous / next frame'],
  ['V', 'Cycle LiDAR / radar view'],
  ['A / X', 'Accept / dismiss suggestions'],
  ['D', 'Suggest boxes with your model'],
  ['S', 'Segment: click the object (right-click: not this); Enter keeps it'],
  ['Space + drag, scroll', 'Pan, zoom'],
  ['O', 'Show or hide the list of boxes'],
  ['F', 'Fit the frame']
];

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** The editor's keyboard shortcuts, opened with `?`. */
const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Keyboard shortcuts</DialogTitle>
    <DialogContent>
      <Stack spacing={0.75}>
        {SHORTCUTS.map(([keys, what]) => (
          <Stack key={keys} direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">{what}</Typography>
            <Typography variant="body2" component="kbd" sx={{ fontWeight: 600 }}>
              {keys}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </DialogContent>
  </Dialog>
);

export default ShortcutsDialog;
