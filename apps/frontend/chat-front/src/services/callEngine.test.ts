import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@visin/frontend-core';
import {
  CAMERA_BLOCKED,
  CAMERA_BUSY,
  CAMERA_MAX_BITRATE,
  CAMERA_NO_OTHER,
  CAMERA_NOT_FOUND,
  CAMERA_NOT_RECEIVED,
  CAMERA_SMALL_BITRATE,
  CallEngine,
  MIC_BLOCKED,
  NO_CONNECTION,
  NO_RELAY,
  encodingFor,
  SCREEN_MAX_BITRATE,
  SCREEN_NOT_RECEIVED,
  SCREEN_NOT_SUPPORTED,
  type CallApi,
  type CallState
} from './callEngine';
import type { CallSignalData, CallView, ChatEvent } from '../types/call';

interface FakeLine {
  kind: string;
  init: RTCRtpTransceiverInit | undefined;
  /** Made here by an incoming offer, rather than by this side. */
  madeByOffer: boolean;
  direction: RTCRtpTransceiverDirection;
  currentDirection: RTCRtpTransceiverDirection | null;
  receiver: { track: { kind: string } };
  sender: {
    track: MediaStreamTrack | null;
    replaceTrack: ReturnType<typeof vi.fn>;
    getParameters: ReturnType<typeof vi.fn>;
    setParameters: ReturnType<typeof vi.fn>;
  };
}

