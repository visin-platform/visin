import { useCallback, useRef, useState } from 'react';
import { chatService } from '../services/chatService';

import type { Conversation, OpenRequest, PageContext } from '../types/chat';
import { analysisOf } from '../utils/chatContext';
import { mergeMessages } from '../utils/messages';
import { screenContext } from '../utils/screen';
import type { useChatNavigation } from './useChatNavigation';
import type { useChatThread } from './useChatThread';

export function useChatActions({
  navigation,
  thread,
  refreshList,
  perform,
  panel = false
}: {
  navigation: ReturnType<typeof useChatNavigation>;
  thread: ReturnType<typeof useChatThread>;
  refreshList: () => Promise<void>;
  perform: (operation: () => Promise<void>) => Promise<void>;
  /** In the shell's side panel, where a page sits beside the chat. */
  panel?: boolean;
}) {
  const latestNavigation = useRef(navigation);
  latestNavigation.current = navigation;
  const { c, pending, selected, draft, setDraft, replyTarget, setReplyTarget, show, analyze } = navigation;
  const { messages, runs, setMessages, setRuns, atBottom } = thread;
  const [sending, setSending] = useState(false);

  const screenFor = () => {
    const screen = screenContext(panel);
    return screen ? { screen } : {};
  };

  const retry = useRef<
    | {
        body: string;
        clientId: string;
        conversation: string;
        replyTo?: string;
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
      if (analysis) return analyze(analysis);
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
    },
    [analyze, openConversation]
  );

  const post = (body: string, fromDraft: boolean, requestedReply?: string) =>
    perform(async () => {
      const text = body.trim();
      if (!c || !text) return;
      const replyTo = fromDraft ? replyTarget?._id : requestedReply;
      if (retry.current?.body !== text || retry.current.conversation !== c._id || retry.current.replyTo !== replyTo)
        retry.current = {
          body: text,
          clientId: crypto.randomUUID(),
          conversation: c._id,
          screen: c.kind === 'assistant' ? screenContext(panel) : undefined,
          replyTo
        };
      setSending(true);
      try {
        await chatService.send(c._id, {
          body: text,
          clientId: retry.current.clientId,
          ...(replyTo ? { replyTo } : {}),
          ...(retry.current.screen ? { screen: retry.current.screen } : {})
        });
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

  const start = (context: PageContext, body: string) =>
    perform(async () => {
      const text = body.trim();
      if (!text) return;
      setSending(true);
      try {
        const created = await chatService.create({
          kind: 'assistant',
          ...(context.assistantId ? { assistantId: context.assistantId } : {}),
          title: (context.title || 'Analysis').slice(0, 120),
          ...(context.projectId ? { projectId: context.projectId, trainingIds: context.trainingIds ?? [] } : {})
        });
        await chatService.send(created._id, { body: text, clientId: crypto.randomUUID(), ...screenFor() });
        await refreshList();
        show(created._id);
      } finally {
        setSending(false);
      }
    });

  const send = () => (c ? post(draft, true) : pending ? start(pending, draft) : undefined);

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
  return {
    sending,
    openConversation,
    handle,
    post,
    send,
    ask,
    latestRun,
    failedQuestion,
    membership,
    composerInput
  };
}
