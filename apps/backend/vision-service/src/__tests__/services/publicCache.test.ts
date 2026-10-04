import { cachedPublic, invalidatePublic } from '../../services/publicCache';

describe('public view cache', () => {
  const previous = process.env.NODE_ENV;
  beforeEach(() => {
    invalidatePublic();
    process.env.NODE_ENV = 'production';
    jest.useFakeTimers();
  });
  afterEach(() => {
    invalidatePublic();
    jest.useRealTimers();
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });

  it('shares in-flight work and recomputes after expiry or invalidation', async () => {
    const compute = jest.fn(async () => ({ rank: 1 }));
    const [first, second] = await Promise.all([cachedPublic('board', compute), cachedPublic('board', compute)]);
    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30_000);
    await cachedPublic('board', compute);
    expect(compute).toHaveBeenCalledTimes(2);
    invalidatePublic();
    await cachedPublic('board', compute);
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('does not retain work during ordinary fixture tests', async () => {
    process.env.NODE_ENV = 'test';
    const compute = jest.fn(async () => 1);
    await cachedPublic('board', compute);
    await cachedPublic('board', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('retries rejected work', async () => {
    const compute = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(2);
    await expect(cachedPublic('board', compute)).rejects.toThrow('offline');
    await expect(cachedPublic('board', compute)).resolves.toBe(2);
  });

  it('does not let an old rejection evict a newer computation after invalidation', async () => {
    let reject!: (error: Error) => void;
    const old = cachedPublic('board', () => new Promise((_, fail) => { reject = fail; }));
    const rejected = expect(old).rejects.toThrow('old');
    invalidatePublic();
    await cachedPublic('board', async () => 2);
    reject(new Error('old'));
    await rejected;
    const compute = jest.fn(async () => 3);
    await expect(cachedPublic('board', compute)).resolves.toBe(2);
    expect(compute).not.toHaveBeenCalled();
  });

  it('bounds retained entries and evicts the oldest', async () => {
    for (let index = 0; index < 501; index++) await cachedPublic(`board-${index}`, async () => index);
    const compute = jest.fn(async () => -1);
    await expect(cachedPublic('board-500', compute)).resolves.toBe(500);
    expect(compute).not.toHaveBeenCalled();
    await expect(cachedPublic('board-0', compute)).resolves.toBe(-1);
  });
});
