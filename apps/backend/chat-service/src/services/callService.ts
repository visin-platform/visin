import { BadRequestError, ConflictError, NotFoundError, logger } from '@visin/backend-core';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { Call, type CallEndReason, type ChatCall } from '../models/Call';
import { CallSignal } from '../models/CallSignal';
import type { CallSignalData } from '../validation/callSchemas';
import { actorName } from '../utils/request';
import { authorize } from './access';
import { wake } from './callWake';
import { appendMessage } from './messages';
import { sendToUsers } from './pushService';

/**
 * One-to-one calls: ringing, answering, hanging up, and passing WebRTC signals between the two browsers.
 *
 * The server never touches audio or video. What it owns is everything the two sides cannot agree on alone: who is
 * calling whom, which device answered, when the ringing stops, and whether a call whose other end vanished is still
 * a call. All of that lives in the database, not in this process: any replica can take a request, and any other can
 * deliver its result (see `callFeed`). Every transition is a conditional update, so racing requests end a call once.
 */

/** How long a call rings before it counts as missed. */
export const RING_TIMEOUT_MS = 45_000;
/**
 * How long a side of an answered call may go unseen before the call is ended for it. A side is seen while its stream
 * is open, which it stays through a locked screen, so losing it means the app was closed or the phone lost signal.
 * Long enough to ride out a tunnel or a Wi-Fi to mobile switch.
 */
export const DROP_GRACE_MS = 45_000;

/** Calls can be turned off for a deployment; chat is unaffected. */
export const callsEnabled = (): boolean => process.env.CALLS_ENABLED?.trim().toLowerCase() !== 'false';

export interface CallPersonView {
  userId: string;
  name: string;
  picture: string | null;
}

