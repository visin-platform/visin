import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { AssistantProfileEditor } from './AssistantProfileEditor';
import { assistantProfileApi } from '../../services/assistantProfileApi';
vi.mock('../../services/assistantProfileApi', () => ({
  assistantProfileApi: {
    list: vi.fn(),
    rename: vi.fn(),
    saveProfile: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn()
  }
}));
const assistant = { _id: 'vivi', name: 'Vivi', personality: 'Research', paused: false };
function mount() {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AssistantProfileEditor
        assistantId="vivi"
        userId="bot-user"
        viewerId="manager"
        handle="vivi"
        bio="Research assistant"
        onSaved={onSaved}
      />
    </QueryClientProvider>
  );
  return onSaved;
}
it('lets a manager rename the assistant without replacing its other settings', async () => {
  vi.mocked(assistantProfileApi.list).mockResolvedValue([assistant]);
  vi.mocked(assistantProfileApi.rename).mockResolvedValue({ ...assistant, name: 'Vivian' });
  vi.mocked(assistantProfileApi.saveProfile).mockResolvedValue({
    handle: 'vivian',
    bio: 'New description',
    public: true
  });
  const onSaved = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.change(screen.getByLabelText(/Assistant name/), { target: { value: 'Vivian' } });
  fireEvent.change(screen.getByLabelText(/^Handle/), { target: { value: 'vivian' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(assistantProfileApi.rename).toHaveBeenCalledWith(assistant, 'Vivian'));
  expect(assistantProfileApi.saveProfile).toHaveBeenCalledWith('vivi', {
    handle: 'vivian',
    bio: 'New description',
    public: true
  });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('vivian'));
});
it('hides editing from someone who does not manage the assistant', async () => {
  vi.mocked(assistantProfileApi.list).mockResolvedValue([]);
  mount();
  await waitFor(() => expect(assistantProfileApi.list).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument();
});
