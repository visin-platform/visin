import { visionApi } from '../config/visionApi';
import type { ApiResponse } from '../types';

/** One decision an inference run recorded: what was judged (attributes) and what the model said (fields). */
export interface RunSample {
  id: string;
  attrs: Record<string, unknown>;
  fields: Record<string, string>;
  abstained?: boolean;
  parseFailed?: boolean;
  /** the model's reply, as it gave it */
  raw?: string;
  latencyMs?: number;
}

export interface RunSamplePage {
  samples: RunSample[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface RunSampleQuery {
  page: number;
  limit: number;
  /** exact values: attribute name → value */
  attrs?: Record<string, string>;
  /** exact values: field name → value */
  fields?: Record<string, string>;
}

const asFilter = (values: Record<string, string> | undefined) =>
  values && Object.keys(values).length ? JSON.stringify(values) : undefined;

/** A page of an inference run's samples, filtered in the database by exact attribute and field values. */
export async function listRunSamples(trainingId: string, query: RunSampleQuery): Promise<RunSamplePage> {
  const attrs = asFilter(query.attrs);
  const fields = asFilter(query.fields);
  const response = await visionApi.get(`/trainings/${encodeURIComponent(trainingId)}/samples`, {
    params: { page: query.page, limit: query.limit, ...(attrs ? { attrs } : {}), ...(fields ? { fields } : {}) }
  });
  return (response.data as ApiResponse<RunSamplePage>).data;
}
