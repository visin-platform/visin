import { describe, expect, it } from 'vitest';
import { costOf, formatCost, resolveCosting } from '../costing';

describe('resolveCosting', () => {
  it('returns null when the project has not priced its hardware', () => {
    expect(resolveCosting(undefined)).toBeNull();
    expect(resolveCosting({})).toBeNull();
    expect(resolveCosting({ currency: 'USD' })).toBeNull();
  });

  it('requires both rates, so half a machine is never billed', () => {
    expect(resolveCosting({ cpuRatePerHour: 1 })).toBeNull();
    expect(resolveCosting({ gpuRatePerHour: 1 })).toBeNull();
  });

  it('keeps a zero rate, which owned hardware legitimately has', () => {
    expect(resolveCosting({ cpuRatePerHour: 0, gpuRatePerHour: 0 })).toEqual({
      cpuRatePerHour: 0,
      gpuRatePerHour: 0,
      currency: 'EUR'
    });
  });
});

describe('costOf', () => {
  it('bills by the hour at the given rates', () => {
    expect(costOf(7200, { cpuRatePerHour: 1, gpuRatePerHour: 10, currency: 'USD' })).toEqual({
      totalHours: 2,
      cpuCost: 2,
      gpuCost: 20,
      totalCost: 22,
      currency: 'USD'
    });
  });

  it('reports measured hours but no money when unpriced', () => {
    expect(costOf(3600, null)).toEqual({ totalHours: 1 });
  });
});

describe('formatCost', () => {
  it('formats in the given currency for the viewer locale', () => {
    // asserted against Intl rather than a literal, so the test is locale-agnostic
    const expected = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(12.5);
    expect(formatCost(12.5, 'USD')).toBe(expected);
  });

  it('shows a dash rather than inventing a currency', () => {
    expect(formatCost(12.5, undefined)).toBe('-');
    expect(formatCost(undefined, 'EUR')).toBe('-');
    expect(formatCost(NaN, 'EUR')).toBe('-');
  });

  it('suppresses invalid mixed-currency scalars from older servers', () => {
    expect(formatCost(30, 'MIXED')).toBe('-');
  });

  it('falls back to a plain suffix for a code Intl does not know', () => {
    expect(formatCost(5, 'XXXX')).toBe('5.00 XXXX');
  });
});
