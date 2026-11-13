import { useEffect, useRef, useState } from 'react';
import { Box, Chip, CircularProgress, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Send } from '@mui/icons-material';
import { ApiError, Markdown } from '@visin/frontend-core';
import { api } from '../services/apiClient';
import { ViviBubble, VisitorBubble } from './guest/GuestBubble';
import { useGuestHistory } from './guest/history';
import { GuestHeader } from './guest/GuestHeader';
import { AppearanceDialog } from '../appearance/AppearanceDialog';
import { appearanceSx } from '../appearance/chatAppearance';
import { useChatAppearance } from '../appearance/useChatAppearance';
import { projectIdentifier } from './guest/projectIdentifier';
import { refusalMessage, resetTime } from './guest/refusal';
import { useRequestedProject } from './guest/requested';
import { guestChatAvailable, useGuestCapabilities } from './guest/useGuestCapabilities';
import { useTurnstile } from './guest/useTurnstile';

/** Used until the server says otherwise (an administrator sets them in the guest policy). */
const DISCOVERY_EXAMPLES = ['Find public computer vision projects', 'Which projects study autonomous driving?'];
/** How often a question being answered is asked after: often enough to read the answer as it is written. */
const POLL_MS = 1000;
const GREETING = "I know Visin's public research: what each project studies, how it was run and what it found.";
const EXAMPLES = ['What does this project study?', 'What are the best results so far?', 'Which data does it use?'];
const RUN_EXAMPLES = ['How did this run do?', 'What do its images show?', 'Where does it peak?'];

/**
 * Vivi for someone who has not signed in, as a plain chat: Vivi says hello in an empty thread, the visitor asks, and
 * the answer comes back as a message. Page context is optional: without it the server searches public projects.
 * The server holds the limits; a refusal arrives as
 * Vivi's own message saying which one applies. Not drawn while guest Vivi is off, so a visitor is never offered it.
 */
