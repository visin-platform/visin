import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@visin/frontend-core';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';
import GuestVivi from './GuestVivi';
import { api } from '../services/apiClient';
import { forgetRequestedProject, rememberRequestedProject } from './guest/requested';
import { KEPT_FOR_MS } from './guest/history';
import { projectIdentifier } from './guest/projectIdentifier';

vi.mock('../services/apiClient', () => ({ api: vi.fn() }));
const mock = api as unknown as Mock;
let verify: (token: string) => void;
let expire: () => void;
const projectId = '111111111111111111111111';
async function response(path: string) {
  if (path === '/guest/capabilities') return { enabled: true, siteKey: 'public-site-key', sessionDailyLimit: 3 };
  if (path === '/guest/session') return { ready: true };
  if (path.startsWith('/guest/projects')) return { projects: [{ id: projectId, name: 'Public research' }] };
  if (path === '/guest/questions') return { runId: 'guest-run', remaining: 2, resetAt: '2026-11-11T00:00:00Z' };
  return { state: 'completed', answer: 'A public project answer' };
}
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GuestVivi />
    </QueryClientProvider>
  );
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // "Ask Vivi about this project" hands the page's project to the chat.
  rememberRequestedProject({ kind: 'project', projectId, title: 'Public research' });
  mock.mockImplementation(response);
  window.turnstile = {
    render: vi.fn((_element, options) => {
      verify = options.callback;
      expire = options['expired-callback'];
      return 'guest-widget';
    }),
    remove: vi.fn(),
    reset: vi.fn()
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.turnstile;
  forgetRequestedProject();
  document.querySelector('script[data-visin-turnstile]')?.remove();
});
const box = () => screen.getByRole('textbox', { name: 'Message Vivi' });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));
async function ready(text = 'Describe this public project') {
  mount();
  await screen.findByRole('textbox', { name: 'Message Vivi' });
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => verify('verified-challenge-token'));
}
const refuse = (error: Error) =>
  mock.mockImplementation(async (path: string) => {
    if (path === '/guest/questions') throw error;
    return response(path);
  });
const STORED = (items: unknown[]) => localStorage.setItem('visin.guest.vivi', JSON.stringify(items));

it('stays hidden when guest access is disabled or capabilities are unavailable', async () => {
  mock.mockResolvedValue({ enabled: false });
  const view = mount();
  await waitFor(() => expect(mock).toHaveBeenCalled());
  expect(screen.queryByRole('textbox', { name: 'Message Vivi' })).not.toBeInTheDocument();
  view.unmount();
  mock.mockRejectedValue(new Error('Unavailable'));
  mount();
  await act(async () => {});
  expect(screen.queryByRole('textbox', { name: 'Message Vivi' })).not.toBeInTheDocument();
});

