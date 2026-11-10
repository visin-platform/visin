import { expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from './test/render';
import Policies from './Policies';
import { admin } from './services/admin';

vi.mock('./services/admin', () => ({ admin: vi.fn() }));

const GLOBAL_SETTINGS = {
  enabled: true,
  dailyRequestLimit: 100,
  dailyTokenLimit: 800000,
  guestEnabled: false,
  guestSessionRequests: 3,
  guestNetworkRequests: 10,
  guestGlobalRequests: 100,
  guestDailyBudgetMicros: 0,
  guestMonthlyBudgetMicros: 0
};

const READY = { botCheck: true, networkSecret: true, trustedProxy: true, visionService: true };

/** The policy answers every policy path; the name lookup, which Policies also makes, finds nobody. */
const answerWith = (policy: unknown) =>
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.startsWith('/users/lookup') ? [] : policy) as typeof admin);

it('keeps anonymous Vivi off until it is toggled and saved', async () => {
  answerWith({ id: 'global', revision: 0, settings: GLOBAL_SETTINGS, history: [] });
  renderPage(<Policies />);
  const guest = await screen.findByRole('switch', { name: 'Anonymous Vivi enabled' });
  expect(guest).not.toBeChecked();
  // Nothing to save yet, so no save bar; toggling changes only the form, and says nothing is applied until saved.
  expect(screen.queryByRole('button', { name: 'Save policy' })).not.toBeInTheDocument();
  fireEvent.click(guest);
  expect(await screen.findByText(/nothing is applied until you save/)).toBeInTheDocument();
  expect(admin).not.toHaveBeenCalledWith('/vivi/admin/policies', 'PUT', expect.anything());
  expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled();
});

