import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, isAuthenticated: false }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
const service = vi.hoisted(() => ({ listPublic: vi.fn(), listMine: vi.fn(), authorshipRequests: vi.fn(), answerAuthorship: vi.fn(), restore: vi.fn() }));
vi.mock('../services/paperService', () => ({ paperService: service }));

import PapersPage from './PapersPage';
import { renderWithClient } from '../test/renderWithClient';
import type { PaperCard } from '../types/paper';

const card = (overrides: Partial<PaperCard> = {}): PaperCard => ({
  id: 'pa1',
  title: 'Night segmentation',
  abstract: 'We measure how segmentation holds up in the dark.',
  authors: [{ name: 'Ann Lee' }, { name: 'Bo Wu' }],
  venue: 'CVPR',
  year: 2025,
  tags: ['segmentation'],
  owner: { kind: 'user', id: 'u1' },
  visibility: 'public',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  results: { cited: 2, available: 2 },
  ...overrides
});
const page = (papers: PaperCard[], pages = 1) => ({ papers, pagination: { page: 1, limit: 12, total: papers.length, pages } });

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = null;
  auth.isAuthenticated = false;
  service.listPublic.mockResolvedValue(page([card()]));
  service.listMine.mockResolvedValue([]);
  service.authorshipRequests.mockResolvedValue([]);
});

