import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { ChatBubbleOutlined, Close, OpenInFull } from '@mui/icons-material';
import { Loader, chrome, tint, useCompactLayout } from '@visin/frontend-core';
import { useConfig } from '../../config/ConfigProvider';
import { useAuth } from '../../contexts/AuthContext';
import { forgetChatPanel, remoteChatPanel } from '../../remotes';
import { RemoteBoundary } from '../RemoteBoundary';
import { ChatDockContext, PANEL_WIDTH, clampWidth, useChatDock, type ChatRequest } from './chatDock';

const OPEN_KEY = 'visin.chat.open';
const WIDTH_KEY = 'visin.chat.width';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: remembered for this visit only.
  }
}

/**
 * Whether chat is open and what it was asked to show, for the whole session. Vision's
 * "Analyze this run", a profile's "Message" and the header's button all go through it.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const config = useConfig();
  const { isAuthenticated } = useAuth();
  const available = Boolean(config.CHAT_FRONT_URL && isAuthenticated);
  const compact = useCompactLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => read(OPEN_KEY) === '1');
  const [conversationId, setConversationId] = useState<string>();

  useEffect(() => write(OPEN_KEY, open ? '1' : '0'), [open]);
  useEffect(() => {
    const selected = (event: Event) => setConversationId((event as CustomEvent<string>).detail);
    window.addEventListener('visin:chat-selected', selected);
    return () => window.removeEventListener('visin:chat-selected', selected);
  }, []);

  const onChatPage = pathname.startsWith('/chat');
  const openWith = useCallback(
    (request: ChatRequest) => {
      // Kept for a chat that has not loaded yet, and announced to one that has.
      window.__visinChatContext = request;
      window.dispatchEvent(new CustomEvent('visin:chat-context', { detail: request }));
      if (compact || onChatPage) {
        if (!onChatPage) navigate('/chat');
      } else setOpen(true);
    },
    [compact, onChatPage, navigate]
  );

  // Remotes ask with an event: they cannot reach this context from their own bundle.
  useEffect(() => {
    if (!available) return;
    const receive = (event: Event) => {
      const request = (event as CustomEvent<ChatRequest | undefined>).detail;
      if (request) openWith(request);
      else if (compact) navigate('/chat');
      else setOpen(true);
    };
    window.addEventListener('visin:open-chat', receive);
    return () => window.removeEventListener('visin:open-chat', receive);
  }, [available, openWith, compact, navigate]);

  const value = useMemo(
    () => ({
      available,
      // Not on the chat page itself, which would be the same conversation twice; not on a phone, which has no room.
      open: available && open && !onChatPage && !compact,
      toggle: () => {
        if (compact || onChatPage) navigate('/chat');
        else setOpen((current) => !current);
      },
      close: () => setOpen(false),
      openWith,
      conversationId
    }),
    [available, open, onChatPage, compact, navigate, openWith, conversationId]
  );
  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

/** Chat's place in the top bar, beside the other icons. */
export function ChatButton() {
  const dock = useChatDock();
  if (!dock.available) return null;
  return (
    <Tooltip title={dock.open ? 'Close chat' : 'Chat'}>
      <IconButton
        onClick={dock.toggle}
        aria-label="Chat"
        aria-pressed={dock.open}
        sx={{
          color: dock.open ? 'primary.main' : chrome.inkMuted,
          bgcolor: dock.open ? (theme) => tint(theme.palette.primary.main, 0.12) : undefined,
          '&:hover': { color: dock.open ? 'primary.main' : chrome.ink }
        }}
      >
        <ChatBubbleOutlined />
      </IconButton>
    </Tooltip>
  );
}

/**
 * Chat docked on the right, as tall as the window, so a conversation stays in view beside the page.
 * Wider or narrower by dragging its left edge (or the arrow keys on it), which is remembered.
 */
