import { createHash } from 'crypto';
import RunSample from '../models/RunSample';
import { canonicalJson } from './suiteProtocol';

/** SHA-256 of a canonical JSON array sorted by sample id. Streamed so large runs stay bounded in memory. */
export async function sampleDigest(trainingId: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update('[');
  let first = true;
  const cursor = RunSample.find({ trainingId }).sort({ sampleId: 1 }).lean().cursor();
  for await (const row of cursor) {
    if (!first) hash.update(',');
    first = false;
    hash.update(canonicalJson({ id: row.sampleId, attrs: row.attrs, fields: row.fields, abstained: row.abstained, parseFailed: row.parseFailed, raw: row.raw, latencyMs: row.latencyMs }));
  }
  hash.update(']');
  return hash.digest('hex');
}
