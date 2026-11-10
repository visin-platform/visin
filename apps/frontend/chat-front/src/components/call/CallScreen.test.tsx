import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/audioDevices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/audioDevices')>()),
  listAudioDevices: vi.fn(async () => ({
    microphones: [
      { id: 'default', label: 'Default - Headset', groupId: 'headset' },
      { id: 'webcam', label: 'Webcam', groupId: 'cam' }
    ],
    speakers: [
      { id: 'default', label: 'Default - Headset', groupId: 'headset' },
      { id: 'monitor', label: 'Monitor speakers', groupId: 'monitor' }
    ]
  })),
  canChooseSpeaker: vi.fn(() => true)
}));

import { CallScreen } from './CallScreen';
import { cameraFit, formatElapsed, statusText } from './callFormat';
import { IDLE, type CallState } from '../../services/callEngine';

const IRJA = { userId: 'u-irja', name: 'Irja', picture: null };

const handlers = () => ({
  onAccept: vi.fn(),
  onDecline: vi.fn(),
  onHangUp: vi.fn(),
  onToggleMute: vi.fn(),
  onDismiss: vi.fn()
});

const state = (patch: Partial<CallState>): CallState => ({ ...IDLE, peer: IRJA, ...patch });

describe('CallScreen', () => {
  it('draws nothing without a call', () => {
    const { container } = render(<CallScreen state={IDLE} {...handlers()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Answer and Decline for an incoming call', async () => {
    const on = handlers();
    render(<CallScreen state={state({ phase: 'incoming' })} {...on} />);

    expect(screen.getByText('Calling you')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(on.onAccept).toHaveBeenCalled();
    expect(on.onDecline).toHaveBeenCalled();
  });

  it('offers Mute and End once talking', async () => {
    const on = handlers();
    render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...on} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await userEvent.click(screen.getByRole('button', { name: 'End' }));

    expect(on.onToggleMute).toHaveBeenCalled();
    expect(on.onHangUp).toHaveBeenCalled();
  });

  it('can only be ended while still calling out', () => {
    render(<CallScreen state={state({ phase: 'outgoing' })} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Mute' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument();
  });
});

describe('statusText', () => {
  it('says what is happening at each stage', () => {
    expect(statusText(state({ phase: 'outgoing' }), null)).toBe('Calling…');
    expect(statusText(state({ phase: 'connecting' }), null)).toBe('Connecting…');
    expect(statusText(state({ phase: 'active' }), '1:05')).toBe('1:05');
    expect(statusText(state({ phase: 'active', reconnecting: true }), '1:05')).toBe('Reconnecting…');
    expect(statusText(state({ phase: 'ended', message: 'No answer' }), null)).toBe('No answer');
  });
});

describe('formatElapsed', () => {
  it('counts minutes and seconds, and hours past the hour', () => {
    expect(formatElapsed(5_000)).toBe('0:05');
    expect(formatElapsed(187_000)).toBe('3:07');
    expect(formatElapsed(3_727_000)).toBe('1:02:07');
  });
});

describe('minimized', () => {
  it('shrinks a call to a bar that can still mute, end and come back', async () => {
    const on = { ...handlers(), onExpand: vi.fn() };
    render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...on} minimized />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open call' }));
    await userEvent.click(screen.getByRole('button', { name: 'End' }));

    expect(on.onToggleMute).toHaveBeenCalled();
    expect(on.onExpand).toHaveBeenCalled();
    expect(on.onHangUp).toHaveBeenCalled();
  });

  it('never hides a ringing call in the bar', () => {
    render(<CallScreen state={state({ phase: 'incoming' })} {...handlers()} minimized />);
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument();
  });

  it('offers to minimize once talking', async () => {
    const onMinimize = vi.fn();
    render(<CallScreen state={state({ phase: 'connecting' })} {...handlers()} onMinimize={onMinimize} />);
    await userEvent.click(screen.getByRole('button', { name: 'Minimize call' }));
    expect(onMinimize).toHaveBeenCalled();
  });
});

describe('dragging the bar', () => {
  const bar = () => screen.getByRole('region', { name: 'Call with Irja' });

  it('moves where it is dragged, stays there next time, and does not open the call on letting go', () => {
    window.localStorage.clear();
    const on = { ...handlers(), onExpand: vi.fn() };
    const { unmount } = render(
      <CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...on} minimized />
    );
    bar().getBoundingClientRect = () => ({ left: 100, top: 500, width: 300, height: 50 }) as DOMRect;

    const openButton = screen.getByRole('button', { name: 'Open call' });
    fireEvent.pointerDown(openButton, { pointerId: 1, button: 0, clientX: 150, clientY: 520 });
    fireEvent.pointerMove(openButton, { pointerId: 1, clientX: 130, clientY: 320 });
    fireEvent.pointerUp(openButton, { pointerId: 1, clientX: 130, clientY: 320 });
    fireEvent.click(openButton);

    expect(bar()).toHaveStyle({ left: '80px', top: '300px' });
    expect(on.onExpand).not.toHaveBeenCalled();

    unmount();
    render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...handlers()} minimized />);
    expect(bar()).toHaveStyle({ left: '80px', top: '300px' });
  });

  it('treats a press that barely moves as a tap', () => {
    window.localStorage.clear();
    const on = { ...handlers(), onExpand: vi.fn() };
    render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...on} minimized />);

    const openButton = screen.getByRole('button', { name: 'Open call' });
    fireEvent.pointerDown(openButton, { pointerId: 1, button: 0, clientX: 150, clientY: 520 });
    fireEvent.pointerMove(openButton, { pointerId: 1, clientX: 152, clientY: 521 });
    fireEvent.pointerUp(openButton, { pointerId: 1, clientX: 152, clientY: 521 });
    fireEvent.click(openButton);

    expect(on.onExpand).toHaveBeenCalled();
  });
});

