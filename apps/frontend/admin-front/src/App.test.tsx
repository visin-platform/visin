import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@visin/frontend-core';
import { renderPage } from './test/render';
import App from './App';
import { admin } from './services/admin';

vi.mock('./services/admin', () => ({ admin: vi.fn() }));
const config = vi.hoisted(() => ({
  SHELL_FRONT_URL: 'https://visin.example.test' as string | undefined,
  GRAFANA_URL: 'https://grafana.example.test' as string | undefined
}));
vi.mock('./config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
const auth = vi.hoisted(() => ({
  user: { id: 'a1', name: 'Ada Lovelace', email: 'ada@example.test' } as { id: string; name: string; email: string } | null,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(async () => undefined)
}));
vi.mock('./contexts/AuthContext', () => ({ useAuth: () => auth }));
// The sections are tested on their own; here each only has to be the one routed to.
vi.mock('./Users', () => ({ default: () => <p>Users section</p> }));
vi.mock('./Runs', () => ({ default: () => <p>Runs section</p> }));
vi.mock('./Policies', () => ({ default: () => <p>Policies section</p> }));
vi.mock('./Audit', () => ({ default: () => <p>History section</p> }));
vi.mock('./components/tabs/AnalystSetup', () => ({ default: () => <p>Setup section</p> }));
vi.mock('./components/tabs/AnalystUsage', () => ({ default: () => <p>Usage section</p> }));

beforeEach(() => {
  vi.clearAllMocks();
  config.SHELL_FRONT_URL = 'https://visin.example.test';
  config.GRAFANA_URL = 'https://grafana.example.test';
  auth.user = { id: 'a1', name: 'Ada Lovelace', email: 'ada@example.test' };
  auth.isAuthenticated = true;
  auth.isLoading = false;
  vi.mocked(admin).mockResolvedValue({ id: 'a1' });
});
afterEach(() => vi.restoreAllMocks());

it('asks a visitor to sign in, and offers the way back to Visin', () => {
  auth.user = null;
  auth.isAuthenticated = false;
  renderPage(<App />);
  expect(screen.getByRole('heading', { name: 'Sign in to administer Visin' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(auth.login).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Back to Visin' })).toHaveAttribute('href', 'https://visin.example.test');
  expect(admin).not.toHaveBeenCalled();
});

it('waits for the session check rather than flashing the sign-in page', () => {
  auth.isLoading = true;
  auth.isAuthenticated = false;
  renderPage(<App />);
  expect(screen.getByRole('heading', { name: 'Checking your access…' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
});

it('says plainly that the account is not an administrator, and lets them sign out', async () => {
  vi.mocked(admin).mockRejectedValue(new ApiError(403, 'Platform administrator access required'));
  renderPage(<App />);
  expect(await screen.findByRole('heading', { name: 'This account is not a platform administrator' })).toBeInTheDocument();
  expect(screen.getByText(/signed in as ada@example.test/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(auth.logout).toHaveBeenCalledTimes(1);
});

it('reports an unreachable Admin API with a retry, not as a refusal', async () => {
  vi.mocked(admin).mockRejectedValueOnce(new ApiError(503, 'Administrator access cannot be checked right now'));
  renderPage(<App />);
  expect(await screen.findByRole('heading', { name: 'Administration is not reachable' })).toBeInTheDocument();
  expect(screen.getByText('Administrator access cannot be checked right now')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Users section')).toBeInTheDocument();
});

it('opens on Users for an administrator, with the Visin menu, Back to Visin and Grafana', async () => {
  renderPage(<App />);
  expect(await screen.findByText('Users section')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Visin' })).toHaveAttribute('href', 'https://visin.example.test');
  expect(screen.getByRole('link', { name: 'Grafana' })).toHaveAttribute('target', '_blank');
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  expect(screen.getByText('ada@example.test')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(auth.logout).toHaveBeenCalledTimes(1);
});

it('lists Vivi\'s sections together and shows the one in the address', async () => {
  renderPage(<App />, '/runs');
  expect(await screen.findByText('Runs section')).toBeInTheDocument();
  for (const name of ['Setup', 'Access and limits', 'Tokens and cost', 'Runs'])
    expect(screen.getByRole('link', { name })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Tokens and cost' }));
  expect(await screen.findByText('Usage section')).toBeInTheDocument();
});

it.each([
  ['/?view=vivi', 'Setup section'],
  ['/?view=audit', 'History section'],
  ['/?view=runs&userId=abc', 'Runs section'],
  ['/?view=unknown', 'Users section'],
  ['/nowhere', 'Users section']
])('sends the old address %s to its section', async (route, text) => {
  renderPage(<App />, route);
  await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
});

it('leaves out the links it has no address for', async () => {
  config.SHELL_FRONT_URL = undefined;
  config.GRAFANA_URL = undefined;
  renderPage(<App />);
  await screen.findByText('Users section');
  expect(screen.queryByRole('link', { name: 'Back to Visin' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Grafana' })).not.toBeInTheDocument();
});
