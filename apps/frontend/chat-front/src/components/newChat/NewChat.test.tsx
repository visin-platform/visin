import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewChat } from './NewChat';

const state = vi.hoisted(() => ({ failing: false }));
vi.mock('../../services/apiClient', () => ({
  api: vi.fn(async (path: string) => {
    if (state.failing) throw new Error('offline');
    if (path === '/projects') return [{ _id: 'p1', name: 'Road experiments' }];
    if (path === '/contacts') return [{ id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Grace' }];
    if (path === '/assistants') return [{ _id: 'vivi', name: 'Vivi', personality: '', paused: false }];
    return [];
  })
}));
const mount = (props: Partial<React.ComponentProps<typeof NewChat>> = {}) => {
  const on = { onBack: vi.fn(), onAnalysis: vi.fn(), onPerson: vi.fn(), onGroup: vi.fn(), onRoom: vi.fn() };
  render(<NewChat assistant groups={[{ groupId: 'g1', name: 'Road lab' }]} busy={false} {...on} {...props} />);
  return on;
};
beforeEach(() => { vi.clearAllMocks(); state.failing = false; });

it('starts with a compact picker instead of setup and creation forms', async () => {
  const on = mount({ assistantModel: { provider: 'anthropic', model: 'configured-model', ready: true } });
  fireEvent.click(await screen.findByRole('button', { name: /Vivi/ }));
  expect(on.onAnalysis).toHaveBeenCalledWith({ assistantId: 'vivi', title: 'Vivi' });
  expect(screen.getByLabelText('Search people or assistants')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Assistant name/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Deployment model/)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Start a room' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Road lab/ })).not.toBeInTheDocument();
});
it('filters contacts and assistants from one search and opens a contact directly', async () => {
  const on = mount();
  await screen.findByRole('button', { name: 'Grace' });
  fireEvent.change(screen.getByLabelText('Search people or assistants'), { target: { value: 'gra' } });
  expect(screen.queryByRole('button', { name: 'Ada' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Vivi/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Grace' }));
  expect(on.onPerson).toHaveBeenCalledWith({ userId: 'u2', name: 'Grace' });
});
it('opens a typed profile handle and disables starting a chat while busy', async () => {
  const on = mount({ busy: true });
  fireEvent.change(screen.getByLabelText('Search people or assistants'), { target: { value: '@ada' } });
  expect(screen.getByRole('button', { name: 'Message @ada' })).toBeDisabled();
  fireEvent.submit(screen.getByLabelText('Search people or assistants').closest('form')!);
  expect(on.onPerson).not.toHaveBeenCalled();
});
it('submits a handle with Enter and keeps optional discovery failures from blocking it', async () => {
  state.failing = true;
  const on = mount();
  fireEvent.change(screen.getByLabelText('Search people or assistants'), { target: { value: ' @ada ' } });
  fireEvent.submit(screen.getByLabelText('Search people or assistants').closest('form')!);
  expect(on.onPerson).toHaveBeenCalledWith({ handle: 'ada', name: 'ada' });
  await waitFor(() => expect(screen.getByText('Could not load your assistants.')).toBeInTheDocument());
});
it('moves editing and model configuration behind Manage and returns to the picker', async () => {
  mount({ assistant: false, setupHref: '/account/analyst', assistantModel: { provider: 'anthropic', model: 'configured-model', ready: false } });
  expect(screen.getByText('Assistant chats are currently unavailable.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Set up the analyst' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
  expect(await screen.findByLabelText(/Assistant name/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Set up the analyst' })).toHaveAttribute('href', '/account/analyst');
  expect(screen.getByText('Model: anthropic / configured-model')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to new chat' }));
  expect(screen.getByLabelText('Search people or assistants')).toBeInTheDocument();
});
it('keeps an unavailable assistant disabled and explains setup to non-admins only in Manage', async () => {
  mount({ assistant: false });
  expect(await screen.findByRole('button', { name: /Vivi/ })).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
  expect(screen.getByText('Ask an administrator to enable assistant chats.')).toBeInTheDocument();
});
it('keeps project analysis and group chats under More options', async () => {
  const on = mount();
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Road experiments' }));
  expect(on.onAnalysis).toHaveBeenCalledWith({ projectId: 'p1', trainingIds: [], title: 'Road experiments', projectName: 'Road experiments' });
  fireEvent.click(screen.getByRole('button', { name: 'Road lab' }));
  expect(on.onGroup).toHaveBeenCalledWith('g1', 'Road lab');
  expect(screen.queryByLabelText(/Assistant name/)).not.toBeInTheDocument();
});
it('keeps room creation available under More options', async () => {
  const on = mount();
  await screen.findByRole('button', { name: 'Ada' });
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  fireEvent.click(screen.getByRole('button', { name: 'New room' }));
  expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Review' } });
  fireEvent.click(within(screen.getByRole('region', { name: 'Start a room' })).getByRole('button', { name: 'Ada' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
  expect(on.onRoom).toHaveBeenCalledWith('Review', [], ['u1']);
});
it('goes back to conversations from the picker', () => {
  const on = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
  expect(on.onBack).toHaveBeenCalled();
});

describe('starting a room', () => {
  const openRoom = async () => {
    const on = mount();
    await screen.findByRole('button', { name: 'Ada' });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New room' }));
    return on;
  };
  /** A colleague's chip in the room form, not their row in the list of people to message. */
  const chip = async (name: string) =>
    within(screen.getByRole('region', { name: 'Start a room' })).findByRole('button', { name });

  it('needs a name and at least one person, from handles or from colleagues', async () => {
    const on = await openRoom();
    const create = screen.getByRole('button', { name: 'Create room' });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: ' Review ' } });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("People's handles"), { target: { value: '@ada, grace  @hopper' } });
    expect(create).toBeEnabled();
    fireEvent.click(await chip('Ada'));
    fireEvent.click(create);
    expect(on.onRoom).toHaveBeenCalledWith('Review', ['ada', 'grace', 'hopper'], ['u1']);
  });

  it('lets a colleague be added and removed again, and a room be abandoned', async () => {
    const on = await openRoom();
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Review' } });
    const ada = await chip('Ada');
    fireEvent.click(ada);
    expect(ada).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled();
    fireEvent.click(ada);
    expect(ada).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'New room' })).toBeInTheDocument());
    expect(on.onRoom).not.toHaveBeenCalled();
  });
});


it('opens an assistant with the current project context after filtering by its name', async () => {
  const page = { projectId: 'p1', trainingIds: ['t1'], title: 'Current run' };
  const on = mount({ pageContext: page });
  await screen.findByRole('button', { name: 'Ada' });
  fireEvent.change(screen.getByLabelText('Search people or assistants'), { target: { value: 'vivi' } });
  fireEvent.click(await screen.findByRole('button', { name: /Vivi/ }));
  expect(on.onAnalysis).toHaveBeenCalledWith({ ...page, assistantId: 'vivi', title: 'Vivi' });
});