/** Records what the engine does to its connection, and lets a test drive it. */
class FakePeer {
  static created: FakePeer[] = [];
  config: RTCConfiguration;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';
  added: RTCIceCandidateInit[] = [];
  tracks: MediaStreamTrack[] = [];
  senders: Array<{ track: MediaStreamTrack | null; replaceTrack: ReturnType<typeof vi.fn> }> = [];
  closed = false;
  offers: Array<RTCOfferOptions | undefined> = [];
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  constructor(config: RTCConfiguration) {
    this.config = config;
    FakePeer.created.push(this);
  }
  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
    const sender = {
      track: track as MediaStreamTrack | null,
      replaceTrack: vi.fn(async (next: MediaStreamTrack) => {
        sender.track = next;
      })
    };
    this.senders.push(sender);
  }
  getSenders() {
    return this.senders;
  }
  transceivers: FakeLine[] = [];
  /** What an offer arriving here holds: the camera and screen lines of a current app, fewer from an older one. */
  static offerVideoLines = 2;
  /** How the far end answers this side's video line, as this side then sees it: 'sendonly' when an older app answered receive-only. */
  static answeredAs: RTCRtpTransceiverDirection = 'sendrecv';
  private line(kind: string, direction: RTCRtpTransceiverDirection, init?: RTCRtpTransceiverInit, madeByOffer = false): FakeLine {
    const sender = {
      track: null as MediaStreamTrack | null,
      replaceTrack: vi.fn(async (next: MediaStreamTrack | null) => {
        sender.track = next;
      }),
      getParameters: vi.fn(() => ({ encodings: [{}] }) as unknown as RTCRtpSendParameters),
      setParameters: vi.fn(async () => undefined)
    };
    const line: FakeLine = { kind, init, madeByOffer, direction, currentDirection: null, receiver: { track: { kind } }, sender };
    this.transceivers.push(line);
    return line;
  }
  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    return this.line(kind, init?.direction ?? 'sendrecv', init) as unknown as RTCRtpTransceiver;
  }
  getTransceivers() {
    return this.transceivers as unknown as RTCRtpTransceiver[];
  }
  async createOffer(options?: RTCOfferOptions) {
    this.offers.push(options);
    return { type: 'offer' as const, sdp: `offer-${this.offers.length}` };
  }
  async createAnswer() {
    return { type: 'answer' as const, sdp: 'answer-1' };
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    // Answering settles the lines the offer made at what this side set them to. A line made here that no
    // offer section was matched to is not negotiated at all, and stays without a direction.
    if (description.type === 'answer') {
      for (const line of this.transceivers) if (line.madeByOffer) line.currentDirection = line.direction;
    }
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    // As browsers do: an offer's video line gets a line of its own here, receive-only until told otherwise.
    // A line this side made with addTransceiver is never taken for it.
    if (description.type === 'offer' && !this.transceivers.some((line) => line.madeByOffer)) {
      for (let i = 0; i < FakePeer.offerVideoLines; i += 1) this.line('video', 'recvonly', undefined, true);
    }
    if (description.type === 'answer') for (const line of this.transceivers) line.currentDirection = FakePeer.answeredAs;
  }
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    this.added.push(candidate);
  }
  close() {
    this.closed = true;
  }
  connect(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

const track = (deviceId = 'built-in') =>
  ({ enabled: true, stop: vi.fn(), kind: 'audio', getSettings: () => ({ deviceId }) }) as unknown as MediaStreamTrack;
const microphone = (deviceId = 'built-in') => {
  const tracks = [track(deviceId)];
  return { getTracks: () => tracks, getAudioTracks: () => tracks } as unknown as MediaStream;
};

const TOM = { userId: 'u-tom', name: 'Tom', picture: null };
const IRJA = { userId: 'u-irja', name: 'Irja', picture: null };

const callView = (overrides: Partial<CallView> = {}): CallView => ({
  id: 'call-1',
  conversationId: 'c1',
  caller: TOM,
  callees: [IRJA],
  callerDeviceId: 'tom-phone',
  answeredBy: null,
  answeredDeviceId: null,
  status: 'ringing',
  endReason: null,
  startedAt: '2026-09-23T10:00:00Z',
  answeredAt: null,
  endedAt: null,
  ...overrides
});

const answeredView = callView({ status: 'active', answeredBy: 'u-irja', answeredDeviceId: 'irja-phone' });

const event = (type: ChatEvent['type'], payload: unknown): ChatEvent => ({
  type,
  conversationId: 'c1',
  at: 1,
  payload
});

function makeApi(): CallApi & { [K in keyof CallApi]: ReturnType<typeof vi.fn> } {
  return {
    iceServers: vi.fn(async () => ({
      iceServers: [{ urls: 'turn:relay', username: 'u', credential: 'c' }],
      relay: true,
      mode: 'turn' as const,
      expiresAt: null
    })),
    currentCall: vi.fn(async () => null),
    startCall: vi.fn(async () => callView()),
    acceptCall: vi.fn(async () => answeredView),
    declineCall: vi.fn(async () => undefined),
    endCall: vi.fn(async () => undefined),
    sendSignal: vi.fn(async () => undefined)
  };
}

/** Lets queued promise chains (signal send and receive) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let api: ReturnType<typeof makeApi>;
let states: CallState[];

function engineFor(
  userId: string,
  deviceId: string,
  getMicrophone: (deviceId: string | null) => Promise<MediaStream> = async () => microphone(),
  preferredMicrophone?: () => string | null,
  getScreen?: () => Promise<MediaStream>,
  getCamera?: (facing: 'user' | 'environment') => Promise<MediaStream>,
  countCameras?: () => Promise<number>
) {
  // This test's own list: an engine from an earlier test still has a timer or two to fire, and must not write into this one.
  const mine = states;
  return new CallEngine({
    api,
    userId,
    deviceId,
    onChange: (state) => mine.push(state),
    createPeer: (config) => new FakePeer(config) as unknown as RTCPeerConnection,
    getMicrophone,
    getScreen,
    getCamera,
    countCameras,
    preferredMicrophone,
    lingerMs: 50
  });
}

const last = () => states[states.length - 1]!;
const sent = (): CallSignalData[] => api.sendSignal.mock.calls.map((call) => call[2] as CallSignalData);

beforeEach(() => {
  api = makeApi();
  states = [];
  FakePeer.created = [];
  FakePeer.offerVideoLines = 2;
  FakePeer.answeredAs = 'sendrecv';
});

afterEach(() => vi.useRealTimers());

describe('placing a call', () => {
  it('rings with this device, then sends the offer once it is answered', async () => {
    const engine = engineFor('u-tom', 'tom-phone');

    await engine.start('c1', IRJA);
    expect(api.startCall).toHaveBeenCalledWith('c1', 'tom-phone');
    expect(last()).toMatchObject({ phase: 'outgoing', peer: IRJA, call: { id: 'call-1' } });

    engine.handleEvent(event('call.accepted', answeredView));
    await settle();

    const peer = FakePeer.created[0]!;
    expect(peer.config.iceServers).toEqual([{ urls: 'turn:relay', username: 'u', credential: 'c' }]);
    expect(peer.tracks).toHaveLength(1);
    expect(sent()).toEqual([{ description: { type: 'offer', sdp: 'offer-1' } }]);
    expect(last().phase).toBe('connecting');
  });

  it('holds candidates that arrive before the answer, then applies them in order', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    const signal = (data: CallSignalData) =>
      engine.handleEvent(
        event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data })
      );

    signal({ candidate: { candidate: 'a' } });
    signal({ description: { type: 'answer', sdp: 'answer-1' } });
    signal({ candidate: { candidate: 'b' } });
    await settle();

    const peer = FakePeer.created[0]!;
    expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'answer-1' });
    expect(peer.added.map((c) => c.candidate)).toEqual(['a', 'b']);
  });

  it('shows the timer once audio connects', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();

    FakePeer.created[0]!.connect('connected');

    expect(last()).toMatchObject({ phase: 'active', reconnecting: false });
    expect(last().connectedAt).toEqual(expect.any(Number));
  });

  it('restarts ICE from the caller when the connection fails', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');

    peer.connect('failed');
    await settle();

    expect(last().reconnecting).toBe(true);
    expect(peer.offers.at(-1)).toEqual({ iceRestart: true });
    expect(sent().at(-1)).toEqual({ description: { type: 'offer', sdp: 'offer-2' } });
    engine.dispose();
  });

  it('says so and never rings when the microphone is refused', async () => {
    const engine = engineFor('u-tom', 'tom-phone', async () => {
      throw new Error('NotAllowedError');
    });

    await engine.start('c1', IRJA);

    expect(api.startCall).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'ended', message: MIC_BLOCKED });
  });

  it('passes on the server’s reason when the other person is busy', async () => {
    api.startCall.mockRejectedValue(new ApiError(409, 'Irja is on another call', {}));
    const engine = engineFor('u-tom', 'tom-phone');

    await engine.start('c1', IRJA);

    expect(last()).toMatchObject({ phase: 'ended', message: 'Irja is on another call' });
  });

  it('cancels a call hung up before the server answered', async () => {
    let answer: (call: CallView) => void = () => undefined;
    api.startCall.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const engine = engineFor('u-tom', 'tom-phone');

    const starting = engine.start('c1', IRJA);
    await settle();
    engine.hangUp();
    answer(callView());
    await starting;

    expect(api.endCall).toHaveBeenCalledWith('call-1');
    expect(last().phase).toBe('idle');
  });

  it('tells the caller when the call is declined, and stops the microphone', async () => {
    const mic = microphone();
    const engine = engineFor('u-tom', 'tom-phone', async () => mic);
    await engine.start('c1', IRJA);

    engine.handleEvent(event('call.ended', callView({ status: 'ended', endReason: 'declined' })));

    expect(last()).toMatchObject({ phase: 'ended', message: "Irja can't talk right now" });
    expect(mic.getTracks()[0]!.stop).toHaveBeenCalled();
  });

  it('goes quiet again after the ended screen has been shown', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.ended', callView({ status: 'ended', endReason: 'missed' })));
    expect(last().message).toBe('No answer');

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(last().phase).toBe('idle');
  });
});

describe('being called', () => {
  it('rings for the person called, and not for the caller’s other devices', () => {
    const irja = engineFor('u-irja', 'irja-phone');
    const tomsLaptop = engineFor('u-tom', 'tom-laptop');

    irja.handleEvent(event('call.ringing', callView()));
    tomsLaptop.handleEvent(event('call.ringing', callView()));

    expect(irja.snapshot).toMatchObject({ phase: 'incoming', peer: TOM });
    expect(tomsLaptop.snapshot.phase).toBe('idle');
  });

  it('answers with the connection ready before the server hears it, then answers the offer', async () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    api.acceptCall.mockImplementation(async () => {
      // By the time the server records the answer, the connection must exist.
      expect(FakePeer.created).toHaveLength(1);
      return answeredView;
    });

    await irja.accept();
    irja.handleEvent(
      event('call.signal', {
        callId: 'call-1',
        fromDeviceId: 'tom-phone',
        toDeviceId: 'irja-phone',
        data: { description: { type: 'offer', sdp: 'offer-1' } }
      })
    );
    await settle();

    expect(api.acceptCall).toHaveBeenCalledWith('call-1', 'irja-phone');
    expect(FakePeer.created[0]!.remoteDescription).toEqual({ type: 'offer', sdp: 'offer-1' });
    expect(sent()).toEqual([{ description: { type: 'answer', sdp: 'answer-1' } }]);
  });

  it('ignores signals meant for another device', async () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    irja.handleEvent(
      event('call.signal', {
        callId: 'call-1',
        fromDeviceId: 'tom-phone',
        toDeviceId: 'irja-laptop',
        data: { description: { type: 'offer', sdp: 'offer-1' } }
      })
    );
    await settle();

    expect(FakePeer.created[0]!.remoteDescription).toBeNull();
  });

  it('stops ringing when answered on another of the same person’s devices', () => {
    const laptop = engineFor('u-irja', 'irja-laptop');
    laptop.handleEvent(event('call.ringing', callView()));

    laptop.handleEvent(event('call.accepted', answeredView));

    expect(laptop.snapshot.phase).toBe('idle');
  });

  it('declines', () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));

    irja.decline();

    expect(api.declineCall).toHaveBeenCalledWith('call-1');
    expect(irja.snapshot.phase).toBe('idle');
  });

  it('shows a missed call when the caller gives up', () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));

    irja.handleEvent(event('call.ended', callView({ status: 'ended', endReason: 'cancelled' })));

    expect(irja.snapshot).toMatchObject({ phase: 'ended', message: 'Missed call' });
  });

  it('finds a ringing call on opening the app from the notification', async () => {
    api.currentCall.mockResolvedValue(callView());
    const irja = engineFor('u-irja', 'irja-phone');

    await irja.resume();

    expect(irja.snapshot).toMatchObject({ phase: 'incoming', call: { id: 'call-1' } });
  });

  it('does not ring for a second call while in one', async () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    irja.handleEvent(
      event('call.ringing', callView({ id: 'call-2', caller: { userId: 'u-x', name: 'X', picture: null } }))
    );

    expect(irja.snapshot.call?.id).toBe('call-1');
  });
});

describe('during a call', () => {
  it('mutes and unmutes the microphone', async () => {
    const mic = microphone();
    const irja = engineFor('u-irja', 'irja-phone', async () => mic);
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    irja.toggleMute();
    expect(mic.getAudioTracks()[0]!.enabled).toBe(false);
    expect(irja.snapshot.muted).toBe(true);

    irja.toggleMute();
    expect(mic.getAudioTracks()[0]!.enabled).toBe(true);
  });

  it('hangs up: tells the server, closes the connection, says the call ended', async () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    irja.hangUp();

    expect(api.endCall).toHaveBeenCalledWith('call-1');
    expect(FakePeer.created[0]!.closed).toBe(true);
    expect(irja.snapshot).toMatchObject({ phase: 'ended', message: 'Call ended' });
  });

  it('gives up when a call never connects', async () => {
    const irja = new CallEngine({
      api,
      userId: 'u-irja',
      deviceId: 'irja-phone',
      onChange: () => undefined,
      createPeer: (config) => new FakePeer(config) as unknown as RTCPeerConnection,
      getMicrophone: async () => microphone(),
      connectTimeoutMs: 20
    });
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(api.endCall).toHaveBeenCalled();
    expect(irja.snapshot.message).toBe('Could not connect the call.');
  });

  it('hangs up when the page goes away mid-call', async () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();

    irja.dispose();

    expect(api.endCall).toHaveBeenCalledWith('call-1');
  });
});

describe('choosing the microphone', () => {
  const answered = async (getMicrophone: (id: string | null) => Promise<MediaStream>, preferred?: () => string | null) => {
    const irja = engineFor('u-irja', 'irja-phone', getMicrophone, preferred);
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();
    return irja;
  };

  it('opens the one that was chosen, and says which device it got', async () => {
    const getMicrophone = vi.fn(async (id: string | null) => microphone(id ?? 'built-in'));

    const irja = await answered(getMicrophone, () => 'headset');

    expect(getMicrophone).toHaveBeenCalledWith('headset');
    expect(irja.snapshot.micDeviceId).toBe('headset');
  });

  it('asks for the system default when nothing was chosen', async () => {
    const getMicrophone = vi.fn(async () => microphone());

    await answered(getMicrophone);

    expect(getMicrophone).toHaveBeenCalledWith(null);
  });

  it('moves a call to another microphone without a new offer', async () => {
    const first = microphone('built-in');
    const second = microphone('headset');
    const getMicrophone = vi.fn(async (id: string | null) => (id === 'headset' ? second : first));
    const irja = await answered(getMicrophone);
    const offersBefore = FakePeer.created[0]!.offers.length;

    await irja.switchMicrophone('headset');

    const sender = FakePeer.created[0]!.senders[0]!;
    expect(sender.replaceTrack).toHaveBeenCalledWith(second.getAudioTracks()[0]);
    expect(first.getAudioTracks()[0]!.stop).toHaveBeenCalled();
    expect(second.getAudioTracks()[0]!.stop).not.toHaveBeenCalled();
    expect(irja.snapshot.micDeviceId).toBe('headset');
    expect(FakePeer.created[0]!.offers).toHaveLength(offersBefore);
  });

  it('keeps a muted call muted on the new microphone', async () => {
    const second = microphone('headset');
    const getMicrophone = vi.fn(async (id: string | null) => (id === 'headset' ? second : microphone()));
    const irja = await answered(getMicrophone);
    irja.toggleMute();

    await irja.switchMicrophone('headset');

    expect(second.getAudioTracks()[0]!.enabled).toBe(false);
    expect(irja.snapshot.muted).toBe(true);
  });

  it('stays on the current microphone when the new one will not open', async () => {
    const first = microphone('built-in');
    const getMicrophone = vi.fn(async (id: string | null) => {
      if (id === 'headset') throw new Error('NotReadableError');
      return first;
    });
    const irja = await answered(getMicrophone);

    await irja.switchMicrophone('headset');

    expect(first.getAudioTracks()[0]!.stop).not.toHaveBeenCalled();
    expect(irja.snapshot.micDeviceId).toBe('built-in');
  });

  it('lets go of the new microphone if the swap is refused', async () => {
    const first = microphone('built-in');
    const second = microphone('headset');
    const getMicrophone = vi.fn(async (id: string | null) => (id === 'headset' ? second : first));
    const irja = await answered(getMicrophone);
    FakePeer.created[0]!.senders[0]!.replaceTrack.mockRejectedValueOnce(new Error('InvalidStateError'));

    await irja.switchMicrophone('headset');

    expect(second.getAudioTracks()[0]!.stop).toHaveBeenCalled();
    expect(first.getAudioTracks()[0]!.stop).not.toHaveBeenCalled();
    expect(irja.snapshot.micDeviceId).toBe('built-in');
  });

  it('does nothing when there is no call', async () => {
    const getMicrophone = vi.fn(async () => microphone());
    const irja = engineFor('u-irja', 'irja-phone', getMicrophone);

    await irja.switchMicrophone('headset');

    expect(getMicrophone).not.toHaveBeenCalled();
  });

  /** A microphone request the test settles itself, to put answers in the order it wants. */
  const deferred = () => {
    let resolve!: (stream: MediaStream) => void;
    const promise = new Promise<MediaStream>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  it('ends on the last choice when an earlier one is answered later', async () => {
    const first = microphone('built-in');
    const slow = deferred();
    const fast = deferred();
    const pending = [slow, fast];
    const getMicrophone = vi.fn(async (id: string | null) => (id === null ? first : pending.shift()!.promise));
    const irja = await answered(getMicrophone);
    const sender = FakePeer.created[0]!.senders[0]!;
    const usb = microphone('usb');
    const headset = microphone('headset');

    const one = irja.switchMicrophone('usb');
    const two = irja.switchMicrophone('headset');
    fast.resolve(headset);
    await two;
    slow.resolve(usb);
    await one;

    expect(irja.snapshot.micDeviceId).toBe('headset');
    expect(sender.track).toBe(headset.getAudioTracks()[0]);
    expect(usb.getAudioTracks()[0]!.stop).toHaveBeenCalled();
  });

  it('ends on the last choice when the earlier one is answered first', async () => {
    const first = microphone('built-in');
    const early = deferred();
    const late = deferred();
    const pending = [early, late];
    const getMicrophone = vi.fn(async (id: string | null) => (id === null ? first : pending.shift()!.promise));
    const irja = await answered(getMicrophone);
    const usb = microphone('usb');
    const headset = microphone('headset');

    const one = irja.switchMicrophone('usb');
    const two = irja.switchMicrophone('headset');
    early.resolve(usb);
    await one;
    late.resolve(headset);
    await two;

    expect(irja.snapshot.micDeviceId).toBe('headset');
    expect(usb.getAudioTracks()[0]!.stop).toHaveBeenCalled();
    expect(headset.getAudioTracks()[0]!.stop).not.toHaveBeenCalled();
  });

  it('does not put a microphone chosen on one call into the next', async () => {
    const first = microphone('built-in');
    const pending = deferred();
    const getMicrophone = vi.fn(async (id: string | null) => (id === 'headset' ? pending.promise : first));
    const irja = await answered(getMicrophone);

    const switching = irja.switchMicrophone('headset');
    irja.hangUp();
    // A new call, opened on its own microphone, while the old switch is outstanding.
    const second = microphone('built-in-2');
    getMicrophone.mockImplementation(async (id: string | null) => (id === 'headset' ? pending.promise : second));
    irja.handleEvent(event('call.ringing', callView({ id: 'call-2' })));
    await irja.accept();
    const late = microphone('headset');
    pending.resolve(late);
    await switching;

    expect(irja.snapshot.micDeviceId).toBe('built-in-2');
    expect(late.getAudioTracks()[0]!.stop).toHaveBeenCalled();
    expect(second.getAudioTracks()[0]!.stop).not.toHaveBeenCalled();
  });
});

