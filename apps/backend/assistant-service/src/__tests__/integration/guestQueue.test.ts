import '../helpers/mocks';
import { GuestRun } from '../../models/GuestRun';
import { GUEST_PATIENCE_MS, claimGuestRun, failStaleGuestRuns, guestTurnMs } from '../../services/guestTurn';
import { setupAssistantTests } from '../helpers/testServer';
setupAssistantTests();

const queued = (id: string, waited: number, rounds: number, now: Date) =>
  GuestRun.create({
    _id: id.padEnd(64, '0'),
    sessionId: 'session',
    state: 'admitting',
    question: 'What is this?',
    queuedAt: new Date(now.getTime() - waited),
    plan: { provider: 'anthropic', model: 'test', rounds, words: 120, resultBytes: 4000 },
    expiresAt: new Date(now.getTime() + 3_600_000)
  });

it('starts a visitor’s question only while it can still be answered before their page gives up', async () => {
  await GuestRun.deleteMany({});
  const now = new Date();
  // Four rounds take up to 70s, so a question that has waited 30s cannot be answered inside 90s; one round can.
  expect(guestTurnMs(4)).toBe(70_000);
  await queued('a', 30_000, 4, now);
  await queued('b', 30_000, 1, now);
  const claimed = await claimGuestRun(now);
  expect(claimed?._id).toBe('b'.padEnd(64, '0'));
  expect(await claimGuestRun(now)).toBeNull();

  // The one that can no longer be answered is failed now, not when the visitor's page gives up.
  await failStaleGuestRuns(now);
  expect(await GuestRun.findById('a'.padEnd(64, '0')).lean()).toMatchObject({ state: 'failed' });
  // A question still being admitted (no queuedAt yet) is left alone.
  await GuestRun.create({ _id: 'c'.padEnd(64, '0'), sessionId: 'session', state: 'admitting', expiresAt: new Date(now.getTime() + 60_000) });
  await failStaleGuestRuns(now);
  expect(await GuestRun.findById('c'.padEnd(64, '0')).lean()).toMatchObject({ state: 'admitting' });
  expect(GUEST_PATIENCE_MS).toBe(90_000);
});
