import { Fragment, useState } from 'react';
import { Refresh, Stop } from '@mui/icons-material';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Snackbar, Stack, Typography } from '@mui/material';
import { useChatWorkspaceContext } from '../../hooks/useChatWorkspaceContext';
import { chatService } from '../../services/chatService';
import { MessageBubble } from './MessageBubble';

import { PAGE, mergeMessages } from '../../utils/messages';
import { AnalysisStarters } from './AnalysisStarters';

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
    selected,
    latestRun,
    failedQuestion,
    enabled,
    sending,
    post,
    ask,
    setReplyTarget,
    setSharedTarget,
    composerInput,
    runs,
    user
  } = useChatWorkspaceContext();
  if (!c) return null;
  const ownRun = (run: (typeof runs)[number]) => c.kind === 'assistant' || run.userId === user?.id;
  const canStop = runs.some((run) => ['queued', 'running'].includes(run.state) && (run.canCancel ?? ownRun(run)));

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
            canSave={c.kind === 'assistant' && Boolean(c.projectId)}
            onSave={setFinding}
            onReply={(message) => {
              setReplyTarget(message);
              setSharedTarget('');
              composerInput.current?.focus();
            }}
            onCopy={(body) =>
              void perform(async () => {
                await navigator.clipboard.writeText(body);
                setCopied(true);
              })
            }
          />
        </Fragment>
      ))}
      {running && (
        <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1}>
          <CircularProgress size={16} />
          <Stack>
            {runs
              .filter((run) => ['queued', 'running'].includes(run.state))
              .map((run) => (
                <Typography key={run._id} variant="body2">
                  {run.assistantName ? `${run.assistantName} · ` : ''}
                  {run.activity || 'Waiting for analyst…'}
                </Typography>
              ))}
          </Stack>
          {canStop && (
            <IconButton
              aria-label="Stop analysis"
              onClick={() =>
                void perform(async () => {
                  await chatService.cancel(selected!);
                })
              }
            >
              <Stop />
            </IconButton>
          )}
        </Stack>
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
      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        message="Message copied"
      />
      {c.kind === 'assistant' && !messages.length && <AnalysisStarters context={c} onAsk={ask} />}
    </Box>
  );
}
