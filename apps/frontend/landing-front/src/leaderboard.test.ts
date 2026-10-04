import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkpointName, fetchRecordedLeaderboard, formatScore } from './leaderboard';

afterEach(() => vi.unstubAllGlobals());

const answer = (data: unknown) => ({ ok: true, json: async () => ({ data }) });

describe('fetchRecordedLeaderboard', () => {
  it('asks for anonymous recorded scores without credentials or caching', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer({ entries: [{ value: 0 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    expect(await fetchRecordedLeaderboard('https://api.example.test/', 'verified', controller.signal)).toEqual({ entries: [{ value: 0 }] });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/evaluations/leaderboard?verification=verified&limit=5', { credentials: 'omit', cache: 'no-store', signal: controller.signal });
  });
  it('reports an unavailable API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchRecordedLeaderboard('https://api.example.test', 'all')).rejects.toThrow('answered 503');
  });
});

describe('formatScore', () => {
  it('is always four decimals, so a column lines up, and a zero reads as the zero it is', () => {
    expect(formatScore(0.7350000001)).toBe('0.7350');
    expect(formatScore(0.6)).toBe('0.6000');
    expect(formatScore(0)).toBe('0.0000');
  });
});

describe('checkpointName', () => {
  it('names a Hub checkpoint by repo and short commit, a local one by its label, and a missing one plainly', () => {
    expect(checkpointName({ kind: 'hf', repo: 'acme/clft', commit: '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433' })).toBe('acme/clft @ 3f2a1c9');
    expect(checkpointName({ kind: 'local', label: 'clftv2-e40' })).toBe('clftv2-e40');
    expect(checkpointName(undefined)).toBe('Unknown model');
  });
});
