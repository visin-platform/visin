import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatBackground } from './ChatBackground';
import { ChatDockContext, type ChatDock } from './chatDock';

const state = vi.hoisted(() => ({ fails: false }));
vi.mock('../../remotes', () => {
  function Background() {
    if (state.fails) throw new Error('chat is mid-deploy');
    return <p>chat background running</p>;
  }
  return { remoteChatCalls: () => Background };
});

const dock = (available: boolean): ChatDock => ({
  available,
  open: false,
  toggle: () => undefined,
  close: () => undefined,
  openWith: () => undefined
});
const mount = (available: boolean) =>
  render(
    <ChatDockContext.Provider value={dock(available)}>
      <ChatBackground />
    </ChatDockContext.Provider>
  );

beforeEach(() => {
  state.fails = false;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('ChatBackground', () => {
  it('loads chat’s always-on part for a signed-in person where chat is configured', async () => {
    mount(true);
    expect(await screen.findByText('chat background running')).toBeInTheDocument();
  });

  it('is not loaded for a visitor, or where there is no chat', () => {
    const { container } = mount(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing when chat is down: the app carries on without it', () => {
    state.fails = true;
    const { container } = mount(true);
    expect(container).toBeEmptyDOMElement();
    expect(console.warn).toHaveBeenCalled();
  });
});
