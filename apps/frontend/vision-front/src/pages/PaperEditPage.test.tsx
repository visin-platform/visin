import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';

const auth = vi.hoisted(() => ({
  user: null as { id: string; name: string; email: string } | null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn()
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
const groups = vi.hoisted(() => ({ data: [] as { id: string; name: string; role: string }[], isLoading: false, isError: false }));
vi.mock('../hooks/useProjectGroups', () => ({ useProjectGroups: () => groups }));
const service = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  searchPeople: vi.fn(),
  document: vi.fn(),
  uploadPdf: vi.fn(),
  removeUploadedPdf: vi.fn()
}));
vi.mock('../services/paperService', () => ({ paperService: service }));

import PaperEditPage from './PaperEditPage';
import { renderWithClient } from '../test/renderWithClient';
import type { Paper } from '../types/paper';

const saved = (overrides: Partial<Paper> = {}): Paper => ({
  id: 'pa1',
  title: 'Night segmentation',
  abstract: 'Abstract.',
  authors: [{ name: 'Ann Lee', status: 'confirmed', user: { id: 'me1', handle: 'ann', name: 'Ann Lee' } }, { name: 'Bo Wu', status: 'pending', user: { id: 'u2', handle: 'bo', name: 'Bo Wu' } }],
  venue: 'CVPR',
  year: 2025,
  arxivId: '2401.01234',
  doi: '10.1000/x',
  url: 'https://example.test/p',
  pdfUrl: 'https://example.test/p.pdf',
  tags: ['segmentation'],
  owner: { kind: 'user', id: 'me1' },
  visibility: 'public',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z',
  permissions: { read: true, contribute: true, manage: true, own: true },
  results: [{ kind: 'project', available: true, ref: 'p1', name: 'Night seg', note: 'Table 1' }, { kind: 'project', available: false, ref: 'p2' }],
  ...overrides
});

const create = () => renderWithClient(<PaperEditPage />, { path: '/papers/new', route: '/papers/new' });
const edit = () => renderWithClient(<PaperEditPage />, { path: '/papers/pa1/edit', route: '/papers/:id/edit' });

beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { id: 'me1', name: 'Mia Roe', email: 'm@example.test' };
  auth.isAuthenticated = true;
  auth.isLoading = false;
  groups.data = [];
  groups.isError = false;
  service.get.mockResolvedValue(saved());
  service.create.mockResolvedValue(saved());
  service.update.mockResolvedValue(saved());
  service.searchPeople.mockResolvedValue([]);
  service.document.mockResolvedValue({ status: 'none', viewable: false });
  service.uploadPdf.mockResolvedValue({ status: 'ready', viewable: true, uploaded: true });
  service.removeUploadedPdf.mockResolvedValue(undefined);
});

