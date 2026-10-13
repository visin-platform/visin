import { fetchWithTimeout, logger, requireEnv } from '@visin/backend-core';

const BATCH_SIZE = 100;

/**
 * The cover pictures of Visin datasets, by dataset id, as `userId` may see them (anyone, when absent). A cover is
 * decoration: when dataset-service cannot be reached the answer is none, and the card shows its plain tile.
 */
export async function fetchDatasetCovers(ids: string[], userId: string | undefined): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const base =
      process.env.DATASET_SERVICE_URL ||
      (process.env.NODE_ENV === 'production' ? requireEnv('DATASET_SERVICE_URL') : 'http://localhost:5010');
    const token = requireEnv('INTERNAL_SERVICE_TOKEN');
    const covers: Record<string, string> = {};
    // The service caps each request, not the number of datasets a project list can use.
    for (let start = 0; start < ids.length; start += BATCH_SIZE) {
      try {
        const response = await fetchWithTimeout(`${base}/internal/datasets/covers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Token': token },
          body: JSON.stringify({ ids: ids.slice(start, start + BATCH_SIZE), ...(userId ? { userId } : {}) }),
          serviceName: 'dataset-service'
        });
        if (!response.ok) {
          logger.warn('Dataset covers unavailable', { status: response.status });
          continue;
        }
        Object.assign(covers, ((await response.json()) as { data?: Record<string, string> }).data ?? {});
      } catch (error) {
        logger.warn('Dataset covers unavailable', { error: error instanceof Error ? error.message : String(error) });
      }
    }
    return covers;
  } catch (error) {
    logger.warn('Dataset covers unavailable', { error: error instanceof Error ? error.message : String(error) });
    return {};
  }
}
