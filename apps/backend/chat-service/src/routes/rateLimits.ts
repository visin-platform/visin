import { createRateLimiter } from '@visin/backend-core';
/** Created once per app and shared across route groups, preserving the existing budgets. */
export function createChatRateLimits() {
  return {
    writeLimit: createRateLimiter({ windowMs: 60000, max: 30, keyGenerator: (req) => req.user!.id }),
    callStartLimit: createRateLimiter({ windowMs: 60000, max: 10, keyGenerator: (req) => req.user!.id }),
    // Trickled ICE candidates and state changes: a few dozen per call, in bursts.
    signalLimit: createRateLimiter({ windowMs: 60000, max: 600, keyGenerator: (req) => req.user!.id }),
    // An upload address is cheap to mint but each is a file on disk: a person sends a few at a time, not hundreds.
    uploadLimit: createRateLimiter({ windowMs: 60000, max: 20, keyGenerator: (req) => req.user!.id }),
    inviteLimit: createRateLimiter({ windowMs: 3600000, max: 20, keyGenerator: (req) => req.user!.id })
  };
}
export type ChatRateLimits = ReturnType<typeof createChatRateLimits>;