describe('PaperEditPage', () => {
  it('asks a visitor to sign in', async () => {
    auth.user = null;
    auth.isAuthenticated = false;
    create();

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(auth.login).toHaveBeenCalled();
  });

  it('adds a paper: what was typed, the author linked to oneself, a result by its address, privately by default', async () => {
    create();
    expect(document.title).toBe('Add paper');

    await userEvent.type(await screen.findByLabelText(/Title/), '  Night segmentation ');
    await userEvent.click(screen.getByRole('button', { name: 'Add me' }));
    await userEvent.type(screen.getByLabelText('Abstract'), 'Words.');
    await userEvent.type(screen.getByLabelText('Venue'), 'CVPR');
    await userEvent.type(screen.getByLabelText('Year'), '2025');
    await userEvent.type(screen.getByLabelText('arXiv'), 'arXiv:2401.01234v2');
    await userEvent.type(screen.getByLabelText('Address of a Visin page'), 'https://visin.example.test/projects/night-seg{enter}');
    await userEvent.type(screen.getByLabelText('Where used'), 'Table 2');
    await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create).toHaveBeenCalledWith({
      title: 'Night segmentation',
      abstract: 'Words.',
      authors: [{ name: 'Mia Roe', userId: 'me1' }],
      venue: 'CVPR',
      year: 2025,
      arxivId: 'arXiv:2401.01234v2',
      doi: undefined,
      url: undefined,
      pdfUrl: undefined,
      tags: [],
      results: [{ kind: 'project', ref: 'night-seg', note: 'Table 2' }],
      visibility: 'private',
      owner: { kind: 'user', id: 'me1' }
    });
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  }, 15_000);

  it('refuses what cannot be sent before sending it', async () => {
    create();
    await screen.findByLabelText(/Title/);

    await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));
    expect(await screen.findByText('A title is required.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Title/), 'T');
    await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));
    expect(await screen.findByText('A paper needs at least one author.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Author 1'), 'A');
    await userEvent.type(screen.getByLabelText('Year'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));
    expect(await screen.findByText('The year should be four digits, like 2025.')).toBeInTheDocument();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('shows what the server refused', async () => {
    service.create.mockRejectedValue(new Error('A public paper must cite at least one result on Visin'));
    create();
    await userEvent.type(await screen.findByLabelText(/Title/), 'T');
    await userEvent.type(screen.getByLabelText('Author 1'), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

    expect(await screen.findByText('A public paper must cite at least one result on Visin')).toBeInTheDocument();
  });

  it('puts a new paper in a group the person is in, and lets only the group’s owner make it public', async () => {
    groups.data = [{ id: 'g1', name: 'Lab', role: 'admin' }];
    create();
    await screen.findByLabelText(/Title/);
    expect(screen.getByRole('radio', { name: 'Public' })).toBeEnabled();

    await userEvent.click(screen.getByRole('combobox', { name: /Owner/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Lab/ }));

    expect(screen.getByRole('radio', { name: 'Public' })).toBeDisabled();
  });

  it('edits what was saved, clearing what is emptied and keeping the rest as it was', async () => {
    edit();
    expect(await screen.findByDisplayValue('Night segmentation')).toBeInTheDocument();
    expect(document.title).toBe('Edit paper');
    expect(screen.queryByRole('combobox', { name: /Owner/ })).not.toBeInTheDocument();
    expect(screen.getByText('Not public')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Venue'));
    await userEvent.clear(screen.getByLabelText('Year'));
    await userEvent.clear(screen.getByLabelText('PDF'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(service.update).toHaveBeenCalledTimes(1));
    expect(service.update).toHaveBeenCalledWith('pa1', {
      title: 'Night segmentation',
      abstract: 'Abstract.',
      authors: [{ name: 'Ann Lee', userId: 'me1' }, { name: 'Bo Wu', userId: 'u2' }],
      venue: null,
      year: null,
      arxivId: '2401.01234',
      doi: '10.1000/x',
      url: 'https://example.test/p',
      pdfUrl: null,
      tags: ['segmentation'],
      results: [
        { kind: 'project', ref: 'p1', note: 'Table 1' },
        { kind: 'project', ref: 'p2' }
      ],
      visibility: 'public'
    });
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  });

  it('does not ask to change who sees a paper of someone who may not', async () => {
    service.get.mockResolvedValue(saved({ permissions: { read: true, contribute: true, manage: true, own: false } }));
    edit();
    await screen.findByDisplayValue('Night segmentation');

    expect(screen.getByRole('radio', { name: 'Public' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(service.update).toHaveBeenCalledTimes(1));
    expect(service.update.mock.calls[0][1].visibility).toBeUndefined();
  });

  it('keeps what was typed when the saved paper is fetched again', async () => {
    const { client } = edit();
    const title = await screen.findByDisplayValue('Night segmentation');
    await userEvent.type(title, '!');

    service.get.mockResolvedValue(saved({ title: 'Changed elsewhere' }));
    await client.invalidateQueries({ queryKey: ['papers'] });

    expect(await screen.findByDisplayValue('Night segmentation!')).toBeInTheDocument();
  });

  it('is not found for a paper that is not there, and not editable for one the person cannot manage', async () => {
    service.get.mockRejectedValue(new Error('missing'));
    const { unmount } = edit();
    expect(await screen.findByText('Paper not found')).toBeInTheDocument();
    unmount();

    service.get.mockResolvedValue(saved({ permissions: { read: true, contribute: false, manage: false, own: false } }));
    edit();
    expect(await screen.findByText('You cannot edit this paper')).toBeInTheDocument();
  });
  describe('uploading the PDF instead of giving a link', () => {
    const pdf = () => new File(['%PDF-1.7'], 'night.pdf', { type: 'application/pdf' });
    const fillBasics = async () => {
      await userEvent.type(await screen.findByLabelText(/Title/), 'Night segmentation');
      await userEvent.type(screen.getByLabelText('Author 1'), 'Ann Lee');
    };

    it('saves a public paper with no link as a draft, uploads the file, then makes it public', async () => {
      create();
      await fillBasics();
      await userEvent.upload(screen.getByLabelText('PDF file'), pdf());
      expect(screen.getByText(/night\.pdf will be uploaded when you save/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: 'Public' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

      await waitFor(() => expect(service.update).toHaveBeenCalledWith('pa1', { visibility: 'public' }));
      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private' }));
      expect(service.uploadPdf).toHaveBeenCalledWith('pa1', expect.objectContaining({ name: 'night.pdf' }));
      expect(service.create.mock.invocationCallOrder[0]).toBeLessThan(service.uploadPdf.mock.invocationCallOrder[0]);
      expect(service.uploadPdf.mock.invocationCallOrder[0]).toBeLessThan(service.update.mock.invocationCallOrder[0]);
    });

    it('creates a public paper straight away when it already has a link', async () => {
      create();
      await fillBasics();
      await userEvent.type(screen.getByLabelText('arXiv'), '2401.01234');
      await userEvent.upload(screen.getByLabelText('PDF file'), pdf());
      await userEvent.click(screen.getByRole('radio', { name: 'Public' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

      await waitFor(() => expect(service.uploadPdf).toHaveBeenCalled());
      expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public' }));
      expect(service.update).not.toHaveBeenCalled();
    });

    it('refuses a file that is not a PDF, and does not upload it', async () => {
      create();
      await fillBasics();
      await userEvent.upload(screen.getByLabelText('PDF file'), new File(['x'], 'notes.txt', { type: 'text/plain' }), {
        applyAccept: false
      });
      expect(await screen.findByText('Choose a PDF file.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));
      await waitFor(() => expect(service.create).toHaveBeenCalled());
      expect(service.uploadPdf).not.toHaveBeenCalled();
    });

    it('keeps the paper when the upload fails, and a second try changes it instead of adding another', async () => {
      service.uploadPdf.mockRejectedValueOnce(new Error('That PDF could not be read'));
      create();
      await fillBasics();
      await userEvent.upload(screen.getByLabelText('PDF file'), pdf());
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

      expect(
        await screen.findByText('The paper was saved, but its PDF was not uploaded: That PDF could not be read')
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

      await waitFor(() => expect(service.uploadPdf).toHaveBeenCalledTimes(2));
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.update).toHaveBeenCalledWith('pa1', expect.objectContaining({ title: 'Night segmentation' }));
    });

    it('says the paper is a private draft with its PDF when it cannot then be made public, and does not resend the file', async () => {
      service.update.mockRejectedValueOnce(new Error('A public paper must cite at least one result on Visin'));
      create();
      await fillBasics();
      await userEvent.upload(screen.getByLabelText('PDF file'), pdf());
      await userEvent.click(screen.getByRole('radio', { name: 'Public' }));
      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));

      expect(
        await screen.findByText(
          'The paper and its PDF were saved as a private draft, but it could not be made public: A public paper must cite at least one result on Visin'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/will be uploaded when you save/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Add paper' }));
      await waitFor(() => expect(service.update).toHaveBeenLastCalledWith('pa1', expect.objectContaining({ visibility: 'public' })));
      expect(service.uploadPdf).toHaveBeenCalledTimes(1);
      expect(service.create).toHaveBeenCalledTimes(1);
    });

    it('shows a stored upload on an edit, and removes it', async () => {
      service.document.mockResolvedValue({ status: 'ready', viewable: true, uploaded: true, pageCount: 9 });
      edit();
      expect(await screen.findByText('An uploaded PDF is stored (9 pages).')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Remove it' }));
      await waitFor(() => expect(service.removeUploadedPdf).toHaveBeenCalledWith('pa1'));
    });
  });
});
