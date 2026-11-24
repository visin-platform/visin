# Research chat service

Authenticated DMs, invited rooms, group channels, project discussions and the private threads in which people ask the assistants. Runs on port 5012. All `/api/chat` routes require the existing signed-in browser session; internal tokens and MCP credentials do not bypass chat membership.

Chat does not run the assistants: they are their own service (`assistant-service`), which chat asks, over its internal API, whether a message may be put to an assistant and which one, and which asks chat, over chat's internal API, to publish an answer or change a question. Human messaging needs neither to be running. Set `ASSISTANT_INTERNAL_URL` (`http://assistant-service:5018`) for chat to reach it; without it, or while it is down, a question to an assistant is refused with a message and everything else works.

Human messaging needs `MONGODB_URI`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AUTH_SERVICE_URL`, `GROUP_SERVICE_URL`, `VISION_SERVICE_URL` and appropriate `CORS_ORIGIN`. Contact invitations use a known **public profile handle** or a colleague from a currently shared group roster; there is no global private email/name search. Roster lookup is bounded to 20 current groups and 500 contacts. Project discussions are private to the project's owning group (or its personal owner), including when the project itself is public.

Messages use durable conversation sequences for pagination and SSE replay. SSE reauthenticates sessions and rechecks conversation access every ten seconds. The frontend also polls to revalidate access and provide fallback. There is no in-memory event bus dependency between replicas; each stream reads persisted messages/jobs. A worker runs up to four turns at a time (`MAX_CONCURRENT_RUNS`), and never two in one conversation.

Run `npm run dev --workspace=chat-service`, or use root Compose. The dev command sets `NODE_ENV=development`.

## Source layout

`app.ts` composes the health endpoint, authenticated chat router and error handler. `bootstrap.ts` owns database/index initialization, the housekeeping (call sweep, membership event recovery) and listening.

- `services/assistantClient.ts`: how chat asks the assistants: one call to their internal API each. The rest of chat never calls them. What chat merely reads of theirs (assistants, runs, screen calls) it reads from the same collections through `models/Assistant.ts`, `models/AssistantRun.ts` and `models/ScreenCall.ts` (typed read-only), and it decides what a conversation's readers may see of runs (`services/runViews.ts`), because its streams ask on every tick.
- `routes/assistantInternalRoutes.ts` and `services/assistantApi.ts`: what the assistant service asks of chat, behind the internal token: append a message, acknowledge or cancel a question's hidden request, record a finding, set a conversation's page selection, save a change to its shared assistants. Chat does only what it would do for itself: a message gets its sequence, wakes the streams and is idempotent by its client id.
- `routes/`: feature routers and middleware ordering. Each app creates one set of rate limiters shared by the route groups.
- `controllers/`: HTTP input extraction, response envelopes/statuses, and SSE connection lifecycle. Stream accounting is scoped to the app instance.
- `services/`: conversation, membership, message and call logic, with the access checks and the views of the assistants' runs. Services return results rather than writing Express responses; request context is retained where live authorization or forwarding session credentials needs it.
- `validation/`: domain-specific Zod schemas and the shared parser; `models/` has one Mongoose model per file, preserving collection names and indexes.
- `__tests__/integration/`: feature suites exercising the complete HTTP/service/database behavior. `__tests__/services/` contains access and wake-bus unit tests. `__tests__/helpers/` shares mocks (the assistant service is faked there: what the real one decides is its own tests', and chat's side of the contract is tested here, its side there) and an isolated database/server lifecycle.

`npm run typecheck --workspace=chat-service` checks application and test code. `npm run test:coverage --workspace=chat-service` runs the same regression tests and enforces the existing coverage thresholds.

## Quoted replies and shared progress

Message sends may include `replyTo` for a visible message in the same conversation. The server saves a bounded quote (`messageId`, `senderName`, `kind`, and up to 500 characters of body); clients cannot author that quote. Retries retain the original snapshot. In rooms, a new quote must reference a message after every current active member's join boundary, so quoting cannot republish pre-join history. Existing messages without quotes remain valid. Assistant turns receive the authorized quote as reference data, subject to the same tool/access checks as the question itself.

The runs endpoint and SSE now share one projection. Readers of shared threads see job state, assistant name, and activity only when they can see the triggering question. Invitees and newer room members cannot inspect older jobs. Shared responses omit unpublished results, evidence, credentials, instructions, billing details, and requester-specific errors. `canCancel` and `canRetry` are true only for the requester and appropriate job states; cancellation still mutates only that caller's jobs. Private analysis remains owner-only.

### Membership audit and connection recovery

Chat-owned acceptance, invitation, departure, removal, and direct-conversation closure produce durable system messages. A membership change and its reserved audit sequence are saved together in the conversation document. The hidden `membershipEvents` outbox is drained by message reads/sends, streams, and the worker (even with assistants disabled). Repeated acceptance/invitation/removal requests do not create another audit event. Concurrent sequence changes reject the membership save with a reload conflict. Streams do not advance past an unmaterialized audit sequence. Room acceptance sets the history boundary before its join event; earlier audit history remains hidden from the new member.

`membershipEvents` is an additive field with an empty default; existing conversations need no backfill. It uses existing message uniqueness indexes. Drain pending audit events before rolling back to a version without outbox support, because that version cannot recover reserved events. Initial conversation rosters remain recorded by conversation creation; these system messages audit subsequent membership mutations.

Quiet SSE connections send a named `heartbeat` event every twenty seconds. Existing clients may ignore it. The chat frontend reconnects silent streams after forty-five seconds (checked every five seconds), polls while reconnecting, refreshes on tab resume, and merges replay by message ID and sequence. Capabilities now disclose only deployment provider/model/readiness metadata through `assistantModel`, alongside existing flags; keys and internal configuration stay in administrator APIs.
