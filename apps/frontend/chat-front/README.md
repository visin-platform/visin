# Chat front

One React application for the `/chat` full page and the shell's resizable side panel. Module Federation exports `./App` and `./Panel`; both share the conversation implementation. Standalone development runs on port 3014.

Runtime configuration: `AUTH_SERVICE_URL`, `AUTH_FRONT_URL`, `CHAT_SERVICE_URL`. Set `CHAT_FRONT_URL` in shell-front to expose its navigation and panel. The root Compose file wires these addresses automatically. Private assistant requests additionally require backend provider configuration; human chats work without it.

`visin:open-chat` asks the shell to open the panel with optional `{ projectId, trainingIds, title, kind }` context. The panel offers a new-conversation review before using that context. Ordinary navigation never changes an existing thread. Training detail/comparison pages and project discussions supply context; the backend independently authorizes all identifiers. The standalone chat entry accepts `project`, `runs`, `title` and `kind` query parameters as untrusted context.

Users can create private analyst threads, send a DM request to a group colleague or a cross-group public profile handle, invite a room, or open group/project channels. Assistant replies offer evidence links, copy, cancel and reviewed finding saves. Human threads explicitly show that shared assistants are off. Existing Analysis tabs remain the durable findings interface.
