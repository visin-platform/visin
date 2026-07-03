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
