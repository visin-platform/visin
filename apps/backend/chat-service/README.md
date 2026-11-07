# Research chat service

Authenticated DMs, invited rooms, group channels, project discussions and private analyst threads. Runs on port 5012. All `/api/chat` routes require the existing signed-in browser session; internal tokens and MCP credentials do not bypass chat membership.

Human messaging needs `MONGODB_URI`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `AUTH_SERVICE_URL`, `GROUP_SERVICE_URL`, `VISION_SERVICE_URL` and appropriate `CORS_ORIGIN`. Contact invitations use a known **public profile handle** or a colleague from a currently shared group roster; there is no global private email/name search. Roster lookup is bounded to 20 current groups and 500 contacts. Project discussions are private to the project's owning group (or its personal owner), including when the project itself is public.

Private analysis is switched on, and given its provider and model, by a platform administrator in Account, under **Analyst** (chat links there, from a gear beside **New chat** and a **Set up** button where the analyst is off): one switch, one provider (Anthropic or OpenAI) and one model for the deployment, applied to the next question. Turning it off also stops questions being answered. Provider and model are both chosen from lists: the models offered are the ones the provider itself reports for that provider's key (for OpenAI, its chat models), so none is typed.

Provider keys are saved there too, by an administrator, one per provider for the whole deployment (a user's own key is not supported yet; the record carries an owner so it could be). A key is checked with the provider before it is kept, then stored encrypted with `API_KEY_ENCRYPTION_SECRET` (AES-256-GCM, as the platform's own API keys are). It is never returned or logged: the page shows only a saved key's last four characters. A key is only ever saved there; it is not read from the environment.

What an operator must still provide, because it is not something to type into a page: `API_KEY_ENCRYPTION_SECRET` (without it no key can be saved here) and `MCP_INTERNAL_URL` ending in `/mcp`. The settings page names whichever of these is missing, never values.

Nothing about the analyst's provider, model, switch or limit is set in the environment. Until an administrator saves settings it counts as on, with whichever provider already has a key and no model, so it stays silent until a model is chosen from that provider's own list. The administrator role is the one `auth-service` gives the first user. Shared threads support explicitly invoked, transcript-only assistants after consent or administrator enablement (see below). **Ask privately** opens a private analyst thread without copying shared messages.

The chosen provider's API ([Anthropic Messages](https://platform.claude.com/docs/en/api/messages) or OpenAI Chat Completions, one adapter each in `services/providers.ts`) is called with a local MCP client's tools. It exposes an explicit read-only tool allowlist under the asking user's project-limited key when a project is selected. A private side-panel chat without a selected project uses a short-lived read-only user key so it can resolve named projects through `list_projects` and verify them with `get_project`; normal resource permissions still apply. Shared chat never gets these tools. Account > Analyst configures 2–16 tool rounds per answer (default 8, including the final answer). Generation allows up to that many provider requests plus three screen-only rounds, eight tool calls per round, 6,000 output tokens per request and a reservation calculated as 40,000 tokens per configured round, plus 120,000 for screen-enabled questions. The daily token limit per person (a UTC day), set by an administrator in Account > Analyst, defaults to 800,000 and cannot be lower than one question's reservation. Actual successful usage releases unused reservations; failed or interrupted calls keep the reservation because consumption may be unknown. This is a token cap, not a dollar billing meter.

Questions contain a hidden outbox request. The worker recovers it into a unique job, uses a database conversation lease to serialize turns, and persists the completed result before publishing an idempotent answer. Expired jobs fail visibly rather than automatically repeating a possibly billed provider call. Retrying a failed analysis is an explicit new question. Short-lived keys are deleted after use and expire after five minutes as a fallback. Cancellation aborts provider work and cleans up keys; the kill switch stops new generation and cancels active work at its next check.

Messages use durable conversation sequences for pagination and SSE replay. SSE reauthenticates sessions and rechecks conversation access every ten seconds. The frontend also polls to revalidate access and provide fallback. There is no in-memory event bus dependency between replicas; each stream reads persisted messages/jobs. The worker currently performs one turn at a time per process. Room invites expose no history before acceptance; adding a participant never grants project/group access.

Existing findings stay in Vision. A separate user-reviewed save receives an ephemeral `analysis:write` credential, preserves analyst attribution, and uses `sourceId=chat:<message-id>` for idempotency in vision-service. The model never receives write tools.

