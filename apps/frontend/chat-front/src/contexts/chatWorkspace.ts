import { createContext } from 'react';
import type { ChatWorkspace } from '../hooks/useChatWorkspace';
export const ChatWorkspaceContext = createContext<ChatWorkspace | null>(null);
