# Auth Service

Authentication API for Google sign-in, JWT cookies, profile lookup, and group refresh.

## Google sign-in and linking

Google sign-in identifies an account by `User.googleSubject`, the Google ID token's
immutable `sub`, in this order:

1. The account already bound to that subject signs in, whatever email Google reports now.
2. An account created by Google sign-up before subjects were stored (`signupMethod:
   'google'`, no subject, no password) is bound to the subject on its first Google
   sign-in. Its address came from a Google-verified token, so no password
   registration can have claimed it.
3. Otherwise Google sign-up creates an account bound to the subject, behind the same
   gate as password registration (closed until initial setup).

Steps 2 and 3 require Google to report the email as verified. Any other account with
that email (a password account, a Google sign-up that has since set a password, or
one bound to a different subject) is refused with 409: an email match never grants
Google access to it. Its owner signs in with the password and uses the auth page's
**Link Google sign-in** form, which requires the current password and a Google account
choice. The protected `POST /auth/profile/google` endpoint accepts `currentPassword`
and `idToken`, binds only the authenticated account, and re-signs the current session
after incrementing its token version, ending every other session. Existing bindings cannot be overwritten through this
endpoint. The unique subject index is created by the existing startup index check.

## Sessions

Every sign-in (password, Google, setup, registration) creates a `user_sessions` document and a JWT naming it in
`sid`, sent as the httpOnly `access_token` cookie. Every service's auth middleware requires that document to exist
and be unexpired, so deleting it revokes the session on the next request.

- **Lifetime:** 30 days idle, slid forward by `GET /auth/verify` (at most one write per 5 minutes), never past 90 days
  from sign-in. A TTL index removes expired sessions.
- **`POST /auth/logout`** deletes the caller's session and clears the cookie.
- **`GET /auth/sessions`** lists the caller's sessions: device label (from the User-Agent), sign-in method,
  created/last-active times, and which one is `current`.
- **`DELETE /auth/sessions/:id`** signs one of the caller's sessions out; `signedOut: true` if it was their own.
- **`POST /auth/sessions/revoke-others`** signs out every session but the caller's.
- A password change or Google link keeps the caller's session and ends the rest; `POST
  /auth/internal/invalidate-tokens` ends all of them.

Pre-sessions tokens (no `sid`, 24-hour lifetime) are still accepted until they expire, and `/auth/verify` upgrades
one to a session.

## Local Development

```bash
npm install
npm run dev --workspace=auth-service
```

The service listens on `PORT` and defaults to `5001`.

## Environment

Copy `.env.example` to `.env` and set:

- `PORT`: HTTP port, usually `5001`.
- `NODE_ENV`: `development` or `production`.
- `MONGODB_URI`: MongoDB database used for users.
- `JWT_SECRET`: shared JWT signing secret. Must match services that verify auth JWTs.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `CORS_ORIGIN`: comma-separated browser origins.
- `COOKIE_DOMAIN`: cookie domain for the `access_token` cookie.
- `INTERNAL_SERVICE_TOKEN`: shared service-to-service token. Must match `group-service`.
- `GROUP_SERVICE_URL`: URL for group lookup and refresh, usually `http://localhost:5006`.

## Commands

```bash
npm run build --workspace=auth-service
npm run start --workspace=auth-service
npm run test --workspace=auth-service
npm run lint --workspace=auth-service
npm run typecheck --workspace=auth-service
```

## First-run setup and recovery

An empty installation accepts its first administrator through `/auth/setup`.
Concurrent requests compete for one indexed bootstrap marker on the new user;
only one succeeds. Startup creates the required indexes before accepting requests
and fails if MongoDB cannot enforce them, even when automatic indexing is disabled.
Registration returns 409 until the first account has been persisted. Existing
installations keep their current accounts and cannot reopen public setup.

If setup is interrupted before the insert, retry setup. If the account was saved
but the response or session failed, sign in with the same email and password.
Do not delete users to retry setup: other services retain references to their IDs.

For a legacy installation that has accounts but no administrator, an operator
with access to the auth service and its database can restore the role on an
explicitly selected existing account:

```bash
npm run build --workspace=auth-service
MONGODB_URI=mongodb://localhost:27017/visin npm run recover:admin --workspace=auth-service -- <existing-user-id>
```

Replace `<existing-user-id>` with the account's 24-character `_id` from the
`users` collection. Verify the account belongs to the intended operator before
granting the role. The command preserves the account ID, password and other roles;
repeating it is safe. It never creates an account or reopens setup. It exits
nonzero if the ID is invalid, missing, or the database operation fails. In the
production container, the equivalent command is
`node dist/scripts/recoverAdmin.js <existing-user-id>` using its configured environment.

The bootstrap regression suite runs automatically under `npm test` using
`mongodb-memory-server` with MongoDB 8.3.9. It needs no external database or
Docker service; the first run downloads and caches the test binary.

## Docker Compose

```bash
docker compose -f apps/backend/auth-service/compose.yml up --build
```

The compose file expects the same env vars to be present in the shell or an env file, and joins the external `visinnet` network.