Run `npm run dev --workspace=chat-service`, or use root Compose. `npm test --workspace=chat-service` uses a temporary MongoDB and local HTTP server with a mocked provider. No real provider calls are made by tests.

The remaining scope is tracked in root `todo.md`: shared research-tool access, per-assistant models, memory, full contact discovery, search, richer moderation, visual analysis and proactive summaries. Chat currently retains persisted history until operator-managed deletion; user-facing retention/deletion controls remain required before a public rollout.

## Source layout

`app.ts` composes the health endpoint, authenticated chat router, and error handler. `index.ts` owns database/index initialization, worker startup, and listening.

- `routes/`: feature routers and middleware ordering. Each app creates one set of rate limiters shared by the route groups.
- `controllers/`: HTTP input extraction, response envelopes/statuses, and SSE connection lifecycle. Stream accounting is scoped to the app instance.
- `services/`: conversation, membership, message, assistant, finding, and administration logic, alongside the existing worker, provider, access, and usage services. Services return results rather than writing Express responses; request context is retained where live authorization or forwarding session credentials needs it.
- `validation/`: domain-specific Zod schemas and the shared parser. `middleware/` holds the administrator gate; `models/` has one Mongoose model per file, preserving collection names and indexes.
- `__tests__/integration/`: feature suites exercising the complete HTTP/service/database behavior. `__tests__/services/` contains access, analyst, and provider unit tests. `__tests__/helpers/` shares mocks, isolated database/server lifecycle, and analyst fixtures.

`npm run typecheck --workspace=chat-service` checks application and test code. `npm run test:coverage --workspace=chat-service` runs the same regression tests and enforces the existing coverage thresholds.

## Usage and cost

