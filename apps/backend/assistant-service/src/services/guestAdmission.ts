import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import mongoose from 'mongoose';
import { BadRequestError, ServiceUnavailableError } from '@visin/backend-core';
const BUDGETS = 'chat_guest_budgets';

/**
 * Whether this deployment has everything guest Vivi depends on: bot verification, a network secret long enough to
 * keep raw addresses out of storage, a trusted proxy chain (or every caller shares one address) and the vision
 * service that answers which projects are public.
 */
export const guestBotCheckRequired = () => process.env.NODE_ENV !== 'development';

export function guestSetup() {
  return {
    botCheck: !guestBotCheckRequired() || Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY),
    networkSecret: (process.env.GUEST_NETWORK_SECRET?.length ?? 0) >= 32,
    trustedProxy: Boolean(process.env.GUEST_TRUSTED_PROXY),
    visionService: Boolean(process.env.VISION_SERVICE_URL)
  };
}
export type GuestSetup = ReturnType<typeof guestSetup>;

export function guestConfigured(): boolean {
  return Object.values(guestSetup()).every(Boolean);
}

/** Today's and this month's shared guest consumption, in millionths of a US dollar. */
export async function guestBudgetSnapshot(now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(8, 10);
  const budget = await mongoose.connection.collection(BUDGETS).findOne(
    { _id: month as never },
    { projection: { reservedMicros: 1, [`days.${day}.requests`]: 1, [`days.${day}.reservedMicros`]: 1 } }
  );
  return {
    month,
    day,
    requestsToday: Number(budget?.days?.[day]?.requests ?? 0),
    reservedTodayMicros: Number(budget?.days?.[day]?.reservedMicros ?? 0),
    reservedMonthMicros: Number(budget?.reservedMicros ?? 0)
  };
}

export function guestHash(value: string): string {
  const secret = process.env.GUEST_NETWORK_SECRET;
  if (!secret || secret.length < 32) throw new ServiceUnavailableError('Guest identity protection is not configured');
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function networkPrefix(ip: string): string {
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7);
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) throw new BadRequestError('Client network could not be established');
  const parts = ip.toLowerCase().split('::');
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const expanded = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return (
    expanded
      .slice(0, 4)
      .map((x) => Number.parseInt(x, 16).toString(16))
      .join(':') + '::/64'
  );
}
export interface GuestCaps {
  guestSessionRequests: number;
  guestNetworkRequests: number;
  guestGlobalRequests: number;
  guestDailyBudgetMicros: number;
  guestMonthlyBudgetMicros: number;
}
interface GuestRequest {
  sessionId: string;
  network: string;
  reserveMicros: number;
  caps: GuestCaps;
  now?: Date;
}

/** The counters one question touches: its session, its network (both hashed), the day's total and spend, the minute. */
function counterPaths(input: GuestRequest) {
  const now = input.now ?? new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(8, 10);
  const network = guestHash(`${month}-${day}:${input.network}`);
  const session = guestHash(`${month}-${day}:${input.sessionId}`);
  const minute = Math.floor(now.getTime() / 60000).toString();
  return {
    now,
    month,
    day,
    session,
    paths: {
      session: `days.${day}.sessions.${session}`,
      network: `days.${day}.networks.${network}`,
      total: `days.${day}.requests`,
      dailySpend: `days.${day}.reservedMicros`,
      burst: `bursts.${minute}.${network}`
    }
  };
}

/** A counter in the budget document, by its dotted path; an absent one is zero. */
const counter = (doc: unknown, path: string): number =>
  Number(path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], doc) ?? 0);