describe('review fixes', () => {
  it('does not leave a connection open when the call ends while ICE servers load', async () => {
    let release: () => void = () => undefined;
    api.iceServers.mockReturnValue(
      new Promise((resolve) => (release = () => resolve({ iceServers: [], relay: false, mode: 'local' as const, expiresAt: null })))
    );
    const tom = engineFor('u-tom', 'tom-phone');
    await tom.start('c1', IRJA);
    tom.handleEvent(event('call.accepted', answeredView));

    tom.handleEvent(event('call.ended', callView({ status: 'ended', endReason: 'hangup' })));
    release();
    await settle();

    expect(FakePeer.created).toHaveLength(0);
  });

  it('leaving the page hangs up a call but keeps the engine working for the next one', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    await tom.start('c1', IRJA);

    tom.leave();
    expect(api.endCall).toHaveBeenCalledWith('call-1');

    const irja = engineFor('u-irja', 'irja-phone');
    irja.leave();
    irja.handleEvent(event('call.ringing', callView({ id: 'call-2' })));
    expect(irja.snapshot.phase).toBe('incoming');
  });

  it('leaving the page while a call only rings here does not decline it for other devices', () => {
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));

    irja.leave();

    expect(api.declineCall).not.toHaveBeenCalled();
    expect(api.endCall).not.toHaveBeenCalled();
  });
});


