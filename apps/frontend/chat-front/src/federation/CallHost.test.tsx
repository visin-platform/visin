import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CallHost from './CallHost';

const mocks = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  refreshSubscription: vi.fn(async () => undefined),
  syncBadge: vi.fn(async () => undefined),
  forgetDeviceOnServer: vi.fn(async () => undefined),
  callsConfig: vi.fn(),
  api: {
    iceServers: vi.fn(),
    currentCall: vi.fn(),
    startCall: vi.fn(),
    acceptCall: vi.fn(),
    declineCall: vi.fn(),
    endCall: vi.fn(),
    sendSignal: vi.fn()
  },
  stream: { args: undefined as undefined | { enabled: boolean; deviceId: string; onEvent: (e: unknown) => void; onOpen?: () => void } },
  stopTone: vi.fn(),
  playTone: vi.fn()
}));
vi.mock('../services/callApi', () => ({ callApi: mocks.api, callsConfig: mocks.callsConfig }));
vi.mock('../hooks/useUserStream', () => ({ useUserStream: (args: NonNullable<typeof mocks.stream.args>) => (mocks.stream.args = args) }));
vi.mock('../services/ringtone', () => ({ playTone: mocks.playTone }));
vi.mock('../components/call/CallScreen', () => ({
  CallScreen: (props: {
    state: { phase: string; peer: { name: string } | null };
    minimized: boolean;
    onAccept: () => void;
    onDecline: () => void;
    onHangUp: () => void;
    onToggleMute: () => void;
    onDismiss: () => void;
    onMinimize: () => void;
    onExpand: () => void;
    onSelectMicrophone: (id: string | null) => void;
    onToggleScreen?: () => void;
    onToggleCamera?: () => void;
    onFlipCamera: () => void;
  }) => (
    <div role="dialog" data-minimized={String(props.minimized)}>
      {props.state.phase} {props.state.peer?.name}
      <button onClick={props.onAccept}>accept</button>
      <button onClick={props.onDecline}>decline</button>
      <button onClick={props.onHangUp}>hang up</button>
      <button onClick={props.onToggleMute}>mute</button>
      <button onClick={props.onDismiss}>dismiss</button>
      <button onClick={props.onMinimize}>minimize</button>
      <button onClick={props.onExpand}>expand</button>
      <button onClick={() => props.onSelectMicrophone('mic-2')}>microphone</button>
      <button onClick={props.onFlipCamera}>flip</button>
      {props.onToggleScreen && <button onClick={props.onToggleScreen}>screen</button>}
      {props.onToggleCamera && <button onClick={props.onToggleCamera}>camera</button>}
    </div>
  )
}));

vi.mock('../config/ConfigProvider', () => ({ ConfigProvider: ({ children }: { children: unknown }) => children }));
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ user: mocks.user })
}));
vi.mock('../services/pushNotifications', () => ({
  refreshSubscription: mocks.refreshSubscription,
  syncBadge: mocks.syncBadge,
  forgetDeviceOnServer: mocks.forgetDeviceOnServer
}));

beforeEach(() => {
  mocks.callsConfig.mockReset().mockResolvedValue({ enabled: false, mode: 'local', relay: false });
  for (const fn of Object.values(mocks.api)) fn.mockReset();
  mocks.api.currentCall.mockResolvedValue(null);
  for (const name of ['declineCall', 'endCall', 'sendSignal'] as const) mocks.api[name].mockResolvedValue(undefined);
  mocks.stream.args = undefined;
  mocks.playTone.mockReset().mockReturnValue(mocks.stopTone);
  mocks.stopTone.mockReset();
  delete window.__visinCalls;
  mocks.user = { id: 'u1' };
  mocks.refreshSubscription.mockClear();
  mocks.syncBadge.mockClear();
  mocks.forgetDeviceOnServer.mockClear();
});

describe('CallHost (chat’s always-on part)', () => {
  it('renders nothing of its own', () => {
    const { container } = render(<CallHost />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renews the notification subscription and the badge once someone is signed in', () => {
    render(<CallHost />);
    expect(mocks.refreshSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.syncBadge).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a visitor', () => {
    mocks.user = null;
    render(<CallHost />);
    window.dispatchEvent(new CustomEvent('visin:logout', { detail: { tasks: [] } }));
    expect(mocks.refreshSubscription).not.toHaveBeenCalled();
    expect(mocks.syncBadge).not.toHaveBeenCalled();
    expect(mocks.forgetDeviceOnServer).not.toHaveBeenCalled();
  });

  it('refreshes the badge when the app comes back into view', () => {
    render(<CallHost />);
    mocks.syncBadge.mockClear();
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.syncBadge).toHaveBeenCalledTimes(1);
  });

  it('lets go of the device before sign-out finishes', () => {
    render(<CallHost />);
    const tasks: Promise<unknown>[] = [];
    window.dispatchEvent(new CustomEvent('visin:logout', { detail: { tasks } }));
    expect(mocks.forgetDeviceOnServer).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(1);
    // An event without a task list is ignored rather than throwing.
    expect(() => window.dispatchEvent(new CustomEvent('visin:logout'))).not.toThrow();
  });

  it('stops listening once it is gone', () => {
    const { unmount } = render(<CallHost />);
    unmount();
    mocks.forgetDeviceOnServer.mockClear();
    window.dispatchEvent(new CustomEvent('visin:logout', { detail: { tasks: [] } }));
    expect(mocks.forgetDeviceOnServer).not.toHaveBeenCalled();
  });
});

