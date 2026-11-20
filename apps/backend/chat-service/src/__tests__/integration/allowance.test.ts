import '../helpers/mocks';
import { AssistantRun } from '../../models/AssistantRun';
import { Budget } from '../../models/Budget';
import { enableAnalyst } from '../helpers/analystFixtures';
import { request, setupChatTests } from '../helpers/testServer';

setupChatTests();

const day = () => new Date().toISOString().slice(0, 10);
interface Allowance {
  requests: { used: number; limit: number; remaining: number };
  tokens: { used: number; limit: number; remaining: number };
  remainingShare: number;
  resetsAt: string;
}
const allowance = (user: string) => request<Allowance>('/usage/me', user);

describe('what is left of today', () => {
  it('shows a person only their own day, and the time it resets', async () => {
    await enableAnalyst();
    await Budget.create({ userId: 'alice', day: day(), requests: 40, reserved: 100_000 });
    await Budget.create({ userId: 'bob', day: day(), requests: 99, reserved: 790_000 });

    const { status, body } = await allowance('alice');
    expect(status).toBe(200);
    expect(body.data.requests).toMatchObject({ used: 40, limit: 100, remaining: 60 });
    expect(body.data.tokens.used).toBe(100_000);
    expect(body.data.tokens.remaining).toBe(body.data.tokens.limit - 100_000);
    expect(body.data.remainingShare).toBeCloseTo(0.6, 5);
    // Midnight UTC, in the future, so a page can say when it resets in the person's own time zone.
    expect(new Date(body.data.resetsAt).getUTCHours()).toBe(0);
    expect(new Date(body.data.resetsAt).getTime()).toBeGreaterThan(Date.now());

    const other = await allowance('bob');
    expect(other.body.data.requests.used).toBe(99);
  });

  it('is full for someone who has asked nothing today, and never negative past the limit', async () => {
    await enableAnalyst();
    const fresh = await allowance('carol');
    expect(fresh.body.data.requests).toMatchObject({ used: 0, remaining: 100 });
    expect(fresh.body.data.remainingShare).toBe(1);

    await Budget.create({ userId: 'dave', day: day(), requests: 500, reserved: 5_000_000 });
    const over = await allowance('dave');
    expect(over.body.data.requests.remaining).toBe(0);
    expect(over.body.data.tokens.remaining).toBe(0);
    expect(over.body.data.remainingShare).toBe(0);
  });

  it('calls the day used once what is left cannot run even the shortest question, as the worker would', async () => {
    await enableAnalyst();
    await Budget.create({ userId: 'frank', day: day(), requests: 3, reserved: 750_000 });
    const { body } = await allowance('frank');
    expect(body.data.tokens.remaining).toBe(body.data.tokens.limit - 750_000);
    expect(body.data.remainingShare).toBe(0);
  });

  it('counts what a running question holds as not yet spent', async () => {
    await enableAnalyst();
    await Budget.create({ userId: 'erin', day: day(), requests: 1, reserved: 600_000 });
    const run = {
      conversationId: 'c1',
      userId: 'erin',
      email: 'erin@test.invalid',
      name: 'Erin',
      reservation: { day: day(), tokens: 550_000 }
    };
    await AssistantRun.create({ ...run, messageId: 'running', state: 'running' });
    // A finished one holds nothing any more, whatever it once reserved.
    await AssistantRun.create({ ...run, messageId: 'done', state: 'completed' });
    const { body } = await allowance('erin');
    expect(body.data.tokens.used).toBe(50_000);
  });

  it('is only for the signed-in', async () => {
    expect((await request('/usage/me', '')).status).toBe(401);
  });
});

describe('why a question failed', () => {
  it('keeps the code with the run the asker sees', async () => {
    const run = await AssistantRun.create({
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'alice',
      email: 'alice@test.invalid',
      name: 'Alice',
      state: 'failed',
      error: 'Your daily Vivi question allowance is used. It resets at midnight UTC.',
      failureCode: 'limit_reached'
    });
    expect((await AssistantRun.findById(run.id))?.failureCode).toBe('limit_reached');
    await expect(AssistantRun.create({ conversationId: 'c1', messageId: 'm2', userId: 'a', email: 'a', name: 'A', failureCode: 'made-up' as never })).rejects.toThrow();
  });
});
