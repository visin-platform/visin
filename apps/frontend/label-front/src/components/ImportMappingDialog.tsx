import React, { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { ImportMapping, ZipFolderSummary, ZipPreview } from '../types';

type Role = 'frames' | 'annotations' | 'ignore';

const ROOT_LABEL = '(zip root)';
const DEFAULT_IDS_SUFFIX = '.ids.png';
const DEFAULT_MASKS_SUFFIX = '.masks.json';

const label = (folderPath: string): string => folderPath || ROOT_LABEL;

const contents = (folder: ZipFolderSummary): string =>
  [
    folder.images > 0 ? `${folder.images} image` : '',
    folder.idMaps > 0 ? `${folder.idMaps} id map` : '',
    folder.maskFiles > 0 ? `${folder.maskFiles} json` : '',
    folder.others > 0 ? `${folder.others} other` : ''
  ]
    .filter(Boolean)
    .join(' · ') || `${folder.files} file(s)`;

const setNameFor = (folderPath: string): string => folderPath.slice(folderPath.lastIndexOf('/') + 1) || 'set';

const initialRoles = (preview: ZipPreview): Record<string, Role> => {
  const annotationPaths = new Set((preview.suggestion.annotations || []).map((entry) => entry.path));
  return Object.fromEntries(
    preview.folders.map((folder) => {
      if (folder.path === preview.suggestion.frames) {
        return [folder.path, 'frames' as Role];
      }
      return [folder.path, annotationPaths.has(folder.path) ? ('annotations' as Role) : ('ignore' as Role)];
    })
  );
};

const initialSets = (preview: ZipPreview): Record<string, string> =>
  Object.fromEntries(
    preview.folders.map((folder) => {
      const suggested = (preview.suggestion.annotations || []).find((entry) => entry.path === folder.path);
      return [folder.path, suggested ? suggested.set : setNameFor(folder.path)];
    })
  );

interface Props {
  open: boolean;
  preview: ZipPreview;
  onCancel: () => void;
  onConfirm: (mapping: ImportMapping) => void;
}

/**
 * Step between upload and import: show what the zip actually contains and let
 * the user wire each folder to frames / an annotation set / nothing. Pre-filled
 * with the server's suggestion, so a bundle in the default layout is one click.
 */
const ImportMappingDialog: React.FC<Props> = ({ open, preview, onCancel, onConfirm }) => {
  const [roles, setRoles] = useState<Record<string, Role>>(() => initialRoles(preview));
  const [sets, setSets] = useState<Record<string, string>>(() => initialSets(preview));
  const [manifest, setManifest] = useState(preview.suggestion.manifest || '');
  const [idsSuffix, setIdsSuffix] = useState(preview.suggestion.idsSuffix || DEFAULT_IDS_SUFFIX);
  const [masksSuffix, setMasksSuffix] = useState(preview.suggestion.masksSuffix || DEFAULT_MASKS_SUFFIX);

  const framesFolder = useMemo(
    () => Object.keys(roles).find((folderPath) => roles[folderPath] === 'frames'),
    [roles]
  );

  // Exactly one folder can hold the frames — picking a new one releases the old.
  const setRole = (folderPath: string, role: Role) =>
    setRoles((previous) => {
      const next = { ...previous, [folderPath]: role };
      if (role === 'frames') {
        Object.keys(next).forEach((other) => {
          if (other !== folderPath && next[other] === 'frames') {
            next[other] = 'ignore';
          }
        });
      }
      return next;
    });

  const annotationRows = Object.keys(roles).filter((folderPath) => roles[folderPath] === 'annotations');
  const missingSetName = annotationRows.some((folderPath) => !sets[folderPath]?.trim());

  const confirm = () =>
    onConfirm({
      frames: framesFolder ?? '',
      annotations: annotationRows.map((folderPath) => ({ path: folderPath, set: sets[folderPath].trim() })),
      ...(manifest ? { manifest } : {}),
      ...(idsSuffix && idsSuffix !== DEFAULT_IDS_SUFFIX ? { idsSuffix } : {}),
      ...(masksSuffix && masksSuffix !== DEFAULT_MASKS_SUFFIX ? { masksSuffix } : {})
    });

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>Map the zip folders</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {preview.entries} file(s) in {preview.folders.length} folder(s). Defaults are filled in from the
            folder names — change them if your zip is laid out differently.
          </Typography>
          {preview.truncated && (
            <Alert severity="info">
              Only the first {preview.folders.length} folders are listed; files in unlisted folders are skipped.
            </Alert>
          )}
          {framesFolder === undefined && (
            <Alert severity="warning">Pick the folder holding the frames to continue.</Alert>
          )}

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Folder</TableCell>
                <TableCell>Contents</TableCell>
                <TableCell sx={{ width: 180 }}>Role</TableCell>
                <TableCell sx={{ width: 200 }}>Annotation set</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.folders.map((folder) => (
                <TableRow key={folder.path}>
                  <TableCell>
                    <Tooltip title={folder.samples.join(', ')}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {label(folder.path)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={contents(folder)} />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Role"
                      value={roles[folder.path] || 'ignore'}
                      onChange={(event) => setRole(folder.path, event.target.value as Role)}
                      slotProps={{ htmlInput: { 'aria-label': `Role for ${label(folder.path)}` } }}
                    >
                      <MenuItem value="frames">Frames</MenuItem>
                      <MenuItem value="annotations">Annotations</MenuItem>
                      <MenuItem value="ignore">Ignore</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    {roles[folder.path] === 'annotations' && (
                      <TextField
                        size="small"
                        fullWidth
                        label="Set name"
                        value={sets[folder.path] ?? ''}
                        onChange={(event) =>
                          setSets((previous) => ({ ...previous, [folder.path]: event.target.value }))
                        }
                        slotProps={{ htmlInput: { 'aria-label': `Set name for ${label(folder.path)}` } }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TextField
            select
            size="small"
            label="Manifest file"
            value={manifest}
            onChange={(event) => setManifest(event.target.value)}
            helperText="Optional — selects and stratifies which frames become tasks."
          >
            <MenuItem value="">None</MenuItem>
            {preview.manifestCandidates.map((candidate) => (
              <MenuItem key={candidate} value={candidate}>
                {candidate}
              </MenuItem>
            ))}
          </TextField>

          <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="subtitle2">File name patterns</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  size="small"
                  fullWidth
                  label="Id map suffix"
                  value={idsSuffix}
                  onChange={(event) => setIdsSuffix(event.target.value)}
                  helperText="e.g. 0001.ids.png"
                />
                <TextField
                  size="small"
                  fullWidth
                  label="Masks metadata suffix"
                  value={masksSuffix}
                  onChange={(event) => setMasksSuffix(event.target.value)}
                  helperText="e.g. 0001.masks.json"
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={framesFolder === undefined || missingSetName} onClick={confirm}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportMappingDialog;
