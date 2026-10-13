import { useEffect, useState } from 'react';

const CHANNEL = 'visin-label-editor';

type Message = { type: 'open' | 'here'; taskId: string; tab: string };

/**
 * Whether this frame is also open in another tab of this browser.
 *
 * Two tabs on one frame both autosave, and the last to save wins; there is no
 * merge. Telling the annotator is enough — they close one. Tabs announce the
 * frame they open, and answer an announcement for the frame they hold, so the
 * tab opened second finds out as well as the first.
 */
export const useTabPresence = (taskId: string | null): boolean => {
  const [elsewhere, setElsewhere] = useState(false);

  useEffect(() => {
    setElsewhere(false);
    if (!taskId || typeof BroadcastChannel === 'undefined') return;
    const tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL);
    } catch {
      return;
    }
    channel.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (!message || message.taskId !== taskId || message.tab === tab) return;
      setElsewhere(true);
      if (message.type === 'open') channel.postMessage({ type: 'here', taskId, tab } satisfies Message);
    };
    channel.postMessage({ type: 'open', taskId, tab } satisfies Message);
    return () => channel.close();
  }, [taskId]);

  return elsewhere;
};
