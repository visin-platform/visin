/** One entry of `RTCConfiguration.iceServers`, as chat-service hands it over. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** How far calls reach on a server: a hosted relay, the operator's own relay, STUN only, or the local network only. */
export type IceMode = 'cloudflare' | 'turn' | 'stun' | 'local';

/** What a call connects with. `relay: false` means some networks will not connect. */
export interface IceConfig {
  iceServers: IceServer[];
  relay: boolean;
  mode: IceMode;
  expiresAt: string | null;
}

/** Whether calls are on for this server, and how far they reach. */
export interface CallsConfig {
  enabled: boolean;
  mode: IceMode;
  relay: boolean;
}

export interface CallPerson {
  userId: string;
  name: string;
  picture: string | null;
}

export type CallEndReason = 'hangup' | 'declined' | 'cancelled' | 'missed' | 'dropped';

/** A call as chat-service describes it, and as every `call.*` event but `call.signal` carries it. */
export interface CallView {
  id: string;
  conversationId: string;
  caller: CallPerson;
  callees: CallPerson[];
  /** The tab that placed the call. */
  callerDeviceId: string;
  answeredBy: string | null;
  answeredDeviceId: string | null;
  status: 'ringing' | 'active' | 'ended';
  endReason: CallEndReason | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

/** An offer, an answer or an ICE candidate, on its way between the two devices. */
export interface CallSignalData {
  description?: { type: 'offer' | 'answer'; sdp: string };
  candidate?: RTCIceCandidateInit | null;
  /** The sender's screen is now being shown to the other person (true) or no longer is (false). */
  screen?: boolean;
  /** The sender's camera is now on (true) or off (false). */
  camera?: boolean;
  /** How much of the other side's pictures the sender is showing, so no more is sent than that. */
  showing?: 'full' | 'small' | 'none';
}

export interface CallSignalPayload {
  callId: string;
  fromDeviceId: string;
  toDeviceId: string;
  data: CallSignalData;
}

/** What the person-level stream delivers about calls. */
export interface ChatEvent {
  type: 'call.ringing' | 'call.accepted' | 'call.ended' | 'call.signal';
  conversationId: string;
  at: number;
  payload: unknown;
}