const IRJA = { userId: 'u2', name: 'Irja', picture: null };
const RINGING = {
  id: 'k1',
  conversationId: 'c1',
  caller: IRJA,
  callees: [{ userId: 'u1', name: 'Tom', picture: null }],
  callerDeviceId: 'irja-tab-001',
  answeredBy: null,
  answeredDeviceId: null,
  status: 'ringing',
  endReason: null,
  startedAt: new Date().toISOString(),
  answeredAt: null,
  endedAt: null
};

describe('CallHost (calls)', () => {
  beforeEach(() => {
    mocks.callsConfig.mockResolvedValue({ enabled: true, mode: 'stun', relay: false });
  });

  it('does not start, and offers no call button, where the server has calls off', async () => {
    mocks.callsConfig.mockResolvedValue({ enabled: false, mode: 'local', relay: false });
    render(<CallHost />);
    await waitFor(() => expect(mocks.callsConfig).toHaveBeenCalled());
    expect(window.__visinCalls).not.toBe(true);
    expect(mocks.stream.args?.enabled).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays off, without failing, when the server cannot be asked', async () => {
    mocks.callsConfig.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<CallHost />);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(window.__visinCalls).not.toBe(true);
  });

  it('is not started for a visitor', () => {
    mocks.user = null;
    render(<CallHost />);
    expect(mocks.callsConfig).not.toHaveBeenCalled();
  });

  it('opens the person’s stream and says calls are available, once the server says they are on', async () => {
    render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    expect(mocks.stream.args?.enabled).toBe(true);
    expect(mocks.stream.args?.deviceId).toMatch(/.{8,}/);
    // Catches up on a call that rang before the page was open.
    expect(mocks.api.currentCall).toHaveBeenCalled();
  });

  it('catches up again whenever the stream reconnects', async () => {
    render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    mocks.api.currentCall.mockClear();
    act(() => mocks.stream.args?.onOpen?.());
    expect(mocks.api.currentCall).toHaveBeenCalledTimes(1);
  });

  it('shows an incoming call and rings for it, then stops when it is over', async () => {
    render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    act(() => mocks.stream.args?.onEvent({ type: 'call.ringing', conversationId: 'c1', at: 1, payload: RINGING }));
    expect(await screen.findByText('incoming Irja')).toBeInTheDocument();
    expect(mocks.playTone).toHaveBeenCalledWith('ring');
    act(() =>
      mocks.stream.args?.onEvent({
        type: 'call.ended',
        conversationId: 'c1',
        at: 2,
        payload: { ...RINGING, status: 'ended', endReason: 'cancelled' }
      })
    );
    expect(await screen.findByText('ended Irja')).toBeInTheDocument();
    expect(mocks.stopTone).toHaveBeenCalled();
  });

  it('places a call when a thread asks for one', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn(), enabled: true, kind: 'audio', getSettings: () => ({}) }], getAudioTracks: () => [] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
    mocks.api.startCall.mockResolvedValue({ ...RINGING, caller: { userId: 'u1', name: 'Tom', picture: null }, callees: [IRJA] });
    render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    window.dispatchEvent(new CustomEvent('visin:call', { detail: { conversationId: 'c1', peer: IRJA, camera: false } }));
    await waitFor(() => expect(mocks.api.startCall).toHaveBeenCalledWith('c1', mocks.stream.args?.deviceId));
    expect(await screen.findByText('outgoing Irja')).toBeInTheDocument();
    expect(mocks.playTone).toHaveBeenCalledWith('ringback');
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('stops listening and says calls are no longer available when it goes', async () => {
    const { unmount } = render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    unmount();
    expect(window.__visinCalls).toBe(false);
    window.dispatchEvent(new CustomEvent('visin:call', { detail: { conversationId: 'c1' } }));
    expect(mocks.api.startCall).not.toHaveBeenCalled();
  });
});