describe('PapersPage', () => {
  it('lists the public papers for a visitor, each leading to its page, with no way to add one', async () => {
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

    const link = await screen.findByRole('link', { name: 'Night segmentation' });
    expect(link).toHaveAttribute('href', '/papers/pa1');
    expect(screen.getByText('Ann Lee, Bo Wu')).toBeInTheDocument();
    expect(screen.getByText('CVPR · 2025')).toBeInTheDocument();
    expect(screen.getByText('Cites 2 Visin results')).toBeInTheDocument();
    expect(screen.getByText('segmentation')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add paper/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yours' })).not.toBeInTheDocument();
    expect(service.listPublic).toHaveBeenCalledWith({ search: undefined, sort: 'created', page: 1, limit: 12 });
    expect(service.authorshipRequests).not.toHaveBeenCalled();
    expect(document.title).toBe('Papers');
  });

  it('says how much of a paper is still public, and what has none cited', async () => {
    service.listPublic.mockResolvedValue(
      page([card({ results: { cited: 3, available: 1 } }), card({ id: 'pa2', title: 'Another', results: { cited: 1, available: 1 } }), card({ id: 'pa3', title: 'Bare', results: { cited: 0, available: 0 } })])
    );
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

    expect(await screen.findByText('Cites 3 Visin results · 1 public')).toBeInTheDocument();
    expect(screen.getByText('Cites 1 Visin result')).toBeInTheDocument();
    expect(screen.getByText('Cites no Visin results')).toBeInTheDocument();
  });

  it('searches from its own box, keeping the words in the address and asking for them', async () => {
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });
    await screen.findByText('Night segmentation');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search papers' }), '2401.01234{enter}');

    await waitFor(() => expect(service.listPublic).toHaveBeenLastCalledWith({ search: '2401.01234', sort: 'created', page: 1, limit: 12 }));
  });

  it('orders by publication year when asked', async () => {
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });
    await screen.findByText('Night segmentation');

    await userEvent.click(screen.getByRole('combobox', { name: 'Order' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Publication year' }));

    await waitFor(() => expect(service.listPublic).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'year' })));
  });

  it('pages through the catalogue', async () => {
    service.listPublic.mockResolvedValue(page([card()], 3));
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });
    await screen.findByText('Night segmentation');

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Paper pages' })).getByRole('button', { name: 'Go to page 2' }));

    await waitFor(() => expect(service.listPublic).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('says when there are none, and when a search finds none', async () => {
    service.listPublic.mockResolvedValue(page([]));
    const { unmount } = renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });
    expect(await screen.findByText('No papers yet')).toBeInTheDocument();
    unmount();

    renderWithClient(<PapersPage />, { path: '/papers?q=zzz', route: '/papers' });
    expect(await screen.findByText('No papers match your search')).toBeInTheDocument();
  });

  it('says what failed', async () => {
    service.listPublic.mockRejectedValue(new Error('down'));
    renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

    expect(await screen.findByText('down')).toBeInTheDocument();
  });

  describe('signed in', () => {
    beforeEach(() => {
      auth.user = { id: 'me1' };
      auth.isAuthenticated = true;
    });

    it('offers to add a paper', async () => {
      renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

      expect(await screen.findAllByRole('link', { name: /Add paper/ })).not.toHaveLength(0);
    });

    it('lists their own papers, drafts too, narrowed by what they type', async () => {
      service.listMine.mockResolvedValue([card({ id: 'd1', title: 'My draft', visibility: 'private' }), card({ id: 'd2', title: 'Other work' })]);
      renderWithClient(<PapersPage />, { path: '/papers?tab=yours', route: '/papers' });

      expect(await screen.findByText('My draft')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yours' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search papers' }), 'draft{enter}');
      await waitFor(() => expect(screen.queryByText('Other work')).not.toBeInTheDocument());
      expect(screen.getByText('My draft')).toBeInTheDocument();
    });

    it('shows the trash and brings a paper back from it', async () => {
      service.listMine.mockResolvedValue([card({ id: 'd1', title: 'Gone paper' })]);
      service.restore.mockResolvedValue(card());
      renderWithClient(<PapersPage />, { path: '/papers?tab=yours', route: '/papers' });
      await screen.findByText('Gone paper');

      await userEvent.click(screen.getByRole('button', { name: 'Trash' }));
      await waitFor(() => expect(service.listMine).toHaveBeenLastCalledWith('trash'));
      await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));

      await waitFor(() => expect(service.restore.mock.calls[0][0]).toBe('d1'));
    });

    it('says when they have none of their own', async () => {
      renderWithClient(<PapersPage />, { path: '/papers?tab=yours', route: '/papers' });
      expect(await screen.findByText('You have no papers yet')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Add a paper' })).toHaveAttribute('href', '/papers/new');
    });

    it('goes back to everyone’s papers', async () => {
      renderWithClient(<PapersPage />, { path: '/papers?tab=yours', route: '/papers' });
      await screen.findByText('You have no papers yet');

      await userEvent.click(screen.getByRole('button', { name: 'All papers' }));

      expect(await screen.findByText('Night segmentation')).toBeInTheDocument();
    });

    it('asks whether they are the author a paper names, and records either answer', async () => {
      service.authorshipRequests.mockResolvedValue([
        card({ id: 'r1', title: 'Names me', authors: [{ name: 'M. Roe', status: 'pending', user: { id: 'me1' } }] }),
        card({ id: 'r2', title: 'Names me too', authors: [{ name: 'Mia R.', status: 'pending', user: { id: 'me1' } }] })
      ]);
      service.answerAuthorship.mockResolvedValue(undefined);
      renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

      expect(await screen.findByText('Is this you?')).toBeInTheDocument();
      expect(screen.getByText('Names me')).toBeInTheDocument();
      expect(screen.getByText(/“M\. Roe”/)).toBeInTheDocument();

      await userEvent.click(screen.getAllByRole('button', { name: 'That’s me' })[0]);
      await waitFor(() => expect(service.answerAuthorship).toHaveBeenCalledWith('r1', true));
      await userEvent.click(screen.getAllByRole('button', { name: 'Not me' })[1]);
      await waitFor(() => expect(service.answerAuthorship).toHaveBeenCalledWith('r2', false));
    });

    it('says when an answer could not be saved', async () => {
      service.authorshipRequests.mockResolvedValue([card({ id: 'r1', authors: [{ name: 'M', status: 'pending', user: { id: 'me1' } }] })]);
      service.answerAuthorship.mockRejectedValue(new Error('not allowed'));
      renderWithClient(<PapersPage />, { path: '/papers', route: '/papers' });

      await userEvent.click(await screen.findByRole('button', { name: 'That’s me' }));

      expect(await screen.findByText('not allowed')).toBeInTheDocument();
    });
  });
});
