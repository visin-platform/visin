import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  Add,
  ArrowBack,
  AutoAwesome,
  ContentCopy,
  FolderOutlined,
  Forum,
  GroupsOutlined,
  PersonOutlined,
  Refresh,
  Settings,
  Stop
} from '@mui/icons-material';
import { Markdown } from '@visin/frontend-core';
import {
  api,
  type Capabilities,
  type Conversation,
  type Message,
  type OpenRequest,
  type PageContext,
  type Run
} from './api';
import { ANALYST_SETTINGS_EVENT, analystSettingsHref } from './analystSettingsLink';
import { useConversationRows } from './useConversationRows';
import { unreadCount } from './unread';
import { useAuth } from './auth';
import { getGlobalConfig } from './config/ConfigProvider';
import {
  KIND_LABEL,
  OPEN_EVENT,
  PAGE_CONTEXT_EVENT,
  analysisOf,
  contextKey,
  displayTitle,
  matchesContext,
  starters
} from './chatContext';
import { Composer } from './Composer';
import { NewChat } from './NewChat';

function evidenceLinks(message: Message) {
  const ids = new Set<string>();
  for (const e of message.evidence) {
    const input = e.input || {};
    if (typeof input.training === 'string' && /^[a-f\d]{24}$/i.test(input.training)) ids.add(input.training);
    if (Array.isArray(input.trainings))
      input.trainings.forEach((id) => {
        if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ids.add(id);
      });
  }
  return [...ids];
}

/** One page of history, as the server returns it. A full page means there may be older messages. */
const PAGE = 50;

/** Rows by id, newest copy wins, in sequence order. */
const mergeMessages = (old: Message[], rows: Message[]) =>
  [...new Map([...old, ...rows].map((m) => [m._id, m])).values()].sort((a, b) => a.seq - b.seq);

const KIND_ICON: Record<Conversation['kind'], typeof AutoAwesome> = {
  assistant: AutoAwesome,
  direct: PersonOutlined,
  room: Forum,
  group: GroupsOutlined,
  project: FolderOutlined
};

/** A request in the address, for the full page opened from a front that is not inside the shell. */
function requestFromUrl(): OpenRequest | undefined {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  if (!projectId) return undefined;
  return {
    kind: params.get('kind') === 'project' ? 'project' : 'assistant',
    projectId,
    trainingIds: params.get('runs')?.split(',').filter(Boolean),
    title: params.get('title') || undefined
  };
}