describe('CallHost (what the screen can do)', () => {
  const microphone = () => ({
    getTracks: () => [{ stop: vi.fn(), enabled: true, kind: 'audio', getSettings: () => ({}) }],
    getAudioTracks: () => [{ stop: vi.fn(), enabled: true, kind: 'audio', getSettings: () => ({}) }]
  });
  const media = (extra: object = {}) =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => microphone()), ...extra }
    });
  const ring = () =>
    act(() => mocks.stream.args?.onEvent({ type: 'call.ringing', conversationId: 'c1', at: 1, payload: RINGING }));
  const dialog = () => screen.getByRole('dialog');

  beforeEach(() => {
    mocks.callsConfig.mockResolvedValue({ enabled: true, mode: 'stun', relay: false });
    media();
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  const up = async () => {
    const view = render(<CallHost />);
    await waitFor(() => expect(window.__visinCalls).toBe(true));
    return view;
  };

  it('offers a screen share only where the browser can capture a screen, and a camera only where it has one', async () => {
    media({ getDisplayMedia: vi.fn() });
    await up();
    ring();
    expect(await screen.findByRole('button', { name: 'screen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'camera' })).toBeInTheDocument();
  });

  it('on a phone: can watch a screen but not offer one, and has no camera button without a camera', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await up();
    ring();
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'camera' })).not.toBeInTheDocument();
  });

  it('declines an incoming call', async () => {
    await up();
    ring();
    await userEvent.click(await screen.findByRole('button', { name: 'decline' }));
    expect(mocks.api.declineCall).toHaveBeenCalledWith('k1');
    expect(await screen.findByText(/^idle/)).toBeInTheDocument();
  });

  it('answers an incoming call through the microphone, and hangs up', async () => {
    class Peer {
      onicecandidate = null;
      ontrack = null;
      onconnectionstatechange = null;
      addTrack = vi.fn();
      getSenders = () => [];
      close = vi.fn();
    }
    vi.stubGlobal('RTCPeerConnection', Peer);
    mocks.api.iceServers.mockResolvedValue({ iceServers: [], relay: false, mode: 'local', expiresAt: null });
    mocks.api.acceptCall.mockResolvedValue({ ...RINGING, status: 'active', answeredBy: 'u1', answeredDeviceId: mocks.stream.args?.deviceId });
    await up();
    ring();
    await userEvent.click(await screen.findByRole('button', { name: 'accept' }));
    await waitFor(() => expect(mocks.api.acceptCall).toHaveBeenCalledWith('k1', mocks.stream.args?.deviceId));
    await userEvent.click(screen.getByRole('button', { name: 'mute' }));
    await userEvent.click(screen.getByRole('button', { name: 'microphone' }));
    await userEvent.click(screen.getByRole('button', { name: 'flip' }));
    await userEvent.click(screen.getByRole('button', { name: 'hang up' }));
    expect(mocks.api.endCall).toHaveBeenCalledWith('k1');
    vi.unstubAllGlobals();
  });

  it('shrinks the call to a bar and brings it back', async () => {
    await up();
    ring();
    await screen.findByRole('dialog');
    expect(dialog()).toHaveAttribute('data-minimized', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'minimize' }));
    expect(dialog()).toHaveAttribute('data-minimized', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'expand' }));
    expect(dialog()).toHaveAttribute('data-minimized', 'false');
  });

  it('clears the call that just ended', async () => {
    await up();
    ring();
    act(() =>
      mocks.stream.args?.onEvent({ type: 'call.ended', conversationId: 'c1', at: 2, payload: { ...RINGING, status: 'ended', endReason: 'cancelled' } })
    );
    expect(await screen.findByText('ended Irja')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(await screen.findByText(/^idle/)).toBeInTheDocument();
  });

  it('hangs up when the page goes away mid-call, but leaves a call that only rings here', async () => {
    await up();
    ring();
    await screen.findByText('incoming Irja');
    window.dispatchEvent(new Event('pagehide'));
    expect(mocks.api.endCall).not.toHaveBeenCalled();
    expect(await screen.findByText(/^idle/)).toBeInTheDocument();
  });

  it('checks for a ringing call when the app comes back into view', async () => {
    await up();
    mocks.api.currentCall.mockClear();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mocks.api.currentCall).toHaveBeenCalled();
  });

  it('keeps the screen awake while calling out, and lets it go afterwards', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    mocks.api.startCall.mockResolvedValue({ ...RINGING, caller: { userId: 'u1', name: 'Tom', picture: null }, callees: [IRJA] });
    await up();
    window.dispatchEvent(new CustomEvent('visin:call', { detail: { conversationId: 'c1', peer: IRJA } }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await userEvent.click(await screen.findByRole('button', { name: 'hang up' }));
    await waitFor(() => expect(release).toHaveBeenCalled());
  });

  it('takes the "calling you" notification down once the call is over', async () => {
    const close = vi.fn();
    const getNotifications = vi.fn(async () => [{ close }]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn(async () => ({ getNotifications })) }
    });
    await up();
    ring();
    await screen.findByText('incoming Irja');
    act(() =>
      mocks.stream.args?.onEvent({ type: 'call.ended', conversationId: 'c1', at: 2, payload: { ...RINGING, status: 'ended', endReason: 'cancelled' } })
    );
    await waitFor(() => expect(getNotifications).toHaveBeenCalledWith({ tag: 'call-k1' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
  });
});