export default function GuestVivi() {
  const capabilities = useGuestCapabilities();
  // Older servers do not send this flag; assume verification is required unless explicitly disabled.
  const checkRequired = capabilities.data?.botCheckRequired !== false;
  const enabled = guestChatAvailable(capabilities.data);
  const project = useRequestedProject();
  const assistant = capabilities.data?.assistant;
  const name = assistant?.name || 'Vivi';
  const appearance = useChatAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [run, setRun] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [allowance, setAllowance] = useState('');
  const key = useRef('');
  const submission = useRef('');
  const submitting = useRef(false);
  const history = useGuestHistory();
  // Remembered for the poll, which reports the question it was started for even after the box has changed.
  const asked = useRef({ question: '', project: '' });
  // The check appears once the visitor begins to type, so looking costs nothing.
  const [typing, setTyping] = useState(false);
  const check = useTurnstile(
    enabled ? capabilities.data?.siteKey : undefined,
    typing && Boolean(question.trim()) && !busy
  );
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!run) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ state: string; answer?: string; draft?: string; error?: string }>(
          `/guest/runs/${run}`
        );
        if (!alive) return;
        setDraft(result.draft || '');
        if (result.state === 'completed' || result.state === 'failed') {
          history.add({
            id: run,
            ...asked.current,
            ...(result.state === 'completed'
              ? { answer: result.answer || '' }
              : { error: result.error || 'The question could not be completed.' })
          });
          // A failed question goes back in the box to try again; an answered one is done.
          if (result.state === 'failed') setQuestion(asked.current.question);
          setRun('');
          setDraft('');
          setBusy(false);
          submitting.current = false;
          key.current = '';
        } else timer = setTimeout(() => void poll(), POLL_MS);
      } catch (err) {
        if (alive) {
          setRefused(err instanceof Error ? err.message : 'Could not read the answer');
          setQuestion(asked.current.question);
          setBusy(false);
          submitting.current = false;
          setRun('');
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `history.add` is stable; the poll must restart only for a new run.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // The newest message is always in view.
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.items.length, busy, refused, draft]);

  if (!enabled) return null;
  const dailyLimit = capabilities.data?.sessionDailyLimit ?? 3;
  const identifier = project ? projectIdentifier(project.id) : null;
  const canSend = !busy && (!checkRequired || Boolean(check.token)) && Boolean(question.trim());

  const send = async () => {
    if (!canSend || submitting.current) return;
    submitting.current = true;
    const text = question;
    const payload = JSON.stringify([text.trim(), identifier]);
    if (submission.current !== payload) key.current = '';
    submission.current = payload;
    setBusy(true);
    setRefused('');
    // The question moves into the thread; it returns to the box if it is refused, so nothing typed is lost.
    setQuestion('');
    if (!key.current) key.current = crypto.randomUUID();
    asked.current = { question: text.trim(), project: project?.name ?? '' };
    try {
      await api('/guest/session', {});
      const result = await api<{ runId: string; remaining?: number; resetAt?: string }>('/guest/questions', {
        question: text,
        ...(identifier ? { projectId: identifier } : {}),
        ...(identifier && project?.trainingId ? { trainingId: project.trainingId } : {}),
        ...(checkRequired ? { challengeToken: check.token } : {}),
        idempotencyKey: key.current
      });
      setRun(result.runId);
      if (result.remaining !== undefined && result.resetAt)
        setAllowance(
          `${result.remaining} of ${dailyLimit} questions left today, back after ${resetTime(result.resetAt)}.`
        );
    } catch (err) {
      setRefused(refusalMessage(err, dailyLimit));
      setQuestion(text);
      setBusy(false);
      submitting.current = false;
      // A clear answer (a limit, a failed check) settled this attempt: asking again is a new question, or the server
      // would hand back the same refusal. Only an attempt whose fate is unknown keeps its key, so a retry is never
      // charged twice.
      if (err instanceof ApiError && err.status < 500) key.current = '';
    }
  };

  // What the line under the box says, most pressing first.
  const hint =
    question.trim() && checkRequired && !check.token && !busy
      ? 'Complete the check above to send.'
      : allowance || `No account needed · ${dailyLimit} questions a day`;

  return (
    <Box
      component="section"
      aria-label="Ask Vivi without signing in"
      sx={(theme) => ({
        ...appearanceSx(theme, appearance.settings),
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0
      })}
    >
      <GuestHeader assistant={assistant} onAppearance={() => setAppearanceOpen(true)} />
      <AppearanceDialog open={appearanceOpen} onClose={() => setAppearanceOpen(false)} appearance={appearance} />
      <Stack
        ref={thread}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Vivi"
        spacing={1.5}
        sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}
      >
        <ViviBubble assistant={assistant}>
          <Typography>
            Hi, I&apos;m {name}! {capabilities.data?.greeting || GREETING}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {project
              ? `Ready when you are: ${project.name}.`
              : 'Ask about a topic, a dataset or a project by name.'}
          </Typography>
          {history.items.length === 0 && !busy && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap', mt: 1.5 }}
              aria-label="Example questions"
            >
              {(project?.trainingId
                ? RUN_EXAMPLES
                : project
                  ? EXAMPLES
                  : (capabilities.data?.examples ?? DISCOVERY_EXAMPLES)
              ).map((example) => (
                <Chip
                  key={example}
                  label={example}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setQuestion(example);
                    setTyping(true);
                    key.current = '';
                  }}
                />
              ))}
            </Stack>
          )}
        </ViviBubble>
        {history.items.map((item) => (
          <Stack key={item.id} spacing={1.5}>
            <VisitorBubble>{item.question}</VisitorBubble>
            {item.answer !== undefined ? (
              <ViviBubble assistant={assistant}>
                <Markdown>{item.answer}</Markdown>
              </ViviBubble>
            ) : (
              <ViviBubble assistant={assistant} tone="warning">
                {item.error}
              </ViviBubble>
            )}
          </Stack>
        ))}
        {busy && (
          <Stack spacing={1.5}>
            <VisitorBubble>{asked.current.question}</VisitorBubble>
            <ViviBubble assistant={assistant}>
              {draft ? (
                // The answer as it is being written; the finished one replaces it.
                <Box aria-live="polite" aria-busy="true">
                  <Markdown>{draft}</Markdown>
                </Box>
              ) : (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <CircularProgress size={14} aria-label="Vivi is answering" />
                  <Typography variant="body2" color="text.secondary">
                    Vivi is answering…
                  </Typography>
                </Stack>
              )}
            </ViviBubble>
          </Stack>
        )}
        {refused && (
          <ViviBubble assistant={assistant} tone="warning">
            {refused}
          </ViviBubble>
        )}
      </Stack>

      <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Stack spacing={1}>
          <div ref={check.container} />
          <TextField
            multiline
            maxRows={4}
            placeholder={`Message ${name}…`}
            value={question}
            disabled={busy}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (e.target.value.trim()) setTyping(true);
              key.current = '';
            }}
            onKeyDown={(event) => {
              // Enter sends, as in the signed-in chat; Shift+Enter is a new line.
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) void send();
              }
            }}
            slotProps={{
              htmlInput: { maxLength: 2000, 'aria-label': 'Message Vivi' },
              input: {
                endAdornment: (
                  <IconButton aria-label="Send" color="primary" disabled={!canSend} onClick={() => void send()}>
                    <Send />
                  </IconButton>
                )
              }
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
