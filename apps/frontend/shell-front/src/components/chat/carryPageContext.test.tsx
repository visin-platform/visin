import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useCarriedPageContext } from './carryPageContext';

type ContextWindow = Window & { __visinPageContext?: unknown };
const target = window as ContextWindow;
const run = { projectId: 'p1', trainingIds: ['t1'], title: 'Base run' };

/** What a vision page does: publishes while shown, withdraws on leaving. */
const publish = (context: unknown) =>
  act(() => {
    target.__visinPageContext = context;
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail: context }));
  });
const withdraw = () =>
  act(() => {
    delete target.__visinPageContext;
    window.dispatchEvent(new CustomEvent('visin:page-context', { detail: null }));
  });

function Harness() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useCarriedPageContext(pathname === '/chat');
  return (
    <>
      <button onClick={() => navigate('/chat')}>chat</button>
      <button onClick={() => navigate('/')}>home</button>
      <button onClick={() => navigate('/trainings/t1')}>run</button>
    </>
  );
}

const go = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(() => {
  delete target.__visinPageContext;
});

describe('useCarriedPageContext', () => {
  it('hands chat what the page it was opened from was about, and takes it back on leaving chat', () => {
    render(
      <MemoryRouter initialEntries={['/trainings/t1']}>
        <Harness />
      </MemoryRouter>
    );
    publish(run);

    const seen: unknown[] = [];
    const listen = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener('visin:page-context', listen);
    // Leaving the page withdraws it, as the page does, before chat is open.
    withdraw();
    go('chat');
    expect(target.__visinPageContext).toEqual(run);
    expect(seen.at(-1)).toEqual(run);

    go('home');
    expect(target.__visinPageContext).toBeUndefined();
    expect(seen.at(-1)).toBeNull();
    window.removeEventListener('visin:page-context', listen);
  });

  it('carries nothing from a page two steps back', () => {
    render(
      <MemoryRouter initialEntries={['/trainings/t1']}>
        <Harness />
      </MemoryRouter>
    );
    publish(run);
    withdraw();
    go('home');
    go('chat');

    expect(target.__visinPageContext).toBeUndefined();
  });

  it('carries it again when chat is opened from the same page a second time', () => {
    render(
      <MemoryRouter initialEntries={['/trainings/t1']}>
        <Harness />
      </MemoryRouter>
    );
    publish(run);
    withdraw();
    go('chat');
    go('run');
    publish(run);
    withdraw();
    go('chat');

    expect(target.__visinPageContext).toEqual(run);
  });
});
