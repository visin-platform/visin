import { Component, Suspense, type ReactNode } from 'react';
import { remoteChatCalls } from '../../remotes';
import { useChatDock } from './chatDock';

/** Chat's background part failing (chat down, mid-deploy) is not worth a message: the app goes on without it. */
class Silent extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    console.warn('Chat background part failed to load', error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Loads chat's always-on part once someone is signed in and chat is configured, and renders nothing of its own.
 * Not mounted for visitors, or where this deployment has no chat.
 */
export function ChatBackground() {
  const { available } = useChatDock();
  if (!available) return null;
  const Background = remoteChatCalls();
  return (
    <Silent>
      <Suspense fallback={null}>
        <Background />
      </Suspense>
    </Silent>
  );
}
