import { flushMembershipEvents } from '../services/membershipAudit';
import { authenticateToken, BadRequestError } from '@visin/backend-core';
import { type RequestHandler } from 'express';
import { z } from 'zod';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { authorize, historyFilter } from '../services/access';
import { visibleRuns } from '../services/runService';
import { pendingScreenCalls } from '../services/screen';
import { paramId } from '../utils/request';
import { streamCursorSchema } from '../validation/messageSchemas';
import { parsed } from '../validation/parse';

const tabSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/)
  .optional();

/** How often an open event stream polls for new messages and run progress. */
const STREAM_POLL_MS = 2000;
/** How often a stream polls while its tab has a run that can move the page, so the page follows within about half a second. */
const STREAM_FAST_POLL_MS = 500;
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
    // The tab this stream belongs to; only it is ever asked to change its page.
    const tabId = parsed(tabSchema, req.query.tab);
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
      lastRuns: string | undefined,
      lastSelection: string | undefined,
      timer: NodeJS.Timeout | undefined;
    const sentCalls = new Set<string>();
    const later = (fast: boolean) => {
      if (!stopped) timer = setTimeout(() => void tick(), fast ? STREAM_FAST_POLL_MS : STREAM_POLL_MS);
    };
    res.on('close', () => {
      stopped = true;
      clearTimeout(timer);
      const remaining = (streams.get(userId) || 1) - 1;
      if (remaining) streams.set(userId, remaining);
      else streams.delete(userId);
    });
    const tick = async () => {
      if (stopped || loading) return;
      loading = true;
      let fast = false;
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
        const pending = await Conversation.findById(conversationId).select(
          '+membershipEvents trainingIds trainingLabels'
        );
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
        const selection =
          conversation.kind === 'assistant' && pending
            ? JSON.stringify({ trainingIds: pending.trainingIds, trainingLabels: pending.trainingLabels })
            : undefined;
        if (selection !== undefined && selection !== lastSelection && !stopped) {
          lastSelection = selection;
          if (!res.write(`event: selection\ndata: ${selection}\n\n`)) res.end();
        }
        lastRuns = runs;
        if (frame && !stopped) {
          wroteAt = Date.now();
          if (!res.write(frame)) res.end();
        }
        // A call exists only while one of this person's runs is working, which the runs above already say:
        // an idle stream costs no extra query, and a working one polls quickly so the page follows within ~0.5 s.
        if (tabId && conversation.kind === 'assistant' && jobs.some((job) => job.state === 'running')) {
          fast = true;
          // Calls are sent once each.
          const calls = (await pendingScreenCalls(userId, tabId, conversationId)).filter((c) => !sentCalls.has(c.id));
          for (const call of calls) sentCalls.add(call.id);
          if (calls.length && !stopped && !res.write(`event: screen\ndata: ${JSON.stringify(calls)}\n\n`)) res.end();
        }
      } catch {
        res.end();
      } finally {
        loading = false;
        later(fast);
      }
    };
    void tick();
  };
}
