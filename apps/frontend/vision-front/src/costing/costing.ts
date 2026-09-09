import { ProjectCosting } from '../types/taxonomy';

/**
 * Cost rates and money formatting.
 *
 * The rates used to be a `const` pair repeated in three backend services and once
 * more here, and every amount was printed with a euro sign hard-coded at the call
 * site — `€${n.toFixed(2)}` in three places and `${n.toFixed(2)}€` in a fourth, so
 * the symbol did not even land on the same side of the number.
 *
 * There is deliberately **no default rate**. A project that has not priced its
 * hardware shows a dash, not a figure derived from someone else's cloud pricing.
 */

/** A rate card complete enough to bill with. */
export interface ResolvedCosting {
  cpuRatePerHour: number;
  gpuRatePerHour: number;
  currency: string;
}

/**
 * A usable rate card, or `null` when the project has not priced its hardware.
 * Both rates are required together — pricing CPU but not GPU would silently bill
 * half the machine.
 */
export const resolveCosting = (costing?: ProjectCosting | null): ResolvedCosting | null => {
  if (typeof costing?.cpuRatePerHour !== 'number' || typeof costing?.gpuRatePerHour !== 'number') {
    return null;
  }
  return {
    cpuRatePerHour: costing.cpuRatePerHour,
    gpuRatePerHour: costing.gpuRatePerHour,
    currency: costing.currency || 'EUR'
  };
};

export interface TrainingCost {
  totalHours: number;
  cpuCost?: number;
  gpuCost?: number;
  totalCost?: number;
  currency?: string;
}

/**
 * Cost of `seconds` of training. Mirrors the backend's `costOf`: hours are always
 * reported because they are measured, money only when rates exist.
 */
export const costOf = (seconds: number, costing: ResolvedCosting | null): TrainingCost => {
  const totalHours = (seconds || 0) / 3600;
  if (!costing) {
    return { totalHours };
  }
  const cpuCost = totalHours * costing.cpuRatePerHour;
  const gpuCost = totalHours * costing.gpuRatePerHour;
  return { totalHours, cpuCost, gpuCost, totalCost: cpuCost + gpuCost, currency: costing.currency };
};

/**
 * Formats an amount in the given currency, positioned and punctuated the way the
 * viewer's own locale writes money — which is the part a hard-coded `€` got wrong
 * for everyone outside one convention.
 *
 * Returns a dash when there is no amount or no currency, which is the honest
 * answer for an unpriced project. `MIXED` is what the backend reports for a total
 * spanning currencies; there is no single symbol for that.
 */
export const formatCost = (amount?: number, currency?: string): string => {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !currency) {
    return '-';
  }
  if (currency === 'MIXED') {
    return `${amount.toFixed(2)} (mixed currencies)`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    // an unknown code reaches Intl only if it bypassed validation; show it plainly
    return `${amount.toFixed(2)} ${currency}`;
  }
};
