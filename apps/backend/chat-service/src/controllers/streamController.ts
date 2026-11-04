import { flushMembershipEvents } from '../services/membershipAudit';
import { authenticateToken, BadRequestError } from '@visin/backend-core';
import { type RequestHandler } from 'express';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { authorize, historyFilter } from '../services/access';
import { visibleRuns } from '../services/runService';
import { paramId } from '../utils/request';
import { streamCursorSchema } from '../validation/messageSchemas';
import { parsed } from '../validation/parse';

/** How often an open event stream polls for new messages and run progress. */
const STREAM_POLL_MS = 2000;
/** How often an open event stream re-checks the session and conversation access. */
const STREAM_REAUTHORIZE_MS = 10000;
/** A named heartbeat lets clients detect a silently stalled connection. */
const STREAM_HEARTBEAT_MS = 20000;

/** Per-app stream accounting: separate app instances never share subscriber limits. */
export function createStreamController(): RequestHandler {
  const streams = new Map<string, number>();
  return async (req, res) => {
    const conversationId = paramId(req);
    let conversation = await authorize(req, conversationId);
    const userId = req.user!.id;
    if ((streams.get(userId) || 0) >= 4) throw new BadRequestError('Too many open chat streams');
    let after = parsed(streamCursorSchema, req.headers['last-event-id'] || req.query.after || 0);
    streams.set(userId, (streams.get(userId) || 0) + 1);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    let stopped = false,
      loading = false,
      authorizedAt = Date.now(),
      wroteAt = 0,
      lastRuns: string | undefined;
    const timer = setInterval(() => {
      void tick();
    }, STREAM_POLL_MS);
    res.on('close', () => {
      stopped = true;
      clearInterval(timer);
      const remaining = (streams.get(userId) || 1) - 1;
      if (remaining) streams.set(userId, remaining);
      else streams.delete(userId);
    });
    const tick = async () => {
      if (stopped || loading) return;
      loading = true;
      try {
        // Access is re-checked every few polls, not every one: each check asks the session
        // store, group-service and vision-service, per open stream.
        if (Date.now() - authorizedAt >= STREAM_REAUTHORIZE_MS) {
          // authenticateToken deliberately skips an already-authenticated request. Clear the
          // cached payload so session revocation is checked again on long-lived connections.
          req.user = undefined;
          await new Promise<void>((resolve, reject) => {
            void authenticateToken(req, res, (error) => (error ? reject(error) : resolve()));
          });
          conversation = await authorize(req, conversationId);
          authorizedAt = Date.now();
        }
        await flushMembershipEvents(conversationId);
        let messages = await Message.find({
          conversationId,
          $and: [historyFilter(conversation, userId), { seq: { $gt: after } }]
        })
          .sort({ seq: 1 })
          .limit(50);
        // A membership change can commit after the flush but before this query. Never advance
        // a replay cursor past a reserved audit sequence that is not materialized yet.
        const pending = await Conversation.findById(conversationId).select('+membershipEvents');
        const boundary = Math.min(...(pending?.membershipEvents || []).map((event) => event.seq));
        messages = messages.filter((message) => message.seq < boundary);
        const jobs = await visibleRuns(conversation, userId);
        const runs = JSON.stringify(jobs);
        if (messages.length) after = messages[messages.length - 1].seq;
        // Sent only when something changed; the first poll always sends, so the page has a state.
        let frame: string | undefined;
        if (messages.length || runs !== lastRuns)
          frame = `id: ${after}\nevent: state\ndata: ${JSON.stringify({ messages, runs: jobs })}\n\n`;
        else if (Date.now() - wroteAt >= STREAM_HEARTBEAT_MS) frame = 'event: heartbeat\ndata: {}\n\n';
        lastRuns = runs;
        if (frame && !stopped) {
          wroteAt = Date.now();
          if (!res.write(frame)) res.end();
        }
      } catch {
        res.end();
      } finally {
        loading = false;
      }
    };
    void tick();
  };
}