it('opens as a plain chat: Vivi says hello in an otherwise empty thread, with a message box below', async () => {
  mount();
  expect(await screen.findByText(/Hi, I'm Vivi/)).toBeInTheDocument();
  expect(screen.getByText(/Ready when you are: Public research/)).toBeInTheDocument();
  expect(screen.getByRole('log', { name: 'Conversation with Vivi' })).toBeInTheDocument();
  expect(screen.getByText('No account needed · 3 questions a day')).toBeInTheDocument();
  // No bot check until the visitor begins to type.
  expect(window.turnstile?.render).not.toHaveBeenCalled();
  expect(document.querySelector('script[data-visin-turnstile]')).toBeNull();
});

it('accepts questions without a project picker and lets the server find public context', async () => {
  forgetRequestedProject();
  await ready('Find public research about cars');
  expect(screen.queryByLabelText('Public project')).not.toBeInTheDocument();
  send();
  await screen.findByText('A public project answer');
  const body = mock.mock.calls.find(([path]) => path === '/guest/questions')![1];
  expect(body).not.toHaveProperty('projectId');
});

it('shows the configured assistant avatar, profile and appearance settings', async () => {
  mock.mockImplementation(async (path: string) =>
    path === '/guest/capabilities'
      ? {
          enabled: true,
          siteKey: 'public-site-key',
          assistant: { name: 'Research Vivi', picture: '/vivi.png', handle: 'research-vivi' }
        }
      : response(path)
  );
  mount();
  expect(await screen.findByRole('img', { name: 'Research Vivi' })).toHaveAttribute('src', '/vivi.png');
  expect(screen.getByRole('link', { name: 'View Research Vivi profile' })).toHaveAttribute('href', '/u/research-vivi');
  fireEvent.click(screen.getByRole('button', { name: 'Conversation settings' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Appearance' }));
  expect(await screen.findByRole('dialog', { name: 'Chat appearance' })).toBeInTheDocument();
});

it('fills the box from an example, which starts the check', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'What does this project study?' }));
  expect(box()).toHaveValue('What does this project study?');
  await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
  expect(screen.getByText('Complete the check above to send.')).toBeInTheDocument();
});

it('does not offer chat when verification is required but its site key is missing', async () => {
  mock.mockResolvedValue({ enabled: true, siteKey: '', sessionDailyLimit: 3 });
  mount();
  await waitFor(() => expect(mock).toHaveBeenCalled());
  expect(screen.queryByRole('textbox', { name: 'Message Vivi' })).not.toBeInTheDocument();
});

it('sends without a bot check when the service does not require one', async () => {
  mock.mockImplementation(async (path: string) =>
    path === '/guest/capabilities'
      ? { enabled: true, botCheckRequired: false, siteKey: '', sessionDailyLimit: 3 }
      : response(path)
  );
  mount();
  fireEvent.change(await screen.findByRole('textbox', { name: 'Message Vivi' }), {
    target: { value: 'Describe this project' }
  });
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  send();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
  expect(window.turnstile?.render).not.toHaveBeenCalled();
  expect(mock.mock.calls.find(([path]) => path === '/guest/questions')![1]).not.toHaveProperty('challengeToken');
});

it('requires verification and sends one bounded question with an idempotency key', async () => {
  await ready();
  await act(async () => expire());
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  await act(async () => verify('fresh-verification'));
  send();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith(
    '/guest/questions',
    expect.objectContaining({
      question: 'Describe this public project',
      projectId,
      challengeToken: 'fresh-verification',
      idempotencyKey: expect.any(String)
    })
  );
  expect(screen.getByText(/2 of 3 questions left today/)).toBeInTheDocument();
  expect(window.turnstile?.reset).not.toHaveBeenCalled();
  expect(window.turnstile?.remove).toHaveBeenCalledWith('guest-widget');
  // The question sits in the thread above the answer, and the box is clear for the next one.
  expect(screen.getByText('Describe this public project')).toBeInTheDocument();
  expect(box()).toHaveValue('');
});

it('sends with Enter, and breaks the line with Shift+Enter', async () => {
  await ready();
  fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
  expect(mock).not.toHaveBeenCalledWith('/guest/questions', expect.anything());
  fireEvent.keyDown(box(), { key: 'Enter' });
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
});

it('shows the question and "Vivi is answering" while waiting', async () => {
  mock.mockImplementation(async (path: string) =>
    path.startsWith('/guest/runs/') ? new Promise(() => undefined) : response(path)
  );
  await ready('What is this?');
  send();
  expect(await screen.findByText('Vivi is answering…')).toBeInTheDocument();
  expect(screen.getByText('What is this?')).toBeInTheDocument();
  expect(box()).toBeDisabled();
});

it('keeps the conversation in this browser, so it is there again on another day', async () => {
  await ready();
  send();
  await screen.findByText('A public project answer');
  expect(JSON.parse(localStorage.getItem('visin.guest.vivi')!)).toMatchObject([
    { question: 'Describe this public project', answer: 'A public project answer', at: expect.any(Number) }
  ]);
  cleanup();
  mount();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
  expect(screen.getByText('Describe this public project')).toBeInTheDocument();
  // With a conversation under way, the examples have done their job.
  expect(screen.queryByRole('button', { name: 'Which data does it use?' })).not.toBeInTheDocument();
});

it('lets a month-old conversation go, and keeps a recent one', async () => {
  const now = Date.now();
  STORED([
    { id: 'old', question: 'Long ago', answer: 'Forgotten', project: 'P', at: now - KEPT_FOR_MS - 1000 },
    { id: 'recent', question: 'Last week', answer: 'Remembered', project: 'P', at: now - 7 * 86400000 }
  ]);
  mount();
  expect(await screen.findByText('Remembered')).toBeInTheDocument();
  expect(screen.queryByText('Forgotten')).not.toBeInTheDocument();
});

it('survives storage that cannot be read or written', async () => {
  localStorage.setItem('visin.guest.vivi', '{not json');
  mount();
  expect(await screen.findByText(/Hi, I'm Vivi/)).toBeInTheDocument();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  fireEvent.change(box(), { target: { value: 'Still works' } });
  await act(async () => verify('token'));
  send();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
});

it.each([
  ['session', /used today's 3 questions. Sign in to keep going/],
  ['network', /Too many questions have come from your network/],
  ['burst', /asking quickly/],
  ['capacity', /busy answering other visitors/],
  ['shared', /paused right now/]
])('has Vivi say which limit applies (%s), and keeps what they typed', async (reason, message) => {
  refuse(new ApiError(429, 'limited', { reason, resetAt: '2026-11-11T00:00:00Z' }));
  await ready();
  send();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(box()).toHaveValue('Describe this public project');
  expect(box()).toBeEnabled();
});

it('asks again as a new question after a limit, so the old refusal is not handed back', async () => {
  let limited = true;
  mock.mockImplementation(async (path: string) => {
    if (path === '/guest/questions' && limited) throw new ApiError(429, 'limited', { reason: 'burst' });
    return response(path);
  });
  await ready();
  send();
  await screen.findByText(/asking quickly/);
  limited = false;
  await act(async () => verify('again'));
  send();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
  const keys = mock.mock.calls.filter(([path]) => path === '/guest/questions').map(([, body]) => body.idempotencyKey);
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

it('keeps what another tab added to the conversation', async () => {
  await ready();
  STORED([
    { id: 'other-tab', question: 'From the other tab', answer: 'Other answer', project: 'P', at: Date.now() - 1000 }
  ]);
  send();
  await screen.findByText('A public project answer');
  const stored = JSON.parse(localStorage.getItem('visin.guest.vivi')!) as { id: string }[];
  expect(stored.map((item) => item.id)).toEqual(['other-tab', 'guest-run']);
});

it('never promises that signing in lifts a shared pause', async () => {
  refuse(new ApiError(429, 'limited', { reason: 'shared' }));
  await ready();
  send();
  const text = (await screen.findByText(/paused right now/)).textContent;
  expect(text).not.toMatch(/sign in/i);
});

it('asks for the check again when verification was refused', async () => {
  refuse(new ApiError(403, 'Complete the guest verification again'));
  await ready();
  send();
  expect(await screen.findByText('Please complete the check again.')).toBeInTheDocument();
  expect(box()).toHaveValue('Describe this public project');
});

it("shows a failed run as Vivi's message and puts the question back to try again", async () => {
  mock.mockImplementation(async (path: string) =>
    path.startsWith('/guest/runs/') ? { state: 'failed', error: 'Reserved allowance retained' } : response(path)
  );
  await ready();
  send();
  expect(await screen.findByText('Reserved allowance retained')).toBeInTheDocument();
  expect(box()).toHaveValue('Describe this public project');
});

it('reuses the submission key when reconnecting after a polling failure', async () => {
  let polls = 0;
  mock.mockImplementation(async (path: string) => {
    if (path.startsWith('/guest/runs/') && polls++ === 0) throw new Error('Connection interrupted');
    return response(path);
  });
  await ready();
  send();
  expect(await screen.findByText('Connection interrupted')).toBeInTheDocument();
  await act(async () => verify('new-challenge'));
  send();
  expect(await screen.findByText('A public project answer')).toBeInTheDocument();
  const keys = mock.mock.calls.filter(([path]) => path === '/guest/questions').map(([, body]) => body.idempotencyKey);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

it('follows the project a page asks about', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Message Vivi' });
  expect(screen.getByText(/Ready when you are: Public research/)).toBeInTheDocument();
  act(() => rememberRequestedProject({ kind: 'project', projectId: 'other-project', title: 'Another one' }));
  expect(screen.getByText(/Ready when you are: Another one/)).toBeInTheDocument();
});

it('follows page context and clears it when leaving the project', async () => {
  await ready();
  act(() =>
    window.dispatchEvent(
      new CustomEvent('visin:page-context', {
        detail: { projectId: 'route-project', title: 'Route project' }
      })
    )
  );
  send();
  await screen.findByText('A public project answer');
  expect(mock).toHaveBeenCalledWith('/guest/questions', expect.objectContaining({ projectId: 'route-project' }));
  act(() => window.dispatchEvent(new CustomEvent('visin:page-context', { detail: null })));
  expect(screen.getByText(/Name a project in your question/)).toBeInTheDocument();
});

it('cleans up the verification widget when the chat closes', async () => {
  const remove = window.turnstile!.remove;
  await ready();
  cleanup();
  expect(remove).toHaveBeenCalledWith('guest-widget');
});

it('accepts ordinary public project links without fetching arbitrary URLs', () => {
  expect(projectIdentifier('https://app.example.test/projects/public-research?view=results')).toBe('public-research');
  expect(projectIdentifier(projectId)).toBe(projectId);
  expect(projectIdentifier('https://app.example.test/datasets/private')).toBeNull();
  expect(projectIdentifier('https://app.example.test/projects/')).toBeNull();
  expect(projectIdentifier('https://[invalid/projects/test')).toBeNull();
  expect(projectIdentifier('file://app/projects/test')).toBeNull();
});

it('uses discovery prompts without page context', async () => {
  forgetRequestedProject();
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Find public computer vision projects' }));
  expect(box()).toHaveValue('Find public computer vision projects');
});

it('uses a new submission key if the page changes after an uncertain failure', async () => {
  let fails = true;
  mock.mockImplementation(async (path: string) => {
    if (path === '/guest/questions' && fails) throw new Error('Connection interrupted');
    return response(path);
  });
  await ready();
  send();
  await screen.findByText('Connection interrupted');
  act(() => rememberRequestedProject({ projectId: 'different-project', title: 'Different project' }));
  fails = false;
  await act(async () => verify('fresh-token'));
  send();
  await screen.findByText('A public project answer');
  const bodies = mock.mock.calls.filter(([path]) => path === '/guest/questions').map(([, body]) => body);
  expect(bodies[0].idempotencyKey).not.toBe(bodies[1].idempotencyKey);
  expect(bodies[1].projectId).toBe('different-project');
});