describe('showing a screen to the other person', () => {
  const screenTrack = () => {
    const ended: Array<() => void> = [];
    return {
      kind: 'video',
      contentHint: '',
      stop: vi.fn(),
      addEventListener: (_type: string, handler: () => void) => ended.push(handler),
      end: () => ended.forEach((handler) => handler())
    };
  };
  const screenStream = (track = screenTrack()) =>
    ({ getTracks: () => [track], getVideoTracks: () => [track] }) as unknown as MediaStream;

  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  /** Tom has called Irja, her answer has come back, and the audio is through. */
  async function onCall(getScreen: () => Promise<MediaStream>) {
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, getScreen);
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    // The first video line is the camera's, the second the screen's.
    return { engine, peer, line: peer.transceivers[1]!, cameraLine: peer.transceivers[0]! };
  }

  /** Irja has answered Tom's call, his offer has come in, and the audio is through. */
  async function answeredCall(getScreen: () => Promise<MediaStream>) {
    const engine = engineFor('u-irja', 'irja-phone', undefined, undefined, getScreen);
    engine.handleEvent(event('call.ringing', callView()));
    await engine.accept();
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'tom-phone', toDeviceId: 'irja-phone', data: { description: { type: 'offer', sdp: 'offer-1' } } }));
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    return { engine, peer };
  }

  it('makes two two-way video lines with the connection, camera then screen, filed under the call’s own stream', async () => {
    const { line, cameraLine, peer } = await onCall(async () => screenStream());
    expect(peer.transceivers.map((t) => t.kind)).toEqual(['video', 'video']);
    for (const each of [cameraLine, line]) {
      expect(each.init).toMatchObject({ direction: 'sendrecv', streams: [expect.anything()] });
    }
  });

  it('the one who answers takes the line the offer made, turns it two-way, and can show a screen on it', async () => {
    const track = screenTrack();
    const { engine, peer } = await answeredCall(async () => screenStream(track));

    // No lines of its own, which an offer would not have been matched to: the two the offer made.
    expect(peer.transceivers).toHaveLength(2);
    expect(peer.transceivers.every((line) => line.madeByOffer && line.direction === 'sendrecv' && line.currentDirection === 'sendrecv')).toBe(true);
    // The screen is the second.
    const line = peer.transceivers[1]!;

    await engine.toggleScreen();
    await settle();

    expect(line.sender.replaceTrack).toHaveBeenCalledWith(track);
    expect(last().sharingScreen).toBe(true);
  });

  it('keeps the line it took through a later offer, such as an ICE restart', async () => {
    const { engine, peer } = await answeredCall(async () => screenStream());
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'tom-phone', toDeviceId: 'irja-phone', data: { description: { type: 'offer', sdp: 'offer-2' } } }));
    await settle();
    expect(peer.transceivers).toHaveLength(2);
  });

  it('tells the one who answers that the caller’s app is out of date, when its offer has no video line', async () => {
    FakePeer.offerVideoLines = 0;
    const getScreen = vi.fn(async () => screenStream());
    const { engine } = await answeredCall(getScreen);

    await engine.toggleScreen();

    expect(getScreen).not.toHaveBeenCalled();
    expect(last().screenMessage).toBe(SCREEN_NOT_RECEIVED);
  });

  it('puts the chosen screen on that line without a new offer, sharp and limited, and says so', async () => {
    const track = screenTrack();
    const { engine, peer, line } = await onCall(async () => screenStream(track));
    const offers = peer.offers.length;

    await engine.toggleScreen();
    await settle();

    expect(line.sender.replaceTrack).toHaveBeenCalledWith(track);
    expect(track.contentHint).toBe('detail');
    expect(line.sender.setParameters).toHaveBeenCalledWith({ encodings: [{ active: true, maxBitrate: SCREEN_MAX_BITRATE, scaleResolutionDownBy: 1 }] });
    expect(peer.offers).toHaveLength(offers);
    expect(last().sharingScreen).toBe(true);
    expect(sent().at(-1)).toEqual({ screen: true });
  });

  it('stops: the picture is taken off the line, the capture ends and the other side is told', async () => {
    const track = screenTrack();
    const { engine, line } = await onCall(async () => screenStream(track));
    await engine.toggleScreen();

    await engine.toggleScreen();
    await settle();

    expect(track.stop).toHaveBeenCalled();
    expect(line.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(last().sharingScreen).toBe(false);
    expect(sent().at(-1)).toEqual({ screen: false });
  });

  it('stops too when the browser’s own "Stop sharing" bar is used', async () => {
    const track = screenTrack();
    const { engine } = await onCall(async () => screenStream(track));
    await engine.toggleScreen();

    track.end();
    await settle();

    expect(last().sharingScreen).toBe(false);
    expect(sent().at(-1)).toEqual({ screen: false });
  });

  it('does nothing, and says nothing, when the person closes the picker', async () => {
    const { engine, line } = await onCall(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    const signals = sent().length;

    await engine.toggleScreen();

    expect(last()).toMatchObject({ sharingScreen: false, screenMessage: null });
    expect(line.sender.replaceTrack).not.toHaveBeenCalled();
    expect(sent()).toHaveLength(signals);
  });

  it('says so when the screen could not be opened for another reason', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = await onCall(async () => {
      throw new Error('no display');
    });
    await engine.toggleScreen();
    expect(last()).toMatchObject({ sharingScreen: false, screenMessage: 'Could not share your screen.' });
  });

  it('says so, and stops the capture, when it could not be put on the call', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const track = screenTrack();
    const { engine, line } = await onCall(async () => screenStream(track));
    line.sender.replaceTrack.mockRejectedValue(new Error('no'));

    await engine.toggleScreen();

    expect(track.stop).toHaveBeenCalled();
    expect(last()).toMatchObject({ sharingScreen: false, screenMessage: 'Could not share your screen.' });
  });

  it('still shares when the bitrate cannot be limited', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, line } = await onCall(async () => screenStream());
    line.sender.setParameters.mockRejectedValue(new Error('too early'));
    await engine.toggleScreen();
    expect(last().sharingScreen).toBe(true);
  });

  it('will not show a screen to an older app that answered receive-only, and says what to do, before asking which', async () => {
    // Its receive-only answer makes the line send-only here: something could be sent, but nobody would see it.
    FakePeer.answeredAs = 'sendonly';
    const getScreen = vi.fn(async () => screenStream());
    const { engine, line } = await onCall(getScreen);

    await engine.toggleScreen();

    expect(getScreen).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ sharingScreen: false, screenMessage: SCREEN_NOT_RECEIVED });
    expect(line.sender.replaceTrack).not.toHaveBeenCalled();
  });

  it('says so in a browser that has no video line to put it on', async () => {
    const mine = states;
    const engine = new CallEngine({
      api,
      userId: 'u-tom',
      deviceId: 'tom-phone',
      onChange: (state) => mine.push(state),
      createPeer: (config) => {
        const peer = new FakePeer(config);
        (peer as { addTransceiver?: unknown }).addTransceiver = undefined;
        return peer as unknown as RTCPeerConnection;
      },
      getMicrophone: async () => microphone(),
      getScreen: async () => screenStream(),
      lingerMs: 50
    });
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    FakePeer.created[0]!.connect('connected');

    await engine.toggleScreen();

    expect(last().screenMessage).toBe(SCREEN_NOT_SUPPORTED);
  });

  it('only while the call is connected', async () => {
    const getScreen = vi.fn(async () => screenStream());
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, getScreen);
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    // Still connecting.
    await engine.toggleScreen();
    expect(getScreen).not.toHaveBeenCalled();
  });

  it('lets go of a screen picked just as the call ended, without showing it', async () => {
    const track = screenTrack();
    let choose: (stream: MediaStream) => void = () => undefined;
    const { engine, line } = await onCall(() => new Promise<MediaStream>((resolve) => (choose = resolve)));

    const sharing = engine.toggleScreen();
    engine.hangUp();
    choose(screenStream(track));
    await sharing;

    expect(track.stop).toHaveBeenCalled();
    expect(line.sender.replaceTrack).not.toHaveBeenCalled();
    expect(last().sharingScreen).toBe(false);
  });

  it('lets go of a screen that was being put on the call when it ended', async () => {
    const track = screenTrack();
    const { engine, line } = await onCall(async () => screenStream(track));
    let finishReplacing: () => void = () => undefined;
    line.sender.replaceTrack.mockImplementationOnce(() => new Promise<void>((resolve) => (finishReplacing = resolve)));

    const sharing = engine.toggleScreen();
    await settle();
    engine.hangUp();
    finishReplacing();
    await sharing;

    expect(track.stop).toHaveBeenCalled();
    expect(last().sharingScreen).toBe(false);
  });

  it('is shown no more once the call is over, whichever end hangs up', async () => {
    const track = screenTrack();
    const { engine } = await onCall(async () => screenStream(track));
    await engine.toggleScreen();

    engine.hangUp();

    expect(track.stop).toHaveBeenCalled();
    expect(last().sharingScreen).toBe(false);
  });

  it('a stop with nothing shared does nothing', async () => {
    const { engine } = await onCall(async () => screenStream());
    const signals = sent().length;
    await engine.stopScreen();
    expect(sent()).toHaveLength(signals);
  });

  describe('when the other person shows theirs', () => {
    it('says so, and says when it stops', async () => {
      const { engine } = await onCall(async () => screenStream());

      signalIn(engine, { screen: true });
      await settle();
      expect(last().remoteSharing).toBe(true);

      signalIn(engine, { screen: false });
      await settle();
      expect(last().remoteSharing).toBe(false);
    });

    it('keeps their screen in a stream of its own, so the voice is never replaced by it', async () => {
      const { peer } = await onCall(async () => screenStream());
      const voice = { id: 'voice' } as unknown as MediaStream;
      const audio = { kind: 'audio' } as unknown as MediaStreamTrack;
      const video = { kind: 'video' } as unknown as MediaStreamTrack;
      vi.stubGlobal('MediaStream', class {
      tracks: unknown[];
      constructor(tracks: unknown[]) {
        this.tracks = tracks;
      }
    });

      peer.ontrack?.({ track: audio, streams: [voice] });
      peer.ontrack?.({ track: video, streams: [voice], transceiver: peer.transceivers[1] });

      // The voice on its own, not the stream it came in, which also carries the silent video lines.
      expect((last().remoteStream as unknown as { tracks: unknown[] }).tracks).toEqual([audio]);
      expect((last().remoteScreen as unknown as { tracks: unknown[] }).tracks).toEqual([video]);
      vi.unstubAllGlobals();
    });
  });
});


