import { costOf, resolveCosting } from '../../models/costing';

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import Project from '../../models/Project';
import { costingByProject, costingFor } from '../../services/costingService';

const mockedProject = Project as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveCosting', () => {
  it('reports no rate card when the project has not priced its hardware', () => {
    expect(resolveCosting(undefined)).toBeNull();
    expect(resolveCosting(null)).toBeNull();
    expect(resolveCosting({})).toBeNull();
    expect(resolveCosting({ currency: 'USD' })).toBeNull();
  });

  it('requires both rates, so half a machine is never billed', () => {
    expect(resolveCosting({ cpuRatePerHour: 1 })).toBeNull();
    expect(resolveCosting({ gpuRatePerHour: 2.5 })).toBeNull();
  });

  it('keeps a zero rate rather than treating it as unset', () => {
    // a project on owned hardware may legitimately charge nothing
    expect(resolveCosting({ cpuRatePerHour: 0, gpuRatePerHour: 0 })).toEqual({
      cpuRatePerHour: 0,
      gpuRatePerHour: 0,
      currency: 'EUR',
    });
  });

  it('denominates in EUR when rates are set but no currency is', () => {
    expect(resolveCosting({ cpuRatePerHour: 1, gpuRatePerHour: 2 })?.currency).toBe("EUR");
  });
});

const RATES = { cpuRatePerHour: 1, gpuRatePerHour: 10, currency: 'USD' };

describe('costOf', () => {
  it('bills by the hour at the given rates', () => {
    expect(costOf(7200, RATES)).toEqual({
      totalHours: 2,
      cpuCost: 2,
      gpuCost: 20,
      totalCost: 22,
      currency: 'USD',
    });
  });

  it('reports hours but no money when the project is unpriced', () => {
    // hours are measured; money is not, so it is omitted rather than shown as 0
    expect(costOf(7200, null)).toEqual({ totalHours: 2 });
  });

  it('reproduces the figures the platform used to hard-code', () => {
    // 10 hours at the old 0.006 / 0.20 — now seeded onto existing projects
    const cost = costOf(36000, { cpuRatePerHour: 0.006, gpuRatePerHour: 0.2, currency: 'EUR' });
    expect(cost.cpuCost).toBeCloseTo(0.06);
    expect(cost.gpuCost).toBeCloseTo(2.0);
    expect(cost.totalCost).toBeCloseTo(2.06);
  });

  it('handles zero and missing time', () => {
    expect(costOf(0, RATES).totalCost).toBe(0);
    expect(costOf(undefined as unknown as number, RATES).totalCost).toBe(0);
  });
});

describe('costingByProject', () => {
  it('does not query when there is nothing to look up', async () => {
    expect((await costingByProject([])).size).toBe(0);
    expect((await costingByProject([undefined, undefined])).size).toBe(0);
    expect(mockedProject.find).not.toHaveBeenCalled();
  });

  it('de-duplicates ids and keeps only projects that are priced', async () => {
    mockedProject.find.mockResolvedValue([
      { _id: { toString: () => 'p1' }, costing: { cpuRatePerHour: 1, gpuRatePerHour: 3, currency: 'USD' } },
      { _id: { toString: () => 'p2' }, costing: { currency: 'USD' } },
      { _id: { toString: () => 'p3' } },
    ]);

    const map = await costingByProject(['p1', 'p1', 'p2', 'p3', undefined]);

    expect(mockedProject.find).toHaveBeenCalledWith({ _id: { $in: ['p1', 'p2', 'p3'] } }, 'costing');
    expect(map.get('p1')).toEqual({ cpuRatePerHour: 1, gpuRatePerHour: 3, currency: 'USD' });
    expect(map.has('p2')).toBe(false);
    expect(map.has('p3')).toBe(false);
  });

  it('degrades to unpriced when the lookup throws', async () => {
    // a malformed Training.projectId makes Mongoose reject the whole $in
    mockedProject.find.mockRejectedValue(new Error('CastError'));

    const map = await costingByProject(['not-an-object-id']);

    expect(map.size).toBe(0);
    expect(costingFor(map, 'not-an-object-id')).toBeNull();
  });
});

describe('costingFor', () => {
  it('returns null for an unknown or absent project', () => {
    const map = new Map([['p1', { cpuRatePerHour: 9, gpuRatePerHour: 9, currency: 'USD' }]]);
    expect(costingFor(map, 'p1')?.currency).toBe('USD');
    expect(costingFor(map, 'p-unknown')).toBeNull();
    expect(costingFor(map, undefined)).toBeNull();
  });
});
