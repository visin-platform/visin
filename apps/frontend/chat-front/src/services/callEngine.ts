import { ApiError } from '@visin/frontend-core';
import { askWhich, declined } from './screenCapture';
import { logger } from '../utils/logger';
import type {
  CallPerson,
  CallSignalData,
  CallSignalPayload,
  CallView,
  ChatEvent,
  IceConfig
} from '../types/call';

/**
 * One device's side of a voice call: the microphone, the RTCPeerConnection,
 * and the back-and-forth with chat-service that rings, answers and connects.
 *
 * Kept out of React so the whole sequence can be tested with a fake peer, and
 * so a re-render can never tear down a call.
 *
 * **Fixed roles, not "perfect negotiation".** The device that placed the call
 * always sends the offer, the one that answered always answers, and only the
 * caller restarts ICE after a network change. With exactly two devices whose
 * roles the server already settled, glare (both offering at once) cannot
 * happen, so the machinery that resolves it is not needed.
 *
 * **Neither does video.** The caller adds two empty video lines, sending and receiving,
 * before its first offer: the first is for the camera, the second for a shared screen,
 * so both can be shown at once. The one who answers takes the lines that offer makes on
 * its side, in the same order, and turns them two-way before answering. (A line
 * it made itself with addTransceiver would not be matched to the offer: browsers
 * only reuse lines made with addTrack.) So it is in the first offer and answer. Sharing is then `replaceTrack` on that line, as switching
 * microphones is on the audio one, and stopping is `replaceTrack(null)`. A plain
 * "screen on / off" signal tells the other side whether there is anything to show,
 * since a video track that is not sending looks the same as one that has nothing to say.
 * Which line is which is told by its place among the video lines, as an incoming track
 * has no other name.
 *
 * Signals are sent one at a time and applied one at a time. Two POSTs in
 * flight can arrive in either order, and a candidate applied while
 * `setRemoteDescription` is still running is dropped by the browser; both
 * queues make the order the one it was sent in.
 */

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallState {
  phase: CallPhase;
  call: CallView | null;
  /** The other person, for the screen. Known before the server answers, from the thread. */
  peer: CallPerson | null;
  muted: boolean;
  /** The microphone the call is using, as the browser names it. Null before one is open. */
  micDeviceId: string | null;
  /** Connected before, lost it, trying again. */
  reconnecting: boolean;
  /** When the audio first connected; the timer counts from here. */
  connectedAt: number | null;
  /** What the "ended" screen says. */
  message: string | null;
  remoteStream: MediaStream | null;
  /** This device is showing its screen to the other person. */
  sharingScreen: boolean;
  /** The other person is showing theirs; `remoteScreen` is what to draw. */
  remoteSharing: boolean;
  /** The other person's screen, as video only: the sound is `remoteStream`'s. */
  remoteScreen: MediaStream | null;
  /** Why a share did not start or could not go on, for the screen to say. */
  screenMessage: string | null;
  /** This device's camera is on and being shown to the other person. */
  cameraOn: boolean;
  /** The other person's camera is on; `remoteCameraStream` is what to draw. */
  remoteCamera: boolean;
  /** Their camera, as video only: the sound is `remoteStream`'s. */
  remoteCameraStream: MediaStream | null;
  /** This device's own camera, for the person to see themselves. */
  localCamera: MediaStream | null;
  /** Why the camera did not come on, for the screen to say. */
  cameraMessage: string | null;
  /** Which way the open camera faces: a phone's front one (`user`) or its back one. Mirrored only when it faces the person. */
  cameraFacing: CameraFacing;
  /** This device has another camera to turn to: a phone with two, not a laptop whose cameras do not say which way they face. */
  canFlipCamera: boolean;
}

export type CameraFacing = 'user' | 'environment';

export const IDLE: CallState = {
  phase: 'idle',
  call: null,
  peer: null,
  muted: false,
  micDeviceId: null,
  reconnecting: false,
  connectedAt: null,
  message: null,
  remoteStream: null,
  sharingScreen: false,
  remoteSharing: false,
  remoteScreen: null,
  screenMessage: null,
  cameraOn: false,
  remoteCamera: false,
  remoteCameraStream: null,
  localCamera: null,
  cameraMessage: null,
  cameraFacing: 'user',
  canFlipCamera: false
};

export interface CallApi {
  iceServers(): Promise<IceConfig>;
  currentCall(): Promise<CallView | null>;
  startCall(conversationId: string, deviceId: string): Promise<CallView>;
  acceptCall(callId: string, deviceId: string): Promise<CallView>;
  declineCall(callId: string): Promise<void>;
  endCall(callId: string): Promise<void>;
  sendSignal(callId: string, deviceId: string, data: CallSignalData): Promise<void>;
}

export interface CallEngineOptions {
  api: CallApi;
  /** This tab. Made up per page load. */
  deviceId: string;
  userId: string;
  onChange: (state: CallState) => void;
  createPeer?: (config: RTCConfiguration) => RTCPeerConnection;
  getMicrophone?: (deviceId: string | null) => Promise<MediaStream>;
  /** Asks the person which screen to show. Called straight from their tap, as the browser requires. */
  getScreen?: () => Promise<MediaStream>;
  /** Opens the camera. No tap is needed for it once the browser has been allowed, but the person's choice starts it. */
  getCamera?: (facing: CameraFacing) => Promise<MediaStream>;
  /** How many cameras this device has, to know whether there is another to turn to. */
  countCameras?: () => Promise<number>;
  /** How long the "Call ended" screen stays. */
  lingerMs?: number;
  /** How long a call may take to connect before it is given up on. */
  connectTimeoutMs?: number;
  /** How long a dropped connection may try to recover. */
  recoverTimeoutMs?: number;
  /** The microphone this device was told to use, asked for each time one is opened. */
  preferredMicrophone?: () => string | null;
}

