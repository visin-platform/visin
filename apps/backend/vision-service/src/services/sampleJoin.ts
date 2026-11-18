import RunSample, { type IRunSample } from '../models/RunSample';

export type JoinedRow = Pick<IRunSample, 'sampleId' | 'attrs' | 'fields' | 'abstained' | 'parseFailed' | 'raw' | 'latencyMs'>;

/** MongoDB orders strings by their UTF-8 bytes; JavaScript's `<` by UTF-16 units. Both cursors must agree with this. */
export function compareSampleIds(a: string, b: string): number {
  if (a === b) return 0;
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

const BATCH = 2000;

function runCursor(trainingId: string) {
  return RunSample.find({ trainingId })
    .select('sampleId attrs fields abstained parseFailed raw latencyMs')
    .sort({ sampleId: 1 })
    .lean<JoinedRow[]>()
    .cursor({ batchSize: BATCH });
}

/** One run's samples in id order, read ahead one row at a time so another run can be merged against it. */
class OrderedRun {
  private readonly iterator: AsyncIterator<JoinedRow>;
  private head: JoinedRow | undefined;
  private done = false;

  constructor(trainingId: string) {
    this.iterator = runCursor(trainingId)[Symbol.asyncIterator]() as AsyncIterator<JoinedRow>;
  }

  private async advance(): Promise<void> {
    const next = await this.iterator.next();
    this.done = Boolean(next.done);
    this.head = next.done ? undefined : next.value;
  }

  /** The row with this id, if the run has one; rows before it are passed over. Ids must be asked for in order. */
  async find(sampleId: string): Promise<JoinedRow | undefined> {
    if (this.head === undefined && !this.done) await this.advance();
    while (this.head && compareSampleIds(this.head.sampleId, sampleId) < 0) await this.advance();
    return this.head && this.head.sampleId === sampleId ? this.head : undefined;
  }

  async close(): Promise<void> {
    await this.iterator.return?.();
  }
}

/**
 * Every sample of `primary`, in id order, with the sample of the same id from each of `others` (undefined where that
 * run has none, or where no run is given). A merge over cursors sorted on the `{ trainingId, sampleId }` index: one
 * pass over each run, memory for one row of each, and no per-sample lookup, so a run of any size joins in linear time.
 */
export async function* joinRuns(primary: string, others: (string | undefined)[]): AsyncGenerator<{ row: JoinedRow; others: (JoinedRow | undefined)[] }> {
  const runs = others.map((id) => (id ? new OrderedRun(id) : undefined));
  try {
    for await (const row of runCursor(primary)) {
      const matched: (JoinedRow | undefined)[] = [];
      for (const run of runs) matched.push(run ? await run.find(row.sampleId) : undefined);
      yield { row, others: matched };
    }
  } finally {
    await Promise.all(runs.map((run) => run?.close()));
  }
}
