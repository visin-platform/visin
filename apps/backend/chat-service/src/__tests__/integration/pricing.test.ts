import '../helpers/mocks';
import { AssistantRun } from '../../models/AssistantRun';
import { startWorker } from '../../services/worker';
import { ADMIN, enableAnalyst, makeAdmin } from '../helpers/analystFixtures';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

describe('the price kept with an answer', () => {
  const putPrices = (body: unknown) =>
    fetch(`${base}/api/chat/settings/assistant/prices`, {
      method: 'PUT',
      headers: { 'x-test-user': ADMIN, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  const ask = async (clientId: string) => {
    const id = await create('assistant', []);
    await request(`/conversations/${id}/messages`, 'alice', { body: 'Compare', clientId });
    const worker = startWorker();
    worker();
    await worker.tick();
    return AssistantRun.findOne({ conversationId: id }).lean();
  };

  beforeEach(async () => {
    await makeAdmin();
    await enableAnalyst('claude-sonnet-5-5');
  });

  it('is stamped on the question as it completes, at the price in effect then', async () => {
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 3, outputPerMillion: 15 }]
    });
    const first = await ask('priced-question-1');
    expect(first?.price).toEqual({
      currency: 'USD',
      inputPerMillion: 3,
      outputPerMillion: 15,
      source: 'manual',
      backfilled: false
    });
    // The price changes: the next question is stamped with the new one, and the first keeps its own.
    await putPrices({
      currency: 'USD',
      entries: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', inputPerMillion: 1, outputPerMillion: 5 }]
    });
    const second = await ask('priced-question-2');
    expect(second?.price).toMatchObject({ inputPerMillion: 1, outputPerMillion: 5 });
    expect((await AssistantRun.findById(first?._id).lean())?.price).toMatchObject({
      inputPerMillion: 3,
      outputPerMillion: 15
    });
  });

  it('is left off where the model had no price, so it can be priced afterwards on request', async () => {
    const run = await ask('unpriced-question-1');
    expect(run?.state).toBe('completed');
    expect(run?.price).toBeUndefined();
  });
});
