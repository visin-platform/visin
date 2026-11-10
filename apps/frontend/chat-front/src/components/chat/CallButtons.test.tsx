import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallButtons } from './CallButtons';
import { onCallRequest, setCallsReady } from '../../services/callBus';
import { chatService } from '../../services/chatService';
vi.mock('../../services/chatService', () => ({ chatService: { contacts: vi.fn(), create: vi.fn() } }));
import { calleeOf, callability } from '../../utils/callee';
import type { Conversation } from '../../types/chat';

const participant = (userId: string, state: 'active' | 'invited' | 'left' | 'blocked' = 'active') => ({
  userId,
  name: userId,
  state,
  role: 'member',
  readSeq: 0
});
const conversation = (patch: Partial<Conversation> = {}): Conversation => ({
  _id: '64b1f0c2a3b4c5d6e7f80912',
  kind: 'direct',
  title: 'Irja',
  createdBy: 'tom',
  participants: [participant('tom'), participant('irja')],
  trainingIds: [],
  seq: 4,
  profile: { id: 'irja', handle: 'irja', name: 'Irja', picture: 'https://img.example.test/irja.png' },
  ...patch
});

const camera = (present: boolean) =>
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: present ? { getUserMedia: vi.fn() } : undefined
  });

beforeEach(() => camera(true));
afterEach(() => {
  setCallsReady(false);
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('calleeOf', () => {
  it('is the other person, only in a direct message both have joined', () => {
    expect(calleeOf(conversation(), 'tom')?.userId).toBe('irja');
    expect(calleeOf(conversation(), 'irja')?.userId).toBe('tom');
    expect(calleeOf(conversation({ kind: 'room' }), 'tom')).toBeNull();
    expect(calleeOf(conversation({ kind: 'assistant' }), 'tom')).toBeNull();
    expect(calleeOf(conversation({ assistantId: 'bot1' }), 'tom')).toBeNull();
    expect(
      calleeOf(conversation({ participants: [participant('tom'), participant('irja', 'invited')] }), 'tom')
    ).toBeNull();
    expect(
      calleeOf(conversation({ participants: [participant('tom', 'invited'), participant('irja')] }), 'tom')
    ).toBeNull();
    expect(
      calleeOf(conversation({ participants: [participant('tom'), participant('irja', 'blocked')] }), 'tom')
    ).toBeNull();
    expect(calleeOf(conversation({ participants: [participant('tom')] }), 'tom')).toBeNull();
    expect(calleeOf(conversation(), 'stranger')).toBeNull();
  });
});

describe('CallButtons', () => {
  it('keeps call controls visible but disabled until the host is ready', () => {
    render(<CallButtons conversation={conversation()} userId="tom" />);
    expect(screen.getByRole('button', { name: 'Call Irja' })).toBeDisabled();
    act(() => setCallsReady(true));
    expect(screen.getByRole('button', { name: 'Call Irja' })).toBeEnabled();
    act(() => setCallsReady(false));
    expect(screen.getByRole('button', { name: 'Call Irja' })).toBeDisabled();
  });

  it('selects a group member and calls their accepted private conversation', async () => {
    setCallsReady(true);
    vi.mocked(chatService.contacts).mockResolvedValue([{ id: 'irja', name: 'Irja' }]);
    vi.mocked(chatService.create).mockResolvedValue(conversation());
    const requested = vi.fn();
    const stop = onCallRequest(requested);
    render(
      <CallButtons
        conversation={conversation({ kind: 'group', groupId: 'lab', participants: [participant('tom')] })}
        userId="tom"
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Video call Irja' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Irja' }));
    expect(chatService.contacts).toHaveBeenCalledWith(expect.any(AbortSignal), 'lab');
    expect(chatService.create).toHaveBeenCalledWith({ kind: 'direct', title: 'Irja', userIds: ['irja'] });
    expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: conversation()._id, camera: true })
    );
    stop();
  });

  it('explains pending acceptance and lets the user open the private conversation', async () => {
    setCallsReady(true);
    vi.mocked(chatService.contacts).mockResolvedValue([{ id: 'irja', name: 'Irja' }]);
    const direct = conversation({ participants: [participant('tom'), participant('irja', 'invited')] });
    vi.mocked(chatService.create).mockResolvedValue(direct);
    const open = vi.fn();
    const requested = vi.fn();
    const stop = onCallRequest(requested);
    render(<CallButtons conversation={conversation({ kind: 'group' })} userId="tom" onOpenConversation={open} />);
    await userEvent.click(screen.getByRole('button', { name: 'Call Irja' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Irja' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('accepts your message request');
    expect(requested).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    expect(open).toHaveBeenCalledWith(direct);
    stop();
  });

  it('places a voice call, naming who is called so the screen can show them at once', async () => {
    setCallsReady(true);
    const requested = vi.fn();
    const stop = onCallRequest(requested);
    render(<CallButtons conversation={conversation()} userId="tom" />);
    await userEvent.click(screen.getByRole('button', { name: 'Call Irja' }));
    stop();
    expect(requested).toHaveBeenCalledWith({
      conversationId: '64b1f0c2a3b4c5d6e7f80912',
      peer: { userId: 'irja', name: 'Irja', picture: 'https://img.example.test/irja.png' },
      camera: false
    });
  });

  it('places a video call with the camera on', async () => {
    setCallsReady(true);
    const requested = vi.fn();
    const stop = onCallRequest(requested);
    render(<CallButtons conversation={conversation()} userId="tom" />);
    await userEvent.click(screen.getByRole('button', { name: 'Video call Irja' }));
    stop();
    expect(requested).toHaveBeenCalledWith(expect.objectContaining({ camera: true }));
  });

  it('keeps video visible but disabled on a browser with no camera', () => {
    camera(false);
    setCallsReady(true);
    render(<CallButtons conversation={conversation()} userId="tom" />);
    expect(screen.getByRole('button', { name: 'Call Irja' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Video call Irja' })).toBeDisabled();
  });
});

describe('a call that cannot be placed yet', () => {
  const invited = (who: 'them' | 'me') =>
    conversation({
      participants: [
        participant('tom', who === 'me' ? 'invited' : 'active'),
        participant('irja', who === 'them' ? 'invited' : 'active')
      ]
    });

  it('shows the buttons switched off, with the reason, rather than hiding them', async () => {
    setCallsReady(true);
    render(<CallButtons conversation={invited('them')} userId="tom" />);
    const call = screen.getByRole('button', { name: 'Call Irja' });
    expect(call).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Video call Irja' })).toBeDisabled();
    await userEvent.hover(call.closest('span')!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'You can call once Irja accepts your message request.'
    );
  });

  it('says what to do when the request is the other way round', () => {
    expect(callability(invited('me'), 'tom')).toEqual({
      callable: false,
      reason: 'Accept the message request to call.'
    });
  });

  it('says a closed conversation is closed, and offers nothing where there is no call to be had', () => {
    const closed = conversation({ participants: [participant('tom'), participant('irja', 'blocked')] });
    expect(callability(closed, 'tom')).toEqual({ callable: false, reason: 'This conversation is closed.' });
    expect(callability(conversation({ kind: 'room' }), 'tom')).toBeNull();
    expect(callability(conversation({ assistantId: 'bot' }), 'tom')).toBeNull();
    expect(callability(conversation({ participants: [participant('tom')] }), 'tom')).toBeNull();
    expect(callability(conversation(), 'stranger')).toBeNull();
    expect(callability(conversation(), 'tom')).toMatchObject({ callable: true });
  });

  it('does not place a call from a switched-off button', () => {
    setCallsReady(true);
    const requested = vi.fn();
    const stop = onCallRequest(requested);
    render(<CallButtons conversation={invited('them')} userId="tom" />);
    fireEvent.click(screen.getByRole('button', { name: 'Call Irja' }));
    stop();
    expect(requested).not.toHaveBeenCalled();
  });
});
