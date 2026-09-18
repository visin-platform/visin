import { createApiClient } from '@visin/frontend-core';
import { getGlobalConfig } from './ConfigProvider';

/**
 * dataset-service, which owns datasets: their zips, imports and images.
 *
 * No address is assumed: an unset `DATASET_API_URL` fails the request with a
 * message naming the setting, rather than quietly calling some other host.
 */
function getDatasetApiUrl(): string {
  let url: string | undefined;
  try {
    url = getGlobalConfig().DATASET_API_URL;
  } catch {
    // Config not loaded yet (initialization or HMR).
  }
  url = url || import.meta.env.VITE_DATASET_API_URL;
  if (!url) {
    throw new Error('DATASET_API_URL is not configured');
  }
  return url.replace(/\/$/, '');
}

export const datasetApi = createApiClient({
  baseUrl: () => `${getDatasetApiUrl()}/api/datasets`
});
