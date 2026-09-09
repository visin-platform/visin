import React, { useMemo } from 'react';
import { ProjectTaxonomy } from '../types/taxonomy';
import { TestResult } from '../types/testResult';
import { TaxonomyContext } from './context';
import { resolveTaxonomyFor } from './useTaxonomy';

/**
 * Supplies the resolved taxonomy to the tables and charts below it, so they don't
 * each re-derive it from the same payload.
 */
interface TaxonomyProviderProps {
  taxonomy?: ProjectTaxonomy;
  /** results to discover vocabulary from; usually the ones about to be rendered */
  testResults?: TestResult[];
  children: React.ReactNode;
}

export const TaxonomyProvider: React.FC<TaxonomyProviderProps> = ({
  taxonomy,
  testResults,
  children
}) => {
  const value = useMemo(
    () => ({ taxonomy, resolved: resolveTaxonomyFor(taxonomy, testResults ?? []) }),
    [taxonomy, testResults]
  );
  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
};
