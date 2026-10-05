import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: null as { id: string } | null, isAuthenticated: false }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
const service = vi.hoisted(() => ({ get: vi.fn(), trash: vi.fn(), answerAuthorship: vi.fn(), shareUrl: (id: string) => `https://api.test/share/${id}` }));
vi.mock('../services/paperService', () => ({ paperService: service }));

import PaperDetailPage from './PaperDetailPage';
import { renderWithClient } from '../test/renderWithClient';
import type { Paper } from '../types/paper';

const paper = (overrides: Partial<Paper> = {}): Paper => ({
  id: 'pa1',
  title: 'Night segmentation',
  abstract: 'We measure how segmentation holds up in the dark.',
  authors: [{ name: 'Ann Lee', status: 'confirmed', user: { id: 'u1', handle: 'ann' } }, { name: 'Bo Wu' }],
  venue: 'CVPR',
  year: 2025,
  arxivId: '2401.01234',
  url: 'https://example.test/paper',
  tags: ['segmentation'],
  owner: { kind: 'user', id: 'u1', name: 'Ann Lee' },
  visibility: 'public',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  results: [
    { kind: 'project', available: true, ref: 'p1', name: 'Night seg', note: 'Table 1' },
    { kind: 'project', available: false }
  ],
  ...overrides
});
const open = () => renderWithClient(<PaperDetailPage />, { path: '/papers/pa1', route: '/papers/:id' });

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = null;
  auth.isAuthenticated = false;
  service.get.mockResolvedValue(paper());
});

describe('PaperDetailPage', () => {
  it('shows a public paper to a visitor: who wrote it, where to read it, what it cites', async () => {
    open();

    expect(await screen.findByRole('heading', { level: 1, name: 'Night segmentation' })).toBeInTheDocument();
    expect(screen.getByText(/Ann Lee, Bo Wu/)).toBeInTheDocument();
    expect(screen.getByText('CVPR · 2025')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /arXiv:2401.01234/ })).toHaveAttribute('href', 'https://arxiv.org/abs/2401.01234');
    expect(screen.getByText('We measure how segmentation holds up in the dark.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Night seg' })).toHaveAttribute('href', '/projects/p1');
    expect(screen.getByText('Project no longer public')).toBeInTheDocument();
    expect(screen.getByText('segmentation')).toBeInTheDocument();
    expect(screen.getByText(/has not re-run it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit paper' })).not.toBeInTheDocument();
    expect(document.title).toBe('Night segmentation');
  });

  it('says so when a paper cites nothing, and leaves out what it does not have', async () => {
    service.get.mockResolvedValue(paper({ results: [], abstract: undefined, venue: undefined, year: undefined, tags: [], arxivId: undefined, url: undefined }));
    open();

    expect(await screen.findByText('This paper does not cite any results recorded on Visin.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Abstract' })).not.toBeInTheDocument();
  });

  it('says the paper is not found, which is also how a draft reads to others', async () => {
    service.get.mockRejectedValue(new Error('Paper not found'));
    open();

    expect(await screen.findByText('Paper not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All papers' })).toHaveAttribute('href', '/papers');
  });

  it('lets someone who manages it edit it and move it to the trash', async () => {
    auth.user = { id: 'u1' };
    auth.isAuthenticated = true;
    service.get.mockResolvedValue(paper({ visibility: 'private', permissions: { read: true, contribute: true, manage: true, own: true } }));
    service.trash.mockResolvedValue(undefined);
    open();

    expect(await screen.findByText(/This is a draft/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit paper' })).toHaveAttribute('href', '/papers/pa1/edit');

    await userEvent.click(screen.getByRole('button', { name: 'Move paper to trash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(service.trash).toHaveBeenCalledWith('pa1'));
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  });

  it('says the draft belongs to a group when it does', async () => {
    auth.user = { id: 'u1' };
    service.get.mockResolvedValue(paper({ visibility: 'private', owner: { kind: 'group', id: 'g1' }, permissions: { read: true, contribute: true, manage: false, own: false } }));
    open();

    expect(await screen.findByText(/and your group’s members/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit paper' })).not.toBeInTheDocument();
  });

  it('says when the paper could not be deleted', async () => {
    auth.user = { id: 'u1' };
    service.get.mockResolvedValue(paper({ permissions: { read: true, contribute: true, manage: true, own: true } }));
    service.trash.mockRejectedValue(new Error('nope'));
    open();

    await userEvent.click(await screen.findByRole('button', { name: 'Move paper to trash' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('nope')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  });

  describe('named as an author', () => {
    beforeEach(() => {
      auth.user = { id: 'me1' };
      auth.isAuthenticated = true;
      service.answerAuthorship.mockResolvedValue(undefined);
    });

    it('asks to confirm, and records the answer', async () => {
      service.get.mockResolvedValue(paper({ authors: [{ name: 'M. Roe', status: 'pending', user: { id: 'me1' } }] }));
      open();

      expect(await screen.findByText(/lists “M\. Roe” as your account/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'That’s me' }));
      await waitFor(() => expect(service.answerAuthorship).toHaveBeenCalledWith('pa1', true));
      await userEvent.click(screen.getByRole('button', { name: 'Not me' }));
      await waitFor(() => expect(service.answerAuthorship).toHaveBeenCalledWith('pa1', false));
    });

    it('lets a confirmed author take their name off', async () => {
      service.get.mockResolvedValue(paper({ authors: [{ name: 'M. Roe', status: 'confirmed', user: { id: 'me1', handle: 'mia' } }] }));
      open();

      expect(await screen.findByText(/this paper is on your page/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Remove my name' }));
      await waitFor(() => expect(service.answerAuthorship).toHaveBeenCalledWith('pa1', false));
    });

    it('says when removing it failed', async () => {
      service.get.mockResolvedValue(paper({ authors: [{ name: 'M. Roe', status: 'confirmed', user: { id: 'me1' } }] }));
      service.answerAuthorship.mockRejectedValue(new Error('x'));
      open();

      await userEvent.click(await screen.findByRole('button', { name: 'Remove my name' }));

      expect(await screen.findByText('Could not save your answer')).toBeInTheDocument();
    });
  });
});