describe('showing the camera', () => {
  const cameraTrack = () => {
    const ended: Array<() => void> = [];
    return {
      kind: 'video',
      contentHint: '',
      stop: vi.fn(),
      addEventListener: (_type: string, handler: () => void) => ended.push(handler),
      end: () => ended.forEach((handler) => handler())
    };
  };
  const cameraStream = (track = cameraTrack()) =>
    ({ getTracks: () => [track], getVideoTracks: () => [track] }) as unknown as MediaStream;
  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  /** Tom has called Irja, her answer has come back, and the audio is through. */
  async function onCall(getCamera: () => Promise<MediaStream>, getScreen: () => Promise<MediaStream> = async () => cameraStream(), asVideoCall = false) {
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, getScreen, getCamera);
    await engine.start('c1', IRJA, asVideoCall ? { camera: true } : {});
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await settle();
    return { engine, peer, camera: peer.transceivers[0]!, screenLine: peer.transceivers[1]! };
  }

  it('puts the camera on the first video line, smooth and limited, shows it to its owner, and says so', async () => {
    const track = cameraTrack();
    const stream = cameraStream(track);
    const getScreen = vi.fn(async () => cameraStream());
    const { engine, camera, screenLine } = await onCall(async () => stream, getScreen);

    await engine.toggleCamera();
    await settle();

    expect(camera.sender.replaceTrack).toHaveBeenCalledWith(track);
    expect(track.contentHint).toBe('motion');
    expect(camera.sender.setParameters).toHaveBeenCalledWith({ encodings: [{ active: true, maxBitrate: CAMERA_MAX_BITRATE, scaleResolutionDownBy: 1 }] });
    expect(screenLine.sender.replaceTrack).not.toHaveBeenCalled();
    expect(getScreen).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ cameraOn: true, localCamera: stream, sharingScreen: false });
    expect(sent().at(-1)).toEqual({ camera: true });
  });

  it('turns it off: the picture comes off the line, the camera is released and the other side is told', async () => {
    const track = cameraTrack();
    const { engine, camera } = await onCall(async () => cameraStream(track));
    await engine.toggleCamera();

    await engine.toggleCamera();
    await settle();

    expect(track.stop).toHaveBeenCalled();
    expect(camera.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(last()).toMatchObject({ cameraOn: false, localCamera: null });
    expect(sent().at(-1)).toEqual({ camera: false });
  });

  it('shows the camera and a screen at the same time, each on its own line', async () => {
    const screen = cameraTrack();
    const face = cameraTrack();
    const { engine, camera, screenLine } = await onCall(async () => cameraStream(face), async () => cameraStream(screen));

    await engine.toggleCamera();
    await engine.toggleScreen();
    await settle();

    expect(camera.sender.replaceTrack).toHaveBeenCalledWith(face);
    expect(screenLine.sender.replaceTrack).toHaveBeenCalledWith(screen);
    expect(last()).toMatchObject({ cameraOn: true, sharingScreen: true });

    await engine.stopScreen();
    expect(last()).toMatchObject({ cameraOn: true, sharingScreen: false });
    expect(face.stop).not.toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', CAMERA_BLOCKED],
    ['NotFoundError', CAMERA_NOT_FOUND]
  ])('says what is wrong when the camera will not open (%s), and sends nothing', async (name, message) => {
    const { engine } = await onCall(async () => {
      throw new DOMException('no', name);
    });
    const signals = sent().length;

    await engine.toggleCamera();

    expect(last()).toMatchObject({ cameraOn: false, cameraMessage: message });
    expect(sent()).toHaveLength(signals);
  });

  it('says so for any other trouble with the camera', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine } = await onCall(async () => {
      throw new Error('busy');
    });
    await engine.toggleCamera();
    expect(last().cameraMessage).toBe('Could not turn your camera on.');
  });

  it('clears the message on the next try', async () => {
    const attempts = [new DOMException('no', 'NotAllowedError'), null];
    const { engine } = await onCall(async () => {
      const next = attempts.shift();
      if (next) throw next;
      return cameraStream();
    });
    await engine.toggleCamera();
    expect(last().cameraMessage).toBe(CAMERA_BLOCKED);
    await engine.toggleCamera();
    expect(last()).toMatchObject({ cameraOn: true, cameraMessage: null });
  });

  it('turns itself off when the camera is pulled out, and says so to the other side', async () => {
    const track = cameraTrack();
    const { engine } = await onCall(async () => cameraStream(track));
    await engine.toggleCamera();

    track.end();
    await settle();

    expect(last()).toMatchObject({ cameraOn: false, localCamera: null });
    expect(sent().at(-1)).toEqual({ camera: false });
  });

  it('will not open the camera for an older app that answered receive-only, and says what to do', async () => {
    FakePeer.answeredAs = 'sendonly';
    const getCamera = vi.fn(async () => cameraStream());
    const { engine } = await onCall(getCamera);

    await engine.toggleCamera();

    expect(getCamera).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ cameraOn: false, cameraMessage: CAMERA_NOT_RECEIVED });
  });

  it('only while the call is connected', async () => {
    const getCamera = vi.fn(async () => cameraStream());
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, undefined, getCamera);
    await engine.start('c1', IRJA);
    await engine.toggleCamera();
    expect(getCamera).not.toHaveBeenCalled();
  });

  it('lets go of a camera that opened just as the call ended, without showing it', async () => {
    const track = cameraTrack();
    let open: (stream: MediaStream) => void = () => undefined;
    const { engine, camera } = await onCall(() => new Promise<MediaStream>((resolve) => (open = resolve)));

    const opening = engine.toggleCamera();
    engine.hangUp();
    open(cameraStream(track));
    await opening;

    expect(track.stop).toHaveBeenCalled();
    expect(camera.sender.replaceTrack).not.toHaveBeenCalled();
    expect(last().cameraOn).toBe(false);
  });

  it('is released when the call is over, whichever end hangs up', async () => {
    const track = cameraTrack();
    const { engine } = await onCall(async () => cameraStream(track));
    await engine.toggleCamera();

    engine.hangUp();

    expect(track.stop).toHaveBeenCalled();
    expect(last()).toMatchObject({ cameraOn: false, localCamera: null });
  });

  it('the one who answers shows theirs on the first line the offer made, and is never started for them', async () => {
    const track = cameraTrack();
    const getCamera = vi.fn(async () => cameraStream(track));
    const engine = engineFor('u-irja', 'irja-phone', undefined, undefined, undefined, getCamera);
    engine.handleEvent(event('call.ringing', callView()));
    await engine.accept();
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'tom-phone', toDeviceId: 'irja-phone', data: { description: { type: 'offer', sdp: 'offer-1' } } }));
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await settle();
    expect(getCamera).not.toHaveBeenCalled();

    await engine.toggleCamera();

    expect(peer.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(track);
    expect(peer.transceivers[1]!.sender.replaceTrack).not.toHaveBeenCalled();
  });

  describe('a video call', () => {
    it('turns the caller’s camera on once the call connects, and not before', async () => {
      const getCamera = vi.fn(async () => cameraStream());
      const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, undefined, getCamera);
      await engine.start('c1', IRJA, { camera: true });
      engine.handleEvent(event('call.accepted', answeredView));
      await settle();
      expect(getCamera).not.toHaveBeenCalled();
      signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
      await settle();

      FakePeer.created[0]!.connect('connected');
      await settle();

      expect(getCamera).toHaveBeenCalledOnce();
      expect(last().cameraOn).toBe(true);
      expect(sent().at(-1)).toEqual({ camera: true });
    });

    it('is only once: a connection that drops and comes back does not turn it on again', async () => {
      const getCamera = vi.fn(async () => cameraStream());
      const { engine, peer } = await onCall(getCamera, undefined, true);
      await engine.toggleCamera();
      peer.connect('disconnected');
      peer.connect('connected');
      await settle();
      expect(getCamera).toHaveBeenCalledTimes(1);
    });

    it('a plain call leaves the camera off', async () => {
      const getCamera = vi.fn(async () => cameraStream());
      await onCall(getCamera);
      expect(getCamera).not.toHaveBeenCalled();
      expect(last().cameraOn).toBe(false);
    });
  });

  describe('when the other person shows theirs', () => {
    it('says so, and says when it stops', async () => {
      const { engine } = await onCall(async () => cameraStream());

      signalIn(engine, { camera: true });
      await settle();
      expect(last().remoteCamera).toBe(true);

      signalIn(engine, { camera: false });
      await settle();
      expect(last().remoteCamera).toBe(false);
    });

    it('files their camera and their screen apart by their place among the video lines, and keeps the voice', async () => {
      const { peer } = await onCall(async () => cameraStream());
      const voice = { id: 'voice' } as unknown as MediaStream;
      const audio = { kind: 'audio' } as unknown as MediaStreamTrack;
      const face = { kind: 'video', id: 'face' } as unknown as MediaStreamTrack;
      const page = { kind: 'video', id: 'page' } as unknown as MediaStreamTrack;
      vi.stubGlobal('MediaStream', class {
      tracks: unknown[];
      constructor(tracks: unknown[]) {
        this.tracks = tracks;
      }
    });

      peer.ontrack?.({ track: audio, streams: [voice] });
      peer.ontrack?.({ track: face, streams: [voice], transceiver: peer.transceivers[0] });
      peer.ontrack?.({ track: page, streams: [voice], transceiver: peer.transceivers[1] });

      // The voice on its own, not the stream it came in, which also carries the silent video lines.
      expect((last().remoteStream as unknown as { tracks: unknown[] }).tracks).toEqual([audio]);
      expect((last().remoteCameraStream as unknown as { tracks: unknown[] }).tracks).toEqual([face]);
      expect((last().remoteScreen as unknown as { tracks: unknown[] }).tracks).toEqual([page]);
      vi.unstubAllGlobals();
    });
  });
});


