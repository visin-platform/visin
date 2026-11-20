import { useCallback, useRef, useState, type RefObject } from 'react';
import { chatService } from '../services/chatService';

import type { AttachmentRef, Conversation, Message, MessageContext, OpenRequest, PageContext } from '../types/chat';
import { analysisOf } from '../utils/chatContext';
import { mergeMessages } from '../utils/messages';
import { screenContext } from '../utils/screen';
import type { useChatNavigation } from './useChatNavigation';
import type { useChatThread } from './useChatThread';

export function useChatActions({
  navigation,
  thread,
  refreshList,
  refreshHidden,
  perform,
  aboutRef,
  hidePageRef,
  panel = false
}: {
  navigation: ReturnType<typeof useChatNavigation>;
  thread: ReturnType<typeof useChatThread>;
  refreshList: () => Promise<void>;
  /** Reads the conversations put away again, after one was put away or brought back. */
  refreshHidden?: () => Promise<void>;
  perform: (operation: () => Promise<void>) => Promise<void>;
  /** What the next question is about: the page the person is on, unless they cleared it. */
  aboutRef?: RefObject<PageContext | undefined>;
  /** The person cleared the page beside the panel, which is then not sent. */
  hidePageRef?: RefObject<boolean>;
  /** In the shell's side panel, where a page sits beside the chat. */
  panel?: boolean;
}) {
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;
  const { c, pending, selected, draft, setDraft, replyTarget, setReplyTarget, show, analyze } = navigation;
  const { messages, runs, setMessages, setRuns, atBottom } = thread;
  const [sending, setSending] = useState(false);
  /** A chat whose deletion is waiting for the person to confirm. */
  const [deleting, setDeleting] = useState<Conversation>();
  /** The chat just put away, offered back for a moment. */
  const [justHidden, setJustHidden] = useState<Conversation>();
  /** The question being reworded: its text is in the box, and sending asks again instead of adding a message. */
  const [editing, setEditing] = useState<Message>();

  const screenFor = () => {
    const screen = screenContext(panel, aboutRef?.current?.page, hidePageRef?.current);
    return screen ? { screen } : {};
  };

  /** What a question to the assistant is about, as the server takes it: ids only, and at most the twenty it checks. */
  const idsOf = (about: PageContext | MessageContext | undefined) => {
    if (about?.paperId) return { paperId: about.paperId };
    if (about?.projectId)
      return {
        projectId: about.projectId,
        ...(about.trainingIds?.length ? { trainingIds: about.trainingIds.slice(0, 20) } : {})
      };
    return undefined;
  };
  const aboutNow = () => idsOf(aboutRef?.current);

  const retry = useRef<
    | {
        body: string;
        context?: ReturnType<typeof aboutNow>;
        attachmentsKey?: string;
        clientId: string;
        conversation: string;
        replyTo?: string;
        /** the question being edited, so a retry of an edit is not taken for a retry of a new question */
        edits?: string;
        screen?: ReturnType<typeof screenContext>;
      }
    | undefined
  >(undefined);

  const composerInput = useRef<HTMLTextAreaElement>(null);

  const openConversation = useCallback(
    (open: () => Promise<Conversation>) =>
      perform(async () => {
        setSending(true);
        try {
          const conversation = await open();
          await refreshList();
          show(conversation._id);
        } finally {
          setSending(false);
        }
      }),
    [perform, refreshList, show]
  );

  const handle = useCallback(
    (open: OpenRequest) => {
      const analysis = analysisOf(open);
      if (analysis) return void analyze(analysis);
      if (open.kind === 'project' && open.projectId)
        return openConversation(() =>
          chatService.create({
            kind: 'project',
            title: (open.title || 'Project discussion').slice(0, 120),
            projectId: open.projectId
          })
        );
      if (open.kind === 'direct')
        return openConversation(() =>
          chatService.create({
            kind: 'direct',
            title: (open.name || open.handle || 'Direct message').slice(0, 120),
            handles: open.handle ? [open.handle] : [],
            userIds: open.userId ? [open.userId] : []
          })
        );
      if (open.kind === 'group') return openConversation(() => chatService.openGroup(open.groupId));
      return undefined;
    },
    [analyze, openConversation]
  );

  /**
   * Sends a message. A question to the assistant is about the page the person is on, unless it is sent again
   * (`asked`): a retried question keeps what it was first asked about, wherever the person is now.
   */
  const post = async (
    body: string,
    fromDraft: boolean,
    requestedReply?: string,
    attachments: AttachmentRef[] = [],
    asked?: MessageContext
  ) => {
    let delivered = false;
    await perform(async () => {
      const text = body.trim();
      if (!c || (!text && !attachments.length)) return;
      const attachmentsKey = JSON.stringify(attachments);
      const replyTo = fromDraft ? replyTarget?._id : requestedReply;
      const edits = fromDraft && c.kind === 'assistant' ? editing?._id : undefined;
      // A reworded question is still about what it was first asked about, wherever the person is now.
      const context =
        c.kind === 'assistant' ? (asked ? idsOf(asked) : edits ? idsOf(editing?.context) : aboutNow()) : undefined;
      if (
        retry.current?.edits !== edits ||
        retry.current?.body !== text ||
        JSON.stringify(retry.current.context) !== JSON.stringify(context) ||
        retry.current.conversation !== c._id ||
        retry.current.replyTo !== replyTo ||
        retry.current.attachmentsKey !== attachmentsKey
      )
        retry.current = {
          body: text,
          context,
          attachmentsKey,
          clientId: crypto.randomUUID(),
          conversation: c._id,
          edits,
          screen:
            c.kind === 'assistant' ? screenContext(panel, aboutRef?.current?.page, hidePageRef?.current) : undefined,
          replyTo
        };
      setSending(true);
      try {
        const message = {
          body: text,
          clientId: retry.current.clientId,
          ...(attachments.length ? { attachments } : {}),
          ...(replyTo ? { replyTo } : {}),
          ...(retry.current.context ? { context: retry.current.context } : {}),
          ...(retry.current.screen ? { screen: retry.current.screen } : {})
        };
        if (edits) await chatService.edit(c._id, edits, message);
        else await chatService.send(c._id, message);
        delivered = true;
        if (edits) setEditing(undefined);
        const current = latestNavigation.current;
        const sameThread = current.accountId === navigation.accountId && current.c?._id === c._id;
        if (fromDraft && sameThread && current.draft === draft) {
          setDraft('');
          if (current.replyTarget?._id === replyTarget?._id) setReplyTarget(undefined);
        }
        retry.current = undefined;
        if (sameThread) atBottom.current = true;
        const [rows, jobs] = await Promise.all([chatService.messages(c._id), chatService.runs(c._id)]);
        setMessages((old) => mergeMessages(old, rows));
        setRuns(jobs);
        await refreshList();
      } finally {
        setSending(false);
      }
    });
    return delivered;
  };

  const start = (context: PageContext, body: string) =>
    perform(async () => {
      const text = body.trim();
      if (!text) return;
      setSending(true);
      try {
        // The chat is only opened here; what the question is about goes with the question.
        const created = await chatService.create({
          kind: 'assistant',
          ...(context.assistantId ? { assistantId: context.assistantId } : {}),
          title: 'Assistant'
        });
        const about = aboutNow();
        await chatService.send(created._id, {
          body: text,
          clientId: crypto.randomUUID(),
          ...(about ? { context: about } : {}),
          ...screenFor()
        });
        await refreshList();
        show(created._id);
      } finally {
        setSending(false);
      }
    });

  const send = (attachments: AttachmentRef[] = []) =>
    c ? post(draft, true, undefined, attachments) : pending ? start(pending, draft) : undefined;

  /** Puts a question back in the box to be reworded; what it was about and its answer stay until it is sent. */
  const beginEdit = (message: Message) => {
    setEditing(message);
    setReplyTarget(undefined);
    setDraft(message.body);
    composerInput.current?.focus();
  };
  const cancelEdit = () => {
    setEditing(undefined);
    setDraft('');
  };
  /** Stops editing without touching the box: the question is gone, or another chat was opened. */
  const dropEdit = useCallback(() => setEditing(undefined), []);
  const ask = (text: string) => {
    setDraft(text);
    composerInput.current?.focus();
  };

  const latestRun = runs[0];

  const failedQuestion =
    latestRun?.state === 'failed' ? messages.find((m) => m._id === latestRun.messageId) : undefined;

  const membership = (action: string) =>
    perform(async () => {
      await chatService.membership(selected!, action);
      await refreshList();
      if (action !== 'accept') show(undefined);
    });
  /** Puts a chat away, deletes it or leaves it, then shows the list rather than a chat that is no longer there. */
  const dismissChat = (id: string, operation: () => Promise<unknown>) =>
    perform(async () => {
      await operation();
      await Promise.all([refreshList(), refreshHidden?.()]);
      // Forgotten, not only closed: a reload would otherwise reopen the chat that was just put away.
      if (latestNavigation.current.selected === id) latestNavigation.current.forgetSelection();
    });
  const hideChat = (conversation: Conversation) =>
    dismissChat(conversation._id, async () => {
      await chatService.hide(conversation._id);
      setJustHidden(conversation);
    });
  const deleteChat = (id: string) => dismissChat(id, () => chatService.remove(id));
  const leaveChat = (id: string) => dismissChat(id, () => chatService.membership(id, 'leave'));
  const unhideChat = (id: string) =>
    perform(async () => {
      await chatService.unhide(id);
      await Promise.all([refreshList(), refreshHidden?.()]);
    });
  /** A new topic in the chat with the assistant: it forgets what was asked before, which stays in the chat. */
  const startNewTopic = () =>
    perform(async () => {
      if (!c) return;
      await chatService.newTopic(c._id);
      const rows = await chatService.messages(c._id);
      setMessages((old) => mergeMessages(old, rows));
      await refreshList();
    });
  return {
    sending,
    deleting,
    askDelete: setDeleting,
    justHidden,
    forgetJustHidden: () => setJustHidden(undefined),
    hideChat,
    unhideChat,
    deleteChat,
    leaveChat,
    startNewTopic,
    openConversation,
    handle,
    post,
    send,
    ask,
    editing,
    beginEdit,
    cancelEdit,
    dropEdit,
    latestRun,
    failedQuestion,
    membership,
    composerInput
  };
}
