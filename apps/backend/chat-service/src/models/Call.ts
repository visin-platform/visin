import { Schema, model } from 'mongoose';

/**
 * One call between two people, from the first ring to the hang-up. The audio and video never pass through here: the
 * two browsers talk directly, or through a TURN relay. This row is what rings, who answered on which device and how
 * it ended; the thread's "Call, 12 min" line is made from it.
 *
 * `live` and `liveUserIds` exist for one reason: the unique index below. A person can be in one call at a time, and
 * "busy" has to hold even when two people press Call at the same moment on different replicas, so the database
 * refuses the second call rather than a lock in one process. Both are removed when the call ends.
 */
export type CallStatus = 'ringing' | 'active' | 'ended';
/**
 * - `hangup`: someone ended an answered call.
 * - `declined`: the person called said no.
 * - `cancelled`: the caller gave up before an answer.
 * - `missed`: nobody answered in time.
 * - `dropped`: one side vanished (closed the app, lost signal) and did not come back.
 */
export type CallEndReason = 'hangup' | 'declined' | 'cancelled' | 'missed' | 'dropped';

const person = new Schema({ userId: { type: String, required: true }, name: { type: String, default: '' } }, { _id: false });

const callSchema = new Schema(
  {
    conversationId: { type: String, required: true, index: true },
    caller: { type: person, required: true },
    callees: { type: [person], default: [] },
    /** The tab that placed the call. Signals go to this device only, not to the caller's others. */
    callerDeviceId: { type: String, required: true },
    answeredBy: { type: String, default: null },
    answeredDeviceId: { type: String, default: null },
    status: { type: String, enum: ['ringing', 'active', 'ended'], default: 'ringing' },
    endReason: { type: String, enum: ['hangup', 'declined', 'cancelled', 'missed', 'dropped', null], default: null },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    live: { type: Boolean },
    liveUserIds: { type: [String], default: undefined },
    /** Counts the signals of this call, so they are delivered in the order they were sent. */
    signalSeq: { type: Number, default: 0 },
    /** When each device on an answered call was last seen by its own stream; a side unseen for long has dropped. */
    seen: { type: new Schema({ caller: Date, callee: Date }, { _id: false }), default: () => ({}) }
  },
  { timestamps: true }
);
// At most one live call per person.
callSchema.index({ liveUserIds: 1 }, { unique: true, partialFilterExpression: { live: true } });
callSchema.index({ status: 1, createdAt: 1 });
export const Call = model('ChatCall', callSchema);
export type ChatCall = InstanceType<typeof Call>;
