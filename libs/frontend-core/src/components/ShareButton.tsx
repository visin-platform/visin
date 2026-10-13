import { useEffect, useState } from 'react';
import { Alert, Chip, Dialog, DialogContent, DialogTitle, IconButton, TextField, Tooltip } from '@mui/material';
import { Check, Share } from '@mui/icons-material';

/** How long the "Link copied" tag stays, when focus has not already left. */
const COPIED_TAG_MS = 2500;

function ShareButtonForUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_TAG_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setManual(true);
    }
  };
  return (
    <>
      <Tooltip title="Copy link">
        <IconButton size="small" aria-label="Share" onClick={() => void copy()} onBlur={() => setCopied(false)}>
          <Share fontSize="small" />
        </IconButton>
      </Tooltip>
      {copied && <Chip role="status" size="small" color="success" variant="outlined" icon={<Check />} label="Link copied" />}
      <Dialog open={manual} onClose={() => setManual(false)} fullWidth maxWidth="sm">
        <DialogTitle>Share this page</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Copy this link to share the page.
          </Alert>
          <TextField
            label="Share link"
            value={url}
            fullWidth
            slotProps={{ input: { readOnly: true } }}
            onFocus={(event) => event.target.select()}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Copies the preview URL, with manual selection when clipboard access is unavailable. State belongs to one URL. */
export function ShareButton({ url }: { url?: string }) {
  return url ? <ShareButtonForUrl key={url} url={url} /> : null;
}
