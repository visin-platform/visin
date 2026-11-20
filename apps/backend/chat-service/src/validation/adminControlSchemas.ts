import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

/** What one account may be given differently from everyone else. Guest settings are platform-wide only. */
const userFields = {
  enabled: z.boolean(),
  dailyRequestLimit: z.number().int().min(0).max(100000),
  dailyTokenLimit: z.number().int().min(0).max(1000000000)
};
const guestFields = {
  guestEnabled: z.boolean(),
  guestSessionRequests: z.number().int().min(0).max(100),
  guestNetworkRequests: z.number().int().min(0).max(1000),
  guestGlobalRequests: z.number().int().min(0).max(10000),
  /** Millionths of a US dollar. */
  guestDailyBudgetMicros: z.number().int().min(0).max(100000000),
  guestMonthlyBudgetMicros: z.number().int().min(0).max(1000000000),
  /** What a visitor reads first, after "Hi, I'm <assistant name>!". */
  guestGreeting: z.string().trim().max(300),
  /** Questions offered to a visitor who has not typed yet; each is sent as written. */
  guestExamples: z.array(z.string().trim().min(1).max(80)).max(3),
  /** How long an answer should be, in words. Also sets the output cap, and so what a question reserves. */
  guestAnswerWords: z.number().int().min(30).max(300),
  /**
   * How many times a guest answer may look something up in the public catalogue before it must answer. 0 turns lookups
   * off: one request, as before. Each round is another request with everything so far re-sent, so each one also
   * raises what a question reserves of the spend ceiling.
   */
  guestToolRounds: z.number().int().min(0).max(4),
  /** The most one lookup may hand back, in bytes. Counted into what a question reserves, round by round. */
  guestToolResultBytes: z.number().int().min(500).max(6000)
};
export const USER_POLICY_KEYS = Object.keys(userFields) as (keyof typeof userFields)[];

export const POLICY_DEFAULTS = {
  enabled: true,
  dailyRequestLimit: 100,
  dailyTokenLimit: 800000,
  guestEnabled: false,
  guestSessionRequests: 3,
  guestNetworkRequests: 10,
  guestGlobalRequests: 100,
  // No spend ceiling until an administrator approves one: guests stay unable to start paid work.
  guestDailyBudgetMicros: 0,
  guestMonthlyBudgetMicros: 0,
  guestGreeting: "I know Visin's public research: what each project studies, how it was run and what it found.",
  guestExamples: ['Find public computer vision projects', 'Which projects study autonomous driving?'] as string[],
  guestAnswerWords: 80,
  // Each round of lookups is another request and raises what a question reserves of the spend ceilings, which stay at
  // zero (no guest can ask) until an administrator sets them. Set this to 0 to turn lookups off.
  guestToolRounds: 3,
  guestToolResultBytes: 3000
} as const;

/** The platform-wide policy: every setting, defaults filled in. */
export const policySchema = z.object({ ...userFields, ...guestFields }).strict();
export type Policy = z.infer<typeof policySchema>;

/** A per-account override: only the settings it changes. A missing one inherits the global value. */
export const userPolicySchema = z.object(userFields).partial().strict();
export type UserPolicy = z.infer<typeof userPolicySchema>;

// A note on why is welcome in the history but not required: it was mostly typed to get past the form.
const revisioned = { revision: z.number().int().min(0), reason: z.string().trim().max(300).default('') };
export const globalPolicyBodySchema = z.object({ ...revisioned, settings: policySchema }).strict();
export const userPolicyBodySchema = z.object({ ...revisioned, settings: userPolicySchema }).strict();

/** `undefined` is the global policy. */
export const policyIdSchema = objectId.optional();

export const runsQuerySchema = z.object({
  userId: objectId.optional(),
  days: z.coerce.number().int().min(1).max(365).default(30)
});
export const runIdSchema = objectId;
