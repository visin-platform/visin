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
export const contextKey = (context?: PageContext): string =>
  context?.paperId
    ? `paper:${context.paperId}`
    : context?.projectId
      ? `${context.projectId}:${[...(context.trainingIds ?? [])].sort().join(',')}`
      : '';

/** The analysis thread already about exactly this. */
export const matchesContext = (conversation: Conversation, context: PageContext): boolean =>
  conversation.kind === 'assistant' &&
  conversation.assistantId === context.assistantId &&
  contextKey(conversation) !== '' &&
  contextKey(conversation) === contextKey(context);

export const KIND_LABEL: Record<Conversation['kind'], string> = {
  assistant: 'Analysis',
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

/** Questions worth one click, for what is being analysed. */
export function starters(context: PageContext | undefined): string[] {
  if (context?.paperId)
    return [
      'Summarize this paper',
      'What are its main results, and on which data?',
      'Find the exact results table',
      'Do its numbers match the recorded runs on Visin?'
    ];
  const runs = context?.trainingIds?.length ?? 0;
  if (runs > 1)
    return [
      'Which run is best, and by how much?',
      'Compare their best and final epochs',
      'What differs in their configuration?',
      'What should I try next?'
    ];
  if (runs === 1)
    return [
      'Summarize this run',
      'Compare best and final epoch',
      'Where does this model perform worst?',
      'What should I try next?'
    ];
  if (context?.projectId)
    return ['Summarize the best runs in this project', 'Which runs improved the most?', 'What should I try next?'];
  return ['How do I read a validation curve?', 'When does training past the best epoch matter?'];
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
        projectName: request.projectName
      }
    : undefined;

export function requestFromUrl(): OpenRequest | undefined {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  const paperId = params.get('paper');
  if (paperId && !projectId) return { kind: 'assistant', paperId, title: params.get('title') || undefined };
  if (!projectId) return undefined;
  return {
    kind: params.get('kind') === 'project' ? 'project' : 'assistant',
    projectId,
    trainingIds: params.get('runs')?.split(',').filter(Boolean),
    title: params.get('title') || undefined
  };
}
