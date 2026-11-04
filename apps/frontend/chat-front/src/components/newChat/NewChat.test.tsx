import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageContext } from '../../types/chat';
import { NewChat } from './NewChat';

const state = vi.hoisted(() => ({
  projects: [] as { _id: string; name: string }[],
  contacts: [] as { id: string; name: string }[],
  failing: false
}));
vi.mock('../../services/apiClient', () => ({
  api: vi.fn(async (path: string) => {
    if (state.failing) throw new Error('offline');
    if (path === '/projects') return state.projects;
    if (path === '/contacts') return state.contacts;
    return [];
  })
}));

const handlers = () => ({
  onBack: vi.fn(),
  onAnalysis: vi.fn(),
  onPerson: vi.fn(),
  onGroup: vi.fn(),
  onRoom: vi.fn()
});
const mount = (props: Partial<React.ComponentProps<typeof NewChat>> = {}) => {
  const on = handlers();
  render(<NewChat assistant groups={[]} busy={false} {...on} {...props} />);
  return on;
};
const page: PageContext = { projectId: 'p1', trainingIds: ['t1'], title: 'resnet50 · lr 3e-4' };

beforeEach(() => {
  vi.clearAllMocks();
  state.projects = [
    { _id: 'p1', name: 'CLFTv2 (final)' },
    { _id: 'p2', name: 'SAM on ZOD' }
  ];
  state.contacts = [
    { id: 'u2', name: 'ada@lab.test' },
    { id: 'u3', name: 'grace@lab.test' }
  ];
  state.failing = false;
});

describe('asking the analyst', () => {
  it('offers what the person is looking at first, then each project, then a general question', async () => {
    const on = mount({ pageContext: page });
    fireEvent.click(await screen.findByRole('button', { name: /resnet50 · lr 3e-4/ }));
    expect(on.onAnalysis).toHaveBeenLastCalledWith(page);
    fireEvent.click(await screen.findByRole('button', { name: /SAM on ZOD/ }));
    expect(on.onAnalysis).toHaveBeenLastCalledWith({
      projectId: 'p2',
      trainingIds: [],
      title: 'SAM on ZOD',
      projectName: 'SAM on ZOD'
    });
    fireEvent.click(screen.getByRole('button', { name: /General question/ }));
    expect(on.onAnalysis).toHaveBeenLastCalledWith({ title: 'General question' });
  });

  it('offers no page of its own where nothing is being looked at', async () => {
    mount();
    await screen.findByRole('button', { name: /CLFTv2 \(final\)/ });
    expect(screen.queryByText('What you are looking at')).toBeNull();
  });

  it('explains, and offers nothing to ask, where the analyst is off', async () => {
    mount({ assistant: false });
    expect(
      screen.getByText('The analyst is not turned on for this deployment. Ask an administrator.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Analyse' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Set up the analyst' })).toBeNull();
  });

  it('sends an administrator to where it is turned on', () => {
    mount({ assistant: false, setupHref: '/account/analyst' });
    expect(screen.getByText('The analyst is not turned on yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up the analyst' })).toHaveAttribute('href', '/account/analyst');
  });

  it('does not offer to analyse anything while a conversation is being opened', async () => {
    mount({ busy: true, pageContext: page });
    expect(await screen.findByRole('button', { name: /General question/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('messaging a person', () => {
  it('starts from a profile handle, with or without the @, and ignores an empty one', async () => {
    const on = mount();
    const message = screen.getByRole('button', { name: 'Message' });
    expect(message).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Profile handle'), { target: { value: ' @ada ' } });
    fireEvent.click(message);
    expect(on.onPerson).toHaveBeenCalledWith({ handle: 'ada', name: 'ada' });
    await screen.findByText('ada@lab.test');
  });

  it("offers colleagues from the person's groups, one click each", async () => {
    const on = mount();
    const colleagues = within(await screen.findByRole('list', { name: 'Group colleagues' }));
    fireEvent.click(colleagues.getByRole('button', { name: /grace@lab.test/ }));
    expect(on.onPerson).toHaveBeenCalledWith({ userId: 'u3', name: 'grace@lab.test' });
  });

  it('offers no colleague list to someone with none, nor when the list cannot be read', async () => {
    state.contacts = [];
    const first = render(<NewChat assistant groups={[]} busy={false} {...handlers()} />);
    await screen.findByRole('button', { name: /CLFTv2/ });
    expect(screen.queryByText('From your groups')).toBeNull();
    first.unmount();
    state.failing = true;
    render(<NewChat assistant groups={[]} busy={false} {...handlers()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /General question/ })).toBeInTheDocument());
    expect(screen.queryByText('From your groups')).toBeNull();
  });
});

describe('messaging a group', () => {
  it("opens the group's channel, and is absent for someone in no group", async () => {
    const on = mount({ groups: [{ groupId: 'g1', name: 'Road lab' }] });
    fireEvent.click(await screen.findByRole('button', { name: /Road lab/ }));
    expect(on.onGroup).toHaveBeenCalledWith('g1', 'Road lab');
  });

  it('has no group section without groups', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Message a group' })).toBeNull();
  });
});

describe('starting a room', () => {
  const openRoom = async () => {
    const on = mount();
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
    fireEvent.click(await chip('ada@lab.test'));
    fireEvent.click(create);
    expect(on.onRoom).toHaveBeenCalledWith('Review', ['ada', 'grace', 'hopper'], ['u2']);
  });

  it('lets a colleague be added and removed again, and a room be abandoned', async () => {
    const on = await openRoom();
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Review' } });
    const ada = await chip('ada@lab.test');
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

it('goes back to the conversations', () => {
  const on = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));
  expect(on.onBack).toHaveBeenCalled();
});

it('discloses the deployment model and its availability without offering per-assistant selection', () => {
  mount({ assistantModel: { provider: 'anthropic', model: 'configured-model', ready: false } });
  expect(screen.getByText('Deployment model: anthropic / configured-model · unavailable')).toBeInTheDocument();
});
