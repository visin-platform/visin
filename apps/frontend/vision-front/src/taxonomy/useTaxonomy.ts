import { useContext, useMemo } from 'react';
import { ProjectTaxonomy, ResolvedTaxonomy } from '../types/taxonomy';
import { RunEvaluation } from '../types/runEvaluation';
import { TaxonomyContext } from './context';
import {
  discoverClassMetrics,
  discoverClasses,
  discoverConditions,
  discoverOverallMetrics
} from './discover';
import { resolveTaxonomy } from './resolveTaxonomy';

/**
 * The non-React entry point, for exports and utilities that run outside a tree.
 */
export const resolveTaxonomyFor = (
  taxonomy: ProjectTaxonomy | undefined,
  evaluations: RunEvaluation[]
): ResolvedTaxonomy =>
  resolveTaxonomy(taxonomy, {
    conditions: discoverConditions(evaluations),
    classes: discoverClasses(evaluations),
    metrics: discoverClassMetrics(evaluations),
    overallMetrics: discoverOverallMetrics(evaluations)
  });

export const useTaxonomy = (): ResolvedTaxonomy => useContext(TaxonomyContext).resolved;

/**
 * The project's raw config, for callers that resolve it against their own data
 * outside of render — a LaTeX export for one specific result, say.
 */
export const useProjectTaxonomy = (): ProjectTaxonomy | undefined =>
  useContext(TaxonomyContext).taxonomy;

/**
 * Resolves against a specific set of results while keeping the project's config —
 * for a component whose own data is narrower than the provider's, or which renders
 * outside any provider at all.
 */
export const useTaxonomyFor = (evaluations: RunEvaluation[]): ResolvedTaxonomy => {
  const { taxonomy, resolved } = useContext(TaxonomyContext);
  return useMemo(() => {
    if (evaluations.length === 0) {
      return resolved;
    }
    return resolveTaxonomyFor(taxonomy, evaluations);
  }, [taxonomy, resolved, evaluations]);
};