describe('call audio', () => {
  const sinks: string[] = [];

  beforeEach(() => {
    localStorage.clear();
    sinks.length = 0;
    Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
      configurable: true,
      writable: true,
      value: vi.fn(async (id: string) => {
        sinks.push(id);
      })
    });
  });

  afterEach(() => {
    delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
  });

  it('has no audio settings unless the host can move the call to another microphone', () => {
    render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Call audio settings' })).not.toBeInTheDocument();
  });

  it('is offered on a ringing call too, so the right device is set before answering', () => {
    render(<CallScreen state={state({ phase: 'incoming' })} {...handlers()} onSelectMicrophone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Call audio settings' })).toBeInTheDocument();
  });

  it('remembers a microphone and moves the call to it', async () => {
    const onSelectMicrophone = vi.fn();
    render(
      <CallScreen
        state={state({ phase: 'active', connectedAt: Date.now(), micDeviceId: 'default' })}
        {...handlers()}
        onSelectMicrophone={onSelectMicrophone}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Call audio settings' }));
    await userEvent.selectOptions(await screen.findByLabelText('Microphone'), 'webcam');

    expect(onSelectMicrophone).toHaveBeenCalledWith('webcam');
    expect(localStorage.getItem('visin.call.microphone')).toBe('webcam');
  });

  it('plays the call through the chosen speakers, and remembers them', async () => {
    render(
      <CallScreen
        state={state({ phase: 'active', connectedAt: Date.now() })}
        {...handlers()}
        onSelectMicrophone={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Call audio settings' }));
    await userEvent.selectOptions(await screen.findByLabelText('Speaker or headphones'), 'monitor');

    expect(sinks).toContain('monitor');
    expect(localStorage.getItem('visin.call.speaker')).toBe('monitor');
  });

  it('uses the speakers chosen on an earlier call as soon as the call starts', () => {
    localStorage.setItem('visin.call.speaker', 'monitor');

    render(<CallScreen state={state({ phase: 'connecting' })} {...handlers()} />);

    expect(sinks).toContain('monitor');
  });

  it('closes the settings when the call ends, and does not reopen them on the next one', async () => {
    const props = { ...handlers(), onSelectMicrophone: vi.fn() };
    const { rerender } = render(<CallScreen state={state({ phase: 'active', connectedAt: Date.now() })} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Call audio settings' }));
    expect(await screen.findByRole('dialog', { name: 'Call audio' })).toBeInTheDocument();

    rerender(<CallScreen state={state({ phase: 'ended', message: 'Call ended' })} {...props} />);
    rerender(<CallScreen state={IDLE} {...props} />);
    rerender(<CallScreen state={state({ phase: 'incoming' })} {...props} />);

    expect(screen.queryByRole('dialog', { name: 'Call audio' })).not.toBeInTheDocument();
  });

  it('leaves the output alone until a speaker has been chosen', () => {
    render(<CallScreen state={state({ phase: 'connecting' })} {...handlers()} onSelectMicrophone={vi.fn()} />);

    expect(sinks).toEqual([]);
  });

  it('puts the output back to the default when the choice is cleared', async () => {
    localStorage.setItem('visin.call.speaker', 'monitor');
    render(
      <CallScreen
        state={state({ phase: 'active', connectedAt: Date.now() })}
        {...handlers()}
        onSelectMicrophone={vi.fn()}
      />
    );
    expect(sinks).toEqual(['monitor']);

    await userEvent.click(screen.getByRole('button', { name: 'Call audio settings' }));
    await userEvent.selectOptions(await screen.findByLabelText('Speaker or headphones'), 'default');

    expect(sinks.at(-1)).toBe('default');
  });
});


describe('showing screens', () => {
  const live = (patch: Partial<CallState> = {}) => state({ phase: 'active', connectedAt: Date.now(), ...patch });
  const theirScreen = () => ({ id: 'their-screen' }) as unknown as MediaStream;
  // jsdom plays nothing and returns no promise, as every browser does.
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers to share the screen once talking, where the browser can, and says it is on', async () => {
    const onToggleScreen = vi.fn();
    const { rerender } = render(<CallScreen state={live()} {...handlers()} onToggleScreen={onToggleScreen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    expect(onToggleScreen).toHaveBeenCalledOnce();

    rerender(<CallScreen state={live({ sharingScreen: true })} {...handlers()} onToggleScreen={onToggleScreen} />);
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(onToggleScreen).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Sharing your screen/)).toBeInTheDocument();
  });

  it('does not offer it where the browser cannot capture a screen, nor before the call is connected', () => {
    const { rerender } = render(<CallScreen state={live()} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();

    rerender(<CallScreen state={state({ phase: 'connecting' })} {...handlers()} onToggleScreen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Share screen' })).not.toBeInTheDocument();
  });

  it('draws their screen, whole, when they are showing it, and says so', () => {
    render(<CallScreen state={live({ remoteSharing: true, remoteScreen: theirScreen() })} {...handlers()} />);

    const video = screen.getByLabelText('Irja’s screen') as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.muted).toBe(true);
    expect(video.srcObject).toEqual(expect.objectContaining({ id: 'their-screen' }));
    expect(screen.getByText(/Sharing their screen/)).toBeInTheDocument();
  });

  it('draws nothing until they are showing it, and takes it away when they stop', () => {
    const { rerender } = render(<CallScreen state={live({ remoteScreen: theirScreen() })} {...handlers()} />);
    expect(screen.queryByLabelText('Irja’s screen')).not.toBeInTheDocument();

    rerender(<CallScreen state={live({ remoteSharing: true, remoteScreen: theirScreen() })} {...handlers()} />);
    expect(screen.getByLabelText('Irja’s screen')).toBeInTheDocument();

    rerender(<CallScreen state={live({ remoteSharing: false, remoteScreen: theirScreen() })} {...handlers()} />);
    expect(screen.queryByLabelText('Irja’s screen')).not.toBeInTheDocument();
  });

  it('keeps the call to a bar, with no picture, while minimized, and still says they are sharing', () => {
    render(<CallScreen state={live({ remoteSharing: true, remoteScreen: theirScreen() })} {...handlers()} minimized />);
    expect(screen.queryByLabelText('Irja’s screen')).not.toBeInTheDocument();
    expect(screen.getByText(/Sharing their screen/)).toBeInTheDocument();
  });

  it('puts "Stop sharing" on the bar while you show yours, which is where the call steps aside to', async () => {
    const onToggleScreen = vi.fn();
    render(<CallScreen state={live({ sharingScreen: true })} {...handlers()} minimized onToggleScreen={onToggleScreen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));

    expect(onToggleScreen).toHaveBeenCalledOnce();
  });

  it('has no stop button on the bar when nothing is shared', () => {
    render(<CallScreen state={live()} {...handlers()} minimized onToggleScreen={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument();
  });

  it('says why a share did not start', () => {
    render(<CallScreen state={live({ screenMessage: 'Could not share your screen.' })} {...handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not share your screen.');
  });
});

describe('statusText while screens are shown', () => {
  it('adds who is showing one to the time', () => {
    const active = state({ phase: 'active', connectedAt: 1 });
    expect(statusText(active, '3:07')).toBe('3:07');
    expect(statusText({ ...active, sharingScreen: true }, '3:07')).toBe('3:07 · Sharing your screen');
    expect(statusText({ ...active, remoteSharing: true }, '3:07')).toBe('3:07 · Sharing their screen');
    expect(statusText({ ...active, reconnecting: true, sharingScreen: true }, '3:07')).toBe('Reconnecting…');
  });
});


describe('showing cameras', () => {
  const live = (patch: Partial<CallState> = {}) => state({ phase: 'active', connectedAt: Date.now(), ...patch });
  const stream = (id: string) => ({ id }) as unknown as MediaStream;
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('offers to turn the camera on once talking, and says when it is on', async () => {
    const onToggleCamera = vi.fn();
    const { rerender } = render(<CallScreen state={live()} {...handlers()} onToggleCamera={onToggleCamera} />);

    await userEvent.click(screen.getByRole('button', { name: 'Camera on' }));
    expect(onToggleCamera).toHaveBeenCalledOnce();

    rerender(<CallScreen state={live({ cameraOn: true, localCamera: stream('me') })} {...handlers()} onToggleCamera={onToggleCamera} />);
    expect(screen.queryByRole('button', { name: 'Camera on' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Camera off' }));
    expect(onToggleCamera).toHaveBeenCalledTimes(2);
  });

  it('does not offer it where there is no camera to offer, nor before the call is connected', () => {
    const { rerender } = render(<CallScreen state={live()} {...handlers()} />);
    expect(screen.queryByRole('button', { name: 'Camera on' })).not.toBeInTheDocument();
    rerender(<CallScreen state={state({ phase: 'connecting' })} {...handlers()} onToggleCamera={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Camera on' })).not.toBeInTheDocument();
  });

  it('draws their camera as the stage when only the camera is on', () => {
    render(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} />);
    const video = screen.getByLabelText('Irja’s camera') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.srcObject).toEqual(expect.objectContaining({ id: 'her' }));
    expect(screen.queryByLabelText('Irja’s screen')).not.toBeInTheDocument();
  });

  it('clears the name and buttons off their picture on a tap, and brings them back on the next', async () => {
    render(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} />);
    const buttons = screen.getByRole('button', { name: 'End' }).parentElement!.parentElement!;
    expect(buttons).toHaveStyle({ opacity: '1' });

    await userEvent.click(screen.getByTestId('call-stage'));
    expect(buttons).toHaveStyle({ opacity: '0', pointerEvents: 'none' });

    await userEvent.click(screen.getByTestId('call-stage'));
    expect(buttons).toHaveStyle({ opacity: '1' });
  });

  it('brings the controls back when their picture goes', async () => {
    const { rerender } = render(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} />);
    await userEvent.click(screen.getByTestId('call-stage'));
    rerender(<CallScreen state={live({ remoteCamera: false })} {...handlers()} />);
    expect(screen.getByRole('button', { name: 'End' }).parentElement!.parentElement!).not.toHaveStyle({ opacity: '0' });
  });

  it('fits their camera to the screen once its size is known', () => {
    render(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} />);
    const video = screen.getByLabelText('Irja’s camera') as HTMLVideoElement;
    expect(video).toHaveStyle({ objectFit: 'cover' });

    // An upright phone camera on a wide window is shown whole.
    Object.defineProperty(video, 'videoWidth', { value: 720, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1280, configurable: true });
    Object.defineProperty(video, 'clientWidth', { value: 1600, configurable: true });
    Object.defineProperty(video, 'clientHeight', { value: 900, configurable: true });
    fireEvent(video, new Event('resize'));
    expect(video).toHaveStyle({ objectFit: 'contain' });
  });

  it('draws nothing of theirs until their camera is on, and takes it away when it goes off', () => {
    const { rerender } = render(<CallScreen state={live({ remoteCameraStream: stream('her') })} {...handlers()} />);
    expect(screen.queryByLabelText('Irja’s camera')).not.toBeInTheDocument();
    rerender(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} />);
    expect(screen.getByLabelText('Irja’s camera')).toBeInTheDocument();
    rerender(<CallScreen state={live({ remoteCamera: false, remoteCameraStream: stream('her') })} {...handlers()} />);
    expect(screen.queryByLabelText('Irja’s camera')).not.toBeInTheDocument();
  });

  it('gives the stage to their screen when both are on, with their camera beside it small', () => {
    render(
      <CallScreen
        state={live({ remoteSharing: true, remoteScreen: stream('page'), remoteCamera: true, remoteCameraStream: stream('her') })}
        {...handlers()}
      />
    );
    expect((screen.getByLabelText('Irja’s screen') as HTMLVideoElement).srcObject).toEqual(expect.objectContaining({ id: 'page' }));
    // One of their camera, not two: the thumbnail, not also a stage.
    expect(screen.getAllByLabelText('Irja’s camera')).toHaveLength(1);
  });

  it('shows you yourself, mirrored, and their screen is not', () => {
    render(
      <CallScreen
        state={live({ cameraOn: true, localCamera: stream('me'), remoteSharing: true, remoteScreen: stream('page') })}
        {...handlers()}
      />
    );
    expect(screen.getByLabelText('Your camera')).toHaveStyle({ transform: 'scaleX(-1)' });
    expect(screen.getByLabelText('Irja’s screen')).not.toHaveStyle({ transform: 'scaleX(-1)' });
  });

  it('shows no stage and no picture of you on the bar, and none before the call is connected', () => {
    const picture = { cameraOn: true, localCamera: stream('me'), remoteCamera: true, remoteCameraStream: stream('her') };
    const { rerender } = render(<CallScreen state={live(picture)} {...handlers()} minimized />);
    expect(screen.queryByLabelText('Your camera')).not.toBeInTheDocument();
    rerender(<CallScreen state={state({ ...picture, phase: 'connecting' })} {...handlers()} />);
    expect(screen.queryByLabelText('Your camera')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Irja’s camera')).not.toBeInTheDocument();
  });

  describe('on the minimized bar', () => {
    it('shows their camera, small and round, in place of who they are, while it is on', () => {
      const { rerender } = render(<CallScreen state={live()} {...handlers()} minimized />);
      expect(screen.queryByLabelText('Irja’s camera')).not.toBeInTheDocument();

      rerender(<CallScreen state={live({ remoteCamera: true, remoteCameraStream: stream('her') })} {...handlers()} minimized />);
      expect((screen.getByLabelText('Irja’s camera') as HTMLVideoElement).srcObject).toEqual(expect.objectContaining({ id: 'her' }));
    });

    it('shows that your camera is on, and turns it off from there', async () => {
      const onToggleCamera = vi.fn();
      const { rerender } = render(<CallScreen state={live()} {...handlers()} minimized onToggleCamera={onToggleCamera} />);
      expect(screen.queryByRole('button', { name: 'Camera off' })).not.toBeInTheDocument();

      rerender(
        <CallScreen state={live({ cameraOn: true, localCamera: stream('me') })} {...handlers()} minimized onToggleCamera={onToggleCamera} />
      );
      await userEvent.click(screen.getByRole('button', { name: 'Camera off' }));
      expect(onToggleCamera).toHaveBeenCalledOnce();
    });
  });

  describe('turning the camera', () => {
    const own = { cameraOn: true, localCamera: stream('me') };

    it('offers to flip it on your own picture, when the phone has another camera', async () => {
      const onFlipCamera = vi.fn();
      render(<CallScreen state={live({ ...own, canFlipCamera: true })} {...handlers()} onFlipCamera={onFlipCamera} />);

      await userEvent.click(screen.getByRole('button', { name: 'Flip camera' }));

      expect(onFlipCamera).toHaveBeenCalledOnce();
    });

    it('offers nothing to flip where there is no other camera, or no camera on', () => {
      const { rerender } = render(<CallScreen state={live({ ...own, canFlipCamera: false })} {...handlers()} onFlipCamera={() => {}} />);
      expect(screen.queryByRole('button', { name: 'Flip camera' })).not.toBeInTheDocument();
      rerender(<CallScreen state={live({ canFlipCamera: true })} {...handlers()} onFlipCamera={() => {}} />);
      expect(screen.queryByRole('button', { name: 'Flip camera' })).not.toBeInTheDocument();
      rerender(<CallScreen state={live({ ...own, canFlipCamera: true })} {...handlers()} />);
      expect(screen.queryByRole('button', { name: 'Flip camera' })).not.toBeInTheDocument();
    });

    it('mirrors the front camera, as a mirror would, and the back camera not at all', () => {
      const { rerender } = render(<CallScreen state={live({ ...own, cameraFacing: 'user' })} {...handlers()} />);
      expect(screen.getByLabelText('Your camera')).toHaveStyle({ transform: 'scaleX(-1)' });
      rerender(<CallScreen state={live({ ...own, cameraFacing: 'environment' })} {...handlers()} />);
      expect(screen.getByLabelText('Your camera')).not.toHaveStyle({ transform: 'scaleX(-1)' });
    });
  });

  it('says why the camera did not come on', () => {
    render(<CallScreen state={live({ cameraMessage: 'Camera is blocked.' })} {...handlers()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Camera is blocked.');
  });
});

describe('cameraFit', () => {
  it('fills the screen with a picture the same way round as it', () => {
    expect(cameraFit({ width: 720, height: 1280 }, { width: 412, height: 870 })).toBe('cover');
    expect(cameraFit({ width: 1280, height: 720 }, { width: 1600, height: 900 })).toBe('cover');
  });

  it('fills an upright phone with a wide picture, taking off the sides rather than leaving black bars', () => {
    expect(cameraFit({ width: 1280, height: 720 }, { width: 412, height: 870 })).toBe('cover');
  });

  it('shows an upright picture on a wide screen whole, rather than cutting off the head and chin', () => {
    expect(cameraFit({ width: 720, height: 1280 }, { width: 1600, height: 900 })).toBe('contain');
  });

  it('fills while the size is not known yet', () => {
    expect(cameraFit({ width: 0, height: 0 }, { width: 412, height: 870 })).toBe('cover');
    expect(cameraFit({ width: 720, height: 1280 }, { width: 0, height: 0 })).toBe('cover');
  });
});
