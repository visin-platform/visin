import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
import { StreamingMessage } from './StreamingMessage';
import { visibleDrafts } from '../../utils/drafts';

import { PAGE, mergeMessages, applyMessageUpdates } from '../../utils/messages';
import { AnalysisHint } from './AnalysisHint';
import { continuesRun } from '../../utils/messageRuns';
import { aboutLabel, sameAbout } from '../../utils/chatContext';
import { failureNote } from '../../utils/failure';
import { useAllowance } from '../../hooks/useAllowance';

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

/** A failed question: what happened, in words that say what to do, and Try again where asking again can help. */
function FailedRun({
  run,
  resetsAt,
  retry,
  sending
}: {
  run: Parameters<typeof failureNote>[0];
  resetsAt?: string;
  retry?: () => void;
  sending: boolean;
}) {
  const note = failureNote(run, resetsAt);
  return (
    <Alert
      severity="warning"
      action={
        retry &&
        note.retry && (
          <Button color="inherit" size="small" startIcon={<Refresh />} disabled={sending} onClick={retry}>
            Retry
          </Button>
        )
      }
    >
      {note.text}
    </Alert>
  );
}

export function MessageList() {
  const [copied, setCopied] = useState(false);
  const [manualCopy, setManualCopy] = useState<{ messageId: string; text: string }>();
  const {
    scroller,
    atBottom,
    hasOlder,
    messages: everything,
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
    setReplyTarget,
    replyTarget,
    setSharedTarget,
    composerInput,
    runs,
    drafts,
    user,
    editing,
    beginEdit,
    dropEdit
  } = useChatWorkspaceContext();
  // A question edited into a new one, and its answer, are out of the thread. They are kept in the list, so a slow
  // fetch cannot bring them back, and in the history, where the run keeps them.
  const messages = useMemo(() => everything.filter((message) => !message.supersededAt), [everything]);
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
    // The question being reworded was taken back or edited elsewhere: there is nothing left to edit.
    if (editing && !messages.some((message) => message._id === editing._id && !message.unsentAt)) dropEdit();
  }, [messages, editing, dropEdit]);
  useEffect(() => {
    if (manualCopy && messages.some((message) => message._id === manualCopy.messageId && message.unsentAt))
      setManualCopy(undefined);
  }, [messages, manualCopy]);
  // Only a day-limit failure needs the reset time: asked for then, from the same quiet look-up the notice uses.
  const limited = latestRun?.state === 'failed' && latestRun.failureCode === 'limit_reached';
  const { data: allowance } = useAllowance(Boolean(c) && limited);
  if (!c) return null;
  const ownRun = (run: (typeof runs)[number]) => c.kind === 'assistant' || run.userId === user?.id;
  // The answer being written, shown until it is a message. Only in the asker's own analyst thread, which is all the
  // server sends drafts for.
  const writing = c.kind === 'assistant' ? visibleDrafts(drafts, everything) : [];
  // One bubble per answer being worked on, from the question until the answer is a message: a working run, or a
  // draft whose run is over but whose message has not arrived. Keyed by run, so it stays put as the analyst switches
  // between writing a note and reading, and only ever grows.
  const order = (runId: string) => {
    const index = runs.findIndex((run) => run._id === runId);
    return index < 0 ? runs.length : index;
  };
  const live = [
    ...(running ? runs.filter((run) => ['queued', 'running'].includes(run.state)).map((run) => run._id) : []),
    ...writing.map((draft) => draft.runId)
  ]
    .filter((runId, index, all) => all.indexOf(runId) === index)
    .sort((a, b) => order(a) - order(b));
  // Only the latest question can be reworded, and only a text one, which is also the last thing the person said.
  const editable =
    c.kind === 'assistant' && enabled && !sending
      ? messages.findLast((message) => message.kind === 'person' && !message.unsentAt)
      : undefined;
  const canEdit = (message: (typeof messages)[number]) =>
    message._id === editable?._id && !message.attachments?.length && Boolean(message.body);
  // One pass over the page: the question each answer replies to, and the label a question shows. In the one chat
  // with an assistant a question says what it was about, when that is not what the question before it was about.
  const byId = new Map(messages.map((message) => [message._id, message]));
  const askedAbout: string[] = [];
  let previousQuestion: (typeof messages)[number] | undefined;
  for (const message of messages) {
    let label = '';
    if (c.kind === 'assistant' && message.kind === 'person') {
      const here = aboutLabel(message.context);
      if (here && !(previousQuestion && sameAbout(message.context, previousQuestion.context))) label = here;
      previousQuestion = message;
    }
    askedAbout.push(label);
  }
  const questionOf = (message: (typeof messages)[number]) =>
    message.replyTo ? byId.get(message.replyTo) : undefined;

  return (
    <Box
      ref={scroller}
      aria-live="polite"
      onScroll={(event) => {
        const box = event.currentTarget;
        atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      }}
      sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: { xs: 1.5, sm: 2 }, pt: 0.5, pb: 2 }}
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
          {askedAbout[index] && (
            <Box
              sx={{ textAlign: 'right', color: 'text.secondary', typography: 'caption', mt: 1.5, px: 0.5 }}
              data-testid="asked-about"
            >
              {askedAbout[index]}
            </Box>
          )}
          <MessageBubble
            key={message._id}
            message={message}
            conversationId={c._id}
            first={!continuesRun(messages[index - 1], message)}
            last={!continuesRun(message, messages[index + 1])}
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
            labels={[...(questionOf(message)?.context?.trainingLabels ?? []), ...(c.trainingLabels ?? [])]}
            fresh={Date.now() - Date.parse(message.createdAt) < FRESH_MS}
            // An answer can be saved as a finding when the question it answers was about a project.
            canSave={c.kind === 'assistant' && Boolean(questionOf(message)?.context?.projectId)}
            onSave={setFinding}
            userId={user?.id}
            onReact={(target, emoji) =>
              perform(async () => {
                const updated = await chatService.react(c._id, target._id, emoji);
                setMessages((rows) => applyMessageUpdates(rows, [updated]));
              })
            }
            onEdit={canEdit(message) ? beginEdit : undefined}
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
            onSelectText={(text) => setManualCopy({ messageId: message._id, text })}
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
      {live.map((runId) => {
        const run = runs.find((row) => row._id === runId);
        return (
          <StreamingMessage
            key={runId}
            text={writing.find((draft) => draft.runId === runId)?.text ?? ''}
            name={run?.assistantName || (c.kind === 'assistant' && c.profile?.name) || 'Visin analyst'}
            profile={c.kind === 'assistant' ? c.profile : undefined}
            run={run}
            onGrow={followEnd}
          />
        );
      })}
      {latestRun?.state === 'failed' && !running && (
        <FailedRun
          run={latestRun}
          resetsAt={allowance?.resetsAt}
          retry={
            failedQuestion && c.kind === 'assistant' && enabled && (latestRun.canRetry ?? ownRun(latestRun))
              ? () => void post(failedQuestion.body, false, failedQuestion.replyTo, [], failedQuestion.context)
              : undefined
          }
          sending={sending}
        />
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
      {c.kind === 'assistant' && !messages.length && <AnalysisHint />}
    </Box>
  );
}
