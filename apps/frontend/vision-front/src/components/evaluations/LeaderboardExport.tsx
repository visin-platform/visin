import React, { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ContentCopy as ContentCopyIcon, Download as DownloadIcon } from '@mui/icons-material';
import { leaderboardCsv, leaderboardLatex, type ExportTable } from '../../utils/leaderboardExport';

type Format = 'latex' | 'csv';

const FORMATS: Record<Format, { label: string; extension: string; type: string; render: (table: ExportTable) => string }> = {
  latex: { label: 'LaTeX', extension: 'tex', type: 'application/x-tex', render: leaderboardLatex },
  csv: { label: 'CSV', extension: 'csv', type: 'text/csv', render: leaderboardCsv }
};

/**
 * Export the ranking on the page as a LaTeX table or a CSV, each carrying the suite, its protocol digest, the
 * selection rule and every row's evaluation id, so a table in a paper can be traced to where it came from.
 */
const LeaderboardExport: React.FC<{ table: ExportTable }> = ({ table }) => {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>('latex');
  const [copied, setCopied] = useState(false);
  const chosen = FORMATS[format];
  const text = chosen.render(table);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: chosen.type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${table.suite.slug}-v${table.suite.version}.${chosen.extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button size="small" onClick={() => { setOpen(true); setCopied(false); }} disabled={table.rows.length === 0}>Export</Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" aria-labelledby="export-title">
        <DialogTitle id="export-title">Export this ranking</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            The rows on this page{table.page ? ` (page ${table.page.page} of ${table.page.pages})` : ''}, with the suite, its protocol digest, how rows
            are chosen and each evaluation id, so the table can be traced to its source.
          </Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <ToggleButtonGroup exclusive size="small" value={format} onChange={(_event, next: Format | null) => { if (next) { setFormat(next); setCopied(false); } }} aria-label="Format">
              {Object.entries(FORMATS).map(([value, item]) => <ToggleButton key={value} value={value}>{item.label}</ToggleButton>)}
            </ToggleButtonGroup>
            <TextField multiline minRows={10} maxRows={18} value={text} slotProps={{ htmlInput: { readOnly: true, 'aria-label': `${chosen.label} export`, style: { fontFamily: 'monospace', fontSize: '0.8rem' } } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<DownloadIcon />} onClick={download}>Download</Button>
          <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default LeaderboardExport;