Account > Analyst > **Usage and cost** (administrators) shows what answered questions used, by day, model and person, and an estimate of what that cost. Providers return no price with an answer, so each model's input and output price per million tokens is entered there, in one currency. **Refresh prices** fills them in from [LiteLLM's public price list](https://github.com/BerriAI/litellm), once per click and never in the background; prices typed by hand are never overwritten, and the list is read in dollars, so a refresh is refused for another currency.

Prices change, so each question keeps the price in effect when it was answered (`price` on its run) and is costed at that, now and later: changing a price affects only questions asked after it, and the report says when a model's questions in a period were asked at more than one price. A question asked before its model had a price shows tokens only, until **Price earlier questions** prices it at today's price; that is an estimate, so it is marked on each question and counted in the report, and it never changes an existing rate. Missing cache rates can be filled afterwards in the same currency, retaining the original input/output rates and marking the estimate as backfilled. Prices in more than one currency are never added together: such a period shows no cost total. Cost is an estimate from token counts and these prices, not an invoice; failed or stopped questions may have used tokens that were never reported, so they are counted but not costed.

## Reusable private assistants

In Chat > New chat > Your assistants, create a named assistant with communication instructions, edit or pause it, or remove it after confirmation. Selecting one starts a private analysis using the reviewed page context, if present. Private profiles are restricted to their creator/managers, while published bots are available to signed-in users. All profiles use the deployment's configured provider/model and daily token budget. Private threads keep read-only research tools; a disclosed copy can also be added to a shared conversation, without research tools.

`GET /api/chat/assistants` lists your profiles; `POST /api/chat/assistants` creates one; `POST /api/chat/assistants/:id` replaces its editable settings; `POST /api/chat/assistants/:id/delete` soft-removes it. Creation/edit bodies contain `name`, optional `personality`, and optional `paused`. Private conversation creation accepts an optional `assistantId`.

Names and instructions are snapshotted when each question is sent, so edits apply to subsequent questions. Pausing/removing prevents further questions, stops queued work, aborts running work at its next check, and suppresses unpublished results. Historical messages remain readable. Existing analyst conversations without a profile continue unchanged. The new collection and optional fields are additive; no history migration is needed.

## Shared assistants and permission contract

Shared assistants are off initially. Open a human thread's **Shared assistants** controls to disclose/add a profile, agree or enable, and select **Ask <name>** in the message audience picker. **People only** sends an ordinary message. Every reply is visible to the conversation's audience. No automatic mentions, follow-up windows, or proactive replies are enabled.

| Conversation          | Add/remove                                                                        | Enablement                                                                                                | History and tools                                                                   |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Private analyst       | Asking user with a managed or published profile                                    | Deployment setup; profile not paused/removed                                                              | Existing private history and project-limited read tools                             |
| Direct                | Either active person, adding a managed profile or published bot                                    | Both people must agree; either can withdraw                                                               | Chat transcript only; no project/dataset credentials                                |
| Room                  | Active room owner/admin, adding a managed profile or published bot                                 | Every current active person agrees; pending invitations prevent enablement; room owner/admin may lock off | Transcript after the newest current member's acceptance boundary; no research tools |
| Group/project channel | Current group owner/admin (personal project: its owner), adding a managed profile or published bot | Administrator switch and lock-off                                                                         | Shared transcript only; no project/dataset credentials, even in project discussions |

Adding an assistant explicitly discloses a snapshot of its name and communication instructions to everyone allowed to read the thread. Private profile edits do not silently change that shared copy: remove/re-add to update it. Global pause/removal still applies everywhere. Conversation membership references are authoritative; the separate `ChatConversationAssistant` collection only supplies disclosed configurations. Adding/removing resets agreement/enablement, and changing the room/direct audience requires fresh agreement. Pending invitees cannot inspect or change settings. There is no shared memory or private-owner-note feature yet.

`GET /api/chat/conversations/:id/assistants` returns the policy, current-user agreement/management rights, disclosed assistants, availability, and pending names. `POST` accepts `action` (`add`, `remove`, `consent`, `switch`, `lock`), optional `assistantId` and `enabled`. At most five assistants may be attached, with case-insensitively unique names. Conversation managers can only add profiles they own. Shared message sending accepts one explicit `assistantId`; replying with `replyTo` to an attached assistant's message also invokes it. One human message invokes at most one assistant; bot/system messages cannot trigger generation.

Shared jobs run on the asking person's budget through the same durable outbox, conversation lease, and idempotent publication as private analysis. No MCP credential or project ID is given to the shared model, and tool requests are rejected. The worker checks current agreement, membership version, live group membership, global enablement and profile availability before execution, provider rounds, tool calls, and publication; a one-second watcher also aborts active requests. Publication conditionally updates the exact conversation version, preventing a settings/membership change between authorization and insertion from publishing a stale reply. A policy change can interrupt a question; it never retries a billed provider request automatically. Pausing/removing cancels persisted pending work, suppresses completed unpublished results, and keeps historical messages and completed usage records.

Policy updates use optimistic concurrency; HTTP 409 requires reload/review. Assistant configuration and audience changes increment `membershipVersion`, invalidating queued/running results. Ordinary chat continues without enabling assistants. Group membership remains group-service's account-ID authority; conversation visitor rosters never grant group privileges. Finding saves remain private-analysis-only and user reviewed.

The schema changes are additive: optional shared settings and authoritative membership IDs on existing conversations, plus a new uniquely indexed `(conversationId, assistantId)` collection. Existing IDs, message sequences, findings, invitations, keys and usage remain intact; missing settings mean off. Before rolling back to a version without shared execution, disable shared conversations and drain/cancel their queued/running jobs. Do not delete the collection or histories as part of rollback.

## Quoted replies and shared progress

Message sends may include `replyTo` for a visible message in the same conversation. The server saves a bounded quote (`messageId`, `senderName`, `kind`, and up to 500 characters of body); clients cannot author that quote. Retries retain the original snapshot. In rooms, a new quote must reference a message after every current active member's join boundary, so quoting cannot republish pre-join history. Existing messages without quotes remain valid. Assistant turns receive the authorized quote as reference data, subject to the same tool/access checks as the question itself.

The runs endpoint and SSE now share one projection. Readers of shared threads see job state, assistant name, and activity only when they can see the triggering question. Invitees and newer room members cannot inspect older jobs. Shared responses omit unpublished results, evidence, credentials, instructions, billing details, and requester-specific errors. `canCancel` and `canRetry` are true only for the requester and appropriate job states; cancellation still mutates only that caller's jobs. Private analysis remains owner-only.

## Who may add shared assistants

Room and group/project administrators can choose **Administrators only** or **All members** in shared assistant controls. Missing settings retain the existing default: administrators in rooms/group channels, either active person in direct chats. Direct chats always keep symmetric addition rights and do not offer this policy control.

`POST /api/chat/conversations/:id/assistants` accepts `{ "action": "addition-policy", "whoCanAdd": "everyone" }` or `"admins"`. Only current administrators may change it; group roles are checked through group-service. The view returns `whoCanAdd`, `canAdd`, and `canSetAdditionPolicy` independently of `canManage`.

Delegation permits active members to add only assistants they own. Removal, lock-off, group enablement, and policy administration retain their existing manager checks. Lock-off blocks additions regardless of the policy. Policy changes increment the conversation version, clear consent/enablement, and emit a system message; queued/running replies become stale and require a new question after agreement/enablement. The new optional setting needs no history migration.

### Revocation timing and regression coverage

`src/__tests__/integration/revocation.test.ts` exercises queued, generating, and completed-unpublished shared answers after room invitation/acceptance, removal/leave, direct-chat blocking, assistant pause/detachment, deployment disablement, and live group membership loss. The generating cases deliberately return an answer after the change, proving the worker's final guard withholds it even if the provider ignores cancellation. Existing shared-assistant tests cover consent withdrawal, project-group membership loss, room history, and competing workers. Analyst tests cover initial/final project-access checks and policy rejection before tool execution; MCP independently authorizes each private research call.

Revocation does not undo an already sent provider request or erase an already published message. Active requests have a one-second abort watcher and guards at execution/model/tool/publication boundaries. Deployment settings are cached for up to two seconds on other replicas, so their watcher may observe disablement after that cache expires. Disabling the deployment suspends queued questions rather than cancelling them; re-enabling can resume those questions, subject to current access checks. Pausing/removing a profile explicitly cancels its pending work.

Chat-owned membership/policy changes use a version-checked publication boundary. External group/project authority checks are live reads, not a transaction with message insertion; they cannot provide atomic revocation across services. Private project access is also checked through MCP, whose authorization and revocation timing remain part of that service's contract.

### Membership audit and connection recovery

Chat-owned acceptance, invitation, departure, removal, and direct-conversation closure produce durable system messages. A membership change and its reserved audit sequence are saved together in the conversation document. The hidden `membershipEvents` outbox is drained by message reads/sends, streams, and the worker (even with assistants disabled). Repeated acceptance/invitation/removal requests do not create another audit event. Concurrent sequence changes reject the membership save with a reload conflict. Streams do not advance past an unmaterialized audit sequence. Room acceptance sets the history boundary before its join event; earlier audit history remains hidden from the new member.

`membershipEvents` is an additive field with an empty default; existing conversations need no backfill. It uses existing message uniqueness indexes. Drain pending audit events before rolling back to a version without outbox support, because that version cannot recover reserved events. Initial conversation rosters remain recorded by conversation creation; these system messages audit subsequent membership mutations.

Quiet SSE connections send a named `heartbeat` event every twenty seconds. Existing clients may ignore it. The chat frontend reconnects silent streams after forty-five seconds (checked every five seconds), polls while reconnecting, refreshes on tab resume, and merges replay by message ID and sequence. Capabilities now disclose only deployment provider/model/readiness metadata through `assistantModel`, alongside existing flags; keys and internal configuration stay in administrator APIs.

### Public bot profiles

Bots are created dynamically from **New chat → Your assistants**. After creating an assistant, use **Profile for …** to choose a public handle and bio, then publish it. The creator manages the assistant; designated `managerIds` also grant management. Bots do not receive platform administrator authority. The manager's public profile is linked on the bot page when that manager chose to make it public.

`GET/POST /assistants/:id/profile` is manager-only. Publishing creates/updates an auth-side user identity with `kind: assistant`, a stable `assistantId` link, a synthetic non-deliverable email identifier, and no password, Google subject, session, or administrator role. Handles use the same unique namespace as human profiles. `/u/:handle` and the People directory label these profiles as bots; **Ask …** opens private analysis. Public profile data excludes instructions and chat history. Names/paused state are mirrored to the public identity when managers edit the assistant; removal hides the profile and cancels work. Hiding the profile removes it from discovery and new public use; already-disclosed shared memberships retain their snapshots until removed or the assistant is paused/deleted.

`GET /assistants/catalog` lists published bots for private use and shared attachment. Public availability never grants the creator's research access or budget: private research acts for the asking person, and shared replies remain transcript-only with normal consent, policy checks, and budgets. Bot handles route to private assistant chats rather than human invitations; rooms add bots through shared assistant settings.

Existing assistants remain private because missing `published` defaults to false. No assistant, message, conversation, membership, or run IDs are rewritten. Existing human accounts without `kind` retain their behavior. Auth-service adds a unique partial index on `users.assistantId`; the existing unique handle index prevents collisions. Chat-service ensures those indexes at startup, so profile edits do not issue index-creation commands. There is no named-bot startup seed or automatic conversion of existing chats.

Deploy auth-service and the shared backend-core session guard before enabling bot profile publication. Bot identities are excluded from human sign-in, session issuance/validation, administrator bootstrap/recovery, Google account linking, and human membership search. Publishing writes the auth identity and chat definition separately; retries repair interrupted writes for the same assistant. This requires the existing shared users database contract and does not provide a cross-service transaction. On rollback, keep bot sign-in exclusion in place and unpublish/hide bot identities before reverting profile-aware clients.

Bot profile editors also read `userId` and `picture` from the manager-only profile response. Avatar writes go to auth-service's `PUT/DELETE /auth/bots/:userId/picture`; that service validates the signed-in human against the current chat assistant creator/managers, not only mirrored profile metadata. Images use the existing `user_avatars` storage and public `/auth/avatars/:userId` serving/privacy rules. Uploads accept bounded JPEG/PNG/WebP bytes and never renew a bot session or change the manager's own picture.

Review follow-ups: profile saves return the bot identity and picture metadata so managers can upload an avatar immediately. Removal is retryable after a failed public-profile write, preserving the first deletion time while finishing revocation/hiding. Direct handle requests reuse their profile lookup when distinguishing humans from bots.


### Screen permissions and model costs

Private desktop side-panel messages carry a page hint and enable navigation and page actions by default,
including successive messages sent with Enter. Full-page and shared chats do not receive screen actions.
The analyst uses navigation only when the person asks to open or show something. Navigation IDs must be explicit `structuredContent.navigation`
references emitted by trusted MCP tool code; descriptions, configs, quoted messages and frame names grant no
navigation permissions. References remain scoped to the credential's project and pages still enforce access.
An older MCP service without these references fails closed for resource navigation; deploy MCP before chat-service.

Page identity uses `get_training` with `detail: "identity"`, without epochs, descriptions or configs. The captured
page context is provider-native tool data, separate from user questions. Successful identical reads are reused only
within a turn, behind live guards; the final project-access check is always fresh. Comparison selection also retains
its fresh resource/project checks. Tool output and advertised frame metadata are bounded; `get_screen_context` can search the captured frame names on demand. Full run reads omit launch configuration in chat unless `includeConfig:true` is requested.

Anthropic uses an explicit five-minute cache breakpoint on the stable system/tool prefix; OpenAI's supported models
cache prefixes automatically. Personality, selected IDs and page metadata are outside that stable prefix. Runs retain
normalized total input, output, cache read/write counts, provider request count, research-call count and duration. Average latency counts only newly measured answers, not legacy zero durations.
**Usage and cost** accepts optional cache-read and cache-write rates per model. Missing applicable rates leave a
cached question unpriced; an explicit backfill can fill missing cache rates while preserving existing prices; provider-specific discounts are never inferred. Old runs without cache counts keep their
existing accounting. Counts and estimates are measurements for evaluating cheaper model choices; model routing is
unchanged until an accuracy baseline exists.

Provider protocol references: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) and
[Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

Screen calls are delivered over SSE with a private user/tab-scoped HTTP polling fallback. The panel polls pending calls every five seconds, and every second while a run is active. It deduplicates delivery and retries failed acknowledgements without navigating twice. Tab identity survives local hot reloads.

Empty screen-call parameters are normalized to `{}` on delivery, including old MongoDB records where empty objects were minimized away. The client also accepts omitted parameters from older streams. Regression coverage exercises both streaming and polling navigation through the real shell/chat browser integration.

Screen-aware questions use a hidden `screenRequest` outbox and internal `screen_queued` state in the same message/run collections. This prevents workers without screen support from claiming a job and dropping its tab context. Current workers recover both outboxes; API responses expose the internal state as `queued`. Cancellation and assistant revocation cover both paths. Chat history, keys and settings remain shared between deployments.

Provider requests keep the 34 KB serialized envelope ceiling, including tool schemas. Before rejecting an oversized request, the provider adapter removes complete older conversational turns and compacts older tool results, marking omitted data as unknown and asking for narrower reads. The current question, verified application context, tool invocation IDs, error flags and invocation/result pairing remain intact. Schemas and a current question that cannot fit still fail before a provider call; compaction does not increase token reservations.
