import { Call, Videocam } from '@mui/icons-material';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Tooltip
} from '@mui/material';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { callsReady, canUseCamera, requestCall, watchCallsReady } from '../../services/callBus';
import { chatService } from '../../services/chatService';
import type { ChatContact, Conversation } from '../../types/chat';
import { callability } from '../../utils/callee';
import { displayTitle } from '../../utils/chatContext';

/** Human channels offer calls in their header. A channel call selects one person and uses their private thread. */
export function CallButtons({
  conversation,
  userId,
  onOpenConversation
}: {
  conversation: Conversation;
  userId: string | undefined;
  onOpenConversation?: (conversation: Conversation) => void;
}) {
  const ready = useSyncExternalStore(watchCallsReady, callsReady, () => false);
  const [camera, setCamera] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [pending, setPending] = useState<Conversation | null>(null);
  const starting = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const choosing = camera !== null;
  useEffect(() => {
    if (!choosing) return;
    const controller = new AbortController();
    setLoading(true);
    setProblem('');
    setContacts([]);
    setPending(null);
    // Channel participants may only contain people who have opened it. Read the authorized group roster instead.
    void chatService
      .contacts(controller.signal, conversation.groupId)
      .then((rows) => {
        if (!controller.signal.aborted) {
          const roomIds = new Set(conversation.participants.filter((p) => p.state === 'active').map((p) => p.userId));
          setContacts(rows.filter((p) => p.id !== userId && (conversation.kind !== 'room' || roomIds.has(p.id))));
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setProblem(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [choosing, conversation.groupId, conversation.kind, conversation.participants, userId]);

  const name = displayTitle(conversation, userId);
  const found = callability(conversation, userId, name);
  if (conversation.kind === 'assistant' || conversation.assistantId || !userId) return null;
  const channel = conversation.kind !== 'direct';
  const why = !ready
    ? 'Calls are unavailable on this server.'
    : !channel && !found?.callable
      ? (found?.reason ?? 'This conversation cannot be called.')
      : undefined;
  const call = (withCamera: boolean) => {
    if (why) return;
    if (channel) {
      setCamera(withCamera);
      return;
    }
    if (found?.callable)
      requestCall({
        conversationId: conversation._id,
        peer: { userId: found.them.userId, name, picture: conversation.profile?.picture ?? null },
        camera: withCamera
      });
  };
  const choose = async (person: ChatContact) => {
    if (starting.current || camera === null || !callsReady()) return;
    starting.current = true;
    setBusy(true);
    setProblem('');
    try {
      const direct = await chatService.create({ kind: 'direct', title: person.name, userIds: [person.id] });
      if (!alive.current) return;
      const allowed = callability(direct, userId, person.name);
      if (!allowed?.callable) {
        setPending(direct);
        setProblem(allowed?.reason ?? 'This conversation cannot be called.');
      } else if (!callsReady()) {
        setProblem('Calls are unavailable on this server.');
      } else {
        requestCall({
          conversationId: direct._id,
          peer: { userId: person.id, name: person.name, picture: null },
          camera
        });
        setCamera(null);
      }
    } catch (error) {
      if (alive.current) setProblem((error as Error).message);
    } finally {
      starting.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const button = (label: string, withCamera: boolean, icon: ReactNode) => {
    const reason =
      why || (withCamera && !canUseCamera() ? 'Video calls require camera access in a secure browser.' : undefined);
    return (
      <Tooltip title={reason ?? label} arrow>
        <span>
          <IconButton aria-label={label} disabled={Boolean(reason)} onClick={() => call(withCamera)}>
            {icon}
          </IconButton>
        </span>
      </Tooltip>
    );
  };
  return (
    <>
      {button(`Call ${name}`, false, <Call />)}
      {button(`Video call ${name}`, true, <Videocam />)}
      <Dialog
        open={choosing}
        onClose={() => {
          if (!busy) setCamera(null);
        }}
        fullWidth
        maxWidth="xs"
        aria-labelledby="call-person-title"
      >
        <DialogTitle id="call-person-title">{camera ? 'Video call' : 'Voice call'} · choose a person</DialogTitle>
        <DialogContent>
          {problem && <Alert severity="info">{problem}</Alert>}
          {loading && <ListItemText primary="Loading people…" />}
          {!loading && !problem && contacts.length === 0 && (
            <ListItemText primary="No shared-group contacts are available to call." />
          )}
          <List>
            {contacts.map((person) => (
              <ListItemButton key={person.id} disabled={busy || Boolean(pending)} onClick={() => void choose(person)}>
                <ListItemText primary={person.name} />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          {pending && onOpenConversation && (
            <Button
              onClick={() => {
                onOpenConversation(pending);
                setCamera(null);
              }}
            >
              Open conversation
            </Button>
          )}
          <Button disabled={busy} onClick={() => setCamera(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
