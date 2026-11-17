import type { Request } from 'express';
import { Conversation } from '../models/Conversation';
import { peer } from './access';
import { requestScreen, screenRequestSchema, type ScreenContext } from './screen';

/** Verify selections with the same project-scoped credential used by the analyst, before moving the page. */
export async function steerScreen(
  run: { id: string; conversationId: string; userId: string; screen?: ScreenContext },
  projectId: string | undefined,
  token: string,
  input: unknown,
  signal: AbortSignal,
  guard: () => Promise<void>
) {
  const request = screenRequestSchema.safeParse(input);
  if (!request.success || request.data.place !== 'compare') return requestScreen(run, input, signal);
  if (!projectId || !token) return { ok: false, text: 'Ask this from a project’s page to compare its runs.' };
  const ids = [...new Set(request.data.ids)];
  if (ids.length < 2) return { ok: false, text: 'A comparison needs at least two different runs.' };
  const labels: { id: string; name: string }[] = [];
  for (const id of ids) {
    signal.throwIfAborted();
    await guard();
    try {
      const training = await peer<{ projectId: string; name: string }>('VISION', `/api/trainings/${id}`, {
        headers: { authorization: `Bearer ${token}` }
      } as Request);
      if (String(training.projectId) !== projectId)
        return { ok: false, text: 'All compared runs must belong to the project this question is about.' };
      labels.push({ id, name: training.name });
    } catch {
      signal.throwIfAborted();
      return { ok: false, text: 'The selected runs could not be verified. No comparison was changed.' };
    }
  }
  const outcome = await requestScreen(run, { ...request.data, ids }, signal);
  if (!outcome.ok) return outcome;
  await guard();
  const updated = await Conversation.updateOne(
    {
      _id: run.conversationId,
      kind: 'assistant',
      deletedAt: null,
      workerRunId: run.id,
      participants: { $elemMatch: { userId: run.userId, state: 'active' } }
    },
    { $set: { trainingIds: ids, trainingLabels: labels } }
  );
  return updated.matchedCount
    ? outcome
    : { ok: false, text: 'The page opened, but the chat’s selection could not be updated.' };
}
