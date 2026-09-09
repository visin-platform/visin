import { createContext } from 'react';
import { ProjectTaxonomy, ResolvedTaxonomy } from '../types/taxonomy';
import { EMPTY_TAXONOMY } from './resolveTaxonomy';

export interface TaxonomyContextValue {
  /** the project's stored config, kept so a narrower scope can re-resolve from it */
  taxonomy?: ProjectTaxonomy;
  resolved: ResolvedTaxonomy;
}

/**
 * Defaults to a pure-discovery taxonomy rather than throwing: plenty of screens
 * render results with no project in scope, and that is the API-fed case anyway.
 */
export const TaxonomyContext = createContext<TaxonomyContextValue>({ resolved: EMPTY_TAXONOMY });