describe('turning the camera to the other one', () => {
  /** A camera that says which way it faces, as a phone's does, and can end as the OS ends one. */
  const phoneCamera = (facing: 'user' | 'environment' | null = 'user') => {
    const ended: Array<() => void> = [];
    const track = {
      kind: 'video',
      contentHint: '',
      stop: vi.fn(),
      addEventListener: (_type: string, handler: () => void) => ended.push(handler),
      end: () => ended.forEach((handler) => handler()),
      getSettings: () => (facing ? { facingMode: facing } : {})
    };
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
  };
  /** A phone: each opening is a new stream from the camera asked for, as a real one gives. */
  const phone = (faces: Partial<Record<'user' | 'environment', 'user' | 'environment' | Error | DOMException>> = {}) => {
    const opened: Array<ReturnType<typeof phoneCamera>> = [];
    const getCamera = vi.fn(async (facing: 'user' | 'environment') => {
      const gives = faces[facing] ?? facing;
      if (typeof gives !== 'string') throw gives;
      const camera = phoneCamera(gives);
      opened.push(camera);
      return camera.stream;
    });
    return { opened, getCamera };
  };
  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  async function onCall(getCamera: (facing: 'user' | 'environment') => Promise<MediaStream>, cameras = 2) {
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, undefined, getCamera, async () => cameras);
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await settle();
    return { engine, peer, camera: peer.transceivers[0]! };
  }

  it('opens the camera facing the person, and offers to turn it only on a phone with two cameras', async () => {
    const asked: string[] = [];
    const { engine } = await onCall(async (facing) => (asked.push(facing), phoneCamera('user').stream));

    await engine.toggleCamera();
    await settle();

    expect(asked).toEqual(['user']);
    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'user', canFlipCamera: true });
  });

  it.each([
    ['a phone with one camera', 'user' as const, 1],
    ['a laptop, whose cameras do not say which way they face', null, 2]
  ])('offers no turn on %s', async (_what, facing, cameras) => {
    const { engine } = await onCall(async () => phoneCamera(facing).stream, cameras);
    await engine.toggleCamera();
    await settle();
    expect(last()).toMatchObject({ cameraOn: true, canFlipCamera: false });
  });

  it('still shows the camera when the cameras cannot be counted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, undefined, async () => phoneCamera().stream, async () => {
      throw new Error('no list');
    });
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    FakePeer.created[0]!.connect('connected');
    await settle();

    await engine.toggleCamera();
    await settle();

    expect(last()).toMatchObject({ cameraOn: true, canFlipCamera: false });
  });

  it('turns to the back camera on the same line without a new offer, lets go of the front one, and sends no signal', async () => {
    const front = phoneCamera('user');
    const back = phoneCamera('environment');
    const { engine, peer, camera } = await onCall(async (facing) => (facing === 'user' ? front : back).stream);
    await engine.toggleCamera();
    await settle();
    const offers = peer.offers.length;
    const signals = sent().length;

    await engine.flipCamera();

    expect(camera.sender.replaceTrack).toHaveBeenLastCalledWith(back.track);
    expect(back.track.contentHint).toBe('motion');
    expect(front.track.stop).toHaveBeenCalled();
    expect(peer.offers).toHaveLength(offers);
    expect(sent()).toHaveLength(signals);
    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'environment', cameraMessage: null });
    expect(last().localCamera).toBe(back.stream);
  });

  it('turns back again', async () => {
    const asked: string[] = [];
    const { engine } = await onCall(async (facing) => (asked.push(facing), phoneCamera(facing).stream));
    await engine.toggleCamera();
    await settle();

    await engine.flipCamera();
    await engine.flipCamera();

    expect(asked).toEqual(['user', 'environment', 'user']);
    expect(last().cameraFacing).toBe('user');
  });

  it('does nothing with the camera off', async () => {
    const getCamera = vi.fn(async () => phoneCamera().stream);
    const { engine } = await onCall(getCamera);
    await engine.flipCamera();
    expect(getCamera).not.toHaveBeenCalled();
  });

  it('lets go of the camera in use before opening the other, which many phones need', async () => {
    const { opened, getCamera } = phone();
    const { engine } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();
    const front = opened[0]!;
    getCamera.mockImplementationOnce(async (facing) => {
      // The front camera is already let go of when the back one is asked for.
      expect(front.track.stop).toHaveBeenCalled();
      const back = phoneCamera(facing);
      opened.push(back);
      return back.stream;
    });

    await engine.flipCamera();

    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'environment' });
  });

  it('is not turned off by the old camera ending afterwards, as some phones end it only then', async () => {
    const { opened, getCamera } = phone();
    const { engine } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();
    await engine.flipCamera();
    const signals = sent().length;

    opened[0]!.track.end();
    await settle();

    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'environment' });
    expect(sent()).toHaveLength(signals);
  });

  it('uses the camera the phone hands back when it has only the one, and says it did not turn', async () => {
    const { opened, getCamera } = phone({ environment: 'user' });
    const { engine, camera } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();

    await engine.flipCamera();

    expect(camera.sender.replaceTrack).toHaveBeenLastCalledWith(opened[1]!.track);
    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'user', canFlipCamera: false, cameraMessage: CAMERA_NO_OTHER });
  });

  it.each([
    ['there is no other camera', new DOMException('no', 'OverconstrainedError'), CAMERA_NO_OTHER],
    ['another app has it', new DOMException('busy', 'NotReadableError'), CAMERA_BUSY]
  ])('opens the camera it had again when the other will not open, as %s, and says why', async (_why, error, message) => {
    const { opened, getCamera } = phone({ environment: error });
    const { engine, camera } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();

    await engine.flipCamera();

    expect(getCamera.mock.calls.map(([facing]) => facing)).toEqual(['user', 'environment', 'user']);
    expect(camera.sender.replaceTrack).toHaveBeenLastCalledWith(opened[1]!.track);
    expect(last()).toMatchObject({ cameraOn: true, cameraFacing: 'user', cameraMessage: message });
    expect(last().localCamera).toBe(opened[1]!.stream);
  });

  it('turns the camera off, and says so, when not even the camera it had will open again', async () => {
    const { getCamera } = phone();
    const { engine } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();
    getCamera.mockRejectedValueOnce(new DOMException('no', 'OverconstrainedError'));
    getCamera.mockRejectedValueOnce(new DOMException('busy', 'NotReadableError'));

    await engine.flipCamera();
    await settle();

    expect(last()).toMatchObject({ cameraOn: false, localCamera: null, cameraMessage: CAMERA_BUSY });
    expect(sent().at(-1)).toEqual({ camera: false });
  });

  it('turns the camera off, and says so, when the swap onto the call fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { opened, getCamera } = phone();
    const { engine, camera } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();
    camera.sender.replaceTrack.mockRejectedValueOnce(new Error('no'));

    await engine.flipCamera();

    expect(opened[1]!.track.stop).toHaveBeenCalled();
    expect(last()).toMatchObject({ cameraOn: false, cameraMessage: 'Could not turn your camera on.' });
  });

  it('lets go of the other camera when the camera was turned off while it opened', async () => {
    const front = phoneCamera('user');
    const back = phoneCamera('environment');
    let open: (stream: MediaStream) => void = () => undefined;
    const { engine, camera } = await onCall((facing) =>
      facing === 'user' ? Promise.resolve(front.stream) : new Promise<MediaStream>((resolve) => (open = resolve))
    );
    await engine.toggleCamera();
    await settle();

    const flipping = engine.flipCamera();
    await engine.toggleCamera();
    open(back.stream);
    await flipping;

    expect(back.track.stop).toHaveBeenCalled();
    expect(camera.sender.replaceTrack).not.toHaveBeenCalledWith(back.track);
    expect(last()).toMatchObject({ cameraOn: false, localCamera: null });
  });

  it('keeps only the last of two quick flips', async () => {
    const { opened, getCamera } = phone();
    const { engine, camera } = await onCall(getCamera);
    await engine.toggleCamera();
    await settle();
    let finishSwap: () => void = () => undefined;
    camera.sender.replaceTrack.mockImplementationOnce(() => new Promise<void>((resolve) => (finishSwap = resolve)));

    const first = engine.flipCamera();
    await settle();
    const second = engine.flipCamera();
    finishSwap();
    await Promise.all([first, second]);

    // The first flip's camera was let go of; what is shown is a live camera the last flip opened.
    expect(opened[1]!.track.stop).toHaveBeenCalled();
    const shown = last().localCamera!;
    expect(opened.map((o) => o.stream)).toContain(shown);
    expect((shown.getVideoTracks()[0] as unknown as { stop: ReturnType<typeof vi.fn> }).stop).not.toHaveBeenCalled();
    expect(last().cameraOn).toBe(true);
  });
});

