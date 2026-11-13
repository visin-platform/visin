import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  guestDenialReason,
  nextGuestReset,
  reserveGuest,
  releaseGuestSlot,
  networkPrefix,
  pruneGuestIdentifiers
} from '../../services/guestAdmission';
describe('distributed guest admission', () => {
  let mongo: MongoMemoryServer;
  const now = new Date('2026-11-10T12:00:00Z');
  const caps = {
    guestSessionRequests: 3,
    guestNetworkRequests: 10,
    guestGlobalRequests: 100,
    guestDailyBudgetMicros: 100000,
    guestMonthlyBudgetMicros: 1000000
  };
  beforeAll(async () => {
    process.env.GUEST_NETWORK_SECRET = 'test-secret-longer-than-thirty-two-characters';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await mongoose.connection.collection('chat_guest_budgets').deleteMany({});
  });
  const admit = (id: string, sessionId = 'session', network = '192.0.2.1', overrides = {}) =>
    reserveGuest({ runId: id, sessionId, network, reserveMicros: 100, caps: { ...caps, ...overrides }, now });
  it('atomically caps concurrency across parallel clients', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => admit(String(i), `s${i}`, `192.0.2.${i}`)));
    expect(results.filter(Boolean)).toHaveLength(2);
  });
  it('reports what is left of the smaller allowance, so a private window is not promised a fresh one', async () => {
    const overrides = { guestSessionRequests: 10, guestNetworkRequests: 4 };
    const first = await admit('w1', 'window-one', '192.0.2.50', overrides);
    expect(first!.remaining).toBe(3);
    await releaseGuestSlot(first!.month, 'w1');
    // A new session (a private window) on the same network: the network has 2 left, not the session's 9.
    expect((await admit('w2', 'window-two', '192.0.2.50', overrides))!.remaining).toBe(2);
  });
  it('caps a session despite changing networks', async () => {
    for (let i = 0; i < 3; i++) {
      const result = await admit(String(i), 'session', `192.0.2.${i}`);
      expect(result).not.toBeNull();
      await releaseGuestSlot(result!.month, String(i));
    }
    expect(await admit('four', 'session', '192.0.2.9')).toBeNull();
  });
  it('caps the global count despite rotating both identities', async () => {
    for (let i = 0; i < 4; i++) {
      const result = await admit(String(i), `s${i}`, `192.0.2.${i}`, { guestGlobalRequests: 4 });
      expect(result).not.toBeNull();
      await releaseGuestSlot(result!.month, String(i));
    }
    expect(await admit('fifth', 'new', '198.51.100.1', { guestGlobalRequests: 4 })).toBeNull();
  });
  it('retains spend reservations after releasing execution slots', async () => {
    const result = await admit('one', 's1', '192.0.2.1', { guestDailyBudgetMicros: 100 });
    expect(result).not.toBeNull();
    await releaseGuestSlot(result!.month, 'one');
    expect(await admit('two', 's2', '192.0.2.2', { guestDailyBudgetMicros: 100 })).toBeNull();
  });
  describe('naming the limit that refused a question', () => {
    const why = (sessionId = 'session', network = '192.0.2.1', overrides = {}) =>
      guestDenialReason({ sessionId, network, reserveMicros: 100, caps: { ...caps, ...overrides }, now });

    it("the visitor's own allowance, then their network's", async () => {
      for (let i = 0; i < 3; i++)
        await releaseGuestSlot((await admit(String(i), 'session', `192.0.2.${i}`))!.month, String(i));
      expect(await why('session', '192.0.2.9')).toBe('session');
      expect(await why('fresh', '192.0.2.1', { guestNetworkRequests: 1 })).toBe('network');
    });

    it('questions asked too quickly, while one is still running', async () => {
      await admit('one', 'session');
      expect(await why('session')).toBe('burst');
    });

    it("the shared pause: the day's questions, the daily spend and the monthly spend", async () => {
      const first = await admit('a', 's1', '192.0.2.1');
      await releaseGuestSlot(first!.month, 'a');
      expect(await why('s2', '192.0.2.2', { guestGlobalRequests: 1 })).toBe('shared');
      expect(await why('s2', '192.0.2.2', { guestDailyBudgetMicros: 150 })).toBe('shared');
      expect(await why('s2', '192.0.2.2', { guestMonthlyBudgetMicros: 150 })).toBe('shared');
    });

    it('every guest slot being busy', async () => {
      await admit('a', 's1', '192.0.2.1');
      await admit('b', 's2', '192.0.2.2');
      expect(await why('s3', '192.0.2.3', { guestGlobalRequests: 100 })).toBe('capacity');
    });

    it('resets at the next UTC midnight', () => {
      expect(nextGuestReset(now).toISOString()).toBe('2026-11-11T00:00:00.000Z');
    });
  });
  it('normalizes IPv6 privacy addresses to a common /64', () => {
    expect(networkPrefix('2001:db8:abcd:1234::1')).toBe(networkPrefix('2001:0db8:abcd:1234:ffff:aaaa:bbbb:cccc'));
    expect(networkPrefix('::ffff:192.0.2.1')).toBe('192.0.2.1');
  });
  it('renews daily request counts without resetting the monthly ceiling', async () => {
    expect(
      await reserveGuest({
        runId: 'one',
        sessionId: 's',
        network: '192.0.2.1',
        reserveMicros: 100,
        caps: { ...caps, guestMonthlyBudgetMicros: 100 },
        now
      })
    ).not.toBeNull();
    expect(
      await reserveGuest({
        runId: 'two',
        sessionId: 's2',
        network: '192.0.2.2',
        reserveMicros: 100,
        caps: { ...caps, guestMonthlyBudgetMicros: 100 },
        now: new Date('2026-11-11T12:00:00Z')
      })
    ).toBeNull();
  });
  it('prunes old identity buckets without releasing reserved spend', async () => {
    await reserveGuest({
      runId: 'previous-day',
      sessionId: 's',
      network: '192.0.2.1',
      reserveMicros: 100,
      caps,
      now: new Date('2026-11-09T12:00:00Z')
    });
    await pruneGuestIdentifiers(now);
    const row = await mongoose.connection.collection('chat_guest_budgets').findOne({ _id: '2026-11' as never });
    expect(row?.reservedMicros).toBe(100);
    expect(row?.days['09']).toEqual({ requests: 1, reservedMicros: 100 });
    expect(row?.bursts).toEqual({});
  });
});