export default function Chat({ panel = false }: { panel?: boolean }) {
  const { user, isAuthenticated, isLoading, login } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string>();
  /** An analysis not started yet: it becomes a conversation with its first question. */
  const [pending, setPending] = useState<PageContext>();
  const [composing, setComposing] = useState(false);
  const [messages, setMessages] = useConversationRows<Message>(`${user?.id}:${selected}`);
  const [runs, setRuns] = useConversationRows<Run>(`${user?.id}:${selected}`);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [groups, setGroups] = useState<{ groupId: string; name: string }[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | undefined>(() => window.__visinPageContext);
  const [request, setRequest] = useState<OpenRequest>();
  const [inviteHandle, setInviteHandle] = useState('');
  const [showPeople, setShowPeople] = useState(false);
  const [finding, setFinding] = useState<Message>();
  const [findingTitle, setFindingTitle] = useState('');
  const [findingRecommendations, setFindingRecommendations] = useState('');
  const [findingBody, setFindingBody] = useState('');
  const retry = useRef<{ body: string; clientId: string; conversation: string } | undefined>(undefined);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const c = conversations.find((c) => c._id === selected);
  const me = c?.participants.find((p) => p.userId === user?.id);
  const running = runs.some((r) => r.state === 'queued' || r.state === 'running');
  const detail = Boolean(selected || composing || pending);

  const show = useCallback((id: string | undefined) => {
    setSelected(id);
    setPending(undefined);
    setComposing(false);
    setDraft('');
  }, []);

  useEffect(() => {
    setConversations([]);
    setLoaded(false);
    const stored = sessionStorage.getItem(`visin.chat.selected.${user?.id || ''}`);
    const fromUrl = new URLSearchParams(window.location.search).get('conversation');
    show(user?.id ? fromUrl || stored || undefined : undefined);
  }, [user?.id, show]);
  useEffect(() => {
    if (user?.id && selected) {
      sessionStorage.setItem(`visin.chat.selected.${user.id}`, selected);
      window.dispatchEvent(new CustomEvent('visin:chat-selected', { detail: selected }));
    }
  }, [selected, user?.id]);
  const refreshList = useCallback(async () => {
    setConversations(await api<Conversation[]>('/conversations'));
  }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    const controller = new AbortController();
    const failed = (e: unknown) => {
      if (!controller.signal.aborted) setError((e as Error).message);
    };
    // Groups change rarely and are read once. Whether the analyst answers is read again whenever it may have
    // changed: an administrator turning it on in Account (announced on the page), the page coming back into view,
    // and once a minute, since the shell keeps this chat mounted while other pages are used.
    void api<{ groupId: string; name: string }[]>('/groups', undefined, controller.signal)
      .then((ownGroups) => {
        if (!controller.signal.aborted) setGroups(ownGroups);
      })
      .catch(failed);
    const readCapabilities = () =>
      void api<Capabilities>('/capabilities', undefined, controller.signal)
        .then((capabilities) => {
          if (controller.signal.aborted) return;
          setEnabled(capabilities.assistant);
          setCanConfigure(Boolean(capabilities.canConfigure));
        })
        .catch(failed);
    readCapabilities();
    const whenVisible = () => {
      if (document.visibilityState === 'visible') readCapabilities();
    };
    window.addEventListener(ANALYST_SETTINGS_EVENT, readCapabilities);
    document.addEventListener('visibilitychange', whenVisible);
    const capabilitiesTimer = setInterval(whenVisible, 60_000);
    const load = async () => {
      try {
        const list = await api<Conversation[]>('/conversations', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setConversations(list);
        setLoaded(true);
      } catch (e) {
        failed(e);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void load();
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(capabilitiesTimer);
      window.removeEventListener(ANALYST_SETTINGS_EVENT, readCapabilities);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [isAuthenticated, user?.id]);

  // What the page is about, as Vision's pages publish it, and the deliberate open requests.
  useEffect(() => {
    const onPage = (event: Event) => setPageContext((event as CustomEvent<PageContext | null>).detail ?? undefined);
    const onOpen = (event: Event) => {
      const value = (event as CustomEvent<OpenRequest>).detail;
      if (!value) return;
      delete window.__visinChatContext;
      setRequest(value);
    };
    window.addEventListener(PAGE_CONTEXT_EVENT, onPage);
    window.addEventListener(OPEN_EVENT, onOpen);
    // A newly loaded chat takes the most recent request, or the full page's address.
    const waiting = window.__visinChatContext ?? (panel ? undefined : requestFromUrl());
    delete window.__visinChatContext;
    if (waiting) setRequest(waiting);
    return () => {
      window.removeEventListener(PAGE_CONTEXT_EVENT, onPage);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [panel]);

  const perform = useCallback(async (operation: () => Promise<void>) => {
    try {
      setError('');
      await operation();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Read by the effects below without re-running them on every list refresh.
  const latest = useRef({ conversations, current: c, composing });
  useEffect(() => {
    latest.current = { conversations, current: c, composing };
  });

  /** The thread already about this, or a fresh analysis waiting for its first question. */
  const analyze = useCallback(
    (context: PageContext) => {
      const match = latest.current.conversations.find((item) => matchesContext(item, context));
      if (match) show(match._id);
      else {
        show(undefined);
        setPending(context);
      }
    },
    [show]
  );

  const openConversation = useCallback(
    (open: () => Promise<Conversation>) =>
      perform(async () => {
        setSending(true);
        try {
          const conversation = await open();
          await refreshList();
          show(conversation._id);
        } finally {
          setSending(false);
        }
      }),
    [perform, refreshList, show]
  );

  const handle = useCallback(
    (open: OpenRequest) => {
      const analysis = analysisOf(open);
      if (analysis) return analyze(analysis);
      if (open.kind === 'project' && open.projectId)
        return openConversation(() =>
          api<Conversation>('/conversations', {
            kind: 'project',
            title: (open.title || 'Project discussion').slice(0, 120),
            projectId: open.projectId
          })
        );
      if (open.kind === 'direct')
        return openConversation(() =>
          api<Conversation>('/conversations', {
            kind: 'direct',
            title: (open.name || open.handle || 'Direct message').slice(0, 120),
            handles: open.handle ? [open.handle] : [],
            userIds: open.userId ? [open.userId] : []
          })
        );
      if (open.kind === 'group')
        return openConversation(() => api<Conversation>(`/groups/${open.groupId}/channel`, {}));
    },
    [analyze, openConversation]
  );

  // A deliberate request is acted on once the list is there to find an existing thread in.
  useEffect(() => {
    if (!loaded || !request) return;
    setRequest(undefined);
    void handle(request);
  }, [loaded, request, handle]);

  // Browsing to a run, a comparison or a project brings up its analysis, unless a conversation with
  // people or a new chat is open: switching away from those would lose someone's place.
  const pageKey = contextKey(pageContext);
  useEffect(() => {
    if (!loaded || !enabled || !pageKey || !pageContext) return;
    const { current, composing } = latest.current;
    if (composing || (current && current.kind !== 'assistant')) return;
    analyze(pageContext);
    // Follows the page, not each new copy of the same context.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, enabled, pageKey, analyze]);

  useEffect(() => {
    if (!selected || !isAuthenticated) {
      setMessages([]);
      setRuns([]);
      return;
    }
    const controller = new AbortController();
    setMessages([]);
    setRuns([]);
    setHasOlder(false);
    setError('');
    const streamBase = getGlobalConfig().CHAT_SERVICE_URL;
    const stream =
      streamBase && typeof EventSource !== 'undefined'
        ? new EventSource(`${streamBase.replace(/\/$/, '')}/api/chat/conversations/${selected}/events`, {
            withCredentials: true
          })
        : undefined;
    // While the stream is open it carries every change (and re-checks access itself);
    // polling is the fallback for while it is down or reconnecting.
    let streaming = false;
    stream?.addEventListener('open', () => {
      streaming = true;
    });
    stream?.addEventListener('error', () => {
      streaming = false;
    });
    stream?.addEventListener('state', (event) => {
      if (controller.signal.aborted) return;
      const state = JSON.parse((event as MessageEvent).data) as { messages: Message[]; runs: Run[] };
      setMessages((rows) => mergeMessages(rows, state.messages));
      setRuns(state.runs);
    });
    let first = true;
    const load = async () => {
      try {
        const [rows, jobs] = await Promise.all([
          api<Message[]>(`/conversations/${selected}/messages`, undefined, controller.signal),
          api<Run[]>(`/conversations/${selected}/runs`, undefined, controller.signal)
        ]);
        if (controller.signal.aborted) return;
        if (first) setHasOlder(rows.length === PAGE);
        first = false;
        setMessages((old) => mergeMessages(old, rows));
        setRuns(jobs);
      } catch (e) {
        if (!controller.signal.aborted) {
          setMessages([]);
          setRuns([]);
          setError((e as Error).message);
        }
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!streaming && document.visibilityState !== 'hidden') void load();
    }, 5000);
    return () => {
      controller.abort();
      stream?.close();
      clearInterval(timer);
    };
  }, [selected, isAuthenticated, setMessages, setRuns]);
  // Marks the thread read as far as it has been shown, once per new message rather than per poll.
  const lastSeq = messages.at(-1)?.seq;
  const readSent = useRef<{ conversation: string; seq: number } | undefined>(undefined);
  useEffect(() => {
    if (!selected || lastSeq === undefined || !user?.id) return;
    if (readSent.current?.conversation === selected && readSent.current.seq >= lastSeq) return;
    readSent.current = { conversation: selected, seq: lastSeq };
    void api(`/conversations/${selected}/read`, { seq: lastSeq })
      .then(() =>
        setConversations((list) =>
          list.map((item) =>
            item._id === selected
              ? {
                  ...item,
                  participants: item.participants.map((p) =>
                    p.userId === user.id ? { ...p, readSeq: Math.max(p.readSeq || 0, lastSeq) } : p
                  )
                }
              : item
          )
        )
      )
      .catch(() => {
        readSent.current = undefined;
      });
  }, [selected, lastSeq, user?.id]);
  // Follows new messages while the reader is at the bottom; leaves them be while they scroll back.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const activity = runs.find((r) => r.state === 'running')?.activity;
  useEffect(() => {
    atBottom.current = true;
  }, [selected]);
  useEffect(() => {
    const box = scroller.current;
    if (box && atBottom.current) box.scrollTop = box.scrollHeight;
  }, [lastSeq, activity, running]);

  const post = (body: string, fromDraft: boolean) =>
    perform(async () => {
      const text = body.trim();
      if (!c || !text) return;
      if (retry.current?.body !== text || retry.current.conversation !== c._id)
        retry.current = { body: text, clientId: crypto.randomUUID(), conversation: c._id };
      setSending(true);
      try {
        await api(`/conversations/${c._id}/messages`, { body: text, clientId: retry.current.clientId });
        if (fromDraft) setDraft('');
        retry.current = undefined;
        atBottom.current = true;
        const [rows, jobs] = await Promise.all([
          api<Message[]>(`/conversations/${c._id}/messages`),
          api<Run[]>(`/conversations/${c._id}/runs`)
        ]);
        setMessages((old) => mergeMessages(old, rows));
        setRuns(jobs);
        await refreshList();
      } finally {
        setSending(false);
      }
    });
  /** The first question makes the analysis a conversation, then goes into it. */
  const start = (context: PageContext, body: string) =>
    perform(async () => {
      const text = body.trim();
      if (!text) return;
      setSending(true);
      try {
        const created = await api<Conversation>('/conversations', {
          kind: 'assistant',
          title: (context.title || 'Analysis').slice(0, 120),
          ...(context.projectId ? { projectId: context.projectId, trainingIds: context.trainingIds ?? [] } : {})
        });
        await api(`/conversations/${created._id}/messages`, { body: text, clientId: crypto.randomUUID() });
        await refreshList();
        show(created._id);
      } finally {
        setSending(false);
      }
    });
  const send = () => (c ? post(draft, true) : pending ? start(pending, draft) : undefined);
  const ask = (text: string) => {
    setDraft(text);
    composerInput.current?.focus();
  };
  // The newest run decides: an old failure stays hidden once a later question was answered.
  const latestRun = runs[0];
  const failedQuestion =
    latestRun?.state === 'failed' ? messages.find((m) => m._id === latestRun.messageId) : undefined;
  const membership = (action: string) =>
    perform(async () => {
      await api(`/conversations/${selected}/membership`, { action });
      await refreshList();
      if (action !== 'accept') show(undefined);
    });
  const back = (
    <IconButton
      aria-label="Conversation list"
      sx={{ display: panel ? 'inline-flex' : { xs: 'inline-flex', md: 'none' } }}
      onClick={() => show(undefined)}
    >
      <ArrowBack />
    </IconButton>
  );
  const contextChips = (
    context: { projectId?: string; projectName?: string; trainingIds?: string[] },
    labels?: { id: string; name: string }[]
  ) =>
    // A boolean, not the count: `0 && …` would render a stray 0 under a conversation with no runs.
    Boolean(context.projectId || context.trainingIds?.length) && (
      <Stack direction="row" sx={{ px: 2, pb: 1, gap: 0.5, flexWrap: 'wrap' }}>
        {context.trainingIds?.map((id) => (
          <Chip
            key={id}
            size="small"
            component="a"
            href={`/trainings/${id}`}
            clickable
            label={labels?.find((run) => run.id === id)?.name || `Run ${id.slice(-6)}`}
          />
        ))}
        {context.projectId && (
          <Chip
            size="small"
            component="a"
            href={`/projects/${context.projectId}`}
            clickable
            icon={<FolderOutlined />}
            label={context.projectName || 'Project'}
          />
        )}
      </Stack>
    );
  const starterButtons = (context: PageContext | undefined) => (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography sx={{ color: 'text.secondary' }}>
        Ask about results, validation peaks or your next experiment.
      </Typography>
      {starters(context).map((text) => (
        <Button key={text} size="small" variant="outlined" startIcon={<AutoAwesome />} onClick={() => ask(text)}>
          {text}
        </Button>
      ))}
    </Stack>
  );

  const notConfigured = (
    <Alert
      severity="info"
      action={
        canConfigure && (
          <Button color="inherit" size="small" component="a" href={analystSettingsHref()}>
            Set up
          </Button>
        )
      }
    >
      {canConfigure
        ? 'The analyst is not turned on yet.'
        : 'The analyst is not turned on for this deployment. Ask an administrator.'}
    </Alert>
  );

  if (isLoading) return <CircularProgress aria-label="Loading chat" />;
  if (!isAuthenticated)
    return (
      <Stack sx={{ p: 3 }} spacing={2}>
        <Typography>Sign in to message people and analyze training results.</Typography>
        <Button onClick={login}>Sign in</Button>
      </Stack>
    );
  return (
    <Box
      sx={{
        display: 'flex',
        position: 'relative',
        height: panel ? '100%' : 'calc(100dvh - 150px)',
        minHeight: panel ? 0 : 400,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        ...(panel ? {} : { border: 1, borderColor: 'divider', borderRadius: 2 })
      }}
    >
      <Box
        sx={{
          width: { xs: '100%', md: panel ? '100%' : 280 },
          flexShrink: 0,
          display: detail ? { xs: 'none', md: panel ? 'none' : 'flex' } : 'flex',
          flexDirection: 'column',
          borderRight: panel ? 0 : 1,
          borderColor: 'divider',
          overflow: 'auto'
        }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700 }}>Conversations</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {canConfigure && (
              // Account's Analyst section: the settings are a page of their own, not part of a conversation.
              <IconButton size="small" aria-label="Analyst settings" component="a" href={analystSettingsHref()}>
                <Settings fontSize="small" />
              </IconButton>
            )}
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => {
                show(undefined);
                setComposing(true);
              }}
            >
              New chat
            </Button>
          </Stack>
        </Stack>
        <List aria-label="Conversations" sx={{ px: 1 }}>
          {conversations.map((item) => {
            const member = item.participants.find((p) => p.userId === user?.id);
            const unread = item._id === selected ? 0 : unreadCount(item, user?.id);
            const Icon = KIND_ICON[item.kind];
            return (
              <ListItemButton
                key={item._id}
                selected={selected === item._id}
                onClick={() => show(item._id)}
                sx={{ borderRadius: 1.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: item.kind === 'assistant' ? 'primary.main' : undefined }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={displayTitle(item, user?.id)}
                  secondary={member?.state === 'invited' ? 'Wants to talk · accept or decline' : KIND_LABEL[item.kind]}
                  slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                />
                {unread > 0 && (
                  <Badge
                    color="primary"
                    badgeContent={unread}
                    max={99}
                    aria-label={`${unread} unread`}
                    sx={{ mr: 1.5 }}
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
        {loaded && !conversations.length && (
          <Typography sx={{ px: 2, py: 1 }} color="text.secondary">
            Ask the analyst about a run, or message someone from their profile.
          </Typography>
        )}
      </Box>
      <Stack sx={{ flex: 1, minWidth: 0, display: !detail ? { xs: 'none', md: panel ? 'none' : 'flex' } : 'flex' }}>
        {c ? (
          <>
            <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', gap: 1 }}>
              {back}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700 }}>
                  {displayTitle(c, user?.id)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {c.kind === 'assistant' ? 'Private analysis · only you can read it' : KIND_LABEL[c.kind]}
                </Typography>
              </Box>
              {c.kind !== 'assistant' && (
                <Button size="small" onClick={() => setShowPeople(true)}>
                  People
                </Button>
              )}
              {c.kind !== 'assistant' && c.projectId && enabled && (
                <Button
                  size="small"
                  startIcon={<AutoAwesome />}
                  onClick={() => analyze({ projectId: c.projectId, trainingIds: c.trainingIds, title: c.projectName })}
                >
                  Ask privately
                </Button>
              )}
            </Stack>
            {contextChips(c, c.trainingLabels)}
            <Divider />
            {me?.state === 'invited' && (
              <Alert
                severity="info"
                action={
                  <Stack direction="row">
                    <Button onClick={() => void membership('accept')}>Accept</Button>
                    <Button onClick={() => void membership('decline')}>Decline</Button>
                  </Stack>
                }
              >
                You have a conversation request.
              </Alert>
            )}
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
                      const older = await api<Message[]>(`/conversations/${c._id}/messages?before=${messages[0].seq}`);
                      setHasOlder(older.length === PAGE);
                      setMessages((rows) => mergeMessages(rows, older));
                    })
                  }
                >
                  Older messages
                </Button>
              )}
              {messages.map((message) => (
                <Box
                  key={message._id}
                  sx={{
                    mb: 2.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: message.kind === 'assistant' ? 'action.hover' : undefined
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {message.senderName} ·{' '}
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  {message.kind === 'assistant' ? (
                    <Markdown>{message.body}</Markdown>
                  ) : (
                    <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</Typography>
                  )}
                  {message.kind === 'assistant' && (
                    <Stack spacing={1}>
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                        {evidenceLinks(message).map((id) => (
                          <Chip
                            key={id}
                            component="a"
                            href={`/trainings/${id}`}
                            clickable
                            size="small"
                            label={`Evidence · ${id.slice(-6)}`}
                          />
                        ))}
                      </Stack>
                      {message.evidence.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Sources checked {new Date(message.evidence[0].at).toLocaleString()}
                        </Typography>
                      )}
                      <Stack direction="row" sx={{ gap: 1 }}>
                        <Button
                          size="small"
                          startIcon={<ContentCopy />}
                          onClick={() =>
                            void perform(async () => {
                              await navigator.clipboard.writeText(message.body);
                            })
                          }
                        >
                          Copy
                        </Button>
                        {c.projectId && (
                          <Button
                            size="small"
                            disabled={Boolean(message.findingId)}
                            onClick={() => {
                              setFinding(message);
                              setFindingTitle('');
                              setFindingRecommendations('');
                              setFindingBody(message.body);
                            }}
                          >
                            {message.findingId ? 'Saved as finding' : 'Save as finding'}
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  )}
                </Box>
              ))}
              {running && (
                <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1}>
                  <CircularProgress size={16} />
                  <Typography variant="body2">{activity || 'Waiting for analyst…'}</Typography>
                  <IconButton
                    aria-label="Stop analysis"
                    onClick={() =>
                      void perform(async () => {
                        await api(`/conversations/${selected}/cancel`, {});
                      })
                    }
                  >
                    <Stop />
                  </IconButton>
                </Stack>
              )}
              {latestRun?.state === 'failed' && !running && (
                <Alert
                  severity="warning"
                  action={
                    failedQuestion &&
                    enabled && (
                      <Button
                        color="inherit"
                        size="small"
                        startIcon={<Refresh />}
                        disabled={sending}
                        onClick={() => void post(failedQuestion.body, false)}
                      >
                        Retry
                      </Button>
                    )
                  }
                >
                  {latestRun.error || 'The analysis failed.'}
                </Alert>
              )}
              {c.kind === 'assistant' && !messages.length && starterButtons(c)}
            </Box>
            {c.kind === 'assistant' && !enabled && notConfigured}
            <Composer
              label={c.kind === 'assistant' ? 'Ask a follow-up' : 'Message'}
              value={draft}
              onChange={setDraft}
              onSend={() => void send()}
              sending={sending}
              inputRef={composerInput}
              hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
              disabled={me?.state === 'invited' || (c.kind === 'assistant' && !enabled)}
            />
          </>
        ) : composing ? (
          <NewChat
            pageContext={pageContext}
            assistant={enabled}
            setupHref={canConfigure ? analystSettingsHref() : undefined}
            groups={groups}
            busy={sending}
            onBack={() => show(undefined)}
            onAnalysis={analyze}
            onPerson={(person) => void handle({ kind: 'direct', ...person })}
            onGroup={(groupId, title) => void handle({ kind: 'group', groupId, title })}
            onRoom={(title, handles, userIds) =>
              void openConversation(() =>
                api<Conversation>('/conversations', { kind: 'room', title, handles, userIds })
              )
            }
          />
        ) : pending ? (
          <>
            <Stack direction="row" sx={{ p: 1.5, alignItems: 'center', gap: 1 }}>
              {back}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700 }}>
                  {pending.title || 'New analysis'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  New analysis · only you can read it
                </Typography>
              </Box>
            </Stack>
            {contextChips(
              pending,
              // A single run's page names the run.
              pending.trainingIds?.length === 1 && pending.title
                ? [{ id: pending.trainingIds[0], name: pending.title }]
                : undefined
            )}
            <Divider />
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>{starterButtons(pending)}</Box>
            {!enabled && notConfigured}
            <Composer
              label="Ask the analyst"
              value={draft}
              onChange={setDraft}
              onSend={() => void send()}
              sending={sending}
              inputRef={composerInput}
              hint={panel ? undefined : 'Enter to send, Shift+Enter for a new line'}
              disabled={!enabled}
            />
          </>
        ) : (
          <Typography sx={{ p: 4, color: 'text.secondary' }}>Choose a conversation, or start a new chat.</Typography>
        )}
      </Stack>
      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 1500 }}
        >
          {error}
        </Alert>
      )}
      <Dialog open={showPeople} onClose={() => setShowPeople(false)}>
        <DialogTitle>People</DialogTitle>
        <DialogContent>
          {c?.participants.map((p) => (
            <Stack key={p.userId} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Typography>
                {p.name} · {p.state}
              </Typography>
              {c?.kind === 'room' && me?.role === 'owner' && p.userId !== user?.id && p.state !== 'left' && (
                <Button
                  onClick={() =>
                    void perform(async () => {
                      await api(`/conversations/${selected}/remove-participant`, { userId: p.userId });
                      await refreshList();
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </Stack>
          ))}
          {c?.kind === 'room' && ['owner', 'admin'].includes(me?.role || '') && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <TextField
                label="Invite public profile handle"
                value={inviteHandle}
                onChange={(e) => setInviteHandle(e.target.value)}
              />
              <Button
                onClick={() =>
                  void perform(async () => {
                    await api(`/conversations/${selected}/participants`, { handle: inviteHandle.replace(/^@/, '') });
                    setInviteHandle('');
                    await refreshList();
                  })
                }
              >
                Invite
              </Button>
            </Stack>
          )}
          {c?.groupId && <Typography>Access follows current membership of the owning group.</Typography>}
        </DialogContent>
        <DialogActions>
          {c && ['room', 'direct'].includes(c.kind) && (
            <>
              <Button
                onClick={() => {
                  setShowPeople(false);
                  void membership('leave');
                }}
              >
                Leave
              </Button>
              {c.kind === 'direct' && (
                <Button
                  color="error"
                  onClick={() => {
                    setShowPeople(false);
                    void membership('block');
                  }}
                >
                  Block
                </Button>
              )}
            </>
          )}
          <Button onClick={() => setShowPeople(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(finding)} onClose={() => setFinding(undefined)} fullWidth maxWidth="md">
        <DialogTitle>Review finding</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Title" value={findingTitle} onChange={(e) => setFindingTitle(e.target.value)} />
            <TextField
              label="Conclusion"
              multiline
              minRows={8}
              value={findingBody}
              onChange={(e) => setFindingBody(e.target.value)}
            />
            <TextField
              label="Suggested next experiment (optional)"
              multiline
              value={findingRecommendations}
              onChange={(e) => setFindingRecommendations(e.target.value)}
            />
            <Typography variant="caption">
              Saving uses your existing project write permission and preserves assistant attribution.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinding(undefined)}>Cancel</Button>
          <Button
            disabled={!findingTitle.trim()}
            onClick={() =>
              void perform(async () => {
                await api(`/conversations/${selected}/findings`, {
                  messageId: finding!._id,
                  title: findingTitle,
                  body: findingBody,
                  recommendations: findingRecommendations || undefined
                });
                setFinding(undefined);
                window.dispatchEvent(new CustomEvent('visin:finding-saved', { detail: { projectId: c?.projectId } }));
                const rows = await api<Message[]>(`/conversations/${selected}/messages`);
                setMessages((old) => mergeMessages(old, rows));
              })
            }
          >
            Save finding
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
