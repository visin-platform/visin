import { createContext } from 'react';
import { ResolvedCosting } from './costing';

/**
 * Null by default: most screens show costs with no project in scope, and an
 * unpriced project reports no money rather than a made-up figure.
 */
export const CostingContext = createContext<ResolvedCosting | null>(null);
