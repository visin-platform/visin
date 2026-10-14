import React, { useMemo } from 'react';
import { ProjectTaxonomy } from '../types/taxonomy';
import { RunEvaluation } from '../types/runEvaluation';
import { TaxonomyContext } from './context';
import { resolveTaxonomyFor } from './useTaxonomy';

/**
 * Supplies the resolved taxonomy to the tables and charts below it, so they don't
 * each re-derive it from the same payload.
 */
interface TaxonomyProviderProps {
  taxonomy?: ProjectTaxonomy;
  /** results to discover vocabulary from; usually the ones about to be rendered */
  evaluations?: RunEvaluation[];
  children: React.ReactNode;
}

export const TaxonomyProvider: React.FC<TaxonomyProviderProps> = ({
  taxonomy,
  evaluations,
  children
}) => {
  const value = useMemo(
    () => ({ taxonomy, resolved: resolveTaxonomyFor(taxonomy, evaluations ?? []) }),
    [taxonomy, evaluations]
  );
  return <TaxonomyContext.Provider value={value}>{children}</TaxonomyContext.Provider>;
};
