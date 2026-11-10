import { Call, type CallStatus, type ChatCall } from '../models/Call';
import { CallSignal } from '../models/CallSignal';
import { RING_TIMEOUT_MS, finishIfLive, toCallView } from './callService';

export type CallEventType = 'call.ringing' | 'call.accepted' | 'call.ended' | 'call.signal';

export interface CallEvent {
  type: CallEventType;
  conversationId: string;
  at: number;
  payload: unknown;
}

/** How often a side of an answered call is marked as seen. Well inside the time a side may go unseen. */
const SEEN_EVERY_MS = 5_000;
/** The most signals handed over in one poll, so one busy device cannot hold the stream. */
const MAX_SIGNALS = 50;

/**
 * What one device (one browser tab) should be told about calls, worked out from the database each time it is asked.
 *
 * Nothing is pushed by whichever replica handled a request: a stream polls, and compares what it finds with what it
 * already told this device. That is what lets the call service run as several replicas, and a reconnecting stream
 * pick up where it should (a ringing call is announced, an answered one is not announced twice).
 *
 * It also marks this device as seen while it is on an answered call, which is how a vanished side is noticed.
 */
export class CallFeed {
  /** The calls this device has been told about, and the state it was told. */
  private readonly told = new Map<string, CallStatus>();
  private seenAt = 0;

  constructor(
    private readonly userId: string,
    private readonly deviceId: string
  ) {}

  async poll(now = Date.now()): Promise<{ events: CallEvent[]; busy: boolean }> {
    const told = [...this.told.keys()];
    const calls = await Call.find({
      $or: [{ live: true, liveUserIds: this.userId }, ...(told.length > 0 ? [{ _id: { $in: told } }] : [])]
    });
    const events: CallEvent[] = [];
    const event = (type: CallEventType, call: ChatCall, payload: unknown = toCallView(call)): void => {
      events.push({ type, conversationId: call.conversationId, at: now, payload });
    };

    const present = new Set<string>();
    for (const call of calls) {
      const id = call.id;
      present.add(id);
      const before = this.told.get(id);
      if (call.status === 'ringing') {
        if (before === undefined) event('call.ringing', call);
        this.told.set(id, 'ringing');
        // The ring timeout is also noticed here, so a call stops ringing on time and not at the next sweep.
        if (now - call.createdAt.getTime() >= RING_TIMEOUT_MS) await finishIfLive(id, ['ringing'], 'missed');
      } else if (call.status === 'active') {
        // A device that joins a call already answered (a reconnect) is not told it was answered again.
        if (before === 'ringing') event('call.accepted', call);
        this.told.set(id, 'active');
        await this.markSeen(call, now);
      } else {
        if (before !== undefined) event('call.ended', call);
        this.told.delete(id);
      }
    }
    for (const id of told) if (!present.has(id)) this.told.delete(id);

    // Signals are only ever sent to a device on a live call, which the query above has just found. With none, there
    // is nothing to collect, and an idle tab (most of them) costs one read a poll instead of a read and a write.
    for (let i = 0; i < MAX_SIGNALS && this.told.size > 0; i++) {
      const signal = await CallSignal.findOneAndDelete({ toUserId: this.userId, toDeviceId: this.deviceId }, { sort: { seq: 1 } });
      if (!signal) break;
      events.push({
        type: 'call.signal',
        conversationId: calls.find((c) => c.id === signal.callId)?.conversationId ?? '',
        at: now,
        payload: { callId: signal.callId, fromDeviceId: signal.fromDeviceId, toDeviceId: signal.toDeviceId, data: signal.data }
      });
    }
    return { events, busy: this.told.size > 0 };
  }

  /** Records that this device is still here, when it is one of the two on an answered call. */
  private async markSeen(call: ChatCall, now: number): Promise<void> {
    if (now - this.seenAt < SEEN_EVERY_MS) return;
    const side =
      call.caller.userId === this.userId && call.callerDeviceId === this.deviceId
        ? 'caller'
        : call.answeredBy === this.userId && call.answeredDeviceId === this.deviceId
          ? 'callee'
          : null;
    if (!side) return;
    this.seenAt = now;
    await Call.updateOne({ _id: call._id, status: 'active' }, { $set: { [`seen.${side}`]: new Date(now) } });
  }
}