/** The UTC midnight that resets the daily counters. */
export const nextGuestReset = (now = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

/**
 * Which limit refused a question, so the visitor is told the right thing: their own allowance (`session`), their
 * network's (`network`), questions coming too quickly (`burst`), the shared pause (`shared`: the day's questions or
 * the daily/monthly spend) or every guest slot being busy (`capacity`). Read after the fact, so a counter that moved
 * in between can name a neighbour limit; the refusal itself was already decided atomically.
 */
export type GuestDenial = 'session' | 'network' | 'burst' | 'shared' | 'capacity';
export async function guestDenialReason(input: GuestRequest): Promise<GuestDenial> {
  const { now, month, session, paths } = counterPaths(input);
  const doc = await mongoose.connection.collection(BUDGETS).findOne({ _id: month as never });
  const at = (path: string): number => counter(doc, path);
  const { caps, reserveMicros } = input;
  if (at(paths.session) >= caps.guestSessionRequests) return 'session';
  if (at(paths.network) >= caps.guestNetworkRequests) return 'network';
  const slots = ((doc?.active ?? []) as { session: string; until: Date }[]).filter((slot) => slot.until > now);
  if (slots.some((slot) => slot.session === session)) return 'burst';
  if (at(paths.burst) >= 2) return 'burst';
  if (
    at(paths.total) >= caps.guestGlobalRequests ||
    at(paths.dailySpend) + reserveMicros > caps.guestDailyBudgetMicros ||
    Number(doc?.reservedMicros ?? 0) + reserveMicros > caps.guestMonthlyBudgetMicros
  )
    return 'shared';
  return slots.length >= 2 ? 'capacity' : 'shared';
}

export async function reserveGuest(input: GuestRequest & { runId: string }) {
  const { now, month, session, paths } = counterPaths(input);
  const collection = mongoose.connection.collection(BUDGETS);
  try {
    await collection.updateOne(
      { _id: month as never },
      {
        $setOnInsert: {
          reservedMicros: 0,
          active: [],
          expiresAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1))
        }
      },
      { upsert: true }
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const value = (p: string) => ({ $ifNull: [`$${p}`, 0] });
  const active = { $filter: { input: { $ifNull: ['$active', []] }, as: 'slot', cond: { $gt: ['$$slot.until', now] } } };
  const result = await collection.findOneAndUpdate(
    {
      _id: month as never,
      $expr: {
        $and: [
          { $lt: [value(paths.session), input.caps.guestSessionRequests] },
          { $lt: [value(paths.network), input.caps.guestNetworkRequests] },
          { $lt: [value(paths.total), input.caps.guestGlobalRequests] },
          { $lt: [value(paths.burst), 2] },
          { $lte: [{ $add: [value(paths.dailySpend), input.reserveMicros] }, input.caps.guestDailyBudgetMicros] },
          { $lte: [{ $add: [value('reservedMicros'), input.reserveMicros] }, input.caps.guestMonthlyBudgetMicros] },
          { $lt: [{ $size: active }, 2] },
          {
            $eq: [{ $size: { $filter: { input: active, as: 'slot', cond: { $eq: ['$$slot.session', session] } } } }, 0]
          }
        ]
      }
    },
    [
      {
        $set: {
          ...Object.fromEntries(
            [paths.session, paths.network, paths.total, paths.burst].map((p) => [p, { $add: [value(p), 1] }])
          ),
          [paths.dailySpend]: { $add: [value(paths.dailySpend), input.reserveMicros] },
          reservedMicros: { $add: [value('reservedMicros'), input.reserveMicros] },
          active: { $concatArrays: [active, [{ id: input.runId, session, until: new Date(now.getTime() + 90000) }]] }
        }
      }
    ],
    { returnDocument: 'after' }
  );
  if (!result) return null;
  // Whichever runs out first. A private window is a new session but the same network, so reporting the session's
  // count alone promised a fresh allowance the network would not honour.
  return {
    month,
    remaining: Math.max(
      0,
      Math.min(
        input.caps.guestSessionRequests - counter(result, paths.session),
        input.caps.guestNetworkRequests - counter(result, paths.network)
      )
    ),
    resetAt: nextGuestReset(now).toISOString()
  };
}
export async function releaseGuestSlot(month: string, runId: string) {
  await mongoose.connection
    .collection(BUDGETS)
    .updateOne({ _id: month as never }, { $pull: { active: { id: runId } } } as never);
}

/** Keep daily totals but discard old network/session identifiers and minute buckets. */
export async function pruneGuestIdentifiers(now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(8, 10);
  const minute = Math.floor(now.getTime() / 60000).toString();
  await mongoose.connection.collection(BUDGETS).updateMany({}, [
    {
      $set: {
        days: {
          $arrayToObject: {
            $map: {
              input: { $objectToArray: { $ifNull: ['$days', {}] } },
              as: 'day',
              in: {
                k: '$$day.k',
                v: {
                  $cond: [
                    { $and: [{ $eq: ['$_id', month] }, { $eq: ['$$day.k', day] }] },
                    '$$day.v',
                    { requests: '$$day.v.requests', reservedMicros: '$$day.v.reservedMicros' }
                  ]
                }
              }
            }
          }
        },
        bursts: {
          $arrayToObject: {
            $filter: {
              input: { $objectToArray: { $ifNull: ['$bursts', {}] } },
              as: 'burst',
              cond: { $and: [{ $eq: ['$_id', month] }, { $eq: ['$$burst.k', minute] }] }
            }
          }
        }
      }
    }
  ]);
}
