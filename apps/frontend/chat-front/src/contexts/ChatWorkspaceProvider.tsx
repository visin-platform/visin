import type { PropsWithChildren } from 'react';
import type { ChatWorkspace } from '../hooks/useChatWorkspace';
import { ChatWorkspaceContext } from './chatWorkspace';
/** Each page/panel mount provides its own workspace value. */
export function ChatWorkspaceProvider({ value, children }: PropsWithChildren<{ value: ChatWorkspace }>) {
  return <ChatWorkspaceContext.Provider value={value}>{children}</ChatWorkspaceContext.Provider>;
}
