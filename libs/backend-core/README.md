# @visin/backend-core

Shared backend functionality for Visin services: JWT auth middleware, inter-service
auth, a centralized error handler, structured logging, and security headers/rate
limiting — extracted from the near-identical copies that used to live in
`auth-service`, `group-service`, `vision-service`, and `file-service`.

## Installation

```bash
npm install @visin/backend-core
```

## Usage

```typescript
import express from 'express';
import {
  authenticateToken,
  optionalAuth,
  errorHandler,
  requestLogger,
  securityHeaders,
  standardRateLimiter,
  logger
} from '@visin/backend-core';

const app = express();

app.use(securityHeaders);
app.use(requestLogger);
app.use(standardRateLimiter);

// Public read, works for anonymous + logged-in users
app.get('/projects', optionalAuth, getProjects);

// Requires a valid, signed-in caller
app.post('/projects', authenticateToken, createProject);

// Must be mounted last
app.use(errorHandler);

logger.info('Service started');
```

### Inter-service calls

```typescript
import { requireInternalServiceToken, validateInternalServiceToken, allowUserOrInternalService } from '@visin/backend-core';

// Route only ever called by other services
router.post('/internal/sync', requireInternalServiceToken, syncHandler);

// Route callable by an end user OR another service
router.get('/groups/:id', validateInternalServiceToken, authenticateToken /* or optionalAuth */, allowUserOrInternalService, getGroup);
```

### Throwing typed errors

```typescript
import { NotFoundError, asyncHandler } from '@visin/backend-core';

router.get('/projects/:id', asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new NotFoundError('Project not found');
  res.json({ success: true, data: project });
}));
```

## Session revocation

`authenticateToken` and `optionalAuth` verify the JWT and check its immutable
account ID, normalized email and token version against the auth-owned `users`
collection through the existing shared MongoDB connection. A session needs an
ObjectId account ID, an email and a positive safe-integer `tokenVersion`.

There is no cross-request cache. Once a password change or account invalidation
has acknowledged its version increment, every subsequent authorization check
reads the primary and rejects the old session. A request already authorized before
that increment may finish. Deleted accounts cannot authenticate or borrow a new
account with the same email. No additional connection or environment variable is
needed; MongoDB must be connected before serving authenticated requests.

Required auth returns 401 if the session cannot be established, including database
failure. Optional auth continues anonymously so public content remains available.
Middleware is asynchronous: direct callers/tests must await it. Pre-authenticated
API keys, project tokens, OAuth access tokens and internal-service authentication
retain their existing separate verification and revocation rules. File-service
uses HMAC URLs/internal keys and does not accept browser-session JWTs.

## OAuth refresh grants

A single `oauth_grants` document identifies each user/client connection using a
stable, deterministic `_id`. Reauthorization replaces its random generation;
refresh rotation conditionally replaces its current token digest. The existing
standalone MongoDB is sufficient; no transactions or additional configuration are
required. `oauth_refresh_tokens` stores only immutable digest history with its
grant ID and generation. History alone never authorizes a request.

Successor history is prepared before the atomic grant update. Concurrent refreshes
have at most one successful claim. Reusing a retired token revokes that generation,
including a concurrent winner's successor, and the client must reconnect. A token
from an earlier connection cannot revoke newer consent. Disconnect updates the
same authority, so a pending refresh cannot reactivate a disconnected grant.
Explicit reconnect and disconnect take effect in the order of their atomic grant
writes; a reconnect committed after a disconnect starts a new connection.

If preparation or an uncommitted activation fails, the existing token remains
usable. If activation commits but its acknowledgement or HTTP response is lost,
the old token cannot be redeemed again: reconnect to recover. Prepared orphan
history is inert and is not listed as a connection. Connection dates/scopes come
from the grant and remain stable across rotation.

Legacy token records lacking grant identity fail closed and require migration or
reconnection; there is no automatic migration. Release backend-core and update its
consumers together before using the new grant format. Existing OAuth access JWTs
retain their normal expiry (up to one hour); this change governs refresh authority.

## Required environment variables

- `JWT_SECRET` — used by `authenticateToken`/`optionalAuth` to verify tokens issued
  by auth-service.
- `INTERNAL_SERVICE_TOKEN` — shared secret for `requireInternalServiceToken` /
  `validateInternalServiceToken`.

## Consuming this package in a standalone Docker build

Each service's `Dockerfile` builds from its own directory in isolation, so a
workspace dependency on `@visin/backend-core` needs to be resolvable inside that
build context — either by publishing this package to npm first and installing it
normally, or by adjusting the build context / adding a copy step so
`node_modules/@visin/backend-core` is populated before `npm ci`. Not yet wired up;
see the repo's `TODO.md`.
