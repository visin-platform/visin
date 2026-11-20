import type { Conversation, OpenRequest, PageContext } from '../types/chat';

declare global {
  interface Window {
    /** The newest open request, for a chat that loads after it was sent. */
    __visinChatContext?: OpenRequest;
    /** What the page being shown is about, for a chat that loads after the page. */
    __visinPageContext?: PageContext;
  }
}

/** Sent by Vision's pages as they show a run, a comparison or a project, and with no detail as they leave. */
export const PAGE_CONTEXT_EVENT = 'visin:page-context';
/** Sent by the shell for a deliberate open: Analyze this run, Message, Message group. */
export const OPEN_EVENT = 'visin:chat-context';

/** One project and the same runs, in any order. Empty without a project: a general question matches nothing. */
export const contextKey = (context?: Pick<PageContext, 'projectId' | 'trainingIds' | 'paperId' | 'page'>): string =>
  context?.paperId
    ? `paper:${context.paperId}`
    : context?.projectId
      ? `${context.projectId}:${[...(context.trainingIds ?? [])].sort().join(',')}`
      : context?.page
        ? `page:${context.page}`
        : '';

/** A path of this app, never another site: `/x`, not `//x`, nothing with a scheme. */
export const isAppPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 500 &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\\');

/**
 * The person's one chat with an assistant. With no assistant named it is the newest of their private chats, which is
 * the one the server also opens when it is asked for "the assistant" without a name.
 */
export const assistantChat = (conversations: Conversation[], assistantId?: string): Conversation | undefined =>
  conversations.find((item) => item.kind === 'assistant' && (!assistantId || item.assistantId === assistantId));

/** What a question is about, in words for a chip or a label above a message. Empty when it is about nothing. */
export function aboutLabel(
  about:
    | {
        projectId?: string;
        projectName?: string;
        trainingIds?: string[];
        trainingLabels?: { id: string; name: string }[];
        paperId?: string;
        paperTitle?: string;
        title?: string;
        page?: string;
      }
    | undefined
): string {
  if (!about) return '';
  if (about.paperId) return `Paper: ${about.paperTitle || about.title || 'paper'}`;
  if (!about.projectId) return about.page ? about.title || 'This page' : '';
  // A page names itself ("Compare 3 runs", a run's name) when it does not know its project's name.
  if (!about.projectName) return about.title || 'Project';
  const runs = about.trainingIds?.length ?? 0;
  if (!runs) return about.projectName;
  const run = runs === 1 ? (about.trainingLabels?.[0]?.name ?? about.title) : undefined;
  return `${about.projectName} · ${run || `${runs} ${runs === 1 ? 'run' : 'runs'}`}`;
}

/**
 * A page Vivi can read that names nothing else to hand over (a dataset, a suite, an evaluation), from its address
 * alone, for the chip above the box. Projects, runs and papers say what they are themselves, with their names.
 */
export function placeOf(path: string): PageContext | undefined {
  const [pathname] = path.split(/[?#]/);
  if (/^\/datasets\/[^/]+$/.test(pathname)) return { page: path, title: 'This dataset' };
  if (/^\/evaluations\/[^/]+$/.test(pathname)) return { page: path, title: 'This evaluation' };
  const suite = /^\/(?:suites|leaderboards)\/([^/]+)\/(\d+)(?:\/(?:compare|judges))?$/.exec(pathname);
  if (suite) return { page: path, title: `Suite ${decodeURIComponent(suite[1])} v${suite[2]}` };
  return undefined;
}

/** The same page, whatever tab or filter its address carries. */
export const samePage = (a: string, b: string) => a.split(/[?#]/)[0] === b.split(/[?#]/)[0];

/** Whether a question's context is the same as the one before it, so its label is shown once. */
export const sameAbout = (
  a: { projectId?: string; paperId?: string; trainingIds?: string[] } | undefined,
  b: { projectId?: string; paperId?: string; trainingIds?: string[] } | undefined
): boolean => contextKey(a) === contextKey(b);

export const KIND_LABEL: Record<Conversation['kind'], string> = {
  assistant: 'Assistant',
  direct: 'Direct message',
  room: 'Room',
  group: 'Group channel',
  project: 'Project discussion'
};

/**
 * A direct message is named by its creator for their side; the other side sees who wrote to them.
 * Everything else keeps its own title.
 */
export function displayTitle(conversation: Conversation, userId: string | undefined): string {
  if (conversation.kind !== 'direct' || !conversation.createdBy || conversation.createdBy === userId)
    return conversation.title;
  return conversation.participants.find((p) => p.userId === conversation.createdBy)?.name || conversation.title;
}

/** A request's analysis context, for the requests that are one. */
export const analysisOf = (request: OpenRequest): PageContext | undefined =>
  request.kind === undefined || request.kind === 'assistant'
    ? {
        assistantId: request.assistantId,
        projectId: request.projectId,
        paperId: request.paperId,
        trainingIds: request.trainingIds,
        title: request.title,
        projectName: request.projectName,
        ...(isAppPath(request.page) ? { page: request.page } : {})
      }
    : undefined;

export function requestFromUrl(): OpenRequest | undefined {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  const paperId = params.get('paper');
  if (paperId && !projectId) return { kind: 'assistant', paperId, title: params.get('title') || undefined };
  const page = params.get('page');
  if (!projectId && isAppPath(page)) return { kind: 'assistant', page, title: params.get('title') || undefined };
  if (!projectId) return undefined;
  return {
    kind: params.get('kind') === 'project' ? 'project' : 'assistant',
    projectId,
    trainingIds: params.get('runs')?.split(',').filter(Boolean),
    title: params.get('title') || undefined
  };
}
