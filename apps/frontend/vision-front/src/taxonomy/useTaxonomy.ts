import { useContext, useMemo } from 'react';
import { ProjectTaxonomy, ResolvedTaxonomy } from '../types/taxonomy';
import { TestResult } from '../types/testResult';
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
  testResults: TestResult[]
): ResolvedTaxonomy =>
  resolveTaxonomy(taxonomy, {
    conditions: discoverConditions(testResults),
    classes: discoverClasses(testResults),
    metrics: discoverClassMetrics(testResults),
    overallMetrics: discoverOverallMetrics(testResults)
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
export const useTaxonomyFor = (testResults: TestResult[]): ResolvedTaxonomy => {
  const { taxonomy, resolved } = useContext(TaxonomyContext);
  return useMemo(() => {
    if (testResults.length === 0) {
      return resolved;
    }
    return resolveTaxonomyFor(taxonomy, testResults);
  }, [taxonomy, resolved, testResults]);
};
