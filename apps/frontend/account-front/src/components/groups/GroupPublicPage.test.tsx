import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@visin/frontend-core';
import GroupPublicPage from './GroupPublicPage';
import type { Group } from '../../types/group';

const service = vi.hoisted(() => ({ updatePage: vi.fn(), uploadPicture: vi.fn(), removePicture: vi.fn() }));
vi.mock('../../utils/resizeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/resizeImage')>()),
  resizeToAvatar: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/webp' })),
}));
vi.mock('../../services/groupService', () => ({ groupService: service }));

const base: Group = { _id: 'g1', name: 'Road lab', createdBy: 'u1', members: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const live: Group = { ...base, handle: 'road-lab', description: 'Segmentation', profilePublic: true };

const renderPage = (group: Group = base) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter>
        <GroupPublicPage group={group} />
      </MemoryRouter>
    </QueryClientProvider>
  );
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save public page' }));

beforeEach(() => {
  vi.clearAllMocks();
  service.updatePage.mockResolvedValue(live);
  service.uploadPicture.mockResolvedValue('https://group.example.test/api/public/avatars/g1?v=1');
  service.removePicture.mockResolvedValue(undefined);
});

describe('GroupPublicPage', () => {
  it('starts off, with nothing to save and no page to view', () => {
    renderPage();

    expect(screen.getByRole('switch', { name: 'Show the public page' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'View the page' })).not.toBeInTheDocument();
    expect(screen.getByText(/Never its members/)).toBeInTheDocument();
  });

  it('shows the page a group has, and the way to see it', () => {
    renderPage(live);

    expect(screen.getByLabelText('Handle')).toHaveValue('road-lab');
    expect(screen.getByLabelText('Description')).toHaveValue('Segmentation');
    expect(screen.getByRole('switch', { name: 'Show the public page' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'View the page' })).toHaveAttribute('href', '/g/road-lab');
  });

  it('turns the page on with a handle and a description, lowercased and trimmed', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'Road-Lab' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  Segmentation ' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Show the public page' }));
    save();

    await waitFor(() =>
      expect(service.updatePage).toHaveBeenCalledWith('g1', { handle: 'road-lab', description: 'Segmentation', profilePublic: true })
    );
  });

  it('cannot switch the page on without a handle', () => {
    renderPage();

    fireEvent.click(screen.getByRole('switch', { name: 'Show the public page' }));

    expect(screen.getByText('Choose a handle first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
  });

  it('does not ask for the handle it already has', async () => {
    renderPage(live);

    fireEvent.click(screen.getByRole('switch', { name: 'Show the public page' }));
    save();

    await waitFor(() => expect(service.updatePage).toHaveBeenCalled());
    expect(service.updatePage.mock.calls[0][1]).toEqual({ description: 'Segmentation', profilePublic: false });
  });

  it("says why a handle was refused, in the server's words", async () => {
    service.updatePage.mockRejectedValue(new ApiError(409, 'That handle is taken'));
    renderPage();

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'taken' } });
    save();

    expect(await screen.findByText('That handle is taken')).toBeInTheDocument();
  });

  it('keeps a failure that is not the owner’s to fix generic, and lets the alert be dismissed', async () => {
    service.updatePage.mockRejectedValue(new ApiError(500, 'stack trace'));
    renderPage();

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'x' } });
    save();

    expect(await screen.findByText('Could not save the public page')).toBeInTheDocument();
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(screen.queryByText('Could not save the public page')).not.toBeInTheDocument();
  });

  it('lists the group\'s own sites, each in a box, and sends them only when they changed', async () => {
    renderPage({ ...live, links: ['https://road-lab.example.test'] });
    expect(screen.getByLabelText('Link 1')).toHaveValue('https://road-lab.example.test');

    fireEvent.click(screen.getByRole('switch', { name: 'Show the public page' }));
    save();
    await waitFor(() => expect(service.updatePage).toHaveBeenCalledTimes(1));
    expect(service.updatePage.mock.calls[0][1]).not.toHaveProperty('links');

    fireEvent.change(screen.getByLabelText('Link 1'), { target: { value: 'github:road-lab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Link 2'), { target: { value: ' road-lab.example.test ' } });
    save();
    await waitFor(() => expect(service.updatePage).toHaveBeenCalledTimes(2));
    expect(service.updatePage.mock.calls[1][1]).toMatchObject({ links: ['github:road-lab', 'road-lab.example.test'] });
  });

  it('clears the links when they are all removed', async () => {
    renderPage({ ...live, links: ['https://road-lab.example.test'] });

    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));
    save();

    await waitFor(() => expect(service.updatePage).toHaveBeenCalled());
    expect(service.updatePage.mock.calls[0][1]).toMatchObject({ links: [] });
  });

  it('offers a box to add, up to the most a page shows', () => {
    renderPage(live);

    for (let count = 1; count < 8; count++) fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(screen.getByLabelText('Link 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
  });

  it('sets the group\'s picture at once, for this group, without waiting for Save', async () => {
    renderPage(live);

    fireEvent.change(screen.getByTestId('picture-input'), { target: { files: [new File(['x'], 'lab.png', { type: 'image/png' })] } });

    await waitFor(() => expect(service.uploadPicture).toHaveBeenCalledWith('g1', expect.any(Blob)), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
  });

  it('removes the group\'s picture', async () => {
    renderPage({ ...live, picture: 'https://group.example.test/api/public/avatars/g1?v=1' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(service.removePicture).toHaveBeenCalledWith('g1'));
  });
});
