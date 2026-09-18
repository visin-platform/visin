import React from 'react';
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { DatasetContents } from '../../services/datasetService';
import { folderLabel, formatBytes } from '../../utils/datasetMapping';

const MAX_DEPTH = 2;

/** What the zip holds, by file type and by top-level folders — for every dataset, imported or not. */
const DatasetContentsCard: React.FC<{ contents: DatasetContents }> = ({ contents }) => {
  const folders = contents.folders.filter((folder) => folder.depth > 0 && folder.depth <= MAX_DEPTH);
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5 }, mb: 3, borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Contents
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {contents.entries.toLocaleString()} files, {formatBytes(contents.totalBytes)} uncompressed
      </Typography>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mb: folders.length ? 2 : 0 }}>
        {contents.extensions.map((ext) => (
          <Chip key={ext.ext} size="small" variant="outlined" label={`${ext.ext} · ${ext.files.toLocaleString()} · ${formatBytes(ext.bytes)}`} />
        ))}
      </Stack>
      {folders.length > 0 && (
        <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Folder</TableCell>
                <TableCell align="right">Files</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Images</TableCell>
                <TableCell align="right">Size</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {folders.map((folder) => (
                <TableRow key={folder.path}>
                  <TableCell sx={{ fontFamily: 'monospace', pl: 1 + (folder.depth - 1) * 2 }}>{folderLabel(folder.path)}</TableCell>
                  <TableCell align="right">{folder.files.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{folder.images.toLocaleString()}</TableCell>
                  <TableCell align="right">{formatBytes(folder.bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
};

export default DatasetContentsCard;