export interface CallView {
  id: string;
  conversationId: string;
  caller: CallPersonView;
  callees: CallPersonView[];
  callerDeviceId: string;
  answeredBy: string | null;
  answeredDeviceId: string | null;
  status: ChatCall['status'];
  endReason: CallEndReason | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export function toCallView(call: ChatCall): CallView {
  const person = (p: { userId: string; name?: string | null }): CallPersonView => ({
    userId: p.userId,
    name: p.name ?? '',
    picture: null
  });
  return {
    id: call.id,
    conversationId: call.conversationId,
    caller: person(call.caller),
    callees: call.callees.map(person),
    callerDeviceId: call.callerDeviceId,
    answeredBy: call.answeredBy ?? null,
    answeredDeviceId: call.answeredDeviceId ?? null,
    status: call.status,
    endReason: call.endReason ?? null,
    startedAt: call.createdAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null
  };
}

export const participantsOf = (call: ChatCall): string[] => [call.caller.userId, ...call.callees.map((c) => c.userId)];

/** The call if this person is in it. Anything else is a 404, as for conversations. */
async function requireCall(req: Request, callId: string, checkConversation = true): Promise<ChatCall> {
  if (!Types.ObjectId.isValid(callId)) throw new NotFoundError('Call not found');
  const call = await Call.findById(callId);
  if (!call || !participantsOf(call).includes(req.user!.id)) throw new NotFoundError('Call not found');
  // Hanging up or declining only ever reduces access, so it must work in a conversation that has since closed.
  if (checkConversation) await authorize(req, call.conversationId);
  return call;
}

const ringUrl = (call: ChatCall) => `/chat?conversation=${call.conversationId}`;

export async function startCall(req: Request, conversationId: string, deviceId: string): Promise<CallView> {
  const conversation = await authorize(req, conversationId, true);
  const me = req.user!.id;
  if (conversation.kind !== 'direct' || conversation.assistantId)
    throw new BadRequestError('Calls are between two people in a direct message');
  const others = conversation.participants.filter((p) => p.userId !== me);
  const callee = others[0];
  if (others.length !== 1 || !callee) throw new BadRequestError('Calls are between two people');
  if (callee.state !== 'active') throw new BadRequestError('They have not accepted your message request yet');

  await sweepCalls();
  let call: ChatCall;
  try {
    call = await Call.create({
      conversationId: conversation.id,
      caller: { userId: me, name: actorName(req) },
      callees: [{ userId: callee.userId, name: callee.name }],
      callerDeviceId: deviceId,
      live: true,
      liveUserIds: [me, callee.userId]
    });
  } catch (error) {
    // The unique index on the people in live calls: someone is busy. It holds across replicas, unlike a lock.
    if ((error as { code?: number }).code !== 11000) throw error;
    const mine = await Call.exists({ live: true, liveUserIds: me });
    throw new ConflictError(mine ? 'You are already in a call' : `${callee.name || 'They'} is on another call`);
  }
  wake(participantsOf(call));

  // Push is what rings a phone whose app is closed. Short-lived on purpose: "calling you" delivered after the
  // ringing stopped is worse than none.
  void sendToUsers(
    [callee.userId],
    { title: actorName(req), body: 'Calling you', tag: `call-${call.id}`, url: ringUrl(call), kind: 'call' },
    { ttlSeconds: Math.round(RING_TIMEOUT_MS / 1000) }
  ).catch((error: Error) => logger.warn('Call push failed', { error: error.message }));
  return toCallView(call);
}

export async function acceptCall(req: Request, callId: string, deviceId: string): Promise<CallView> {
  const call = await requireCall(req, callId);
  const me = req.user!.id;
  if (!call.callees.some((callee) => callee.userId === me)) throw new BadRequestError('You cannot answer your own call');

  // Conditional on still ringing, so two devices answering at once cannot both win: one gets the call, the other a
  // conflict.
  const now = new Date();
  const accepted = await Call.findOneAndUpdate(
    { _id: call._id, status: 'ringing' },
    { $set: { status: 'active', answeredBy: me, answeredDeviceId: deviceId, answeredAt: now, seen: { caller: now, callee: now } } },
    { returnDocument: 'after' }
  );
  if (!accepted) {
    const current = await Call.findById(call._id);
    throw new ConflictError(current?.status === 'active' ? 'Answered on another device' : 'The call has already ended');
  }
  wake(participantsOf(accepted));
  takeDownRinging(accepted, 'Answered on another device');
  return toCallView(accepted);
}

export async function declineCall(req: Request, callId: string): Promise<CallView> {
  const call = await requireCall(req, callId, false);
  if (!call.callees.some((callee) => callee.userId === req.user!.id)) throw new BadRequestError('You cannot decline your own call');
  const ended = await finishIfLive(call.id, ['ringing'], 'declined');
  if (ended) takeDownRinging(ended, 'Declined');
  return toCallView(ended ?? (await Call.findById(call._id)) ?? call);
}

/**
 * Hanging up, from either side, at any point. Ending an ended call changes nothing. The reason is settled by which
 * update wins, not by the status read first: a caller giving up at the moment the other person answers must end an
 * answered call as a hang-up, not record a missed one.
 */
export async function endCall(req: Request, callId: string): Promise<CallView> {
  const call = await requireCall(req, callId, false);
  const unanswered: CallEndReason = call.caller.userId === req.user!.id ? 'cancelled' : 'declined';
  const ended =
    (await finishIfLive(call.id, ['active'], 'hangup')) ??
    (await finishIfLive(call.id, ['ringing'], unanswered)) ??
    // Answered between the two attempts above.
    (await finishIfLive(call.id, ['active'], 'hangup'));
  if (ended?.endReason === 'declined') takeDownRinging(ended, 'Declined');
  return toCallView(ended ?? (await Call.findById(call._id)) ?? call);
}

/**
 * Passes an offer, an answer, an ICE candidate or a camera/screen state to the other device. Only the two devices in
 * the call may signal, each only as itself: a second tab of the same person cannot talk its way into the connection.
 */
export async function relaySignal(req: Request, callId: string, deviceId: string, data: CallSignalData): Promise<void> {
  const call = await requireCall(req, callId);
  if (call.status !== 'active') throw new ConflictError('The call is not connected');
  const me = req.user!.id;
  const fromCaller = me === call.caller.userId && deviceId === call.callerDeviceId;
  const fromCallee = me === call.answeredBy && deviceId === call.answeredDeviceId;
  if (!fromCaller && !fromCallee) throw new ConflictError('This device is not in the call');

  const toUserId = fromCaller ? call.answeredBy! : call.caller.userId;
  const toDeviceId = fromCaller ? call.answeredDeviceId! : call.callerDeviceId;
  // Counted on the call itself, atomically, so signals reach the other side in the order they were sent however
  // many replicas took them.
  const counted = await Call.findOneAndUpdate({ _id: call._id, status: 'active' }, { $inc: { signalSeq: 1 } }, { returnDocument: 'after' });
  if (!counted) throw new ConflictError('The call is not connected');
  await CallSignal.create({ callId: call.id, toUserId, toDeviceId, fromDeviceId: deviceId, seq: counted.signalSeq, data });
  wake([toUserId]);
}

/** This person's live call, so an app opened from a "calling you" notification can show it. */
export async function currentCall(req: Request): Promise<CallView | null> {
  await sweepCalls();
  const call = await Call.findOne({ live: true, liveUserIds: req.user!.id });
  if (!call) return null;
  // Access is re-checked rather than assumed: they may have left the group, or blocked the other person.
  try {
    await authorize(req, call.conversationId);
  } catch {
    return null;
  }
  return toCallView(call);
}

/**
 * Replaces "calling you" on every device of the people called, for a call answered or declined on one of them. A
 * locked phone would otherwise keep showing a ringing call through the whole conversation and after it.
 */
function takeDownRinging(call: ChatCall, body: string): void {
  void sendToUsers(
    call.callees.map((callee) => callee.userId),
    { title: call.caller.name || 'Visin', body, tag: `call-${call.id}`, url: ringUrl(call), kind: 'call-over' },
    { ttlSeconds: Math.round(RING_TIMEOUT_MS / 1000) }
  ).catch((error: Error) => logger.warn('Could not take down a ringing notification', { error: error.message }));
}

/** "Call, 12 min" for an answered call; for one that was not, who it was from. */
export function callLine(call: ChatCall): string {
  if (call.answeredAt) {
    const seconds = Math.max(0, Math.round(((call.endedAt ?? new Date()).getTime() - call.answeredAt.getTime()) / 1000));
    return `Call, ${formatDuration(seconds)}`;
  }
  if (call.endReason === 'declined') return 'Call declined';
  return `Missed call from ${call.caller.name || 'someone'}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Ends the call if it is still in one of `from`, and does everything an ending means: forgets what is left to
 * deliver, writes the line in the thread, and replaces "calling you" with "missed call" where nobody answered.
 * Conditional, so a hang-up racing the ring timeout ends the call once; the loser gets null.
 */
export async function finishIfLive(
  callId: string,
  from: Array<ChatCall['status']>,
  reason: CallEndReason,
  staleBefore?: Date
): Promise<ChatCall | null> {
  const ended = await Call.findOneAndUpdate(
    {
      _id: callId,
      status: { $in: from },
      ...(staleBefore && { $or: [{ 'seen.caller': { $lt: staleBefore } }, { 'seen.callee': { $lt: staleBefore } }] })
    },
    { $set: { status: 'ended', endReason: reason, endedAt: new Date() }, $unset: { live: 1, liveUserIds: 1 } },
    { returnDocument: 'after' }
  );
  if (!ended) return null;
  wake(participantsOf(ended));
  await CallSignal.deleteMany({ callId });
  try {
    await appendMessage({
      conversationId: ended.conversationId,
      senderId: 'system:call',
      senderName: 'Call',
      kind: 'system',
      body: callLine(ended),
      clientId: `call-${ended.id}`
    });
  } catch (error) {
    logger.warn('Could not write the call into the thread', { callId, error: (error as Error).message });
  }
  if (reason === 'missed' || reason === 'cancelled') {
    // Same tag as the ringing notification, so it is replaced rather than joined by a second.
    void sendToUsers(
      ended.callees.map((callee) => callee.userId),
      { title: ended.caller.name || 'Visin', body: 'Missed call', tag: `call-${ended.id}`, url: ringUrl(ended) }
    ).catch((error: Error) => logger.warn('Missed call push failed', { error: error.message }));
  }
  return ended;
}

/**
 * Ends what nobody will end: calls ringing past the timeout, and answered calls where a side has gone unseen for
 * `DROP_GRACE_MS`. Safe from any replica at any time.
 */
export async function sweepCalls(now = Date.now()): Promise<void> {
  const stale = await Call.find({ status: 'ringing', createdAt: { $lt: new Date(now - RING_TIMEOUT_MS) } }).select('_id');
  for (const call of stale) await finishIfLive(call.id, ['ringing'], 'missed');
  const cutoff = new Date(now - DROP_GRACE_MS);
  const gone = await Call.find({
    status: 'active',
    $or: [{ 'seen.caller': { $lt: cutoff } }, { 'seen.callee': { $lt: cutoff } }]
  }).select('_id');
  for (const call of gone) await finishIfLive(call.id, ['active'], 'dropped', cutoff);
}

const SWEEP_MS = 5_000;
export function startCallSweep(): () => void {
  const timer = setInterval(() => {
    sweepCalls().catch((error: Error) => logger.warn('Call sweep failed', { error: error.message }));
  }, SWEEP_MS);
  timer.unref();
  return () => clearInterval(timer);
}
