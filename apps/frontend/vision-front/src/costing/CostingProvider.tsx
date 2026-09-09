import React, { useMemo } from 'react';
import { ProjectCosting } from '../types/taxonomy';
import { CostingContext } from './context';
import { resolveCosting } from './costing';

interface CostingProviderProps {
  costing?: ProjectCosting;
  children: React.ReactNode;
}

/** Supplies one project's cost rates to the cards and tables below it. */
export const CostingProvider: React.FC<CostingProviderProps> = ({ costing, children }) => {
  const value = useMemo(() => resolveCosting(costing), [costing]);
  return <CostingContext.Provider value={value}>{children}</CostingContext.Provider>;
};
