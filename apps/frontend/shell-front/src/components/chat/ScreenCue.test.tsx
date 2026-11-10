import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useGuestVivi', () => ({ useGuestVivi: () => false }));
vi.mock('../../config/ConfigProvider', () => ({ useConfig: () => ({ CHAT_FRONT_URL: 'http://chat.test' }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('../../remotes', () => ({ remoteChatPanel: () => () => <div>Embedded conversations</div>, forgetChatPanel: vi.fn() }));

import { ChatButton, ChatProvider } from './ChatDock';
import { ScreenCue } from './ScreenCue';

const ID = 'a'.repeat(24);
const Where = () => {
  const location = useLocation();
  return <p data-testid="at">{location.pathname + location.search}</p>;
};
const mount = (path = '/projects') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ChatProvider>
        <ChatButton />
        <Where />
        <ScreenCue />
      </ChatProvider>
    </MemoryRouter>
  );
const ask = (detail: unknown) => act(() => void window.dispatchEvent(new CustomEvent('visin:screen', { detail })));
const note = () => screen.queryByRole('status');
const reducedMotion = (reduced: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('visin.chat.open', '1');
  reducedMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ScreenCue', () => {
  it('says what the analyst opened, in words, with a glow around the page', () => {
    mount();
    expect(note()).toBeNull();
    ask({ id: 'c1', place: 'training', params: { id: ID, tab: 'epochs' } });
    expect(note()).toHaveTextContent('Analyst opened the run’s Epochs tab');
    expect(note()).not.toHaveTextContent(ID);
    expect(screen.getByTestId('screen-glow')).toBeInTheDocument();
    expect(screen.getByTestId('at')).toHaveTextContent(`/trainings/${ID}?tab=epochs`);
  });

  it('takes the change back, to where the page was', () => {
    mount('/projects?tab=runs');
    ask({ id: 'c1', place: 'datasets', params: {} });
    expect(screen.getByTestId('at')).toHaveTextContent('/datasets');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('at')).toHaveTextContent('/projects?tab=runs');
    expect(note()).toBeNull();
  });

  it('offers no undo for a frame opened in place, or for a page that is already open', () => {
    mount('/datasets');
    const handler = (event: Event) => ((event as CustomEvent).detail.result = { ok: true, summary: 'Opened loaded frame' });
    window.addEventListener('visin:page-action', handler);
    ask({ id: 'a1', place: 'action', params: { action: 'open_frame', id: ID } });
    window.removeEventListener('visin:page-action', handler);
    expect(note()).toHaveTextContent('Analyst opened a frame');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    ask({ id: 'c2', place: 'datasets', params: {} });
    expect(note()).toHaveTextContent('Analyst opened the datasets');
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('says nothing for a change that was refused, or a page action nobody carried out', () => {
    mount();
    ask({ id: 'c1', place: 'training', params: { id: '../account' } });
    ask({ id: 'a1', place: 'action', params: { action: 'open_frame', id: ID } });
    expect(note()).toBeNull();
    expect(screen.queryByTestId('screen-glow')).not.toBeInTheDocument();
  });

  it('goes by itself after a while, and can be dismissed sooner', () => {
    vi.useFakeTimers();
    mount();
    ask({ id: 'c1', place: 'datasets', params: {} });
    act(() => void vi.advanceTimersByTime(7900));
    expect(note()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(note()).toBeNull();
    ask({ id: 'c2', place: 'models', params: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(note()).toBeNull();
  });

  it('shows the newest change, and starts its time again', () => {
    vi.useFakeTimers();
    mount();
    ask({ id: 'c1', place: 'datasets', params: {} });
    act(() => void vi.advanceTimersByTime(6000));
    ask({ id: 'c2', place: 'models', params: {} });
    expect(note()).toHaveTextContent('Analyst opened the models');
    act(() => void vi.advanceTimersByTime(6000));
    expect(note()).not.toBeNull();
    act(() => void vi.advanceTimersByTime(2100));
    expect(note()).toBeNull();
  });

  it('is announced politely, not as an alert', () => {
    mount();
    ask({ id: 'c1', place: 'datasets', params: {} });
    expect(note()).toHaveAttribute('aria-live', 'polite');
  });
});
