import mongoose from 'mongoose';
import { BadRequestError, ConflictError, ForbiddenError } from '@visin/backend-core';
import { AdminPolicy } from '../models/AdminPolicy';
import { parsed } from '../validation/parse';
import {
  globalPolicyBodySchema,
  POLICY_DEFAULTS,
  policyIdSchema,
  policySchema,
  USER_POLICY_KEYS,
  userPolicyBodySchema,
  userPolicySchema,
  type Policy,
  type UserPolicy
} from '../validation/adminControlSchemas';
import { guestSetup } from './guestAdmission';

export { policySchema, type Policy };
export const defaultPolicy: Policy = { ...POLICY_DEFAULTS };
const GLOBAL = 'global';
const STALE = 'Settings changed; reload before saving';

const pick = (stored: unknown, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(
    keys.filter((k) => (stored as Record<string, unknown> | undefined)?.[k] !== undefined).map((k) => [
      k,
      (stored as Record<string, unknown>)[k]
    ])
  );

/** Stored global settings over the defaults. Invalid stored values fail closed rather than fall back to defaults. */
const globalFrom = (stored: unknown): Policy =>
  policySchema.parse({ ...defaultPolicy, ...pick(stored, Object.keys(defaultPolicy)) });

/** Only the per-account settings; anything else an older override stored is ignored, so it cannot shadow global. */
const overrideFrom = (stored: unknown): UserPolicy => userPolicySchema.parse(pick(stored, USER_POLICY_KEYS));

/** An override replaces a global limit, but can never re-enable Vivi for one account while it is off for everyone. */
export const mergePolicy = (global: Policy, override: UserPolicy): Policy => ({
  ...global,
  ...override,
  enabled: global.enabled && (override.enabled ?? true)
});

async function load(userId?: string) {
  const docs = await AdminPolicy.find({ _id: { $in: userId ? [GLOBAL, userId] : [GLOBAL] } }).lean();
  return { global: docs.find((d) => d._id === GLOBAL), user: userId ? docs.find((d) => d._id === userId) : undefined };
}

/** The policy in force for one account (or, with no id, for everyone): one read for both documents. */
export async function effectivePolicy(userId?: string): Promise<Policy> {
  const { global, user } = await load(userId);
  return mergePolicy(globalFrom(global?.settings), overrideFrom(user?.settings));
}

/** Refuses paid work for an account that is suspended, deleted or has Vivi turned off. */
export async function assertViviUser(userId: string): Promise<Policy> {
  const account = /^[a-f\d]{24}$/i.test(userId)
    ? await mongoose.connection
        .collection('users')
        .findOne({ _id: new mongoose.Types.ObjectId(userId) }, { projection: { status: 1 } })
    : null;
  if (!account || ['suspended', 'deleted'].includes(account.status)) throw new ForbiddenError('Account is not active');
  const policy = await effectivePolicy(userId);
  if (!policy.enabled) throw new ForbiddenError('Vivi access is disabled for this account');
  return policy;
}

/**
 * The global policy, or one account's override beside what it inherits and what results. `settings` is what an
 * edit replaces: the whole global policy, or only the settings the override sets.
 */
export async function getPolicy(rawId: unknown) {
  const id = parsed(policyIdSchema, rawId);
  const { global, user } = await load(id);
  const globalPolicy = globalFrom(global?.settings);
  if (!id)
    return {
      id: GLOBAL,
      revision: global?.revision ?? 0,
      settings: globalPolicy,
      effective: globalPolicy,
      // Which of the deployment's guest settings exist (never their values), so the page can say what is missing.
      guestSetup: guestSetup(),
      history: global?.history ?? []
    };
  const override = overrideFrom(user?.settings);
  return {
    id,
    revision: user?.revision ?? 0,
    settings: override,
    inherited: globalPolicy,
    effective: mergePolicy(globalPolicy, override),
    history: user?.history ?? []
  };
}

/** Saves a whole new revision; a stale revision is refused, so two administrators never overwrite each other. */
export async function savePolicy(actorId: string, rawId: unknown, body: unknown) {
  const id = parsed(policyIdSchema, rawId);
  const input = id ? parsed(userPolicyBodySchema, body) : parsed(globalPolicyBodySchema, body);
  if (!id && (input.settings as Policy).guestEnabled) assertGuestCanBeEnabled(input.settings as Policy);
  const key = id ?? GLOBAL;
  const current = await AdminPolicy.findById(key).lean();
  if ((current?.revision ?? 0) !== input.revision) throw new ConflictError(STALE);
  try {
    const saved = await AdminPolicy.findOneAndUpdate(
      { _id: key, revision: input.revision },
      {
        $set: { settings: input.settings },
        $inc: { revision: 1 },
        $push: {
          history: {
            $each: [
              {
                actorId,
                at: new Date(),
                reason: input.reason,
                before: current?.settings ?? (id ? {} : defaultPolicy),
                after: input.settings
              }
            ],
            $slice: -100
          }
        }
      },
      { upsert: !current, returnDocument: 'after' }
    );
    if (!saved) throw new ConflictError(STALE);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ConflictError(STALE);
    throw error;
  }
  return getPolicy(id);
}

const SETUP_LABELS = {
  botCheck: 'bot verification keys (TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY)',
  networkSecret: 'GUEST_NETWORK_SECRET of at least 32 characters',
  trustedProxy: 'GUEST_TRUSTED_PROXY',
  visionService: 'VISION_SERVICE_URL'
} as const;

/** What stands between this deployment and anonymous Vivi, by name, so an administrator knows what to fix. */
function assertGuestCanBeEnabled(settings: Policy): void {
  const setup = guestSetup();
  const missing: string[] = [
    ...(Object.keys(SETUP_LABELS) as (keyof typeof SETUP_LABELS)[]).filter((key) => !setup[key]).map((key) => SETUP_LABELS[key]),
    ...(settings.guestDailyBudgetMicros > 0 ? [] : ['a daily spend ceiling above zero']),
    ...(settings.guestMonthlyBudgetMicros > 0 ? [] : ['a monthly spend ceiling above zero'])
  ];
  if (missing.length) throw new BadRequestError(`Anonymous Vivi cannot be turned on yet. Missing: ${missing.join('; ')}.`);
}
