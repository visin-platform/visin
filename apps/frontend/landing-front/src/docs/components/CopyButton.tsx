import { useEffect, useState, type RefObject } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Check, ContentCopy } from '@mui/icons-material';

interface CopyButtonProps {
  /** The element whose text is copied: the code as shown, never a second copy that could drift. */
  target: RefObject<HTMLElement | null>;
}

/**
 * Copies the code. Where the clipboard is unavailable (a self-hosted page
 * served over plain http has none), it selects the code instead, so one
 * Ctrl+C finishes the job.
 */
export default function CopyButton({ target }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    const element = target.current;
    if (!element) return;
    try {
      // An element's text is never null; only a document's is.
      await navigator.clipboard.writeText(element.textContent!);
      setCopied(true);
    } catch {
      window.getSelection()?.selectAllChildren(element);
    }
  };

  return (
    <Tooltip title={copied ? 'Copied' : 'Copy'}>
      <IconButton
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        size="small"
        sx={{ color: 'rgba(255,255,255,0.64)', '&:hover': { color: '#fff' } }}
      >
        {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
