import { Fragment, useCallback, useEffect, useState } from 'react';
import { Refresh } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Snackbar,
  TextField
} from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { chatService } from '../../services/chatService';
import { MessageBubble } from './MessageBubble';
import { AnalysisSteps } from './AnalysisSteps';
import { StreamingMessage } from './StreamingMessage';
import { visibleDrafts } from '../../utils/drafts';
import { followUps } from '../../utils/followUps';
import { FollowUps } from './FollowUps';

import { PAGE, mergeMessages, applyMessageUpdates } from '../../utils/messages';
import { AnalysisStarters } from './AnalysisStarters';

/** A message this young eases in as it arrives. */
const FRESH_MS = 8000;

function messageDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MessageList() {
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState<{ messageId: string; text: string }>();
  const {
    scroller,
    atBottom,
    hasOlder,
    messages,
    perform,
    c,
    setHasOlder,
    setMessages,
    setFinding,
    running,
    latestRun,
    failedQuestion,
    enabled,
    sending,
    post,
    ask,
    setReplyTarget,
    replyTarget,
    setSharedTarget,
    composerInput,
    runs,
    drafts,
    user
  } = useChatWorkspaceContext();
  // Keeps the end in view for someone reading at the end, and leaves alone anyone who scrolled up.
  const followEnd = useCallback(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [scroller, atBottom]);
  useEffect(() => {
    window.addEventListener('visin:chat-media-loaded', followEnd);
    return () => window.removeEventListener('visin:chat-media-loaded', followEnd);
  }, [followEnd]);
  useEffect(() => {
    if (replyTarget && messages.some((message) => message._id === replyTarget._id && message.unsentAt))
      setReplyTarget(undefined);
  }, [messages, replyTarget, setReplyTarget]);
  useEffect(() => {
    if (manualCopy && messages.some((message) => message._id === manualCopy.messageId && message.unsentAt))
      setManualCopy(undefined);
  }, [messages, manualCopy]);
  if (!c) return null;
  const ownRun = (run: (typeof runs)[number]) => c.kind === 'assistant' || run.userId === user?.id;
  // The answer being written, shown until it is a message. Only in the asker's own analyst thread, which is all the
  // server sends drafts for.
  const writing = c.kind === 'assistant' ? visibleDrafts(drafts, messages) : [];

  return (
    <Box
      ref={scroller}
      aria-live="polite"
      onScroll={(event) => {
        const box = event.currentTarget;
        atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      }}
      sx={{ flex: 1, overflow: 'auto', p: 2 }}
    >
      {hasOlder && messages.length > 0 && (
        <Button
          onClick={() =>
            void perform(async () => {
              const older = await chatService.messages(c._id, undefined, messages[0].seq);
              setHasOlder(older.length === PAGE);
              setMessages((rows) => mergeMessages(rows, older));
            })
          }
        >
          Older messages
        </Button>
      )}
      {messages.map((message, index) => (
        <Fragment key={message._id}>
          {(index === 0 ||
            new Date(messages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString()) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Chip
                size="small"
                label={messageDay(message.createdAt)}
                sx={{ color: 'text.secondary', bgcolor: 'action.hover' }}
              />
            </Box>
          )}
          <MessageBubble
            key={message._id}
            message={message}
            conversationId={c._id}
            own={
              message.kind === 'person' &&
              (message.senderId === user?.id || (!message.senderId && c.kind === 'assistant'))
            }
            profile={
              (c.kind === 'direct' && message.senderId !== user?.id) ||
              (c.kind === 'assistant' && message.kind === 'assistant')
                ? c.profile
                : undefined
            }
            labels={c.trainingLabels}
            fresh={Date.now() - Date.parse(message.createdAt) < FRESH_MS}
            canSave={c.kind === 'assistant' && Boolean(c.projectId)}
            onSave={setFinding}
            userId={user?.id}
            onReact={(target, emoji) =>
              perform(async () => {
                const updated = await chatService.react(c._id, target._id, emoji);
                setMessages((rows) => applyMessageUpdates(rows, [updated]));
              })
            }
            onUnsend={(target) =>
              perform(async () => {
                const updated = await chatService.unsend(c._id, target._id);
                setMessages((rows) => applyMessageUpdates(rows, [updated]));
                if (replyTarget?._id === target._id) setReplyTarget(undefined);
              })
            }
            onReply={(message) => {
              setReplyTarget(message);
              setSharedTarget('');
              composerInput.current?.focus();
            }}
            onCopy={(body) => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(body);
                  setCopied(true);
                } catch {
                  setManualCopy({ messageId: message._id, text: body });
                }
              })();
            }}
          />
        </Fragment>
      ))}
      {writing.map((draft) => (
        <StreamingMessage
          key={draft.runId}
          text={draft.text}
          name={runs.find((run) => run._id === draft.runId)?.assistantName || c.profile?.name || 'Visin analyst'}
          profile={c.profile}
          onGrow={followEnd}
        />
      ))}
      {running && writing.length === 0 && (
        <Box>
          {runs
            .filter((run) => ['queued', 'running'].includes(run.state))
            .map((run) => (
              <AnalysisSteps key={run._id} run={run} assistantName={run.assistantName} />
            ))}
        </Box>
      )}
      {latestRun?.state === 'failed' && !running && (
        <Alert
          severity="warning"
          action={
            failedQuestion &&
            c.kind === 'assistant' &&
            enabled &&
            (latestRun.canRetry ?? ownRun(latestRun)) && (
              <Button
                color="inherit"
                size="small"
                startIcon={<Refresh />}
                disabled={sending}
                onClick={() => void post(failedQuestion.body, false, failedQuestion.replyTo)}
              >
                Retry
              </Button>
            )
          }
        >
          {latestRun.error || 'The analysis failed.'}
        </Alert>
      )}
      <Dialog
        open={manualCopy !== undefined}
        onClose={() => setManualCopy(undefined)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="copy-message-title"
      >
        <DialogTitle id="copy-message-title">Copy message</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>Select the text and use your device’s Copy command.</DialogContentText>
          <TextField
            label="Message text"
            value={manualCopy?.text ?? ''}
            autoFocus
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            slotProps={{ htmlInput: { readOnly: true } }}
            onFocus={(event) => (event.target as HTMLTextAreaElement).select()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualCopy(undefined)}>Done</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={copied} autoHideDuration={2000} onClose={() => setCopied(false)} message="Message copied" />
      {c.kind === 'assistant' && !messages.length && <AnalysisStarters context={c} onAsk={ask} />}
      {c.kind === 'assistant' && enabled && !running && messages.at(-1)?.kind === 'assistant' && (
        <FollowUps
          questions={followUps(
            c,
            messages.filter((m) => m.kind === 'person').map((m) => m.body)
          )}
          onAsk={ask}
        />
      )}
    </Box>
  );
}
