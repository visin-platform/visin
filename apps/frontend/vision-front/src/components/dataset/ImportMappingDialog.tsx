import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import type { DatasetContents, ImportMapping } from '../../services/datasetService';
import { directCounts, folderLabel, formatBytes, suggestMapping } from '../../utils/datasetMapping';

interface ImportMappingDialogProps {
  open: boolean;
  contents?: DatasetContents;
  /** the mapping the last import used, which pre-fills a re-map */
  previous?: ImportMapping;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (mapping: ImportMapping) => void;
}

/**
 * Choose which zip folders become image groups. Only folders holding images or
 * JSON (directly or beneath) are listed; everything else stays in the zip
 * download. A mapped folder takes everything beneath it, and the deepest mapped
 * folder wins, so `annotations` and `annotations/verify` can be separate groups.
 */
const ImportMappingDialog: React.FC<ImportMappingDialogProps> = ({ open, contents, previous, busy, error, onCancel, onConfirm }) => {
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [manifest, setManifest] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    const initial = previous?.groups.length ? previous.groups : suggestMapping(contents);
    setGroups(Object.fromEntries(initial.map((row) => [row.folder, row.group])));
    setManifest(previous?.manifest ?? '');
    setFilter('');
  }, [open, contents, previous]);

  const direct = useMemo(() => directCounts(contents?.folders ?? []), [contents]);
  const rows = useMemo(
    () =>
      (contents?.folders ?? []).filter(
        (folder) => (folder.images > 0 || folder.jsons > 0) && folder.path.toLowerCase().includes(filter.toLowerCase())
      ),
    [contents, filter]
  );
  const mapped = Object.entries(groups);
  const missingName = mapped.some(([, group]) => !group.trim());
  const hasManifestFiles = (contents?.extensions ?? []).some((ext) => ext.ext === '.csv' || ext.ext === '.jsonl');

  const toggle = (folder: string, include: boolean) =>
    setGroups((current) => {
      const next = { ...current };
      if (include) next[folder] = folder.slice(folder.lastIndexOf('/') + 1) || 'root';
      else delete next[folder];
      return next;
    });

  const confirm = () =>
    onConfirm({
      groups: mapped.map(([folder, group]) => ({ folder, group: group.trim() })),
      ...(manifest.trim() ? { manifest: manifest.trim() } : {})
    });

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="md">
      <DialogTitle>Choose image groups</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {contents
              ? `${contents.entries.toLocaleString()} files, ${formatBytes(contents.totalBytes)}. Tick the folders to show as images; each becomes a group. Files that share a name across groups (0001.png, 0001.ids.png) are shown together.`
              : 'Upload a zip first.'}
          </Typography>
          {contents?.truncated && <Alert severity="info">This zip has many folders; only the shallowest are listed. Map a parent folder to take everything beneath it.</Alert>}
          <TextField size="small" label="Filter folders" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Box sx={{ maxHeight: '50vh', overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Folder</TableCell>
                  <TableCell align="right">Images</TableCell>
                  <TableCell align="right">JSON</TableCell>
                  <TableCell sx={{ width: 220 }}>Group</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((folder) => {
                  const included = folder.path in groups;
                  const own = direct.get(folder.path);
                  return (
                    <TableRow key={folder.path} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={included}
                          onChange={(e) => toggle(folder.path, e.target.checked)}
                          disabled={busy}
                          slotProps={{ input: { 'aria-label': `Include ${folderLabel(folder.path)}` } }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', pl: 1 + folder.depth * 2 }}>{folderLabel(folder.path)}</TableCell>
                      <TableCell align="right" title={`${own?.images ?? 0} directly in this folder`}>
                        {folder.images.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">{folder.jsons.toLocaleString()}</TableCell>
                      <TableCell>
                        {included && (
                          <TextField
                            size="small"
                            fullWidth
                            value={groups[folder.path]}
                            onChange={(e) => setGroups((current) => ({ ...current, [folder.path]: e.target.value }))}
                            disabled={busy}
                            error={!groups[folder.path].trim()}
                            slotProps={{ htmlInput: { 'aria-label': `Group for ${folderLabel(folder.path)}` } }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>
                      {filter ? 'No folder matches' : 'This zip holds no images or JSON files'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
          {hasManifestFiles && (
            <TextField
              size="small"
              label="Manifest file (optional)"
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              disabled={busy}
              placeholder="e.g. manifest.csv"
              helperText="Path inside the zip of a CSV/JSONL with a filename column; its other columns become attributes"
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={confirm} disabled={busy || mapped.length === 0 || missingName}>
          Import {mapped.length > 0 ? `${mapped.length} group${mapped.length === 1 ? '' : 's'}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportMappingDialog;
