import { useContext } from 'react';
import { CostingContext } from './context';
import { ResolvedCosting, formatCost } from './costing';

/** This project's rates, or null when it has not priced its hardware. */
export const useCosting = (): ResolvedCosting | null => useContext(CostingContext);

/**
 * Formats money in the project's currency.
 *
 * Takes an optional `currency` override for figures the backend has already
 * denominated — a cross-project total may come back as `MIXED`, which no single
 * project's rate card can describe. With neither, the result is a dash.
 */
export const useFormatCost = () => {
  const costing = useContext(CostingContext);
  return (amount?: number, currency?: string) => formatCost(amount, currency || costing?.currency);
};
