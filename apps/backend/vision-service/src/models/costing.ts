import { Schema } from 'mongoose';

/**
 * What an hour of training costs, per project.
 *
 * These were three hard-coded constant pairs in the services plus a fourth copy in
 * the frontend, all reading 0.006 / 0.20 with a euro sign nailed on at the point of
 * display. Rates belong to whoever pays for the hardware, so they belong to the
 * project — and every deployment's differ.
 *
 * There is deliberately **no default**. A project that has not set rates reports no
 * cost at all rather than a plausible-looking figure derived from someone else's
 * cloud pricing, because a wrong number presented confidently is worse than a dash.
 */

export interface IProjectCosting {
  /** currency per CPU-hour */
  cpuRatePerHour?: number;
  /** currency per GPU-hour */
  gpuRatePerHour?: number;
  /** ISO 4217 code — 'EUR', 'USD', … */
  currency?: string;
}

/** A rate card complete enough to bill with. */
export interface ResolvedCosting {
  cpuRatePerHour: number;
  gpuRatePerHour: number;
  currency: string;
}

export const CostingSchema = new Schema<IProjectCosting>(
  {
    cpuRatePerHour: { type: Number, min: 0 },
    gpuRatePerHour: { type: Number, min: 0 },
    currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3 }
  },
  { _id: false }
);

/**
 * A usable rate card, or `null` when the project has not priced its hardware.
 *
 * Both rates are required together: pricing CPU but not GPU would silently bill
 * half the machine. A missing currency is the one thing filled in, since an amount
 * with no denomination is meaningless and the rates themselves say what was meant.
 */
export const resolveCosting = (costing?: IProjectCosting | null): ResolvedCosting | null => {
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
 * Cost of `seconds` of training. Hours are always reported — they are measured, not
 * priced — while the money is present only when the project has rates.
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