describe('sending only what the other person shows', () => {
  const stream = () => {
    const track = { kind: 'video', contentHint: '', stop: vi.fn(), addEventListener: vi.fn() };
    return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  };
  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  async function onCall() {
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, async () => stream(), async () => stream(), async () => 1);
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await settle();
    return { engine, peer, camera: peer.transceivers[0]!, screen: peer.transceivers[1]! };
  }
  const lastEncoding = (line: { sender: { setParameters: ReturnType<typeof vi.fn> } }) =>
    (line.sender.setParameters.mock.calls.at(-1)![0] as RTCRtpSendParameters).encodings[0];

  it.each([
    ['camera', 'full', { active: true, maxBitrate: CAMERA_MAX_BITRATE, scaleResolutionDownBy: 1 }],
    ['camera', 'small', { active: true, maxBitrate: CAMERA_SMALL_BITRATE, scaleResolutionDownBy: 4 }],
    ['camera', 'none', { active: false }],
    ['screen', 'full', { active: true, maxBitrate: SCREEN_MAX_BITRATE, scaleResolutionDownBy: 1 }],
    ['screen', 'small', { active: false }],
    ['screen', 'none', { active: false }]
  ] as const)('sends the %s, to someone showing it %s, as %j', (source, showing, plan) => {
    expect(encodingFor(source, showing)).toEqual(plan);
  });

  it('shrinks the camera and pauses the screen when their call is on the bar, and sends it all again when it is not', async () => {
    const { engine, camera, screen } = await onCall();
    await engine.toggleCamera();
    await engine.toggleScreen();

    signalIn(engine, { showing: 'small' });
    await settle();
    expect(lastEncoding(camera)).toEqual(encodingFor('camera', 'small'));
    expect(lastEncoding(screen)).toEqual({ active: false });

    signalIn(engine, { showing: 'full' });
    await settle();
    expect(lastEncoding(camera)).toEqual(encodingFor('camera', 'full'));
    expect(lastEncoding(screen)).toEqual(encodingFor('screen', 'full'));
  });

  it('starts a camera already paused for someone who shows nothing, as a locked phone', async () => {
    const { engine, camera } = await onCall();
    signalIn(engine, { showing: 'none' });
    await settle();

    await engine.toggleCamera();

    expect(lastEncoding(camera)).toEqual({ active: false });
  });

  it('tells the other side what it shows, only when that changes, and only while connected', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.setShowing('small');
    expect(sent()).toEqual([]);

    const { engine: live } = await onCall();
    const before = sent().length;
    live.setShowing('full');
    live.setShowing('full');
    live.setShowing('none');
    await settle();
    expect(sent().slice(before)).toEqual([{ showing: 'full' }, { showing: 'none' }]);
  });
});

describe('starting a camera or screen that is still opening', () => {
  const stream = () => {
    const track = { kind: 'video', contentHint: '', stop: vi.fn(), addEventListener: vi.fn() };
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
  };
  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  it('gives it up on a second tap: what opens afterwards is let go of, and nothing is shown', async () => {
    const camera = stream();
    let open: (s: MediaStream) => void = () => undefined;
    const getCamera = vi.fn(() => new Promise<MediaStream>((resolve) => (open = resolve)));
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, undefined, getCamera);
    await engine.start('c1', IRJA, { camera: true });
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    FakePeer.created[0]!.connect('connected');
    // The video call's own camera is opening; the person taps to say no.
    await engine.toggleCamera();
    open(camera.stream);
    await settle();

    expect(getCamera).toHaveBeenCalledOnce();
    expect(camera.track.stop).toHaveBeenCalled();
    expect(last().cameraOn).toBe(false);
    // And the next tap starts it afresh.
    getCamera.mockResolvedValueOnce(stream().stream);
    await engine.toggleCamera();
    expect(last().cameraOn).toBe(true);
  });
});

describe('what the call screen is told', () => {
  it('shows one message at a time, the newest: a camera problem is not hidden behind an old screen one', async () => {
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, async () => {
      throw new Error('no display');
    }, async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data: { description: { type: 'answer', sdp: 'answer-1' } } }));
    await settle();
    FakePeer.created[0]!.connect('connected');

    await engine.toggleScreen();
    expect(last().screenMessage).toBe('Could not share your screen.');
    await engine.toggleCamera();

    expect(last()).toMatchObject({ cameraMessage: CAMERA_BLOCKED, screenMessage: null });
  });

  it('draws a video line it cannot place as nothing, rather than as the wrong thing', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    const peer = FakePeer.created[0]!;
    vi.stubGlobal('MediaStream', class {
      tracks: unknown[];
      constructor(tracks: unknown[]) {
        this.tracks = tracks;
      }
    });

    peer.ontrack?.({ track: { kind: 'video' }, streams: [], transceiver: { receiver: { track: { kind: 'video' } } } });

    expect(last()).toMatchObject({ remoteScreen: null, remoteCameraStream: null });
    vi.unstubAllGlobals();
  });
});


