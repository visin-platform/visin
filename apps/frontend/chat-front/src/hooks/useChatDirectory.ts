import { useEffect, useState } from 'react';
import { chatService } from '../services/chatService';
import type { ChatContact, ChatProject } from '../types/chat';
/** Optional discovery lists may fail independently without blocking new conversations. */
export function useChatDirectory() {
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const settle = <T>(read: (signal?: AbortSignal) => Promise<T[]>, set: (rows: T[]) => void) =>
      void read(controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted) set(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) set([]);
        });
    settle(chatService.projects, setProjects);
    settle(chatService.contacts, setContacts);
    return () => controller.abort();
  }, []);
  return { projects, contacts };
}
