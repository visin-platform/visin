import { expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderPage } from './test/render';
import Audit from './Audit';
import { admin } from './services/admin';
vi.mock('./services/admin', () => ({ admin: vi.fn() }));
const entry = (id: string, status: string) => ({
  _id: id,
  actorId: 'admin-1',
  method: 'PUT',
  path: `/users/${id}`,
  status,
  createdAt: '2026-11-10T10:00:00.000Z'
});
it('flags unconfirmed writes and pages back through older changes', async () => {
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.includes('before=')
      ? { entries: [entry('older', 'completed')] }
      : { entries: [entry('newer', 'uncertain')], nextBefore: 'newer' }) as typeof admin);
  renderPage(<Audit />);
  expect(await screen.findByText(/were not confirmed by the owning service/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show older changes' }));
  expect(await screen.findByText(/\/users\/older/)).toBeInTheDocument();
  expect(admin).toHaveBeenLastCalledWith('/audit?limit=50&before=newer');
  expect(screen.queryByRole('button', { name: 'Show older changes' })).not.toBeInTheDocument();
});
