import { BadGatewayError, fetchWithTimeout, NotFoundError } from '@visin/backend-core';

/**
 * The Hugging Face Hub, read-only and without a token: only public repos answer.
 * `HF_ENDPOINT` is the same variable `huggingface_hub` reads, so a mirror or an
 * enterprise Hub is one setting for the whole deployment.
 */
export const hubEndpoint = (): string => (process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '');

export interface HubSibling {
  rfilename: string;
  size?: number;
}

export interface HubDatasetInfo {
  gated?: boolean | string;
  tags?: string[];
  cardData?: Record<string, unknown>;
  siblings?: HubSibling[];
}

/** The repo's files and card at one commit. 404 means missing or private: the Hub does not say which. */
export async function fetchDatasetInfo(repo: string, revision: string): Promise<HubDatasetInfo> {
  const [org, name] = repo.split('/').map(encodeURIComponent);
  const response = await fetchWithTimeout(`${hubEndpoint()}/api/datasets/${org}/${name}/revision/${revision}?blobs=true`, {
    headers: { Accept: 'application/json' },
    serviceName: 'huggingface'
  });
  if (response.status === 404 || response.status === 401) {
    throw new NotFoundError('This repo or commit is not on the Hub, or it is private. Only public repos can be shown here.');
  }
  if (!response.ok) throw new BadGatewayError(`The Hub answered ${response.status}`);
  return (await response.json()) as HubDatasetInfo;
}
