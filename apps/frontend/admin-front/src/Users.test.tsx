import { expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from './test/render';
import Users from './Users';
import { admin } from './services/admin';
vi.mock('./services/admin', () => ({ admin: vi.fn() }));
vi.mock('./config/ConfigProvider', () => ({ useConfig: () => ({ AUTH_FRONT_URL: 'https://auth.example.test' }) }));
it('shows account state and offers user management', async () => {
  vi.mocked(admin).mockResolvedValue({
    users: [{ _id: '123', email: 'alice@example.test', roles: [], status: 'suspended' }],
    total: 1,
    pageSize: 30
  });
  renderPage(<Users />);
  expect(await screen.findByText('alice@example.test')).toBeInTheDocument();
  expect(screen.getByText('suspended')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
});

it('pins the account revision being edited when background data changes', async () => {
  const id = '111111111111111111111111';
  const fresh = {
    _id: id,
    email: 'user@example.test',
    roles: [],
    status: 'active',
    firstName: 'Fresh',
    adminRevision: 2,
    history: []
  };
  const mock = admin as unknown as import('vitest').Mock;
  mock.mockImplementation(async (path: string, method = 'GET') => {
    if (method === 'PUT') throw new Error('Account changed; reload before editing');
    if (path === '/users?page=1')
      return { users: [{ ...fresh, firstName: 'Old', adminRevision: 1 }], total: 1, pageSize: 30 };
    if (path === `/users/${id}`) return fresh;
    return [];
  });
  const { client: cache } = renderPage(<Users />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
  expect(await screen.findByDisplayValue('Fresh')).toBeInTheDocument();
  await act(async () => {
    cache.setQueryData(['admin-user', id], { ...fresh, firstName: 'External change', adminRevision: 3 });
  });
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Edited' } });
  fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: 'Correct profile' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Account changed; reload before editing')).toBeInTheDocument();
  expect(mock).toHaveBeenCalledWith(
    `/users/${id}`,
    'PUT',
    { revision: 2, firstName: 'Edited', reason: 'Correct profile' }
  );
});

it('keeps Save disabled until something changes and confirms deactivation by email', async () => {
  const id = '333333333333333333333333';
  const account = { _id: id, email: 'bob@example.test', roles: [], status: 'active', adminRevision: 0, history: [] };
  vi.mocked(admin).mockImplementation((async (path: string) => {
    if (path.startsWith('/users?')) return { users: [account], total: 1, pageSize: 30 };
    if (path === `/users/${id}`) return account;
    return [];
  }) as typeof admin);
  renderPage(<Users />);
  fireEvent.click(await screen.findByRole('button', { name: 'Manage' }));
  fireEvent.change(await screen.findByLabelText(/Reason for change/), { target: { value: 'Review' } });
  const save = screen.getByRole('button', { name: 'Save changes' });
  expect(save).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Account status' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Suspended' }));
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Type the user's email to confirm"), { target: { value: 'bob@example.test' } });
  expect(save).toBeEnabled();
});

it('opens one person from a link elsewhere in Administration, and closing it leaves the link behind', async () => {
  const id = '555555555555555555555555';
  const account = { _id: id, email: 'eve@example.test', roles: [], status: 'active', adminRevision: 0, history: [] };
  vi.mocked(admin).mockImplementation((async (path: string) => {
    if (path.startsWith('/users?')) return { users: [], total: 0, pageSize: 30 };
    if (path === `/users/${id}`) return account;
    return [];
  }) as typeof admin);
  renderPage(<Users />, `/users?open=${id}`);
  expect(await screen.findByRole('dialog')).toHaveTextContent('eve@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('says when the account behind a link cannot be opened', async () => {
  vi.mocked(admin).mockImplementation((async (path: string) => {
    if (path.startsWith('/users?')) return { users: [], total: 0, pageSize: 30 };
    if (path.startsWith('/users/55')) throw new Error('User not found');
    return [];
  }) as typeof admin);
  renderPage(<Users />, '/users?open=555555555555555555555555');
  expect(await screen.findByText(/That account could not be opened: User not found/)).toBeInTheDocument();
});

it('says so when a search finds no one, and offers everyone again', async () => {
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.startsWith('/users?') ? { users: [], total: 0, pageSize: 30 } : []) as typeof admin);
  renderPage(<Users />);
  fireEvent.change(await screen.findByLabelText('Find users'), { target: { value: 'nobody' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByText('No one matches that search')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
  expect(await screen.findByText('No users yet')).toBeInTheDocument();
});

it('shows roles and status as chips, and which page of how many', async () => {
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.startsWith('/users?')
      ? {
          users: [{ _id: '1'.repeat(24), email: 'ada@example.test', firstName: 'Ada', roles: ['admin'], status: 'active' }],
          total: 45,
          pageSize: 30
        }
      : []) as typeof admin);
  renderPage(<Users />);
  expect(await screen.findByText('Ada')).toBeInTheDocument();
  expect(screen.getByText('admin')).toBeInTheDocument();
  expect(screen.getByText('active')).toBeInTheDocument();
  expect(screen.getByText(/45 users · showing 1–30/)).toBeInTheDocument();
});