describe('a connection that drops and comes back', () => {
  const stream = () => {
    const track = { kind: 'video', contentHint: '', stop: vi.fn(), addEventListener: vi.fn() };
    return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream };
  };
  const signalIn = (engine: CallEngine, data: CallSignalData) =>
    engine.handleEvent(event('call.signal', { callId: 'call-1', fromDeviceId: 'irja-phone', toDeviceId: 'tom-phone', data }));

  /** Tom is calling Irja, showing both his camera and a screen. */
  async function showingBoth() {
    const face = stream();
    const page = stream();
    const engine = engineFor('u-tom', 'tom-phone', undefined, undefined, async () => page.stream, async () => face.stream);
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await engine.toggleCamera();
    await engine.toggleScreen();
    await settle();
    return { engine, peer, face, page, cameraLine: peer.transceivers[0]!, screenLine: peer.transceivers[1]! };
  }

  it('keeps showing both, on the lines it had, through a drop and an ICE restart', async () => {
    const { engine, peer, face, page, cameraLine, screenLine } = await showingBoth();
    const swaps = [cameraLine, screenLine].map((line) => line.sender.replaceTrack.mock.calls.length);

    peer.connect('disconnected');
    expect(last()).toMatchObject({ reconnecting: true, cameraOn: true, sharingScreen: true });
    peer.connect('failed');
    await settle();
    expect(peer.offers.at(-1)).toEqual({ iceRestart: true });
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-2' } });
    peer.connect('connected');
    await settle();

    expect(last()).toMatchObject({ phase: 'active', reconnecting: false, cameraOn: true, sharingScreen: true });
    // Neither picture was taken off the call or put on again, and nothing was let go of.
    expect([cameraLine, screenLine].map((line) => line.sender.replaceTrack.mock.calls.length)).toEqual(swaps);
    expect(FakePeer.created).toHaveLength(1);
    expect(face.track.stop).not.toHaveBeenCalled();
    expect(page.track.stop).not.toHaveBeenCalled();
  });

  it('says again what it is showing once the connection is back, in case a signal was lost with it', async () => {
    const { engine, peer } = await showingBoth();
    engine.setShowing('small');
    await settle();
    peer.connect('disconnected');
    const before = sent().length;

    peer.connect('connected');
    await settle();

    expect(sent().slice(before)).toEqual([{ screen: true, camera: true, showing: 'small' }]);
  });

  it('says a stopped picture is stopped, so the other side is not left drawing a frozen one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { engine, peer } = await showingBoth();
    peer.connect('disconnected');
    // Stopped during the outage, when a signal about it cannot get through.
    api.sendSignal.mockRejectedValue(new Error('offline'));
    await engine.stopScreen();
    await engine.stopCamera();
    await settle();
    api.sendSignal.mockResolvedValue(undefined);

    peer.connect('connected');
    await settle();

    // Neither "off" arrived, and the other side still shows both: the one signal after the drop sets it right.
    expect(sent().at(-1)).toEqual({ screen: false, camera: false });
  });

  it('says nothing extra when the connection is made for the first time, or only wobbles without being lost', async () => {
    const engine = engineFor('u-tom', 'tom-phone');
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await settle();
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await settle();
    const before = sent().length;

    FakePeer.created[0]!.connect('connected');
    await settle();
    expect(sent()).toHaveLength(before);
  });

  it('takes theirs as it is told again, so a picture that stopped while the connection was down goes', async () => {
    const { engine } = await showingBoth();
    signalIn(engine, { screen: true, camera: true });
    await settle();
    expect(last()).toMatchObject({ remoteSharing: true, remoteCamera: true });

    // Their state, said again after their drop, with nothing showing.
    signalIn(engine, { screen: false, camera: false });
    await settle();

    expect(last()).toMatchObject({ remoteSharing: false, remoteCamera: false });
  });

  it('lets go of both when it is given up on, as a call that never recovers is', async () => {
    vi.useFakeTimers();
    const face = stream();
    const page = stream();
    const engine = new CallEngine({
      api,
      userId: 'u-tom',
      deviceId: 'tom-phone',
      onChange: (state) => states.push(state),
      createPeer: (config) => new FakePeer(config) as unknown as RTCPeerConnection,
      getMicrophone: async () => microphone(),
      getScreen: async () => page.stream,
      getCamera: async () => face.stream,
      lingerMs: 50,
      recoverTimeoutMs: 1_000
    });
    await engine.start('c1', IRJA);
    engine.handleEvent(event('call.accepted', answeredView));
    await vi.advanceTimersByTimeAsync(0);
    signalIn(engine, { description: { type: 'answer', sdp: 'answer-1' } });
    await vi.advanceTimersByTimeAsync(0);
    const peer = FakePeer.created[0]!;
    peer.connect('connected');
    await engine.toggleCamera();
    await engine.toggleScreen();

    peer.connect('disconnected');
    // Past the time allowed to recover, and before the "call dropped" screen has gone.
    await vi.advanceTimersByTimeAsync(1_020);

    expect(face.track.stop).toHaveBeenCalled();
    expect(page.track.stop).toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'ended', message: 'Call dropped', cameraOn: false, sharingScreen: false, localCamera: null });
  });
});

describe('catching up after the event stream was away', () => {
  const young = () => new Date().toISOString();

  it('connects when the other side answered while the stream was down', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    api.startCall.mockResolvedValue(callView({ startedAt: young() }));
    await tom.start('c1', IRJA);
    api.currentCall.mockResolvedValue(callView({ ...answeredView, startedAt: young() }));

    await tom.resume();
    await settle();

    expect(last().phase).toBe('connecting');
    expect(sent()).toEqual([{ description: { type: 'offer', sdp: 'offer-1' } }]);
  });

  it('makes the connection once, however many times it is told the call was answered', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    api.startCall.mockResolvedValue(callView({ startedAt: young() }));
    await tom.start('c1', IRJA);
    api.currentCall.mockResolvedValue(callView({ ...answeredView, startedAt: young() }));

    await tom.resume();
    tom.handleEvent(event('call.accepted', answeredView));
    tom.handleEvent(event('call.accepted', answeredView));
    await settle();

    expect(FakePeer.created).toHaveLength(1);
    expect(sent()).toHaveLength(1);
  });

  it('ends a call the server no longer has, saying so only to a side that was in it', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    await tom.start('c1', IRJA);
    tom.handleEvent(event('call.accepted', answeredView));
    await settle();
    api.currentCall.mockResolvedValue(null);

    await tom.resume();

    expect(tom.snapshot).toMatchObject({ phase: 'ended', message: 'Call ended' });

    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.resume();
    expect(irja.snapshot.phase).toBe('idle');
  });

  it('ends a call that has been replaced by another', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    await tom.start('c1', IRJA);
    api.currentCall.mockResolvedValue(callView({ id: 'call-2', startedAt: young() }));
    await tom.resume();
    expect(tom.snapshot.phase).toBe('ended');
  });

  it('does not judge a call placed a moment ago by an answer that may predate it', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    api.startCall.mockResolvedValue(callView({ startedAt: young() }));
    await tom.start('c1', IRJA);
    api.currentCall.mockResolvedValue(null);

    await tom.resume();

    expect(tom.snapshot).toMatchObject({ phase: 'outgoing', call: { id: 'call-1' } });
  });

  it('leaves everything alone when the server cannot be asked', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    await tom.start('c1', IRJA);
    api.currentCall.mockRejectedValue(new Error('offline'));
    await tom.resume();
    expect(tom.snapshot.phase).toBe('outgoing');
  });

  it('does nothing while still waiting for the server to say the call exists', async () => {
    const tom = engineFor('u-tom', 'tom-phone');
    api.startCall.mockReturnValue(new Promise(() => undefined));
    void tom.start('c1', IRJA);
    api.currentCall.mockResolvedValue(null);
    await settle();
    await tom.resume();
    expect(tom.snapshot.phase).toBe('outgoing');
  });
});

describe('a server without a relay', () => {
  const stalled = (api: ReturnType<typeof makeApi>) =>
    new CallEngine({
      api,
      userId: 'u-irja',
      deviceId: 'irja-phone',
      onChange: (state) => states.push(state),
      createPeer: (config) => new FakePeer(config) as unknown as RTCPeerConnection,
      getMicrophone: async () => microphone(),
      connectTimeoutMs: 20,
      lingerMs: 50
    });

  it('says why a call that never connected may have failed', async () => {
    api.iceServers.mockResolvedValue({ iceServers: [], relay: false, mode: 'local' as const, expiresAt: null });
    const irja = stalled(api);
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(irja.snapshot.message).toBe(NO_RELAY);
    expect(NO_RELAY).toContain('no relay');
  });

  it('does not blame the missing relay when there is one', async () => {
    const irja = stalled(api);
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(irja.snapshot.message).toBe(NO_CONNECTION);
  });

  it('asks nobody’s server for help when it cannot learn its own: no third-party default is built in', async () => {
    api.iceServers.mockRejectedValue(new Error('offline'));
    const irja = engineFor('u-irja', 'irja-phone');
    irja.handleEvent(event('call.ringing', callView()));
    await irja.accept();
    expect(FakePeer.created[0]!.config.iceServers).toEqual([]);
  });
});
