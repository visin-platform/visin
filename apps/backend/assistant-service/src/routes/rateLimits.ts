import { createRateLimiter } from '@visin/backend-core';
/** Created once per app and shared across route groups: the budgets of the settings and assistant routes, as they were in chat. */
export function createAssistantRateLimits() {
  return {
    writeLimit: createRateLimiter({ windowMs: 60000, max: 30, keyGenerator: (req) => req.user!.id }),
    inviteLimit: createRateLimiter({ windowMs: 3600000, max: 20, keyGenerator: (req) => req.user!.id })
  };
}
export type AssistantRateLimits = ReturnType<typeof createAssistantRateLimits>;
