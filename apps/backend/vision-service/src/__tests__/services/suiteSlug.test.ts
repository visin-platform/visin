import { vi } from 'vitest';
import Suite from '../../models/Suite';
import SuiteSlug from '../../models/SuiteSlug';
import { reserveSuiteSlug } from '../../services/suiteSlugService';

vi.mock('../../models/Suite', async () => {
  const module = await (() => ({ __esModule: true, default: { distinct: vi.fn() } }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/SuiteSlug', async () => {
  const module = await (() => ({ __esModule: true, default: { create: vi.fn(), findById: vi.fn() } }))();
  return Object.assign({ default: module }, module);
});

describe('suite slug reservation failures', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(Suite.distinct).mockResolvedValue([]);
  });

  it('refuses a foreign legacy owner before creating a reservation', async () => {
    vi.mocked(Suite.distinct).mockResolvedValue(['other']);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toThrow('belongs to another project');
    expect(SuiteSlug.create).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of interpreting it as an ownership collision', async () => {
    const failure = new Error('database unavailable');
    vi.mocked(SuiteSlug.create).mockRejectedValue(failure);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toBe(failure);
    expect(SuiteSlug.findById).not.toHaveBeenCalled();
  });

  it('propagates a duplicate-key failure if its winning reservation cannot be found', async () => {
    const failure = Object.assign(new Error('duplicate key'), { code: 11000 });
    vi.mocked(SuiteSlug.create).mockRejectedValue(failure);
    vi.mocked(SuiteSlug.findById).mockResolvedValue(null);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toBe(failure);
  });
});
