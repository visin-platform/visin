import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useEffect, useId, useState } from 'react';
import type { Conversation } from '../../types/chat';
import { conversationMarkdown, exportFilename, exportHistory } from '../../utils/exportConversation';

/** Prepare history while the dialog is open; Download remains a user gesture on mobile browsers. */
export function ExportConversationDialog({
  conversation,
  title,
  onClose
}: {
  conversation: Conversation;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [result, setResult] = useState<{ url: string; count: number }>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    void exportHistory(conversation._id, controller.signal)
      .then((messages) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(
          new Blob([conversationMarkdown(title, messages)], { type: 'text/markdown;charset=utf-8' })
        );
        setResult({ url, count: messages.length });
      })
      .catch((problem: Error) => {
        if (!controller.signal.aborted) setError(problem.message);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [conversation._id, title]);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Export conversation</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Typography role="status">
            {result ? `${result.count} messages ready to save as Markdown.` : 'Preparing conversation…'}
          </Typography>
        )}
        <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
          Includes history you can access up to this moment. Attachment files are not included.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          component="a"
          variant="contained"
          disabled={!result}
          href={result?.url}
          download={exportFilename(title)}
        >
          Download Markdown
        </Button>
      </DialogActions>
    </Dialog>
  );
}
