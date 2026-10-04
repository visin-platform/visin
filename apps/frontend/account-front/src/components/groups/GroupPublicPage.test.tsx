import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@visin/frontend-core';
import GroupPublicPage from './GroupPublicPage';
import type { Group } from '../../types/group';

const service = vi.hoisted(() => ({ updatePage: vi.fn() }));
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
});