export function ChatSidePanel() {
  const dock = useChatDock();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(() =>
    clampWidth(Number(read(WIDTH_KEY)) || PANEL_WIDTH.initial, window.innerWidth)
  );
  const [dragging, setDragging] = useState(false);
  const Panel = remoteChatPanel();

  useEffect(() => {
    const fit = () => setWidth((current) => clampWidth(current, window.innerWidth));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const resize = (next: number) => {
    const clamped = clampWidth(next, window.innerWidth);
    setWidth(clamped);
    write(WIDTH_KEY, String(clamped));
  };
  // The edge follows the pointer: the panel is on the right, so moving left widens it.
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture?.(event.pointerId);
    setDragging(true);
    const move = (moved: globalThis.PointerEvent) =>
      setWidth(clampWidth(startWidth + startX - moved.clientX, window.innerWidth));
    const stop = (ended: globalThis.PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      setDragging(false);
      resize(startWidth + startX - ended.clientX);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = ({ ArrowLeft: PANEL_WIDTH.step, ArrowRight: -PANEL_WIDTH.step } as Record<string, number>)[event.key];
    if (by === undefined) return;
    event.preventDefault();
    resize(width + by);
  };

  return (
    <Box
      component="aside"
      aria-label="Chat"
      onClickCapture={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
        if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
        const url = new URL(anchor.href, window.location.href);
        const inShell = /^\/u\/[^/]+\/?$/.test(url.pathname) || /^\/account\/analyst\/?$/.test(url.pathname);
        if (url.origin !== window.location.origin || !inShell) return;
        // Remotes render ordinary anchors (including Markdown links). The shell owns navigation,
        // so keep the mounted conversation and change only the page beside it.
        event.preventDefault();
        navigate(`${url.pathname}${url.search}${url.hash}`);
      }}
      sx={{
        position: 'relative',
        width,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        userSelect: dragging ? 'none' : undefined,
        bgcolor: 'background.paper',
        borderLeft: `1px solid ${chrome.edge}`
      }}
    >
      <Box
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat"
        aria-valuenow={width}
        aria-valuemin={PANEL_WIDTH.min}
        aria-valuemax={PANEL_WIDTH.max}
        tabIndex={0}
        title="Drag to resize, double-click to reset"
        onPointerDown={startDrag}
        onKeyDown={onHandleKey}
        onDoubleClick={() => resize(PANEL_WIDTH.initial)}
        sx={{
          position: 'absolute',
          left: -3,
          top: 0,
          bottom: 0,
          width: 6,
          zIndex: 2,
          cursor: 'col-resize',
          touchAction: 'none',
          bgcolor: dragging ? 'primary.main' : 'transparent',
          transition: 'background-color .15s ease',
          '&:hover, &:focus-visible': { bgcolor: 'primary.main', outline: 'none' }
        }}
      />
      <Box
        sx={{
          ...chrome.surface,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          pl: 2,
          pr: 1,
          minHeight: 64,
          borderBottom: `1px solid ${chrome.edge}`
        }}
      >
        <ChatBubbleOutlined fontSize="small" sx={{ color: 'primary.main' }} />
        <Typography component="h2" sx={{ flex: 1, fontWeight: 700, fontSize: '1rem', ml: 0.5 }}>
          Chat
        </Typography>
        <Tooltip title="Open full page">
          <IconButton
            size="small"
            aria-label="Open full chat"
            onClick={() =>
              navigate(dock.conversationId ? `/chat?conversation=${encodeURIComponent(dock.conversationId)}` : '/chat')
            }
          >
            <OpenInFull fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close">
          <IconButton size="small" aria-label="Close chat" onClick={dock.close}>
            <Close fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <RemoteBoundary
          key={attempt}
          appTitle="Chat"
          onRetry={() => {
            forgetChatPanel();
            setAttempt((n) => n + 1);
          }}
        >
          <Suspense fallback={<Loader fullHeight={false} message="Loading chat…" />}>
            <Panel />
          </Suspense>
        </RemoteBoundary>
      </Box>
    </Box>
  );
}