// Nothing is assumed when the server cannot be asked: no third-party server is built in. The browser then still
// connects on one machine or one local network.
const FALLBACK_ICE: RTCIceServer[] = [];

export const NO_CONNECTION = 'Could not connect the call.';
export const NO_RELAY =
  'Could not connect the call. This server has no relay, so calls between some networks cannot connect.';

/** A call this young is not declared over by a check that may have been asked before it began. */
const RESUME_GRACE_MS = 10_000;

export const MIC_BLOCKED = 'Microphone is blocked. Allow it for Visin in your settings, then try again.';

const defaultMicrophone = (deviceId: string | null) =>
  navigator.mediaDevices.getUserMedia({
    audio: {
      // `ideal`, not `exact`: a headset unplugged since it was chosen falls
      // back to the default instead of failing the call.
      ...(deviceId ? { deviceId: { ideal: deviceId } } : null),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

// A screen is read, not watched: fewer frames of sharp text beat many of soft.
const defaultScreen = () => askWhich({ frameRate: { ideal: 15, max: 30 } });

/**
 * The most a shared screen may send. The relay is metered by the byte and a screen is
 * mostly still, so this is generous for text and keeps a scrolling page from running away.
 */
export const SCREEN_MAX_BITRATE = 2_500_000;

export const SCREEN_NOT_SUPPORTED = 'Sharing your screen is not available in this browser.';
export const SCREEN_NOT_RECEIVED = 'Their app is out of date and cannot show your screen yet. Ask them to reload it.';

/** The camera is a face, not a page: 720p at a modest rate looks right, and costs a fraction of what a screen can. */
export const CAMERA_MAX_BITRATE = 1_200_000;
export const CAMERA_BLOCKED = 'Camera is blocked. Allow it for Visin in your settings, then try again.';
export const CAMERA_NOT_FOUND = 'No camera was found.';
export const CAMERA_NOT_SUPPORTED = 'Video is not available in this browser.';
export const CAMERA_NOT_RECEIVED = 'Their app is out of date and cannot show your camera yet. Ask them to reload it.';

const defaultCamera = (facing: CameraFacing) =>
  navigator.mediaDevices.getUserMedia({
    // `ideal`, so a device without that camera still opens the one it has.
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    audio: false
  });

const defaultCountCameras = async (): Promise<number> =>
  (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput').length;

export const CAMERA_NO_OTHER = 'This device has no other camera.';
export const CAMERA_BUSY = 'Your camera is being used by another app.';

/** On the other person's minimized bar the camera is a 36 pixel circle: a quarter of the size, at a sliver of the rate, is plenty. */
export const CAMERA_SMALL_BITRATE = 150_000;

/** How much of the other side's pictures a device is showing: the call screen, the minimized bar, or nothing. */
export type Showing = 'full' | 'small' | 'none';

/** What to send of a source, for how much of it the other side shows. A screen is not drawn on the bar at all. */
export function encodingFor(source: Source, showing: Showing): RTCRtpEncodingParameters {
  if (showing === 'full') {
    return { active: true, maxBitrate: source === 'camera' ? CAMERA_MAX_BITRATE : SCREEN_MAX_BITRATE, scaleResolutionDownBy: 1 };
  }
  if (showing === 'small' && source === 'camera') return { active: true, maxBitrate: CAMERA_SMALL_BITRATE, scaleResolutionDownBy: 4 };
  return { active: false };
}

/** Which way a camera faces, where it says. A laptop's does not. */
const facingOf = (track: MediaStreamTrack): CameraFacing | null => {
  const facing = track.getSettings?.().facingMode;
  return facing === 'user' || facing === 'environment' ? facing : null;
};

/** The two things that can be shown on a video line: what each says, how it is encoded and what it is called. */
type Source = 'camera' | 'screen';
const SOURCES = {
  screen: {
    bitrate: SCREEN_MAX_BITRATE,
    // Text has to stay readable: sharp, at the cost of smoothness.
    hint: 'detail',
    on: 'sharingScreen',
    message: 'screenMessage',
    couldNot: 'Could not share your screen.',
    notReceived: SCREEN_NOT_RECEIVED,
    notSupported: SCREEN_NOT_SUPPORTED
  },
  camera: {
    bitrate: CAMERA_MAX_BITRATE,
    hint: 'motion',
    on: 'cameraOn',
    message: 'cameraMessage',
    couldNot: 'Could not turn your camera on.',
    notReceived: CAMERA_NOT_RECEIVED,
    notSupported: CAMERA_NOT_SUPPORTED
  }
} as const;

/**
 * What to tell the person when a camera would not open. The screen's picker being closed says nothing; a
 * blocked camera does. `missing` is what a camera that is not there means: none at all when turning it on,
 * no other one when turning it round.
 */
function cameraProblem(error: unknown, missing = CAMERA_NOT_FOUND): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return CAMERA_BLOCKED;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return missing;
  if (name === 'NotReadableError') return CAMERA_BUSY;
  return SOURCES.camera.couldNot;
}

/** The device an open stream is actually on, which is not always the one asked for. */
const deviceIdOf = (stream: MediaStream): string | null => stream.getAudioTracks()[0]?.getSettings().deviceId ?? null;

/** The server's reason, where it gave one ("Irja is on another call"), else the fallback. */
function reasonOf(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

export class CallEngine {
  private state: CallState = IDLE;
  private peer: RTCPeerConnection | null = null;
  private mic: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private sending: Promise<void> = Promise.resolve();
  private receiving: Promise<void> = Promise.resolve();
  private lingerTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private recoverTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** Bumped per `start`, so a slow answer to an abandoned attempt cannot claim a newer one. */
  private attempt = 0;
  /** Bumped per microphone switch, so the last choice wins however the browser orders its answers. */
  private micRequest = 0;
  /** Whether this browser can make video lines at all, to tell "not here" from "not on their side". */
  private canMakeLines = true;
  /** Whether the connection was given a relay, so a failure to connect can say why it may have failed. */
  private hasRelay = true;
  /**
   * What is being shown on each video line. The line is null until it is negotiated, and where the other
   * app has none; `request` is bumped per start and per stop, so a slow picker or camera answer cannot
   * start what the person already gave up on.
   */
  private out: Record<Source, { line: RTCRtpTransceiver | null; stream: MediaStream | null; request: number }> = {
    camera: { line: null, stream: null, request: 0 },
    screen: { line: null, stream: null, request: 0 }
  };
  /** The caller chose a video call: the camera comes on once the call connects, and never by itself for the one who answers. */
  private cameraAtConnect = false;
  /** A camera or a screen picker still opening, which a second tap gives up on. */
  private opening: Record<Source, boolean> = { camera: false, screen: false };
  /** How much of this side's pictures the other side shows; until it says, all of it. */
  private theyShow: Showing = 'full';
  /** What this side last told the other it shows. */
  private weShow: Showing | null = null;

  private readonly createPeer: (config: RTCConfiguration) => RTCPeerConnection;
  private readonly getMicrophone: (deviceId: string | null) => Promise<MediaStream>;
  private readonly getScreen: () => Promise<MediaStream>;
  private readonly getCamera: (facing: CameraFacing) => Promise<MediaStream>;
  private readonly countCameras: () => Promise<number>;

  private readonly options: CallEngineOptions;

  constructor(options: CallEngineOptions) {
    this.options = options;
    this.createPeer = options.createPeer ?? ((config) => new RTCPeerConnection(config));
    this.getMicrophone = options.getMicrophone ?? defaultMicrophone;
    this.getScreen = options.getScreen ?? defaultScreen;
    this.getCamera = options.getCamera ?? defaultCamera;
    this.countCameras = options.countCameras ?? defaultCountCameras;
  }

  get snapshot(): CallState {
    return this.state;
  }

  private set(patch: Partial<CallState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }

  private get busy(): boolean {
    return this.state.phase !== 'idle' && this.state.phase !== 'ended';
  }

  /** Whether this device placed the current call. */
  private get isCaller(): boolean {
    const call = this.state.call;
    return !!call && call.caller.userId === this.options.userId && call.callerDeviceId === this.options.deviceId;
  }

  private stillOn(callId: string): boolean {
    return !this.disposed && this.state.call?.id === callId;
  }

  // ─── What the person does ────────────────────────────────────────────────

  /** Calls the other person in this conversation. Must run from a tap: it asks for the microphone. */
  async start(conversationId: string, peer?: CallPerson, options: { camera?: boolean } = {}): Promise<void> {
    if (this.busy) return;
    this.clearLinger();
    this.cameraAtConnect = options.camera === true;
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt && this.busy;
    this.set({ ...IDLE, phase: 'outgoing', peer: peer ?? null });

    let mic: MediaStream;
    try {
      mic = await this.getMicrophone(this.options.preferredMicrophone?.() ?? null);
    } catch {
      if (current()) this.finish(MIC_BLOCKED);
      return;
    }
    // Hung up while the permission prompt was open.
    if (!current()) {
      for (const track of mic.getTracks()) track.stop();
      return;
    }
    this.holdMicrophone(mic);

    try {
      const call = await this.options.api.startCall(conversationId, this.options.deviceId);
      if (!current()) {
        void this.options.api.endCall(call.id).catch(() => undefined);
        return;
      }
      // The ringing event can beat this response here; either way the call is ours.
      if (!this.state.call) this.set({ call, peer: call.callees[0] ?? this.state.peer });
    } catch (error) {
      if (current()) this.finish(reasonOf(error, 'Could not start the call.'));
    }
  }

  /** Answers the call ringing on this device. Must run from a tap, for the microphone. */
  async accept(): Promise<void> {
    const call = this.state.call;
    if (this.state.phase !== 'incoming' || !call) return;
    this.set({ phase: 'connecting' });

    let mic: MediaStream;
    try {
      mic = await this.getMicrophone(this.options.preferredMicrophone?.() ?? null);
    } catch {
      if (!this.stillOn(call.id)) return;
      void this.options.api.declineCall(call.id).catch(() => undefined);
      this.finish(MIC_BLOCKED);
      return;
    }
    // Ended while the permission prompt was open. Only this microphone is
    // stopped: whatever the engine holds now may belong to a newer call.
    if (!this.stillOn(call.id)) {
      for (const track of mic.getTracks()) track.stop();
      return;
    }
    this.holdMicrophone(mic);

    // The connection exists before the server hears "accepted", so the offer
    // the caller sends the moment it does always has somewhere to land.
    if (!(await this.openPeer(call.id))) return;

    try {
      const accepted = await this.options.api.acceptCall(call.id, this.options.deviceId);
      if (this.stillOn(call.id)) this.set({ call: accepted });
      this.armConnectTimeout();
    } catch (error) {
      this.finish(reasonOf(error, 'Could not answer the call.'));
    }
  }

  decline(): void {
    const call = this.state.call;
    if (this.state.phase !== 'incoming' || !call) return;
    void this.options.api.declineCall(call.id).catch(() => undefined);
    this.finish(null);
  }

  /** Ends the call from this side, whatever stage it is at. */
  hangUp(message: string | null = null): void {
    if (!this.busy) return;
    const call = this.state.call;
    const wasTalking = this.state.phase === 'connecting' || this.state.phase === 'active';
    if (call) void this.options.api.endCall(call.id).catch(() => undefined);
    this.finish(message ?? (wasTalking ? 'Call ended' : null));
  }

  /** Keeps `mic` as the microphone of this call, and tells the screen which device it is. */
  private holdMicrophone(mic: MediaStream): void {
    this.mic = mic;
    this.set({ micDeviceId: deviceIdOf(mic) });
  }

  /**
   * Moves the call to another microphone without a new offer: the sender
   * swaps its track, which the far end hears as nothing more than a pause.
   *
   * Before the call has a microphone there is nothing to move; the choice is
   * remembered by the caller and is what the next one is opened on. A device
   * that will not open leaves the call on the one it has.
   */
  async switchMicrophone(deviceId: string | null): Promise<void> {
    if (!this.busy || !this.mic) return;
    // What this switch is replacing. If it is not what the engine holds when
    // the browser answers, the call it was for is over or has moved on.
    const replacing = this.mic;
    const request = ++this.micRequest;

    let next: MediaStream;
    try {
      next = await this.getMicrophone(deviceId);
    } catch (error) {
      logger.warn('Could not switch microphone', { error: (error as Error).message });
      return;
    }

    const track = next.getAudioTracks()[0];
    // Two quick choices can be answered out of order: only the latest counts.
    const stale = !this.busy || this.mic !== replacing || request !== this.micRequest;
    if (stale || !track) {
      for (const t of next.getTracks()) t.stop();
      return;
    }

    // A muted call stays muted on the new microphone.
    track.enabled = !this.state.muted;
    const sender = this.peer?.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) {
      try {
        await sender.replaceTrack(track);
      } catch (error) {
        logger.warn('Could not hand the call to the new microphone', { error: (error as Error).message });
        for (const t of next.getTracks()) t.stop();
        return;
      }
    }

    // The swap itself took a turn: the call may have ended during it.
    if (!this.busy || this.mic !== replacing) {
      for (const t of next.getTracks()) t.stop();
      return;
    }
    this.holdMicrophone(next);
    for (const t of replacing.getTracks()) t.stop();
  }

  toggleMute(): void {
    if (!this.mic) return;
    const muted = !this.state.muted;
    for (const track of this.mic.getAudioTracks()) track.enabled = !muted;
    this.set({ muted });
  }

  /**
   * Starts showing the screen, or stops; or, while the picker is still open, gives up on it.
   * Must run from a tap: the browser only asks which screen for one.
   */
  toggleScreen(): Promise<void> {
    return this.toggle('screen');
  }

  /**
   * Shows the other person a screen the person picks, on the call's second video line. Nothing is
   * renegotiated, so it starts as soon as the picker closes. The picker is the browser's: this
   * can neither choose for them nor start without them, and closing it changes nothing.
   */
  shareScreen(): Promise<void> {
    return this.startShowing('screen');
  }

  /** Stops showing the screen, and tells the other person there is nothing to look at. */
  stopScreen(): Promise<void> {
    return this.stopShowing('screen');
  }

  /** Turns the camera on, or off; or, while it is still opening (a video call's own included), gives up on it. */
  toggleCamera(): Promise<void> {
    return this.toggle('camera');
  }

  /** Shows the other person the camera, on the call's first video line. */
  startCamera(): Promise<void> {
    return this.startShowing('camera');
  }

  stopCamera(): Promise<void> {
    return this.stopShowing('camera');
  }

  private toggle(source: Source): Promise<void> {
    if (this.state[SOURCES[source].on]) return this.stopShowing(source);
    // Still opening: the tap means "not now", and whatever opens is let go of.
    if (this.opening[source]) {
      this.out[source].request += 1;
      this.opening[source] = false;
      return Promise.resolve();
    }
    return this.startShowing(source);
  }

  /** One message at a time: the newest says what just happened, and an older one about the other source would hide it. */
  private say(source: Source, message: string | null): void {
    const other: Source = source === 'camera' ? 'screen' : 'camera';
    this.set({ [SOURCES[source].message]: message, ...(message ? { [SOURCES[other].message]: null } : {}) });
  }

  /** Stops showing a source when its track ends (the browser's "Stop sharing", a camera pulled out), unless it has been replaced since. */
  private endWith(source: Source, track: MediaStreamTrack): void {
    track.addEventListener('ended', () => {
      // A flip lets go of the old camera, and some phones end it only then: that is not the camera going away.
      if (this.out[source].stream?.getVideoTracks().includes(track)) void this.stopShowing(source);
    });
  }

  private async startShowing(source: Source): Promise<void> {
    const config = SOURCES[source];
    const mine = this.out[source];
    const callId = this.state.call?.id;
    if (this.state.phase !== 'active' || !callId || this.state[config.on]) return;
    const line = mine.line;
    // Their answer is what says whether they can show it: only a current app turns the line two-way.
    // An older one answers receive-only, or has no line at all when it is the one who called.
    if (!line || line.currentDirection !== 'sendrecv') {
      this.say(source, this.canMakeLines ? config.notReceived : config.notSupported);
      return;
    }
    const request = ++mine.request;
    this.opening[source] = true;
    this.say(source, null);
    try {
      let stream: MediaStream;
      try {
        stream = await (source === 'screen' ? this.getScreen() : this.getCamera('user'));
      } catch (error) {
        // Closing the screen picker is an answer, not a failure; a camera that will not open always is one.
        const problem = source === 'camera' ? cameraProblem(error) : declined(error) ? null : config.couldNot;
        if (problem && source === 'screen') logger.warn('Could not share the screen', { error: (error as Error).message });
        if (problem && request === mine.request && this.stillOn(callId)) this.say(source, problem);
        return;
      }

      const track = stream.getVideoTracks()[0];
      const stale = !this.stillOn(callId) || this.state.phase !== 'active' || mine.line !== line || request !== mine.request;
      if (stale || !track) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }

      try {
        track.contentHint = config.hint;
        await line.sender.replaceTrack(track);
      } catch (error) {
        logger.warn(`Could not put the ${source} on the call`, { error: (error as Error).message });
        for (const t of stream.getTracks()) t.stop();
        if (this.stillOn(callId)) this.say(source, config.couldNot);
        return;
      }

      // The call may have ended, or this given up, while the track was being put on.
      if (!this.stillOn(callId) || mine.line !== line || request !== mine.request) {
        for (const t of stream.getTracks()) t.stop();
        void line.sender.replaceTrack(null).catch(() => undefined);
        return;
      }
      mine.stream = stream;
      this.endWith(source, track);
      void this.applyEncoding(source);
      this.set({
        [config.on]: true,
        ...(source === 'camera' ? { localCamera: stream, cameraFacing: facingOf(track) ?? 'user', canFlipCamera: false } : {})
      });
      this.send(source === 'camera' ? { camera: true } : { screen: true });
      if (source === 'camera') void this.findOtherCamera(stream, track);
    } finally {
      if (request === mine.request) this.opening[source] = false;
    }
  }

  /**
   * Whether there is another camera to turn to. Known only once the camera is open (a browser names
   * cameras only after it has been allowed one), and only offered where the camera says which way it
   * faces: a laptop's two webcams do not, and "flipping" them would appear to do nothing.
   */
  private async findOtherCamera(stream: MediaStream, track: MediaStreamTrack): Promise<void> {
    if (facingOf(track) === null) return;
    let cameras = 0;
    try {
      cameras = await this.countCameras();
    } catch (error) {
      logger.warn('Could not count the cameras', { error: (error as Error).message });
    }
    if (this.out.camera.stream === stream) this.set({ canFlipCamera: cameras > 1 });
  }

  /**
   * Turns the open camera to the other one, a phone's back camera for its front one and back, without
   * a new offer: the line swaps its track, which the far end sees as a moment's pause and a new picture.
   *
   * The camera in use is let go of first: many phones cannot have two open at once, and opening the
   * second would fail every time. When the other one will not open, the one it had is opened again,
   * so the person keeps their picture and is told why it did not turn; only when neither will open
   * is the camera off.
   */
  async flipCamera(): Promise<void> {
    const mine = this.out.camera;
    const callId = this.state.call?.id;
    const line = mine.line;
    const old = mine.stream;
    if (!this.state.cameraOn || !old || !line || !callId) return;
    const was = this.state.cameraFacing;
    const wanted: CameraFacing = was === 'user' ? 'environment' : 'user';
    const request = ++mine.request;
    // Turned off, the call ended, or another flip came after: then this one keeps nothing.
    const current = () => this.stillOn(callId) && mine.line === line && request === mine.request;
    const letGo = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());
    this.set({ cameraMessage: null });
    letGo(old);

    let stream: MediaStream | null = null;
    let problem: string | null = null;
    try {
      stream = await this.getCamera(wanted);
    } catch (error) {
      problem = cameraProblem(error, CAMERA_NO_OTHER);
    }
    if (!current()) return letGo(stream);
    let track = stream?.getVideoTracks()[0];
    // A phone with one camera hands back the same one: it is used, but nothing has turned and it must not say so.
    if (track && facingOf(track) === was) problem = CAMERA_NO_OTHER;
    if (!stream || !track) {
      try {
        stream = await this.getCamera(was);
        track = stream.getVideoTracks()[0];
      } catch (error) {
        stream = null;
        // Not even the camera it had: that, not the other one, is what the person needs to hear.
        problem = cameraProblem(error, SOURCES.camera.couldNot);
      }
      if (!current()) return letGo(stream);
    }
    if (!stream || !track) {
      await this.stopShowing('camera');
      return this.say('camera', problem ?? SOURCES.camera.couldNot);
    }

    try {
      track.contentHint = SOURCES.camera.hint;
      await line.sender.replaceTrack(track);
    } catch (error) {
      logger.warn('Could not turn the camera', { error: (error as Error).message });
      letGo(stream);
      if (!current()) return;
      await this.stopShowing('camera');
      return this.say('camera', SOURCES.camera.couldNot);
    }
    if (!current()) return letGo(stream);
    mine.stream = stream;
    this.endWith('camera', track);
    void this.applyEncoding('camera');
    this.set({
      localCamera: stream,
      cameraFacing: facingOf(track) ?? (problem ? was : wanted),
      ...(problem === CAMERA_NO_OTHER ? { canFlipCamera: false } : {})
    });
    if (problem) this.say('camera', problem);
  }

  private async stopShowing(source: Source): Promise<void> {
    const mine = this.out[source];
    const stream = mine.stream;
    mine.request += 1;
    this.opening[source] = false;
    if (!stream) return;
    mine.stream = null;
    for (const track of stream.getTracks()) track.stop();
    await mine.line?.sender.replaceTrack(null).catch(() => undefined);
    if (!this.busy) return;
    this.set({
      [SOURCES[source].on]: false,
      ...(source === 'camera' ? { localCamera: null, cameraFacing: 'user', canFlipCamera: false } : {})
    });
    this.send(source === 'camera' ? { camera: false } : { screen: false });
  }

  /**
   * How much of the camera or screen to send, by what the other person is showing of it. Video through
   * the relay is paid for by the byte, and a picture nobody sees is the most expensive kind: their call
   * minimized to the bar shows the camera as a small circle and no screen, and a locked phone shows nothing.
   */
  private async applyEncoding(source: Source): Promise<void> {
    const line = this.out[source].line;
    if (!line || !this.out[source].stream) return;
    const plan = encodingFor(source, this.theyShow);
    try {
      const parameters = line.sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      Object.assign(parameters.encodings[0]!, plan);
      await line.sender.setParameters(parameters);
    } catch (error) {
      // Some browsers refuse before a first frame has gone: the picture is then sent as it is, not missing.
      logger.warn('Could not set how much video to send', { error: (error as Error).message });
    }
  }

  /**
   * Tells the other device how much of its pictures this one is showing, so it sends no more than that:
   * `full` on the call screen, `small` on the minimized bar, `none` with the page hidden or the phone locked.
   * Said only when it changes.
   */
  setShowing(showing: Showing): void {
    if (this.state.phase !== 'active' || showing === this.weShow) return;
    this.weShow = showing;
    this.send({ showing });
  }

  /** Clears the "ended" screen early. */
  dismiss(): void {
    if (this.state.phase !== 'ended') return;
    this.clearLinger();
    this.set(IDLE);
  }

  /**
   * Asks the server what this person's call is, and catches up with anything the event stream missed while it was
   * down or not yet open.
   *
   * - Idle: a ringing call is answerable. This is what makes a call answerable from a notification: the app may have
   *   been closed when the ringing began.
   * - Calling: the other side may have answered while the stream was reconnecting, so the answer is taken from here.
   * - In a call the server no longer has: it ended while the stream was away, so this side ends too.
   *
   * A call placed in the last few seconds is not judged by this: the answer may have been asked for before it existed.
   */
  async resume(): Promise<void> {
    let call: CallView | null;
    try {
      call = await this.options.api.currentCall();
    } catch (error) {
      logger.warn('Could not check for a call', { error: (error as Error).message });
      return;
    }
    const mine = this.state.call;
    if (!this.busy) {
      if (call?.status === 'ringing') this.onRinging(call);
      return;
    }
    if (!mine || this.disposed) return;
    if (call?.id === mine.id) {
      if (call.status === 'active' && this.state.phase === 'outgoing') this.onAccepted(call);
    } else if (Date.now() - Date.parse(mine.startedAt) > RESUME_GRACE_MS) {
      this.finish(this.state.phase === 'incoming' ? null : 'Call ended');
    }
  }

  // ─── What the server says ────────────────────────────────────────────────

  handleEvent(event: ChatEvent): void {
    if (this.disposed) return;
    switch (event.type) {
      case 'call.ringing':
        return this.onRinging(event.payload as CallView);
      case 'call.accepted':
        return this.onAccepted(event.payload as CallView);
      case 'call.ended':
        return this.onEnded(event.payload as CallView);
      case 'call.signal':
        return this.onSignal(event.payload as CallSignalPayload);
      default:
    }
  }

  private onRinging(call: CallView): void {
    const { userId, deviceId } = this.options;

    // The echo of our own call, possibly before `startCall` has answered.
    if (call.callerDeviceId === deviceId) {
      if (this.state.phase === 'outgoing' && !this.state.call) this.set({ call, peer: call.callees[0] ?? this.state.peer });
      return;
    }
    if (this.busy) return;
    if (!call.callees.some((callee) => callee.userId === userId)) return;

    this.clearLinger();
    this.set({ ...IDLE, phase: 'incoming', call, peer: call.caller });
  }

  private onAccepted(call: CallView): void {
    const { deviceId } = this.options;
    if (this.state.phase === 'outgoing' && !this.state.call && call.callerDeviceId === deviceId) {
      this.set({ call });
    }
    if (this.state.call?.id !== call.id) return;

    if (call.callerDeviceId === deviceId) {
      // Said twice (by the stream and by a catch-up after it reconnected): the connection is made once.
      if (this.state.phase !== 'outgoing') return;
      this.set({ call, phase: 'connecting' });
      void this.connectAsCaller(call.id);
    } else if (call.answeredDeviceId === deviceId) {
      this.set({ call });
    } else {
      // Picked up on another of this person's devices.
      this.finish(null);
    }
  }

  private onEnded(call: CallView): void {
    if (this.state.call?.id !== call.id) return;
    const caller = this.isCaller;
    const name = this.state.peer?.name || 'They';

    const message = ((): string | null => {
      switch (call.endReason) {
        case 'declined':
          return caller ? `${name} can't talk right now` : null;
        case 'missed':
          return caller ? 'No answer' : 'Missed call';
        case 'cancelled':
          return caller ? null : 'Missed call';
        case 'dropped':
          return 'Call dropped';
        default:
          return 'Call ended';
      }
    })();
    this.finish(message);
  }

  private onSignal(payload: CallSignalPayload): void {
    if (payload.toDeviceId !== this.options.deviceId) return;
    if (payload.callId !== this.state.call?.id) return;
    this.receiving = this.receiving
      .then(() => this.applySignal(payload.data))
      .catch((error: Error) => logger.warn('Could not apply a call signal', { error: error.message }));
  }

  // ─── The connection ──────────────────────────────────────────────────────

  /**
   * Creates the connection for `callId`, or nothing if that call ended while
   * the ICE servers were being fetched: a connection made after the teardown
   * would never be closed.
   */
  private async openPeer(callId: string): Promise<RTCPeerConnection | null> {
    const ice = await this.options.api.iceServers().catch(() => null);
    if (!this.stillOn(callId)) return null;
    this.hasRelay = ice?.relay ?? true;
    const peer = this.createPeer({ iceServers: (ice?.iceServers as RTCIceServer[] | undefined) ?? FALLBACK_ICE });
    this.peer = peer;

    for (const track of this.mic?.getTracks() ?? []) peer.addTrack(track, this.mic!);
    this.canMakeLines = typeof peer.addTransceiver === 'function';

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate =
        typeof event.candidate.toJSON === 'function' ? event.candidate.toJSON() : (event.candidate as RTCIceCandidateInit);
      this.send({ candidate });
    };
    peer.ontrack = (event) => {
      // Their camera and their screen are streams of their own: the audio element must keep the voice.
      if (event.track.kind === 'video') {
        // Which is which is its place among the video lines: the first is the camera, the second the screen.
        const place = (peer.getTransceivers?.() ?? []).filter((line) => line.receiver.track?.kind === 'video').indexOf(event.transceiver);
        const stream = new MediaStream([event.track]);
        if (place === 0) this.set({ remoteCameraStream: stream });
        else if (place === 1) this.set({ remoteScreen: stream });
        // Anywhere else it is a line this app does not know: drawn as nothing rather than as the wrong thing.
      } else {
        // The voice alone. Its stream also carries the silent video lines (they share its id, for older apps),
        // and an audio element given a stream with video in it can wait for a first frame before it plays.
        this.set({ remoteStream: new MediaStream([event.track]) });
      }
    };
    peer.onconnectionstatechange = () => this.onConnectionState(peer);
    return peer;
  }

  private async connectAsCaller(callId: string): Promise<void> {
    try {
      const peer = await this.openPeer(callId);
      if (!peer) return;
      // The lines a camera and a shared screen go on, in the first offer. They carry the microphone's stream id, so an
      // app that does not know about it files its track with the audio's stream and goes on playing the
      // call, instead of replacing the stream it plays with a silent video one.
      if (this.canMakeLines) {
        const line = () => peer.addTransceiver('video', { direction: 'sendrecv', streams: this.mic ? [this.mic] : [] });
        this.out.camera.line = line();
        this.out.screen.line = line();
      }
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.send({ description: { type: 'offer', sdp: offer.sdp ?? '' } });
      this.armConnectTimeout();
    } catch (error) {
      logger.warn('Could not start the call connection', { error: (error as Error).message });
      this.hangUp(NO_CONNECTION);
    }
  }

  private async applySignal(data: CallSignalData): Promise<void> {
    if (typeof data.screen === 'boolean') this.set({ remoteSharing: data.screen });
    if (typeof data.camera === 'boolean') this.set({ remoteCamera: data.camera });
    if (data.showing) {
      this.theyShow = data.showing;
      void this.applyEncoding('camera');
      void this.applyEncoding('screen');
    }
    const peer = this.peer;
    if (!peer) {
      if (data.candidate) this.pendingCandidates.push(data.candidate);
      return;
    }

    if (data.description) {
      await peer.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        // The caller's video lines, as the offer made them here, in its order: camera, then screen. Turned two-way,
        // so this side can show its own too. An offer without both is from an app that cannot show them.
        if (!this.out.camera.line) {
          const lines = (peer.getTransceivers?.() ?? []).filter((candidate) => candidate.receiver.track?.kind === 'video');
          if (lines.length === 2) {
            for (const line of lines) line.direction = 'sendrecv';
            [this.out.camera.line, this.out.screen.line] = lines as [RTCRtpTransceiver, RTCRtpTransceiver];
          }
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        this.send({ description: { type: 'answer', sdp: answer.sdp ?? '' } });
      }
      const queued = this.pendingCandidates;
      this.pendingCandidates = [];
      for (const candidate of queued) await peer.addIceCandidate(candidate).catch(() => undefined);
    }

    if (data.candidate) {
      if (!peer.remoteDescription) this.pendingCandidates.push(data.candidate);
      // A candidate the browser cannot use is not worth ending a call over.
      else await peer.addIceCandidate(data.candidate).catch(() => undefined);
    }
  }

  private send(data: CallSignalData): void {
    const callId = this.state.call?.id;
    if (!callId) return;
    this.sending = this.sending
      .then(() => this.options.api.sendSignal(callId, this.options.deviceId, data))
      .catch((error: Error) => logger.warn('Could not send a call signal', { error: error.message }));
  }

  private onConnectionState(peer: RTCPeerConnection): void {
    if (peer !== this.peer) return;

    switch (peer.connectionState) {
      case 'connected': {
        const wasDropped = this.state.reconnecting;
        this.clearTimer('connectTimer');
        this.clearTimer('recoverTimer');
        this.set({ phase: 'active', reconnecting: false, connectedAt: this.state.connectedAt ?? Date.now() });
        // Back after a drop: a signal about the camera or screen may have been lost with it, and the other side
        // would go on drawing a picture that stopped, or none that has begun. Said again, whole.
        if (wasDropped) this.resendState();
        // A video call: the one who placed it chose the camera, so it comes on now that there is someone to see it.
        if (this.cameraAtConnect) {
          this.cameraAtConnect = false;
          void this.startCamera();
        }
        break;
      }
      case 'disconnected':
      case 'failed':
        // "disconnected" often recovers by itself within seconds; "failed"
        // never does without a restart. Either way the caller restarts, and
        // the call is given up on only if nothing comes back.
        if (this.state.phase === 'active') this.set({ reconnecting: true });
        if (peer.connectionState === 'failed' && this.isCaller) void this.restartIce(peer);
        if (!this.recoverTimer && this.state.phase === 'active') {
          this.recoverTimer = setTimeout(() => {
            this.recoverTimer = null;
            this.hangUp('Call dropped');
          }, this.options.recoverTimeoutMs ?? 30_000);
        }
        break;
      default:
    }
  }

  /** What this side is showing and how much of theirs it shows, in one signal: the other side takes each part as it is. */
  private resendState(): void {
    this.send({
      screen: this.state.sharingScreen,
      camera: this.state.cameraOn,
      ...(this.weShow ? { showing: this.weShow } : {})
    });
  }

  private async restartIce(peer: RTCPeerConnection): Promise<void> {
    if (peer.signalingState !== 'stable') return;
    try {
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      this.send({ description: { type: 'offer', sdp: offer.sdp ?? '' } });
    } catch (error) {
      logger.warn('ICE restart failed', { error: (error as Error).message });
    }
  }

  private armConnectTimeout(): void {
    this.clearTimer('connectTimer');
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.state.phase === 'connecting') this.hangUp(this.hasRelay ? NO_CONNECTION : NO_RELAY);
    }, this.options.connectTimeoutMs ?? 30_000);
  }

  // ─── Ending ──────────────────────────────────────────────────────────────

  /** Tears the call down and shows `message` for a moment, or goes straight back to idle. */
  private finish(message: string | null): void {
    this.teardown();
    this.clearLinger();
    if (!message) {
      this.set(IDLE);
      return;
    }
    this.set({ ...IDLE, phase: 'ended', peer: this.state.peer, message });
    const linger = message === MIC_BLOCKED ? 6_000 : (this.options.lingerMs ?? 2_500);
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = null;
      if (this.state.phase === 'ended') this.set(IDLE);
    }, linger);
  }

  private teardown(): void {
    this.clearTimer('connectTimer');
    this.clearTimer('recoverTimer');
    if (this.peer) {
      this.peer.onicecandidate = null;
      this.peer.ontrack = null;
      this.peer.onconnectionstatechange = null;
      this.peer.close();
      this.peer = null;
    }
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    this.mic = null;
    for (const source of ['camera', 'screen'] as const) {
      const mine = this.out[source];
      for (const track of mine.stream?.getTracks() ?? []) track.stop();
      mine.stream = null;
      mine.line = null;
      mine.request += 1;
    }
    this.cameraAtConnect = false;
    this.opening = { camera: false, screen: false };
    this.theyShow = 'full';
    this.weShow = null;
    this.pendingCandidates = [];
  }

  private clearTimer(name: 'connectTimer' | 'recoverTimer'): void {
    const timer = this[name];
    if (timer) clearTimeout(timer);
    this[name] = null;
  }

  private clearLinger(): void {
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.lingerTimer = null;
  }

  /**
   * The page is going away, possibly into the back-forward cache, from which it
   * can come back. Hangs up a call this device is on, so the other side is not
   * left talking to nobody, but leaves a call that is only ringing here alone:
   * another device may still answer it. The engine stays usable.
   */
  leave(): void {
    if (this.state.phase === 'incoming') this.finish(null);
    else this.hangUp();
  }

  /** For good: the component holding the engine is unmounting. */
  dispose(): void {
    if (this.busy && this.state.call) void this.options.api.endCall(this.state.call.id).catch(() => undefined);
    this.teardown();
    this.clearLinger();
    this.disposed = true;
  }
}
