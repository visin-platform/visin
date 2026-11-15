import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useId, useRef, useState } from 'react';
import { chatService } from '../../services/chatService';
import type { Message } from '../../types/chat';
import { MIN_SEARCH, SEARCH_DELAY_MS, SEARCH_PAGE } from '../../utils/search';

/** The text around the first match, with the match itself marked, so a result shows why it was found. */
function Snippet({ text, term }: { text: string; term: string }) {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return <>{text.slice(0, 160)}</>;
  const from = Math.max(0, at - 50);
  const to = Math.min(text.length, at + term.length + 100);
  return (
    <>
      {from > 0 && '…'}
      {text.slice(from, at)}
      <mark>{text.slice(at, at + term.length)}</mark>
      {text.slice(at + term.length, to)}
      {to < text.length && '…'}
    </>
  );
}

/** Find earlier messages in this conversation. It lists them; it does not scroll the thread to one. */
export function SearchConversationDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const titleId = useId();
  const [text, setText] = useState('');
  const [found, setFound] = useState<Message[]>([]);
  const [searched, setSearched] = useState('');
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const term = text.trim();
  // Which search the results on screen belong to: an older page asked for under one term must not be added to the
  // results of the next.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    if (term.length < MIN_SEARCH) {
      setFound([]);
      setSearched('');
      setMore(false);
      setError('');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError('');
      chatService
        .search(conversationId, term, undefined, controller.signal)
        .then((rows) => {
          setFound(rows);
          setSearched(term);
          setMore(rows.length >= SEARCH_PAGE);
        })
        .catch((problem: Error) => {
          if (!controller.signal.aborted) setError(problem.message || 'Search failed');
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [conversationId, term]);

  const older = () => {
    const asked = generation.current;
    const current = () => asked === generation.current;
    setBusy(true);
    chatService
      .search(conversationId, searched, found.at(-1)?.seq)
      .then((rows) => {
        if (!current()) return;
        setFound((previous) => [...previous, ...rows]);
        setMore(rows.length >= SEARCH_PAGE);
      })
      .catch((problem: Error) => current() && setError(problem.message || 'Search failed'))
      .finally(() => current() && setBusy(false));
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>Search messages</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Search this conversation"
          value={text}
          onChange={(event) => setText(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        {busy && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} aria-label="Searching" />
          </Box>
        )}
        {!busy && !error && searched && found.length === 0 && (
          <Typography role="status" sx={{ mt: 2, color: 'text.secondary' }}>
            No messages contain &ldquo;{searched}&rdquo;.
          </Typography>
        )}
        {found.length > 0 && (
          <List aria-label="Results" dense>
            {found.map((message) => (
              <ListItem key={message._id} disableGutters divider>
                <ListItemText
                  primary={<Snippet text={message.body} term={searched} />}
                  secondary={`${message.senderName} · ${new Date(message.createdAt).toLocaleString()}`}
                  slotProps={{ primary: { sx: { overflowWrap: 'anywhere' } } }}
                />
              </ListItem>
            ))}
          </List>
        )}
        {more && !busy && (
          <Button onClick={older} sx={{ mt: 1 }}>
            Older results
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
