import { createContext, useContext } from 'react';
import type { ScreenCue } from './useScreenCalls';

/** A deliberate request to open chat on something. Chat-front reads it and re-checks every id in it. */
export type ChatRequest =
  | {
      kind?: 'assistant' | 'project';
      assistantId?: string;
      projectId?: string;
      /** a research paper to analyse on its own, in a private chat */
      paperId?: string;
      trainingIds?: string[];
      title?: string;
    }
  | { kind: 'direct'; handle?: string; userId?: string; name?: string }
  | { kind: 'group'; groupId: string; title?: string };

declare global {
  interface Window {
    /** Whether a visitor may ask Vivi: the shell's answer, for pages that offer "Ask Vivi" beside the dock. */
    __visinGuestVivi?: boolean;
    /** The newest request, for a chat panel that has not loaded yet. */
    __visinChatContext?: ChatRequest;
  }
}

export interface ChatDock {
  /** Chat is configured and someone is signed in. */
  available: boolean;
  /**
   * A visitor may ask Vivi: guest Vivi is on. Not `available`, which pages read as "there is a conversation to message
   * or open": a visitor has none, only the guest panel.
   */
  guest: boolean;
  /** The side panel is open (on a desktop, outside the chat page). */
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** Opens chat on something: the panel on a desktop, the chat page on a phone. */
  openWith: (request: ChatRequest) => void;
  /** The conversation the panel shows, for "open full page". */
  conversationId?: string;
  /** What the analyst last opened on the page, until it is dismissed or fades. */
  screenCue?: ScreenCue | null;
  dismissScreenCue?: () => void;
  /** Takes the last change back: goes to where the page was. */
  undoScreenCue?: () => void;
}

export const ChatDockContext = createContext<ChatDock>({
  available: false,
  guest: false,
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
