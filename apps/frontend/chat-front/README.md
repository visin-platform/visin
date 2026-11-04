# Chat front

One React application for the `/chat` full page and the shell's resizable side panel. Module Federation exports `./App` and `./Panel`; both share the conversation implementation. Standalone development runs on port 3014.

Runtime configuration: `AUTH_SERVICE_URL`, `AUTH_FRONT_URL`, `CHAT_SERVICE_URL`. Set `CHAT_FRONT_URL` in shell-front to expose its navigation and panel. The root Compose file wires these addresses automatically. Private assistant requests additionally require backend provider configuration; human chats work without it.

`visin:open-chat` asks the shell to open the panel with optional `{ projectId, trainingIds, title, kind }` context. The panel offers a new-conversation review before using that context. Ordinary navigation never changes an existing thread. Training detail/comparison pages and project discussions supply context; the backend independently authorizes all identifiers. The standalone chat entry accepts `project`, `runs`, `title` and `kind` query parameters as untrusted context.

Users can create private analyst threads, send a DM request to a group colleague or a cross-group public profile handle, invite a room, or open group/project channels. Assistant replies offer evidence links, copy, cancel and reviewed finding saves. Human threads offer shared assistant controls when the deployment advertises the capability. Direct/room conversations require unanimous agreement; group/project channels use administrator enablement. Shared replies use only visible chat history; Ask privately retains research tools. Existing Analysis tabs remain the durable findings interface.

New chat also provides owner-only reusable assistants with name/instructions, editing, pause, and confirmed removal. Selecting one carries the reviewed page context into a private conversation. All assistants currently use the deployment analyst model; shared participation is available through a disclosed copy of the profile and explicit consent/enablement.

## Source layout

The layout follows vision-front and account-front: pages compose feature components, hooks own state and effects, services own API calls, and shared types/utilities are independent modules.

- `pages/ChatPage.tsx`: composes the workspace, conversation list, active/pending thread, new-chat flow, and dialogs.
- `components/chat/`: conversation list/thread, message bubbles, composer, evidence/context links, analyst notices, and people/finding dialogs. Dialogs own their form drafts.
- `components/newChat/`: analyst/project picker, people picker, room form, and the new-chat composition. `components/assistants/` contains private/shared assistant controls.
- `hooks/`: conversation/capability loading, navigation, the page-context bridge, live thread/read state, sending/retries, discovery, and assistant mutations. `useChatWorkspace` composes those focused hooks.
- `contexts/`: authentication and a workspace provider scoped to each page or panel mount. The provider avoids passing the entire workspace through every intermediate component.
- `services/`: the browser-session API client and typed chat/assistant operations. `types/` holds domain and request contracts; `utils/` holds message merging, evidence, unread counts, context matching, handles, and settings links.
- Tests live beside their components, hooks, services, and utilities. Page behavior is split into messaging, analysis, and navigation suites; `test/chatFixtures.ts` shares their mock server/session state.

Both federation entry points render the same `ChatPage`; neither introduces a nested router or changes the shell's address bar. The existing credential handling, sequence-based message merging, cancellation, SSE/poll fallback, account/conversation row isolation, retry identifiers, context review, and finding-save flow are retained.

Validation: `npm run typecheck --workspace=chat-front`, `npm run lint --workspace=chat-front`, `npm run test:coverage --workspace=chat-front`, `npm run build --workspace=chat-front`, and `npm run test:e2e --workspace=chat-front`. Existing coverage thresholds remain in force.

## Replies and shared assistant activity

Use **Reply** on a message to stage a quoted reply; **Cancel reply** keeps the draft and removes the target. Sending clears the preview, while a failed send retains its reply target and retry identifier. Switching conversations clears the target. Copy is available for human messages as well as assistant replies.

A reply to a shared assistant explicitly asks that assistant and uses the conversation's existing consent/enablement rules. The preview explains this behavior. Choosing an assistant in the recipient picker clears a staged quote; choosing a reply clears the previous picker selection, keeping the intended recipient explicit. Quote content is rendered as plain text and authored by the server.

Shared assistant activity is visible to all authorized readers of the question. Only the requester sees cancel/retry controls. Progress stays synchronized through the same SSE stream and polling fallback as messages.

Shared assistant controls also let room/group administrators choose who may add assistants. Members with delegated permission see their own available assistants to share, without gaining removal, lock, or policy controls. Changes require fresh agreement or administrator enablement; direct chats keep equal rights for both people.

In enabled shared chats, type `@` to filter available attached assistants. Click a suggestion or use arrow keys and Enter to select its explicit recipient ID; Enter then sends. Escape dismisses suggestions, and Shift+Enter inserts a newline. Editing or removing an inserted mention clears its recipient. Plain typed names never invoke an assistant automatically. The server rechecks consent and availability when sending.

Remembered conversations are checked against the loaded conversation list; missing rows are fetched directly so older threads outside the capped list still open. Missing/inaccessible selections return to the list; Back clears storage and conversation URL parameters. Account changes/logout clear the previous account selection and draft. The shell receives selection clearing too.

The thread shows connecting/reconnecting/offline status, monitors named server heartbeats, and falls back to polling while SSE recovers. Tab resume and restored connectivity refresh the thread; navigation closes streams and removes timers/listeners. New chat shows the deployment-wide provider/model and whether it is available; model selection remains administrator-controlled. Account's shell-hosted group/member views can request group/direct chats through the existing shell event contract; project discussion actions already use that contract.

Bots can be created and published dynamically: **New chat → Your assistants → Create assistant → Profile for …**. Choose a handle and public bio and enable the public profile. Published bots appear in People and on `/u/:handle` with a bot label and public manager link. The profile action opens a private assistant chat; the shared-assistant picker also offers published bots, subject to the conversation's policy. No bot name or manager handle is hardcoded. Existing assistants stay private until explicitly published.

To upload or replace a bot avatar, open **Profile for …** and save its profile; avatar upload becomes available immediately. The avatar editor uploads immediately, offers removal, and uses the same 256-pixel center crop and size validation as human profiles. Name, instructions, pause state, handle, and bio remain editable through the existing bot controls. Management stays available even while the deployment model is unavailable; starting analysis remains disabled.

The review pass added cursor-based reconnects, offline polling suppression, and protection against late thread/account responses clearing current messages or drafts. Temporary restore failures preserve the selected thread and draft while showing a retry message. Member-action errors appear inside People, duplicate public/managed bot options are removed, and unpublished avatar previews use an authenticated manager endpoint with no-store caching. Profile editors stay open after Save and have an explicit Close action.
