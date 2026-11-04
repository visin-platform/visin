import { createRateLimiter } from '@visin/backend-core';
/** Created once per app and shared across route groups, preserving the existing budgets. */
export function createChatRateLimits() {
  return {
    writeLimit: createRateLimiter({ windowMs: 60000, max: 30, keyGenerator: (req) => req.user!.id }),
    inviteLimit: createRateLimiter({ windowMs: 3600000, max: 20, keyGenerator: (req) => req.user!.id })
  };
}
export type ChatRateLimits = ReturnType<typeof createChatRateLimits>;
