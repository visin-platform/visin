import { createContext, useContext } from 'react';

/** A deliberate request to open chat on something. Chat-front reads it and re-checks every id in it. */
export type ChatRequest =
  | { kind?: 'assistant' | 'project'; assistantId?: string; projectId?: string; trainingIds?: string[]; title?: string }
  | { kind: 'direct'; handle?: string; userId?: string; name?: string }
  | { kind: 'group'; groupId: string; title?: string };

declare global {
  interface Window {
    /** The newest request, for a chat panel that has not loaded yet. */
    __visinChatContext?: ChatRequest;
  }
}

export interface ChatDock {
  /** Chat is configured and someone is signed in. */
  available: boolean;
  /** The side panel is open (on a desktop, outside the chat page). */
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Opens chat on something: the panel on a desktop, the chat page on a phone. */
  openWith: (request: ChatRequest) => void;
  /** The conversation the panel shows, for "open full page". */
  conversationId?: string;
}

export const ChatDockContext = createContext<ChatDock>({
  available: false,
  open: false,
  toggle: () => undefined,
  close: () => undefined,
  openWith: () => undefined
});

export const useChatDock = () => useContext(ChatDockContext);

/** The panel's width, and the range a drag or the arrow keys can take it to. */
export const PANEL_WIDTH = { initial: 440, min: 320, max: 720, maxShare: 0.5, step: 24 } as const;

/** Within the range, and never so wide that the page beside it stops being usable. */
export function clampWidth(width: number, windowWidth: number): number {
  const max = Math.max(PANEL_WIDTH.min, Math.min(PANEL_WIDTH.max, Math.round(windowWidth * PANEL_WIDTH.maxShare)));
  return Math.round(Math.min(Math.max(width, PANEL_WIDTH.min), max));
}
