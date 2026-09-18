import { callService, serviceUrl, type Query } from './http';
import { datasetSchema, datasetsResponseSchema, parseResponse, type Dataset } from './schemas';

/**
 * The dataset-service client — datasets moved out of vision-service into their
 * own service. Same rules as `vision.ts`: the caller's key is forwarded as-is,
 * so dataset visibility is decided there, and every response is parsed at the
 * boundary.
 */

const base = (): string => serviceUrl('DATASET');

export const datasets = {
  list: async (apiKey: string, query: Query): Promise<{ datasets: Dataset[]; pagination?: { total?: number } }> =>
    parseResponse(datasetsResponseSchema, '/datasets', await callService(base(), apiKey, 'GET', '/datasets', undefined, { page: 1, ...query })),

  get: async (apiKey: string, id: string): Promise<Dataset> => {
    const path = `/datasets/${encodeURIComponent(id)}`;
    return parseResponse(datasetSchema, path, await callService(base(), apiKey, 'GET', path));
  }
};
