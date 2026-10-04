import { useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogTitle, TextField } from '@mui/material';
import { Share } from '@mui/icons-material';

function ShareButtonForUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
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
      <Button size="small" startIcon={<Share />} onClick={() => void copy()} onBlur={() => setCopied(false)}>
        {copied ? 'Link copied' : 'Share'}
      </Button>
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
