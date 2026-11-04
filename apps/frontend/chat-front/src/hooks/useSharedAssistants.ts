import { useEffect, useState } from 'react';
import { assistantService } from '../services/assistantService';
import type { SharedAssistantChange, SharedAssistantSettings as View } from '../types/assistant';

export function useSharedAssistants(conversationId: string, target: string, onTarget: (id: string) => void) {
  const [view, setView] = useState<View>();
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState<{ _id: string; name: string; paused: boolean }[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      void assistantService
        .shared(conversationId, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setView(value);
            setError('');
          }
        })
        .catch((cause: Error) => {
          if (!controller.signal.aborted) setError(cause.message);
        });
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [conversationId]);
  useEffect(() => {
    if (view && (!view.enabled || !view.bots.some((b) => b.id === target && b.available))) onTarget('');
  }, [view, target, onTarget]);
  const change = async (body: SharedAssistantChange) => {
    setSaving(true);
    try {
      setView(await assistantService.updateShared(conversationId, body));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update shared assistants');
    } finally {
      setSaving(false);
    }
  };
  const toggle = () => {
    setOpen(!open);
    if (!open)
      void Promise.all([assistantService.list(), assistantService.catalog()])
        .then(([owned, catalog]) => {
          const managed = new Set(owned.map((bot) => bot._id));
          setOwn([
            ...owned,
            ...(Array.isArray(catalog) ? catalog : [])
              .filter((bot) => !managed.has(bot._id))
              .map((bot) => ({ ...bot, personality: '' }))
          ]);
        })
        .catch((cause: Error) => setError(cause.message));
  };

  return { view, setView, open, setOpen, own, setOwn, error, setError, saving, setSaving, change, toggle };
}
