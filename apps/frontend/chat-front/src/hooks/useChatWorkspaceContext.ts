import { useContext } from 'react';
import { ChatWorkspaceContext } from '../contexts/chatWorkspace';
export function useChatWorkspaceContext() {
  const value = useContext(ChatWorkspaceContext);
  if (!value) throw new Error('Chat components require a chat workspace');
  return value;
}
