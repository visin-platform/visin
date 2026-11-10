import { useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatWorkspace } from '../hooks/useChatWorkspace';
import { ChatWorkspaceContext } from './chatWorkspace';

function QueryScope({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Each page/panel owns its query context, even outside the shell. A new account gets a fresh signed-URL cache. */
export function ChatWorkspaceProvider({ value, children }: PropsWithChildren<{ value: ChatWorkspace }>) {
  return <QueryScope key={value.user?.id}><ChatWorkspaceContext.Provider value={value}>{children}</ChatWorkspaceContext.Provider></QueryScope>;
}
