import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { AssistantProfileEditor } from './AssistantProfileEditor';
import { resizeToAvatar } from '@visin/frontend-core';
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
vi.mock('@visin/frontend-core', async (original) => ({
  ...(await original<typeof import('@visin/frontend-core')>()),
  resizeToAvatar: vi.fn()
}));
beforeEach(() => vi.resetAllMocks());
const assistant = { _id: 'vivi', name: 'Vivi', personality: 'Research', paused: false };
function mount(props: { bio?: string } = { bio: 'Research assistant' }) {
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AssistantProfileEditor
        assistantId="vivi"
        userId="bot-user"
        viewerId="manager"
        handle="vivi"
        bio={props.bio}
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

it('uploads a resized avatar, ignores an empty file selection and removes the avatar immediately', async () => {
  vi.mocked(assistantProfileApi.list).mockResolvedValue([assistant]);
  const image = new Blob(['resized'], { type: 'image/webp' });
  vi.mocked(resizeToAvatar).mockResolvedValue(image);
  vi.mocked(assistantProfileApi.upload).mockResolvedValue(undefined);
  vi.mocked(assistantProfileApi.remove).mockResolvedValue(undefined);
  const onSaved = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  const input = screen.getByLabelText('Choose assistant avatar');
  fireEvent.change(input, { target: { files: [] } });
  expect(resizeToAvatar).not.toHaveBeenCalled();
  const file = new File(['source'], 'avatar.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
  expect(resizeToAvatar).toHaveBeenCalledWith(file);
  expect(assistantProfileApi.upload).toHaveBeenCalledWith('bot-user', image);
  fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
  expect(assistantProfileApi.remove).toHaveBeenCalledWith('bot-user');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('shows a failed save and lets the manager dismiss the dialog', async () => {
  vi.mocked(assistantProfileApi.list).mockResolvedValue([assistant]);
  vi.mocked(assistantProfileApi.saveProfile).mockRejectedValue(new Error('Handle is taken'));
  const onSaved = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Handle is taken');
  expect(onSaved).not.toHaveBeenCalled();
  expect(assistantProfileApi.rename).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('opens an empty description and refuses blank names or handles', async () => {
  vi.mocked(assistantProfileApi.list).mockResolvedValue([assistant]);
  mount({});
  fireEvent.click(await screen.findByRole('button', { name: 'Edit profile' }));
  expect(screen.getByLabelText('Description')).toHaveValue('');
  fireEvent.change(screen.getByLabelText(/Assistant name/), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Assistant name/), { target: { value: 'Vivi' } });
  fireEvent.change(screen.getByLabelText(/^Handle/), { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  expect(assistantProfileApi.saveProfile).not.toHaveBeenCalled();
});
