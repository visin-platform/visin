import Suite from '../../models/Suite';
import SuiteSlug from '../../models/SuiteSlug';
import { reserveSuiteSlug } from '../../services/suiteSlugService';

jest.mock('../../models/Suite', () => ({ __esModule: true, default: { distinct: jest.fn() } }));
jest.mock('../../models/SuiteSlug', () => ({ __esModule: true, default: { create: jest.fn(), findById: jest.fn() } }));

describe('suite slug reservation failures', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(Suite.distinct).mockResolvedValue([]);
  });

  it('refuses a foreign legacy owner before creating a reservation', async () => {
    jest.mocked(Suite.distinct).mockResolvedValue(['other']);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toThrow('belongs to another project');
    expect(SuiteSlug.create).not.toHaveBeenCalled();
  });

  it('propagates a database failure instead of interpreting it as an ownership collision', async () => {
    const failure = new Error('database unavailable');
    jest.mocked(SuiteSlug.create).mockRejectedValue(failure);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toBe(failure);
    expect(SuiteSlug.findById).not.toHaveBeenCalled();
  });

  it('propagates a duplicate-key failure if its winning reservation cannot be found', async () => {
    const failure = Object.assign(new Error('duplicate key'), { code: 11000 });
    jest.mocked(SuiteSlug.create).mockRejectedValue(failure);
    jest.mocked(SuiteSlug.findById).mockResolvedValue(null);
    await expect(reserveSuiteSlug('road-test', 'mine')).rejects.toBe(failure);
  });
});