it('needs no note to save, but names what anonymous Vivi still lacks while Save is grey', async () => {
  answerWith({ id: 'global', revision: 0, settings: GLOBAL_SETTINGS, guestSetup: READY, history: [] });
  renderPage(<Policies />);
  fireEvent.click(await screen.findByRole('switch', { name: 'Anonymous Vivi enabled' }));
  expect(screen.getByText(/Still to do: Daily spend ceiling, Monthly spend ceiling/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled();
});

it('saves a change with no note', async () => {
  answerWith({ id: 'global', revision: 2, settings: GLOBAL_SETTINGS, guestSetup: READY, history: [] });
  renderPage(<Policies />);
  fireEvent.click(await screen.findByRole('switch', { name: 'Vivi access enabled' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
  await waitFor(() =>
    expect(admin).toHaveBeenCalledWith('/vivi/admin/policies', 'PUT', {
      revision: 2,
      settings: { ...GLOBAL_SETTINGS, enabled: false },
      reason: ''
    })
  );
});

it('puts a discarded change back, and hides the save bar again', async () => {
  answerWith({ id: 'global', revision: 0, settings: GLOBAL_SETTINGS, guestSetup: READY, history: [] });
  renderPage(<Policies />);
  const vivi = await screen.findByRole('switch', { name: 'Vivi access enabled' });
  fireEvent.click(vivi);
  expect(vivi).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(vivi).toBeChecked();
  expect(screen.queryByRole('button', { name: 'Save policy' })).not.toBeInTheDocument();
});

it('confirms a saved policy with a message that outlives the form it replaced', async () => {
  const saved = { id: 'global', revision: 1, settings: { ...GLOBAL_SETTINGS, enabled: false }, guestSetup: READY, history: [] };
  vi.mocked(admin).mockImplementation((async (path: string, method = 'GET') =>
    path.startsWith('/users/lookup') ? [] : method === 'PUT' ? saved : { ...saved, revision: 0, settings: GLOBAL_SETTINGS }) as typeof admin);
  renderPage(<Policies />);
  fireEvent.click(await screen.findByRole('switch', { name: 'Vivi access enabled' }));
  fireEvent.change(screen.getByLabelText(/Note \(optional\)/), { target: { value: 'Pause' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
  expect(await screen.findByText(/Policy saved/)).toBeInTheDocument();
});

it('edits only what a user policy overrides and shows what it inherits', async () => {
  const id = '444444444444444444444444';
  answerWith({
    id,
    revision: 1,
    settings: { dailyRequestLimit: 5 },
    inherited: GLOBAL_SETTINGS,
    effective: { ...GLOBAL_SETTINGS, dailyRequestLimit: 5 },
    history: []
  });
  renderPage(<Policies />, `/policies?userId=${id}`);
  expect(await screen.findByText('Follows global: 800,000')).toBeInTheDocument();
  expect(screen.queryByRole('switch', { name: 'Anonymous Vivi enabled' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Questions per UTC day'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText(/Note \(optional\)/), { target: { value: 'Back to default' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
  await waitFor(() =>
    expect(admin).toHaveBeenCalledWith(`/vivi/admin/policies/${id}`, 'PUT', {
      revision: 1,
      settings: {},
      reason: 'Back to default'
    })
  );
});

it('names the person a user policy is for, linking to their account', async () => {
  const id = '444444444444444444444444';
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.startsWith('/users/lookup')
      ? [{ id, email: 'ada@example.test', name: 'Ada Lovelace' }]
      : {
          id,
          revision: 0,
          settings: {},
          inherited: GLOBAL_SETTINGS,
          effective: GLOBAL_SETTINGS,
          history: []
        }) as typeof admin);
  renderPage(<Policies />, `/policies?userId=${id}`);
  const link = await screen.findByRole('link', { name: 'Ada Lovelace (ada@example.test)' });
  expect(link).toHaveAttribute('href', `/users?open=${id}`);
});

it('edits guest spend ceilings in dollars and stores millionths', async () => {
  const settings = { ...GLOBAL_SETTINGS, guestDailyBudgetMicros: 2500000 };
  answerWith({ id: 'global', revision: 3, settings, history: [] });
  renderPage(<Policies />);
  expect(await screen.findByLabelText('Guest daily spend ceiling (USD)')).toHaveValue(2.5);
  fireEvent.change(screen.getByLabelText('Guest monthly spend ceiling (USD)'), { target: { value: '40' } });
  fireEvent.change(screen.getByLabelText(/Note \(optional\)/), { target: { value: 'Approved allowance' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
  await waitFor(() =>
    expect(admin).toHaveBeenCalledWith(
      '/vivi/admin/policies',
      'PUT',
      expect.objectContaining({ settings: { ...settings, guestMonthlyBudgetMicros: 40000000 } })
    )
  );
});

it('lists what is missing for anonymous Vivi, with how to fix each, and blocks saving it as on', async () => {
  answerWith({
    id: 'global',
    revision: 0,
    settings: GLOBAL_SETTINGS,
    guestSetup: { ...READY, botCheck: false },
    history: []
  });
  renderPage(<Policies />);
  expect(await screen.findByText('Before anonymous Vivi can be turned on')).toBeInTheDocument();
  expect(screen.getByText(/TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY in the chat service/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Anonymous Vivi enabled' }));
  fireEvent.change(screen.getByLabelText(/Note \(optional\)/), { target: { value: 'Try it' } });
  expect(screen.getByText(/cannot be saved as on yet\. Still to do: Bot check keys/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled();
});

it('ticks the spend ceilings off as they are set, then allows saving anonymous Vivi on', async () => {
  answerWith({ id: 'global', revision: 0, settings: GLOBAL_SETTINGS, guestSetup: READY, history: [] });
  renderPage(<Policies />);
  await screen.findByText('Before anonymous Vivi can be turned on');
  fireEvent.click(screen.getByRole('switch', { name: 'Anonymous Vivi enabled' }));
  fireEvent.change(screen.getByLabelText(/Note \(optional\)/), { target: { value: 'Try it' } });
  expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Guest daily spend ceiling (USD)'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Guest monthly spend ceiling (USD)'), { target: { value: '20' } });
  expect(await screen.findByText('Anonymous Vivi can be turned on')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save policy' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
  await waitFor(() =>
    expect(admin).toHaveBeenCalledWith(
      '/vivi/admin/policies',
      'PUT',
      expect.objectContaining({
        settings: expect.objectContaining({ guestEnabled: true, guestDailyBudgetMicros: 2000000, guestMonthlyBudgetMicros: 20000000 })
      })
    )
  );
});
